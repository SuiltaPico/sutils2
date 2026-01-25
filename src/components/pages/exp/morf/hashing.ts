// Morf Structural Hashing Implementation
import type { Key, KeyRaw, Pivot } from './ir';

export type Hash = number;

// FNV-1a 32-bit constants
const FNV_PRIME = 16777619;
const FNV_OFFSET_BASIS = 2166136261;

/**
 * 计算字符串的 FNV-1a 哈希
 */
export function hashString(str: string): Hash {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer
}

/**
 * 计算数字的哈希
 */
export function hashNumber(num: number): Hash {
  // 简单处理：转字符串。对于高精度需求，需结合 Pivot 结构处理。
  return hashString(num.toString());
}

/**
 * 计算 BigInt 的哈希
 */
export function hashBigInt(n: bigint): Hash {
  return hashString(n.toString());
}

/**
 * 混合两个哈希值（顺序敏感）
 * 用于: 列表, 结构体字段
 * Algo: Boost Hash Combine
 */
export function mix(h1: Hash, h2: Hash): Hash {
  return (h1 ^ (h2 + 0x9e3779b9 + (h1 << 6) + (h1 >> 2))) >>> 0;
}

/**
 * 混合多个哈希值（顺序敏感）
 */
export function mixAll(...hashes: Hash[]): Hash {
  let h = 0;
  for (const val of hashes) {
    h = mix(h, val);
  }
  return h;
}

/**
 * 混合多个哈希值（顺序无关/满足交换律）
 * 用于: 集合, 命名空间 (Namespace)
 * Algo: XOR Sum
 */
export function combineUnordered(hashes: Iterable<Hash>): Hash {
  let result = 0;
  for (const h of hashes) {
    result ^= h;
  }
  return result >>> 0;
}

/**
 * 基础哈希接口
 */
export interface HasHash {
  readonly hash: Hash;
}

// ==========================================
// 针对 Morf Key 和 Namespace 的哈希策略
// ==========================================

export function hashPivot(p: Pivot): Hash {
  switch (p.kind) {
    case 'Rat':
      // mix(mix(tag, n), d)
      return mixAll(hashString('Rat'), hashBigInt(p.n), hashBigInt(p.d));
    case 'Sym':
      return mix(hashString('Sym'), hashString(p.name));
    case 'Expr':
      // op + args
      let h = mix(hashString('Expr'), hashString(p.op));
      for (const arg of p.args) {
        h = mix(h, hashPivot(arg));
      }
      return h;
  }
}

export function hashKeyRaw(k: KeyRaw): Hash {
  switch (k.kind) {
    case "Literal":
      return mix(hashString("Literal"), hashString(k.value));
    case "Nominal":
      return mix(hashString("Nominal"), hashString(k.id));
    case "Lt":
      return mix(hashString("Lt"), hashPivot(k.pivot));
    case "Gt":
      return mix(hashString("Gt"), hashPivot(k.pivot));
    case "Eq":
      return mix(hashString("Eq"), hashPivot(k.pivot));
  }
}

export function hashPrimitive(val: string): Hash {
  return mix(hashString('Primitive'), hashString(val));
}

/**
 * 命名空间哈希计算
 * Namespace = { [Key]: Value }
 * 哈希算法 = XOR_SUM( mix(hash(Key), hash(Value)) )
 * 这里的 Key 和 Value 都是已经计算好 Hash 的 Runtime 对象
 */
export function hashNamespace(ns: Map<Key, HasHash>, ordinal?: Pivot): Hash {
  let combinedHash = 0;
  
  for (const [k, v] of ns.entries()) {
    const kHash = k.hash; 
    const vHash = v.hash;
    
    // 将 Key 和 Value 绑定在一起 (Pair Hash)
    const pairHash = mix(kHash, vHash);
    
    // 累积到整体 (Order Independent)
    combinedHash ^= pairHash;
  }
  
  if (ordinal) {
    const ordinalHash = hashPivot(ordinal);
    // Mix ordinal hash specifically
    combinedHash = mix(combinedHash, ordinalHash);
  }

  return combinedHash >>> 0;
}
