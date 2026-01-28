import type { Hash } from './hashing';
import type { Statement, Parameter } from './ast';

// ============================================================================
// 1. Pivot System (基准点系统)
// 对应 Spec 5.1 & 6.2: 用于支撑数值系统的核心结构
// ============================================================================

export type Pivot =
  | { kind: 'Rat'; n: bigint; d: bigint }   // 有理数: n/d (numerator/denominator)
  | { kind: 'Sym'; name: string }           // 符号常量: "Pi", "e", "Inf"
  | { kind: 'Expr'; op: string; args: Pivot[] }; // 表达式: A + B

// ============================================================================
// 2. Key System (结构化键)
// 对应 Spec 6.1: 系统内部禁止使用字符串拼接，必须使用结构化对象
// ============================================================================

export type KeyRaw =
  | { kind: 'Literal'; value: string }      // 字面量键: "age", "name"
  | { kind: 'Nominal'; id: string }         // 名义键: 用于承载名义符号 ID
  | { kind: 'Lt'; pivot: Pivot }            // 上界约束: < P
  | { kind: 'Gt'; pivot: Pivot }            // 下界约束: > P (可选)
  | { kind: 'Eq'; pivot: Pivot };           // 等值约束: = P (可选)

/**
 * 运行时的 Key 实例
 * 必须是全局驻留 (Interned) 的，通过 ID/Hash 进行 O(1) 比较
 */
export interface Key {
  readonly raw: KeyRaw;
  readonly hash: Hash;
}

// ============================================================================
// 3. Type System IR (类型系统中间码)
// 对应 Spec 2.0
// ============================================================================

export type MorfType =
  | NamespaceType
  | UnionType
  | NeverType
  | TypeFunctionType
  | PrimitiveType;

// Host Interop / Literal Support (String, etc.)
export interface PrimitiveType {
  readonly kind: 'Primitive';
  readonly value: string; // Only strings for now
  readonly hash: Hash;
}


/**
 * 命名空间 (Namespace)
 * 对应 Spec 2.1.1: 键值对的不可变集合
 * 核心特性:
 * 1. 默认值为 Void (未定义的键视为 Void)
 * 2. 结构化等价
 */
export interface NamespaceType {
  readonly kind: 'Namespace';
  // 使用 Map 存储，Key 必须是 Interned Key 对象
  // 值也是 MorfType (递归定义)
  readonly entries: Map<Key, MorfType>; 
  // 数字系统扩展: 序数约束 (Ordinal)
  // 如果存在，表示该 Namespace 实际上是一个序数 N，隐含所有 Lt<q> (q > N)
  readonly ordinal?: Pivot;
  readonly hash: Hash;
}

/**
 * 类型集合 (Union)
 * 对应 Spec 2.2.1: 表达 "或" 的关系
 * 核心特性:
 * 1. 自动扁平化 (Flattened)
 * 2. 自动去重
 * 3. 自动归约 (若 A <: B, 则 {A, B} -> {B})
 */
export interface UnionType {
  readonly kind: 'Union';
  readonly types: Set<MorfType>; // 成员类型
  readonly hash: Hash;
}

/**
 * 底类型 (Never)
 * 对应 Spec 2.1.3: 逻辑矛盾或空集
 */
export interface NeverType {
  readonly kind: 'Never';
  readonly hash: Hash;
}

/**
 * 类型函数 (Type Function)
 * 对应 Spec 2.2.2
 */
export interface TypeFunctionType {
  readonly kind: 'TypeFunction';
  readonly name: string;
  readonly params: Parameter[];
  readonly isVariadic: boolean;
  
  // AST (用于优化执行)
  readonly bodyAST: Statement[];

  // 原生实现钩子 (ctx 是 ExecutionContext，但为了避免循环依赖这里用 any)
  readonly apply: (args: Map<string, MorfType>, ctx: any) => MorfType;
  
  readonly hash: Hash;
}

// ============================================================================
// 4. Type Guards
// ============================================================================

export function isNamespace(t: MorfType): t is NamespaceType {
  return t.kind === 'Namespace';
}

export function isUnion(t: MorfType): t is UnionType {
  return t.kind === 'Union';
}

export function isNever(t: MorfType): t is NeverType {
  return t.kind === 'Never';
}

