import type { MorfType, Key } from './ir';
import type { Hash } from './hashing';

// ============================================================================
// Abstract Syntax Tree (AST) Definitions
// ============================================================================

export type Node = Statement | Expression;

// ----------------------------------------------------------------------------
// Statements
// ----------------------------------------------------------------------------

export type Statement = 
  | LetStatement
  | ExpressionStatement;

export interface LetStatement {
  kind: 'Let';
  name: string;
  value: Expression;
}

/**
 * 表达式语句。
 * 在 Block 中，只有最后一个 ExpressionStatement 的值会被返回（如果它是 Block 的结尾）。
 * 前面的 ExpressionStatement 通常用于副作用（如果有的话）。
 */
export interface ExpressionStatement {
  kind: 'ExprStmt';
  expr: Expression;
}

// ----------------------------------------------------------------------------
// Expressions
// ----------------------------------------------------------------------------

export type Expression = 
  | Literal
  | Identifier
  | CallExpression
  | MemberExpression
  | FunctionExpression
  | NamespaceLiteral
  | UnionLiteral
  | TupleLiteral;

/**
 * 静态常量。
 * 数字、字符串等在 Parse 阶段就可以被 Intern 为 MorfType。
 */
export interface Literal {
  kind: 'Literal';
  value: MorfType; 
}

/**
 * 变量引用
 */
export interface Identifier {
  kind: 'Var';
  name: string;
}

/**
 * 函数调用: f(a, b) 或 f { ... }
 */
export type CallExpression =
  | {
      kind: 'Call';
      style: 'Paren';
      func: Expression;
      args: Expression[];
    }
  | {
      kind: 'Call';
      style: 'Brace';
      func: Expression;
      argNamespace: NamespaceLiteral;
    };

/**
 * 成员访问: obj.key
 */
export interface MemberExpression {
  kind: 'Member';
  target: Expression;
  key: Key; // Key 在 Parse 阶段通常是已知的（Identifier 或 Number），可以直接 Intern
}

/**
 * 函数定义: (args) { body }
 * 这是本次重构的核心：body 不再是 string，而是预编译好的 AST。
 */
export interface FunctionExpression {
  kind: 'Function';
  params: string[];
  isVariadic: boolean;
  body: Statement[];
  hash: Hash; // 预计算的 Hash，基于源码或结构
}

// --- Complex Literals (Constructors) ---

export type NamespaceEntry = 
  | { kind: 'Entry', key: Key, value: Expression }
  | { kind: 'Spread', name: string }; // ...p

/**
 * Namespace 字面量: { a: 1, b: x, ...p }
 */
export interface NamespaceLiteral {
  kind: 'NamespaceLiteral';
  entries: NamespaceEntry[];
}

/**
 * Union 字面量: #{ A, B }
 */
export interface UnionLiteral {
  kind: 'UnionLiteral';
  elements: Expression[];
}

/**
 * Tuple 字面量: [a, b]
 * 虽然它会被脱糖为 Namespace，但为了保持 AST 与源码的一致性，
 * 或者为了方便后续优化，保留独立的节点类型是合理的。
 * Parser 可以选择直接生成 Desugared 的 NamespaceLiteral，也可以生成 TupleLiteral 让 Evaluator 处理。
 * 建议：让 Parser 处理脱糖，或者 Evaluator 处理。
 * 考虑到 Tuple 脱糖逻辑较复杂（涉及 __nominal__, length 等），
 * 这里保留 TupleLiteral 节点，让编译阶段或执行阶段处理均可。
 */
export interface TupleLiteral {
  kind: 'TupleLiteral';
  elements: Expression[];
}
