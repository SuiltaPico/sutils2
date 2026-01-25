import type { Hash } from './hashing';
import { hashKeyRaw, hashNamespace, combineUnordered, mix, mixAll, hashString, hashPrimitive } from './hashing';
import type { Key, KeyRaw, MorfType, NamespaceType, UnionType, NeverType, Pivot, PrimitiveType } from './ir';
import { isNamespace, isUnion, isNever, isPrimitive } from './ir';

// ============================================================================
// Equality Checks (用于哈希冲突时的深度比较)
// ============================================================================

function pivotEquals(a: Pivot, b: Pivot): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'Rat') {
    const bRat = b as Extract<Pivot, { kind: 'Rat' }>;
    return a.n === bRat.n && a.d === bRat.d;
  }
  if (a.kind === 'Sym') {
    return a.name === (b as Extract<Pivot, { kind: 'Sym' }>).name;
  }
  if (a.kind === 'Expr') {
    const bExpr = b as Extract<Pivot, { kind: 'Expr' }>;
    if (a.op !== bExpr.op) return false;
    if (a.args.length !== bExpr.args.length) return false;
    for (let i = 0; i < a.args.length; i++) {
      if (!pivotEquals(a.args[i], bExpr.args[i])) return false;
    }
    return true;
  }
  return false;
}

function keyRawEquals(a: KeyRaw, b: KeyRaw): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'Literal': return a.value === (b as typeof a).value;
    case 'Nominal': return a.id === (b as typeof a).id;
    case 'Lt': 
    case 'Gt':
    case 'Eq':
      return pivotEquals(a.pivot, (b as typeof a).pivot);
  }
}

/**
 * 检查两个 Namespace 的 Map 内容是否完全一致
 * 前提: Key 对象本身已经是 Interned 的 (引用相等即代表相等)
 * 前提: Value 对象 (MorfType) 也必须是 Interned 的
 */
function namespaceContentEquals(
  a: Map<Key, MorfType>, 
  b: Map<Key, MorfType>
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const v2 = b.get(k);
    // 指针比较：因为所有 MorfType 都是 Interned 的
    if (v2 !== v) return false;
  }
  return true;
}

function unionContentEquals(a: Set<MorfType>, b: Set<MorfType>): boolean {
  if (a.size !== b.size) return false;
  for (const t of a) {
    if (!b.has(t)) return false;
  }
  return true;
}

// ============================================================================
// Interner System
// ============================================================================

class Pool<T extends { hash: Hash }> {
  // Map<Hash, Array<T>> 处理哈希冲突
  private map = new Map<Hash, T[]>();

  get(hash: Hash, check: (candidate: T) => boolean): T | undefined {
    const candidates = this.map.get(hash);
    if (!candidates) return undefined;
    return candidates.find(check);
  }

  add(item: T): T {
    const list = this.map.get(item.hash);
    if (list) {
      list.push(item);
    } else {
      this.map.set(item.hash, [item]);
    }
    return item;
  }
}

export class MorfInterner {
  private keyPool = new Pool<Key>();
  private typePool = new Pool<MorfType>();

  // 单例 Never
  public readonly NEVER: NeverType;
  // 单例 Void (空 Namespace)
  public readonly VOID: NamespaceType;

  constructor() {
    // 初始化 Never
    this.NEVER = { kind: 'Never', hash: mix(hashString('Never'), 0) }; // 简单哈希
    this.typePool.add(this.NEVER);

    // 初始化 Void
    const voidHash = hashNamespace(new Map());
    this.VOID = { kind: 'Namespace', entries: new Map(), hash: voidHash };
    this.typePool.add(this.VOID);
  }

  // --------------------------------------------------------------------------
  // Key Interning
  // --------------------------------------------------------------------------

  internKey(raw: KeyRaw): Key {
    const hash = hashKeyRaw(raw);
    
    const existing = this.keyPool.get(hash, (k) => keyRawEquals(k.raw, raw));
    if (existing) return existing;

    const newKey: Key = { raw, hash };
    return this.keyPool.add(newKey);
  }

  // 快捷构造器
  key(name: string): Key {
    return this.internKey({ kind: 'Literal', value: name });
  }
  
  nominalKey(id: string): Key {
    return this.internKey({ kind: 'Nominal', id });
  }

  ltKey(pivot: Pivot): Key {
    return this.internKey({ kind: 'Lt', pivot });
  }

  // --------------------------------------------------------------------------
  // Type Interning
  // --------------------------------------------------------------------------

  internNamespace(entries: Map<Key, MorfType>, ordinal?: Pivot): NamespaceType {
    if (entries.size === 0 && !ordinal) return this.VOID;

    const hash = hashNamespace(entries, ordinal);
    const existing = this.typePool.get(hash, (t) => {
      if (!isNamespace(t)) return false;
      
      // Check ordinal
      if (t.ordinal && !ordinal) return false;
      if (!t.ordinal && ordinal) return false;
      if (t.ordinal && ordinal && !pivotEquals(t.ordinal, ordinal)) return false;

      return namespaceContentEquals(t.entries, entries);
    });
    if (existing) return existing as NamespaceType;

    // 创建新的 (必须复制 Map 以防外部修改)
    const newNs: NamespaceType = {
      kind: 'Namespace',
      entries: new Map(entries),
      ordinal,
      hash
    };
    return this.typePool.add(newNs) as NamespaceType;
  }

  internUnion(types: Set<MorfType>): MorfType {
    // 自动归约 1: 空集 -> Never (通常 Union 语义下空集是 Never)
    // 但如果在 Morf 中 Union {} 语义未定义，暂且视为 Never
    if (types.size === 0) return this.NEVER;

    // 自动归约 2: 单元素集合 -> 元素本身
    if (types.size === 1) {
      return types.values().next().value!;
    }

    // 自动扁平化: 如果成员中有 Union，将其展开
    const flattened = new Set<MorfType>();
    for (const t of types) {
      if (isUnion(t)) {
        for (const sub of t.types) flattened.add(sub);
      } else {
        flattened.add(t);
      }
    }
    
    // 如果扁平化后只剩一个
    if (flattened.size === 1) return flattened.values().next().value!;

    // 计算哈希 (XOR Sum for Order Independence)
    // Union Hash = XOR(Hash("Union"), XOR(MemberHashes))
    let memberHash = 0;
    for (const t of flattened) memberHash ^= t.hash;
    const hash = mix(hashString('Union'), memberHash);

    const existing = this.typePool.get(hash, (t) => 
      isUnion(t) && unionContentEquals(t.types, flattened)
    );
    if (existing) return existing;

    const newUnion: UnionType = {
      kind: 'Union',
      types: flattened,
      hash
    };
    return this.typePool.add(newUnion) as UnionType;
  }

  internPrimitive(val: string): PrimitiveType {
    const hash = hashPrimitive(val);
    const existing = this.typePool.get(hash, (t) => isPrimitive(t) && t.value === val);
    if (existing) return existing as PrimitiveType;

    const newPrim: PrimitiveType = { kind: 'Primitive', value: val, hash };
    return this.typePool.add(newPrim) as PrimitiveType;
  }
}

// 全局单例实例 (可选)
export const globalMorf = new MorfInterner();