export function isTypeFunction(t: MorfType): t is TypeFunctionType {
  return t.kind === 'TypeFunction';
}

export function isPrimitive(t: MorfType): t is PrimitiveType {
  return t.kind === 'Primitive';
}

// ============================================================================
// 5. Pretty Print
// ============================================================================

export function prettyPrint(t: MorfType, depth = 0): string {
  if (depth > 5) return '...';

  if (isPrimitive(t)) {
     if (t.value === 'BoolProof') return 'Proof'; 
     return `"${t.value}"`;
  }
  
  if (isNever(t)) return 'Never';
  
  if (isTypeFunction(t)) {
      return `Fn(${t.params.map(p => p.name).join(', ')})${t.isVariadic ? '...' : ''}`;
  }

  if (isUnion(t)) {
     const parts = Array.from(t.types).map(m => prettyPrint(m, depth));
     return `Union { ${parts.join(', ')} }`;
  }

  if (isNamespace(t)) {
     // Check for Ordinal (3)
     if (t.ordinal) {
        if (t.ordinal.kind === 'Rat') {
           const {n, d} = t.ordinal;
           if (d === 1n) return n.toString();
           return Number(n/d).toString(); // Approx
        }
        if (t.ordinal.kind === 'Sym') return t.ordinal.name;
        return 'Expr';
     }

     // Check for Exact Value (#3)
     // { __nominal__: { #3: Proof } }
     // Also check for Tuple [1, 2]
     // { __nominal__: TupleTag, length: #2, 0: 1, 1: 2 }
     
     let isTuple = false;
     let isExact = false;
     let exactVal = '';

     // Hacky iteration to inspect keys
     for (const [k, v] of t.entries) {
        if (k.raw.kind === 'Literal' && k.raw.value === '__nominal__') {
            if (isNamespace(v)) {
                // Check inner keys
                for (const [ik, iv] of v.entries) {
                    if (ik.raw.kind === 'Nominal') {
                       if (ik.raw.id === '#Tuple') isTuple = true;
                       else if (ik.raw.id.startsWith('#')) {
                           isExact = true;
                           exactVal = ik.raw.id;
                       }
                    }
                }
            }
        }
     }
     
     if (isTuple) {
        // Find length
        let len = 0;
        // The length property is itself an Exact Number Namespace
        // But for printing we just look at numeric keys
        const items: string[] = [];
        // Scan for "0", "1"...
        // Since Map iteration order is insertion order, we might need to sort or search.
        // Let's just search up to length.
        
        // Find length property first
        // ... Skip rigorous length check, just find max index
        const indices: number[] = [];
        for (const [k, v] of t.entries) {
           if (k.raw.kind === 'Literal' && !isNaN(Number(k.raw.value))) {
              indices.push(Number(k.raw.value));
           }
        }
        indices.sort((a,b)=>a-b);
        
        return `[${indices.map(i => {
           // We need to find the value for key "i"
           // This is O(N) because we can't lookup by string easily without ctx.
           // But we have the entry iterator.
           // Let's just reconstruct map for O(1)? No ctx.
           // Just iterate.
           for(const [k, v] of t.entries) {
              if (k.raw.kind === 'Literal' && k.raw.value === i.toString()) {
                  return prettyPrint(v, depth+1);
              }
           }
           return '?';
        }).join(', ')}]`;
     }

     if (isExact) return exactVal;

     // Generic Namespace
     if (t.entries.size === 0) return '{}'; // Void? Or {}
     
     // Check for True/False
     // True = { True: BoolProof }
     for (const [k, v] of t.entries) {
        if (k.raw.kind === 'Literal') {
            if (k.raw.value === 'True') return 'True';
            if (k.raw.value === 'False') return 'False';
        }
     }

     const parts: string[] = [];
     for (const [k, v] of t.entries) {
        let keyStr = '?';
        if (k.raw.kind === 'Literal') keyStr = k.raw.value;
        else if (k.raw.kind === 'Nominal') keyStr = k.raw.id;
        else if (k.raw.kind === 'Lt') keyStr = `<${k.raw.pivot}`; // Simplify
        
        parts.push(`${keyStr}: ${prettyPrint(v, depth + 1)}`);
     }
     return `{ ${parts.join(', ')} }`;
  }
  
  return 'Unknown';
}
