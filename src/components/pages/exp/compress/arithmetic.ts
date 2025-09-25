// 纯逻辑模块：算术编码/解码（基于 BigInt 的 32bit 区间编码）
import { packBitsToBytes, unpackBytesToBits } from "./huffman";

export type FrequencyItem = {
  character: string;
  frequency: number;
};

export type ArithEncodeResult = {
  frequencyTable: FrequencyItem[];
  bitLength: number;
  packedBytes: Uint8Array;
  messageLength: number; // 符号数（字符数）
  stateBits: number; // 内部状态位宽（固定 32）
};

export type ArithCodebook = {
  version: number;
  type: "arith-codebook";
  encoding: "utf-8";
  frequencyTable: FrequencyItem[];
  messageLength: number;
  stateBits: number; // 32
};

function buildFrequencyMap(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const ch of text) map.set(ch, (map.get(ch) || 0) + 1);
  // 至少包含一个符号，若为空文本则返回空频表
  return map;
}

function normalizeFrequencyTable(freqMap: Map<string, number>): FrequencyItem[] {
  const table: FrequencyItem[] = Array.from(freqMap.entries()).map(
    ([character, frequency]) => ({ character, frequency })
  );
  table.sort((a, b) => a.character.localeCompare(b.character));
  return table;
}

function buildCumulative(table: FrequencyItem[]): {
  symbols: string[];
  cumulative: bigint[]; // 长度 = symbols.length + 1，最后一项为 total
  total: bigint;
} {
  const symbols = table.map((t) => t.character);
  const cumulative: bigint[] = [0n];
  let run = 0n;
  for (const item of table) {
    run += BigInt(item.frequency);
    cumulative.push(run);
  }
  return { symbols, cumulative, total: run };
}

function findSymbolIndexByScaledValue(
  cumulative: bigint[],
  scaledValue: bigint
): number {
  // 寻找最大 i 使 cumulative[i] <= scaledValue < cumulative[i+1]
  let low = 0;
  let high = cumulative.length - 1; // 最后一项是 total
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (cumulative[mid] <= scaledValue) low = mid;
    else high = mid;
  }
  return low;
}

// 算术编码核心（整型区间 + E1/E2/E3 重归一化）
export function arithEncode(text: string): ArithEncodeResult {
  const freqMap = buildFrequencyMap(text);
  const table = normalizeFrequencyTable(freqMap);
  if (table.length === 0) {
    return {
      frequencyTable: [],
      bitLength: 0,
      packedBytes: new Uint8Array(),
      messageLength: 0,
      stateBits: 32,
    };
  }

  const { cumulative, total } = buildCumulative(table);
  const STATE_BITS = 32n;
  const ONE = 1n;
  const FULL = (ONE << STATE_BITS) - 1n;
  const HALF = ONE << (STATE_BITS - 1n);
  const QUARTER = ONE << (STATE_BITS - 2n);
  const THREE_QUARTERS = QUARTER * 3n;

  let low = 0n;
  let high = FULL;
  let pendingBits = 0n;

  const outBits: string[] = [];
  const emitBit = (bit: 0 | 1) => {
    outBits.push(bit ? "1" : "0");
  };
  const emitPending = (bit: 0 | 1) => {
    while (pendingBits > 0n) {
      emitBit(bit === 1 ? 0 : 1);
      pendingBits--;
    }
  };

  for (const ch of text) {
    const idx = table.findIndex((t) => t.character === ch);
    if (idx < 0) throw new Error("频表中缺少字符: " + JSON.stringify(ch));
    const range = high - low + 1n;
    const loCum = cumulative[idx];
    const hiCum = cumulative[idx + 1];
    high = low + (range * hiCum) / total - 1n;
    low = low + (range * loCum) / total;

    while (true) {
      if (high < HALF) {
        emitBit(0);
        emitPending(1);
      } else if (low >= HALF) {
        emitBit(1);
        emitPending(0);
        low -= HALF;
        high -= HALF;
      } else if (low >= QUARTER && high < THREE_QUARTERS) {
        pendingBits++;
        low -= QUARTER;
        high -= QUARTER;
      } else {
        break;
      }
      low <<= 1n;
      high = (high << 1n) | 1n;
    }
  }

  // 终止输出，强制落点
  pendingBits++;
  if (low < QUARTER) {
    emitBit(0);
    emitPending(1);
  } else {
    emitBit(1);
    emitPending(0);
  }

  const bitString = outBits.join("");
  const { bytes, validBitsInLastByte } = packBitsToBytes(bitString);
  // 将有效位数信息蕴含在码流中不强制要求；解码时仅依赖 symbol 数量
  // 这里保留 bitLength 以供 UI 展示
  return {
    frequencyTable: table,
    bitLength: bitString.length,
    packedBytes: bytes,
    messageLength: text.length,
    stateBits: Number(STATE_BITS),
  };
}

export function makeArithCodebook(r: ArithEncodeResult): ArithCodebook {
  return {
    version: 1,
    type: "arith-codebook",
    encoding: "utf-8",
    frequencyTable: r.frequencyTable,
    messageLength: r.messageLength,
    stateBits: r.stateBits,
  };
}

export function arithDecode(
  packedBytes: Uint8Array,
  codebook: ArithCodebook
): string {
  const table = codebook.frequencyTable.slice().sort((a, b) =>
    a.character.localeCompare(b.character)
  );
  if (table.length === 0) return "";

  const { symbols, cumulative, total } = buildCumulative(table);

  const STATE_BITS = BigInt(codebook.stateBits || 32);
  const ONE = 1n;
  const FULL = (ONE << STATE_BITS) - 1n;
  const HALF = ONE << (STATE_BITS - 1n);
  const QUARTER = ONE << (STATE_BITS - 2n);
  const THREE_QUARTERS = QUARTER * 3n;

  // 还原位流
  const bits = unpackBytesToBits(packedBytes, 8); // 这里传 8 表示全部字节的 8 位都参与构造流

  let readIndex = 0;
  const readBit = (): 0 | 1 => {
    if (readIndex >= bits.length) return 0;
    const b = bits.charCodeAt(readIndex++) === 49 ? 1 : 0;
    return b as 0 | 1;
  };

  let low = 0n;
  let high = FULL;
  let code = 0n;
  for (let i = 0n; i < STATE_BITS; i++) {
    code = (code << 1n) | BigInt(readBit());
  }

  let out = "";
  for (let outCount = 0; outCount < codebook.messageLength; outCount++) {
    const range = high - low + 1n;
    const scaledValue = ((code - low + 1n) * total - 1n) / range;
    const idx = findSymbolIndexByScaledValue(cumulative, scaledValue);
    out += symbols[idx];

    const loCum = cumulative[idx];
    const hiCum = cumulative[idx + 1];
    high = low + (range * hiCum) / total - 1n;
    low = low + (range * loCum) / total;

    while (true) {
      if (high < HALF) {
        // no-op
      } else if (low >= HALF) {
        low -= HALF;
        high -= HALF;
        code -= HALF;
      } else if (low >= QUARTER && high < THREE_QUARTERS) {
        low -= QUARTER;
        high -= QUARTER;
        code -= QUARTER;
      } else {
        break;
      }
      low <<= 1n;
      high = (high << 1n) | 1n;
      code = (code << 1n) | BigInt(readBit());
    }
  }
  return out;
}


