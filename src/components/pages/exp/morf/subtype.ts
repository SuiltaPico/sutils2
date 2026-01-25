import { MorfInterner } from './interner';
import type { Key, MorfType, NamespaceType } from './ir';
import { isNamespace, isNever, isUnion, isPrimitive } from './ir';
import { globalOracle } from './oracle';

/**
 * 访问 Namespace 的属性
 * 对应 Spec 2.1.1: 默认值规则 (Void Default)
 * 若 k 不在 dom(tau) 中，则返回 Void (空 Namespace)
 * 
 * Update Spec 6.2: Virtual Projection for Strings
 */
export function getProperty(
  type: MorfType, 
  key: Key, 
  ctx: MorfInterner
): MorfType {
  // 1. Primitive (String) Virtual Projection
  if (isPrimitive(type)) {
    const str = type.value;
    
    // length -> #N
    if (key.raw.kind === 'Literal' && key.raw.value === 'length') {
      const len = str.length;
      
      // Construct #N
      const nominalKey = ctx.key('__nominal__');
      const idKey = ctx.internKey({ kind: 'Nominal', id: '#' + len });
      const proof = ctx.internPrimitive('NominalProof');
      const innerNs = ctx.internNamespace(new Map([[idKey, proof]]));
      return ctx.internNamespace(new Map([[nominalKey, innerNs]]));
    }
    
    // index -> "char"
    // Assuming keys like "0", "1" are Literals
    if (key.raw.kind === 'Literal') {
      const idx = Number(key.raw.value);
      if (!isNaN(idx) && Number.isInteger(idx)) {
         if (idx >= 0 && idx < str.length) {
            return ctx.internPrimitive(str[idx]);
         }
      }
    }
    
    return ctx.VOID;
  }

  // 2. Namespace Logic
  if (isNamespace(type)) {
    const val = type.entries.get(key);
    if (val) return val;
    
    // 接入 "隐式知识库" 逻辑
    // 如果 Namespace 是一个序数 (ordinal)，它隐含了所有 Lt<q> (其中 q > ordinal)
    if (type.ordinal && key.raw.kind === 'Lt') {
      const queryPivot = key.raw.pivot;
      const myPivot = type.ordinal;
      
      const isLt = globalOracle.compareLt(myPivot, queryPivot);
      
      if (isLt === 'True') {
        return ctx.VOID;
      }
    }

    // Legacy/Explicit Lt properties fallback
    if (key.raw.kind === 'Lt') {
       const queryPivot = key.raw.pivot;
       for (const [existingKey, _] of type.entries) {
        if (existingKey.raw.kind === 'Lt') {
          const existingPivot = existingKey.raw.pivot;
          const isLt = globalOracle.compareLt(existingPivot, queryPivot);
          const isEq = globalOracle.compareEq(existingPivot, queryPivot);
          if (isLt === 'True' || isEq === 'True') {
            return ctx.VOID;
          }
        }
      }
    }
    
    return ctx.VOID; // 默认值 Void
  }

  // Union or others -> Void (Spec pending on Union distribution in getProperty)
  return ctx.VOID;
}

/**
 * 子类型检查核心逻辑
 * A <: B (Is A a subtype of B?)
 * 凡是需要 B 的地方都可以安全地使用 A
 */
export function isSubtype(
  a: MorfType, 
  b: MorfType, 
  ctx: MorfInterner
): boolean {
  // 1. 自身反身性 (Reflexivity): A <: A
  // 由于使用了 Interning，直接指针比较即可
  if (a === b) return true;

  // 2. Never 是所有类型的子类型 (Bottom Type)
  if (isNever(a)) return true;
  // Never 只有 Never 一个子类型 (已由 step 1 处理)
  if (isNever(b)) return false;

  // 3. Union 处理
  // 规则: Union { A1, A2 } <: B  iff  (A1 <: B) && (A2 <: B)
  if (isUnion(a)) {
    for (const member of a.types) {
      if (!isSubtype(member, b, ctx)) return false;
    }
    return true;
  }
  // 规则: A <: Union { B1, B2 }  iff  (A <: B1) || (A <: B2)
  if (isUnion(b)) {
    for (const member of b.types) {
      if (isSubtype(a, member, ctx)) return true;
    }
    return false;
  }

  // 4. Namespace 处理 (Structural Subtyping)
  if (isNamespace(a) && isNamespace(b)) {
    return isNamespaceSubtype(a, b, ctx);
  }

  // 5. Primitive: invariant, only equal primitives subtype each other
  if (isPrimitive(a) && isPrimitive(b)) {
    return a === b;
  }

  return false;
}

/**
 * 命名空间子类型规则
 * Spec 3.2: A <: B iff
 * 1. Width: dom(B) \subseteq dom(A) (隐式，通过 Void 默认值处理)
 * 2. Depth: \forall k, A[k] <: B[k]
 */
function isNamespaceSubtype(
  a: NamespaceType, 
  b: NamespaceType, 
  ctx: MorfInterner
): boolean {
  // 优化: 空 Namespace (Void) 是最宽的类型
  // 任何具体 Namespace A 都是 Void 的子类型 (A <: {})
  if (b === ctx.VOID) return true;
  
  // 1. Ordinal Constraint Check (Spec 5.4: a < b => a <: b)
  if (b.ordinal) {
    if (!a.ordinal) {
      // If B is an ordinal but A is not, A must satisfy B's implied Lt<q> properties.
      // This means A must have an explicit Lt key that is <= B.ordinal
      let satisfied = false;
      for (const [k, _] of a.entries) {
        if (k.raw.kind === 'Lt') {
           const isLt = globalOracle.compareLt(k.raw.pivot, b.ordinal);
           const isEq = globalOracle.compareEq(k.raw.pivot, b.ordinal);
           if (isLt === 'True' || isEq === 'True') {
             satisfied = true;
             break;
           }
        }
      }
      if (!satisfied) return false;
    } else {
      // Both are ordinals. A <: B iff A.ordinal <= B.ordinal
      const isLt = globalOracle.compareLt(a.ordinal, b.ordinal);
      const isEq = globalOracle.compareEq(a.ordinal, b.ordinal);
      if (isLt !== 'True' && isEq !== 'True') {
        return false;
      }
    }
  }

  // 2. Explicit Properties Check (Structural Subtyping)
  // A 必须满足 B 的所有约束
  // 遍历 B 的所有显式属性
  for (const [key, bVal] of b.entries) {
    // 获取 A 中对应的属性类型 (如果不存在则为 Void)
    const aVal = getProperty(a, key, ctx);
    
    // 递归检查属性类型的子类型关系 (Depth Rule)
    if (!isSubtype(aVal, bVal, ctx)) {
      return false;
    }
  }
  
  return true;
}
