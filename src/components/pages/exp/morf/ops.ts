import { MorfInterner } from './interner';
import type { Key, MorfType, NamespaceType, UnionType, Pivot } from './ir';
import { isNamespace, isNever, isUnion, isPrimitive } from './ir';
import { getProperty, isSubtype } from './subtype';
import { globalOracle } from './oracle';

// ============================================================================
// Intersection (交集)
// ============================================================================

/**
 * 计算两个类型的交集
 * Intersection { A, B }
 * 
 * 核心逻辑:
 * 1. 自动归约: if A <: B return A (A 更窄，是交集结果)
 * 2. 分布律: Intersection { Union {A, B}, C } -> Union { Intersection{A, C}, Intersection{B, C} }
 * 3. 命名空间合并: { k: T1 } & { k: T2 } -> { k: T1 & T2 }
 */
export function intersection(
  a: MorfType, 
  b: MorfType, 
  ctx: MorfInterner
): MorfType {
  // 1. 快速路径与自动归约
  if (a === b) return a;
  if (isNever(a) || isNever(b)) return ctx.NEVER;

  // Primitive intersection: only equal primitives intersect, otherwise Never
  if (isPrimitive(a) && isPrimitive(b)) return ctx.NEVER;
  
  if (isSubtype(a, b, ctx)) return a; // A is smaller
  if (isSubtype(b, a, ctx)) return b; // B is smaller

  // 2. Union 分布律
  if (isUnion(a)) {
    // (A1 | A2) & B = (A1 & B) | (A2 & B)
    const members = new Set<MorfType>();
    for (const member of a.types) {
      members.add(intersection(member, b, ctx));
    }
    return ctx.internUnion(members);
  }
  if (isUnion(b)) {
    return intersection(b, a, ctx); // 交换律
  }

  // 3. Namespace 合并
  if (isNamespace(a) && isNamespace(b)) {
    return intersectNamespaces(a, b, ctx);
  }

  // 默认不可合并 (例如不同类型的 Primitives，虽然 Morf 中只有 Namespace)
  return ctx.NEVER;
}

function intersectNamespaces(
  a: NamespaceType, 
  b: NamespaceType, 
  ctx: MorfInterner
): MorfType {
  // Determine new ordinal (min value = stronger constraint)
  let newOrdinal: Pivot | undefined = undefined;
  if (a.ordinal && b.ordinal) {
     // If both are ordinals, pick the smaller one (stronger upper bound)
     const isALtB = globalOracle.compareLt(a.ordinal, b.ordinal) === 'True';
     newOrdinal = isALtB ? a.ordinal : b.ordinal;
  } else {
     // Inherit if only one has it
     newOrdinal = a.ordinal || b.ordinal;
  }

  // 合并 Key 集合
  // 结果必须包含 dom(A) U dom(B)
  const keys = new Set<Key>();
  for (const k of a.entries.keys()) keys.add(k);
  for (const k of b.entries.keys()) keys.add(k);

  const newEntries = new Map<Key, MorfType>();

  for (const k of keys) {
    // 递归求交集
    // 如果某一方没有该 Key，getProperty 会返回 Void
    // T & Void = T (因为 T <: Void)
    const valA = getProperty(a, k, ctx);
    const valB = getProperty(b, k, ctx);
    
    // 特殊处理数值类型的自动归约 (Lt<3> & Lt<5> -> Lt<3>)
    // 虽然通用 Intersection 也能处理，但在 Namespace 构造层做可能更快
    // 这里直接调用通用 Intersection 即可
    const valInter = intersection(valA, valB, ctx);
    
    // 如果任意属性变成 Never，整个 Namespace 坍缩为 Never
    if (isNever(valInter)) return ctx.NEVER;
    
    // 优化: 如果结果是 Void (且原属性不是显式 Void)，通常不需要存储
    // 但为了保持结构完整性，且 getProperty 默认返回 Void，这里可以不存
    if (valInter !== ctx.VOID) {
      newEntries.set(k, valInter);
    }
  }

  return ctx.internNamespace(newEntries, newOrdinal);
}

// ============================================================================
// Union (并集)
// ============================================================================

/**
 * 计算两个类型的并集
 * Union { A, B }
 */
export function union(
  a: MorfType, 
  b: MorfType, 
  ctx: MorfInterner
): MorfType {
  // 1. 快速路径与自动归约
  if (a === b) return a;
  if (isNever(a)) return b;
  if (isNever(b)) return a;
  
  if (isSubtype(a, b, ctx)) return b; // B is wider
  if (isSubtype(b, a, ctx)) return a; // A is wider

  // 2. 构造 Union 集合
  const members = new Set<MorfType>();
  
  if (isUnion(a)) {
    for (const m of a.types) members.add(m);
  } else {
    members.add(a);
  }

  if (isUnion(b)) {
    for (const m of b.types) members.add(m);
  } else {
    members.add(b);
  }

  // internUnion 会再次处理自动归约和去重
  return ctx.internUnion(members); 
}

// ============================================================================
// Difference (差集)
// ============================================================================

/**
 * 计算 A - B
 * 从 A (通常是 Union) 中移除 B 的成分
 */
export function difference(
  a: MorfType, 
  b: MorfType, 
  ctx: MorfInterner
): MorfType {
  // 1. 如果 A 是 B 的子类型，A 完全被 B 覆盖 -> Never
  if (isSubtype(a, b, ctx)) return ctx.NEVER;

  // 2. 如果 A 和 B 没有任何交集 (A & B = Never)，则 A - B = A
  // 这里的检查比较昂贵，可以先跳过

  // 3. Union 分布律
  // (A1 | A2) - B = (A1 - B) | (A2 - B)
  if (isUnion(a)) {
    const members = new Set<MorfType>();
    for (const member of a.types) {
      const diff = difference(member, b, ctx);
      members.add(diff);
    }
    return ctx.internUnion(members);
  }

  // 4. 单体 A vs B
  // 既然 step 1 没返回，说明 A 不被 B 包含。
  // 在结构化类型系统中，如果是 Namespace - Namespace，通常无法简单减除，除非完全不重叠。
  // Morf 目前的 Spec 对于 Namespace 的差集定义主要用于从 Union 中剔除分支。
  // 因此，如果 A 不是 Union 且 A 不属于 B，则保留 A。
  
  return a;
}

