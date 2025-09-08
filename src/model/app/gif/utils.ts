// ======================
// GIF 渲染辅助函数
// ======================

interface SubBlock {
  data: Uint8Array | number[];
}

export function concatSubBlocks(subBlocks: SubBlock[]): Uint8Array {
  if (!Array.isArray(subBlocks)) return new Uint8Array(0);
  let total = 0;
  const parts: Uint8Array[] = [];
  for (const sb of subBlocks) {
    const raw = sb?.data;
    const arr =
      raw instanceof Uint8Array
        ? raw
        : Array.isArray(raw)
        ? Uint8Array.from(raw)
        : new Uint8Array(0);
    parts.push(arr);
    total += arr.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * 解码 GIF LZW 压缩数据
 * @param minCodeSize 最小码字大小
 * @param data 压缩的数据块
 * @param expectedPixels 期望输出的像素数量
 * @returns 解码后的颜色索引数组
 */
export function decodeGifLZW(
  minCodeSize: number,
  data: Uint8Array,
  expectedPixels: number
): number[] {
  const MAX_BITS = 12;
  const CLEAR = 1 << minCodeSize;
  const END = CLEAR + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = END + 1;

  const dict: number[][] = [];
  const reset = () => {
    dict.length = 0;
    for (let i = 0; i < CLEAR; i++) dict[i] = [i];
    // CLEAR 和 END code 本身不进入字典
    dict[CLEAR] = [];
    dict[END] = [];
    codeSize = minCodeSize + 1;
    nextCode = END + 1;
  };
  reset();

  // 读取 LSB-first code
  let bitPos = 0;
  const readCode = () => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIndex = bitPos >> 3;
      const bitIndex = bitPos & 7;
      const bit = (data[byteIndex] >> bitIndex) & 1;
      code |= bit << i;
      bitPos++;
    }
    return code;
  };

  const out: number[] = [];
  let prev: number[] | null = null;
  while (out.length < expectedPixels) {
    if (bitPos >> 3 >= data.length) break;
    const code = readCode();

    // 清除码，重置字典
    if (code === CLEAR) {
      reset();
      prev = null;
      continue;
    }
    // 结束码
    if (code === END) break;

    let entry: number[];
    if (dict[code]) {
      entry = dict[code];
    } else if (code === nextCode && prev) {
      // 特殊情况 K(K+L)
      entry = prev.concat(prev[0]);
    } else {
      // 异常的 code
      break;
    }
    // 使用循环代替展开符，提高性能
    for (let i = 0; i < entry.length; i++) {
      out.push(entry[i]);
    }

    if (prev) {
      // 将 P + K[0] 添加到字典
      const newEntry = prev.concat(entry[0]);
      dict[nextCode] = newEntry;
      nextCode++;
      // 当字典满了，增加码长
      if (nextCode === 1 << codeSize && codeSize < MAX_BITS) codeSize++;
    }
    prev = entry;
  }

  // 修正长度
  if (out.length < expectedPixels)
    out.push(...new Array(expectedPixels - out.length).fill(0));
  if (out.length > expectedPixels) out.length = expectedPixels;
  return out;
}

const GIF_INTERLACE_PASSES = [
  { start: 0, step: 8 },
  { start: 4, step: 8 },
  { start: 2, step: 4 },
  { start: 1, step: 2 },
];

export function deinterlacePixels(
  indexes: number[],
  width: number,
  height: number
): number[] {
  const out = new Array(width * height).fill(0);
  let pos = 0;
  for (const { start, step } of GIF_INTERLACE_PASSES) {
    for (let y = start; y < height; y += step) {
      const row = y * width;
      for (let x = 0; x < width; x++) out[row + x] = indexes[pos++] ?? 0;
    }
  }
  return out;
}

export function mapPaletteToRgba(
  indexes: number[],
  palette?: { r: number; g: number; b: number }[],
  transparentIndex?: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(indexes.length * 4);
  for (let i = 0; i < indexes.length; i++) {
    const idx = indexes[i] | 0;
    const color = palette?.[idx];
    const r = color?.r ?? 0;
    const g = color?.g ?? 0;
    const b = color?.b ?? 0;
    const a = transparentIndex != null && idx === transparentIndex ? 0 : 255;
    const outputOffset = i * 4;
    out[outputOffset] = r;
    out[outputOffset + 1] = g;
    out[outputOffset + 2] = b;
    out[outputOffset + 3] = a;
  }
  return out;
}
