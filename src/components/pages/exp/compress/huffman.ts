// 纯逻辑模块：霍夫曼编码/解码与相关类型工具

export type HuffmanNode = {
  frequency: number;
  character?: string;
  left?: HuffmanNode;
  right?: HuffmanNode;
};

export type FrequencyItem = {
  character: string;
  frequency: number;
};

export type EncodeResult = {
  root: HuffmanNode | null;
  frequencyTable: FrequencyItem[];
  codeMap: Map<string, string>;
  encodedBits: string;
  packedBytes: Uint8Array;
  validBitsInLastByte: number; // 1..8，若没有数据则为 0
};

export type Codebook = {
  version: number;
  type: "huffman-codebook";
  encoding: "utf-8";
  codes: { character: string; code: string }[];
  validBitsInLastByte: number;
};

export function buildFrequencyMap(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const ch of text) {
    map.set(ch, (map.get(ch) || 0) + 1);
  }
  return map;
}

export function buildHuffmanTree(freqMap: Map<string, number>): HuffmanNode | null {
  const nodes: HuffmanNode[] = [];
  for (const [character, frequency] of freqMap.entries()) {
    nodes.push({ character, frequency });
  }
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    const only = nodes[0];
    return {
      frequency: only.frequency,
      left: only,
      right: { frequency: 0, character: "\u0000" },
    };
  }
  const queue = nodes.slice();
  queue.sort((a, b) => a.frequency - b.frequency);
  while (queue.length > 1) {
    const left = queue.shift()!;
    const right = queue.shift()!;
    const parent: HuffmanNode = {
      frequency: left.frequency + right.frequency,
      left,
      right,
    };
    const idx = lowerBound(queue, parent.frequency, (n) => n.frequency);
    queue.splice(idx, 0, parent);
  }
  return queue[0]!;
}

export function lowerBound<T>(
  arr: T[],
  target: number,
  getKey: (v: T) => number
): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (getKey(arr[mid]) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function buildCodeMap(root: HuffmanNode | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!root) return map;
  const walk = (node: HuffmanNode, prefix: string) => {
    if (node.character !== undefined) {
      map.set(node.character, prefix.length === 0 ? "0" : prefix);
      return;
    }
    if (node.left) walk(node.left, prefix + "0");
    if (node.right) walk(node.right, prefix + "1");
  };
  walk(root, "");
  return map;
}

export function encodeBits(text: string, codeMap: Map<string, string>): string {
  let bits = "";
  for (const ch of text) {
    const code = codeMap.get(ch);
    if (code === undefined)
      throw new Error("缺少字符编码: " + JSON.stringify(ch));
    bits += code;
  }
  return bits;
}

export function packBitsToBytes(bits: string): {
  bytes: Uint8Array;
  validBitsInLastByte: number;
} {
  if (bits.length === 0)
    return { bytes: new Uint8Array(0), validBitsInLastByte: 0 };
  const byteLength = Math.ceil(bits.length / 8);
  const out = new Uint8Array(byteLength);
  let byteIndex = 0;
  let bitOffset = 0;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits.charCodeAt(i) === 49 ? 1 : 0; // '1' -> 49
    out[byteIndex] = (out[byteIndex] << 1) | bit;
    bitOffset++;
    if (bitOffset === 8) {
      bitOffset = 0;
      byteIndex++;
    }
  }
  if (bitOffset !== 0) {
    out[byteIndex] <<= 8 - bitOffset;
  }
  const validBits = bitOffset === 0 ? 8 : bitOffset;
  return { bytes: out, validBitsInLastByte: validBits };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function decodeBits(root: HuffmanNode | null, bits: string): string {
  if (!root) return "";
  let out = "";
  let node: HuffmanNode | undefined = root;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits.charCodeAt(i) === 49 ? 1 : 0;
    node = bit === 0 ? node?.left : node?.right;
    if (!node) throw new Error("位流与树不匹配");
    if (node.character !== undefined) {
      out += node.character;
      node = root;
    }
  }
  return out;
}

export function buildTreeFromCodes(
  codes: { character: string; code: string }[]
): HuffmanNode | null {
  if (codes.length === 0) return null;
  const root: HuffmanNode = { frequency: 0 };
  for (const { character, code } of codes) {
    let node = root;
    for (let i = 0; i < code.length; i++) {
      const bit = code.charCodeAt(i) === 49 ? 1 : 0;
      if (bit === 0) {
        if (!node.left) node.left = { frequency: 0 };
        node = node.left;
      } else {
        if (!node.right) node.right = { frequency: 0 };
        node = node.right;
      }
    }
    node.character = character;
  }
  return root;
}

export function unpackBytesToBits(
  bytes: Uint8Array,
  validBitsInLastByte: number
): string {
  if (bytes.length === 0) return "";
  if (validBitsInLastByte <= 0 || validBitsInLastByte > 8) {
    throw new Error("无效的有效位数: " + validBitsInLastByte);
  }
  let bits = "";
  const lastIndex = bytes.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const b = bytes[i]!;
    for (let k = 7; k >= 0; k--) bits += (b >> k) & 1 ? "1" : "0";
  }
  const last = bytes[lastIndex]!;
  for (let k = 7; k >= 8 - validBitsInLastByte; k--)
    bits += (last >> k) & 1 ? "1" : "0";
  return bits;
}

export function encode(text: string): EncodeResult {
  const freqMap = buildFrequencyMap(text);
  const root = buildHuffmanTree(freqMap);
  const codeMap = buildCodeMap(root);
  const encodedBits = encodeBits(text, codeMap);
  const { bytes, validBitsInLastByte } = packBitsToBytes(encodedBits);
  const frequencyTable: FrequencyItem[] = Array.from(freqMap.entries())
    .map(([character, frequency]) => ({ character, frequency }))
    .sort(
      (a, b) =>
        b.frequency - a.frequency || a.character.localeCompare(b.character)
    );
  return {
    root,
    frequencyTable,
    codeMap,
    encodedBits,
    packedBytes: bytes,
    validBitsInLastByte,
  };
}

export function makeCodebook(r: EncodeResult): Codebook {
  const codes: { character: string; code: string }[] = [];
  for (const [ch, code] of r.codeMap.entries())
    codes.push({ character: ch, code });
  codes.sort((a, b) => a.character.localeCompare(b.character));
  return {
    version: 1,
    type: "huffman-codebook",
    encoding: "utf-8",
    codes,
    validBitsInLastByte: r.validBitsInLastByte,
  };
}


