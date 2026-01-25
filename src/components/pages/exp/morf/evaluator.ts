import type { Statement, Expression, NamespaceLiteral } from './ast';
import type { MorfType, Key } from './ir';
import { isNamespace } from './ir';
import { Environment, ExecutionContext } from './env';
import { invoke } from './invoke';
import { getProperty } from './subtype';

// ============================================================================
// Evaluator
// ============================================================================

export function evaluateBlock(stmts: Statement[], env: Environment, ctx: ExecutionContext): MorfType {
  let last: MorfType = ctx.env.context.VOID;
  
  for (const stmt of stmts) {
    if (stmt.kind === 'Let') {
      const val = evaluate(stmt.value, env, ctx);
      env.define(stmt.name, val);
      last = ctx.env.context.VOID;
    } else if (stmt.kind === 'ExprStmt') {
      last = evaluate(stmt.expr, env, ctx);
    }
  }
  
  return last;
}

export function evaluate(node: Expression, env: Environment, ctx: ExecutionContext): MorfType {
  switch (node.kind) {
    case 'Literal':
      return node.value;
      
    case 'Var': {
      const val = env.lookup(node.name);
      if (!val) {
        throw new Error(`Undefined variable: ${node.name}`);
      }
      return val;
    }
    
    case 'Call': {
      const func = evaluate(node.func, env, ctx);

      if (node.style === 'Paren') {
        const args = node.args.map(arg => evaluate(arg, env, ctx));
        return invoke(func, args, ctx);
      }

      // Brace call: f { ... }
      // 旧语义：先把 { ... } 求值为 Namespace，然后取 values() 作为位置参数调用。
      const nsVal = evaluateNamespace(node.argNamespace, env, ctx);
      if (!isNamespace(nsVal)) {
        throw new Error('Brace call argument must evaluate to a Namespace');
      }
      const args = Array.from(nsVal.entries.values());
      return invoke(func, args, ctx);
    }
    
    case 'Member': {
      const target = evaluate(node.target, env, ctx);
      return getProperty(target, node.key, ctx.env.context);
    }
    
    case 'Function': {
      // 创建闭包
      // 注意：这里不再 Parse，因为 body 已经是 AST 了
      // 我们创建一个新的 TypeFunction，它捕获了当前的 env
      
      const { params, isVariadic, body, hash } = node;
      
      return {
        kind: 'TypeFunction',
        name: 'anonymous', // 匿名函数
        params,
        isVariadic,
        bodyAST: body,
        hash,
        apply: (argsMap, callCtx) => {
          // 1. Create Scope
          const scope = new Environment(env, callCtx.env.context); // 使用闭包 captured env
          for (const [k, v] of argsMap) {
            scope.define(k, v);
          }
          
          // 2. Evaluate Body AST
          return evaluateBlock(body, scope, callCtx);
        }
      };
    }
    
    case 'NamespaceLiteral': {
      return evaluateNamespace(node, env, ctx);
    }
    
    case 'UnionLiteral': {
      const types = new Set<MorfType>();
      for (const el of node.elements) {
        types.add(evaluate(el, env, ctx));
      }
      return ctx.env.context.internUnion(types);
    }
    
    case 'TupleLiteral': {
      // 运行时脱糖或者直接构造
      // 复用 Parser 中的逻辑：Tuple -> Namespace
      // { __nominal__: { #Tuple: Proof }, length: #N, 0: v0, ... }
      
      const items = node.elements.map(e => evaluate(e, env, ctx));
      const morfer = ctx.env.context;
      
      const entries = new Map<Key, MorfType>();
      
      // 1. __nominal__
      const nominalKey = morfer.key('__nominal__');
      const tupleIdKey = morfer.internKey({ kind: 'Nominal', id: '#Tuple' });
      const proof = morfer.internPrimitive('NominalProof');
      const tupleTag = morfer.internNamespace(new Map([[tupleIdKey, proof]]));
      entries.set(nominalKey, tupleTag);
      
      // 2. length
      const lengthKey = morfer.key('length');
      const lenIdKey = morfer.internKey({ kind: 'Nominal', id: '#' + items.length });
      const lenVal = morfer.internNamespace(new Map([[nominalKey, morfer.internNamespace(new Map([[lenIdKey, proof]]))]]));
      entries.set(lengthKey, lenVal);
      
      // 3. items
      for (let i = 0; i < items.length; i++) {
        entries.set(morfer.key(i.toString()), items[i]);
      }
      
      return morfer.internNamespace(entries);
    }
  }
  
  return ctx.env.context.VOID;
}

function evaluateNamespace(node: NamespaceLiteral, env: Environment, ctx: ExecutionContext): MorfType {
  const entries = new Map<Key, MorfType>();
  
  for (const entry of node.entries) {
    if (entry.kind === 'Spread') {
      const val = env.lookup(entry.name);
      if (!val) throw new Error(`Undefined variable in spread: ${entry.name}`);
      if (!isNamespace(val)) throw new Error(`Cannot spread non-namespace: ${entry.name}`);
      
      for (const [k, v] of val.entries) {
        entries.set(k, v);
      }
    } else {
      // Entry
      const val = evaluate(entry.value, env, ctx);
      entries.set(entry.key, val);
    }
  }
  
  return ctx.env.context.internNamespace(entries);
}
