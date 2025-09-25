// 纯逻辑模块：rANS（range Asymmetric Numeral Systems）静态模型编码/解码
// 说明：为可维护性简化实现，使用 32 位状态 + 二分查找 cumulative（不构建大表）

export type FrequencyItem = {
  character: string;
  frequency: number;
};

export type AnsEncodeResult = {
  frequencyTable: FrequencyItem[];
  packedBytes: Uint8Array; // 码流：renorm 字节 + 尾部 4 字节状态（LE）
  bitLength: number; // 近似位长：字节数 * 8
  messageLength: number;
  scaleBits: number; // L = 1 << scaleBits
};

export type AnsCodebook = {
  version: number;
  type: "ans-codebook";
  encoding: "utf-8";
  frequencyTable: FrequencyItem[]; // 原始频表（未缩放）
  messageLength: number;
  scaleBits: number;
};

function buildFrequencyMap(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of text) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

function normalizeFrequencyTable(
  freqMap: Map<string, number>,
  scaleBits: number
): { table: FrequencyItem[]; scaled: number[]; cumulative: number[]; total: number } {
  const L = 1 << scaleBits;
  const table: FrequencyItem[] = Array.from(freqMap.entries()).map(
    ([character, frequency]) => ({ character, frequency })
  );
  table.sort((a, b) => a.character.localeCompare(b.character));
  if (table.length === 0)
    return { table, scaled: [], cumulative: [0], total: 0 };
  const totalRaw = table.reduce((s, it) => s + it.frequency, 0);
  // 先按比例取 floor，并保证至少为 1
  const scaled = table.map((it) => Math.max(1, Math.floor((it.frequency * L) / totalRaw)));
  let sum = scaled.reduce((s, v) => s + v, 0);
  // 计算残差，按精度高者分配或回收
  const residuals = table.map((it, i) => {
    const exact = (it.frequency * L) / totalRaw;
    return { i, frac: exact - Math.floor(exact) };
  });
  if (sum < L) {
    residuals.sort((a, b) => b.frac - a.frac);
    let need = L - sum;
    for (let k = 0; k < residuals.length && need > 0; k++) {
      scaled[residuals[k]!.i]++;
      need--;
    }
  } else if (sum > L) {
    residuals.sort((a, b) => a.frac - b.frac);
    let need = sum - L;
    for (let k = 0; k < residuals.length && need > 0; k++) {
      if (scaled[residuals[k]!.i] > 1) {
        scaled[residuals[k]!.i]--;
        need--;
      }
    }
  }
  // 最终 cumulative
  const cumulative: number[] = [0];
  for (const s of scaled) cumulative.push(cumulative[cumulative.length - 1]! + s);
  return { table, scaled, cumulative, total: L };
}

function findSymbolIndexByScaledValue(cum: number[], value: number): number {
  // 寻找最大 idx 使 cum[idx] <= value < cum[idx+1]
  let low = 0;
  let high = cum.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (cum[mid] <= value) low = mid;
    else high = mid;
  }
  return low;
}

export function ansEncode(text: string, scaleBits = 12): AnsEncodeResult {
  const freqMap = buildFrequencyMap(text);
  const { table, scaled, cumulative, total } = normalizeFrequencyTable(
    freqMap,
    scaleBits
  );
  if (table.length === 0) {
    return {
      frequencyTable: [],
      packedBytes: new Uint8Array(),
      bitLength: 0,
      messageLength: 0,
      scaleBits,
    };
  }
  const THRESH = 1n << 16n; // 归一化阈值
  let x = 1n; // 初始状态
  const out: number[] = [];

  // 从后往前编码
  for (let p = text.length - 1; p >= 0; p--) {
    const ch = text[p]!;
    const idx = table.findIndex((t) => t.character === ch);
    if (idx < 0) throw new Error("频表缺少字符: " + JSON.stringify(ch));
    const f = BigInt(scaled[idx]!);
    const c = BigInt(cumulative[idx]!);
    while (x >= f * THRESH) {
      out.push(Number(x & 0xffn));
      x >>= 8n;
    }
    // x' = floor(x / f) * L + (x % f) + c
    x = (x / f << BigInt(scaleBits)) + (x % f) + c;
  }
  // 写入最终状态（固定 4 字节 LE）
  const final: number[] = [];
  let xf = x;
  for (let i = 0; i < 4; i++) {
    final.push(Number(xf & 0xffn));
    xf >>= 8n;
  }
  const bytes = new Uint8Array(out.length + final.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out[i]!;
  for (let i = 0; i < 4; i++) bytes[out.length + i] = final[i]!;

  return {
    frequencyTable: table,
    packedBytes: bytes,
    bitLength: bytes.length * 8,
    messageLength: text.length,
    scaleBits,
  };
}

export function makeAnsCodebook(r: AnsEncodeResult): AnsCodebook {
  return {
    version: 1,
    type: "ans-codebook",
    encoding: "utf-8",
    frequencyTable: r.frequencyTable,
    messageLength: r.messageLength,
    scaleBits: r.scaleBits,
  };
}

export function ansDecode(packedBytes: Uint8Array, book: AnsCodebook): string {
  const map = new Map<string, number>();
  for (const it of book.frequencyTable) map.set(it.character, it.frequency);
  const { table, scaled, cumulative, total } = normalizeFrequencyTable(
    map,
    book.scaleBits
  );
  if (table.length === 0) return "";
  if (packedBytes.length < 4) throw new Error("码流过短");
  const dataLen = packedBytes.length - 4;
  // 读取末尾 4 字节 LE 为初始状态 x
  let x = 0n;
  for (let i = 3; i >= 0; i--) x = (x << 8n) | BigInt(packedBytes[dataLen + i]!);

  const THRESH = 1n << 16n;
  let pos = 0; // 从流头开始读 renorm 字节
  const L = total; // 1<<scaleBits
  const mask = BigInt(L - 1);
  let out = "";

  for (let produced = 0; produced < book.messageLength; produced++) {
    const idx = Number(x & mask);
    const symIndex = findSymbolIndexByScaledValue(cumulative, idx);
    const ch = table[symIndex]!.character;
    const f = BigInt(scaled[symIndex]!);
    const c = BigInt(cumulative[symIndex]!);
    out += ch;
    // 逆变换：x = f * floor(x / L) + (x % L) - c
    x = f * (x >> BigInt(book.scaleBits)) + (x & mask) - c;
    while (x < THRESH && pos < dataLen) {
      x = (x << 8n) | BigInt(packedBytes[pos++]!);
    }
  }
  return out;
}


