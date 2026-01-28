import type { Statement, Expression, NamespaceLiteral } from './ast';
import type { MorfType, Key } from './ir';
import { isNamespace } from './ir';
import { Environment, ExecutionContext } from './env';
import { invoke } from './invoke';
import { getProperty } from './subtype';
import * as OPS from './ops';

// ============================================================================
// Evaluator
// ============================================================================

// 用于 `nominal { ... }` 语法糖的全局计数器（进程级唯一即可）。
let __nominalCounter = 0;

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
      // 1. 特殊处理 `nominal { ... }` 语法糖
      if (node.style === 'Brace' && node.func.kind === 'Var' && node.func.name === 'nominal') {
        const morfer = ctx.env.context;
        const nsVal = evaluateNamespace(node.argNamespace, env, ctx);
        if (!isNamespace(nsVal)) {
          throw new Error('nominal { ... } requires a Namespace literal');
        }

        const nominalKey = morfer.key('__nominal__');
        const proof = morfer.internPrimitive('NominalProof');
        const idKey = morfer.internKey({ kind: 'Nominal', id: `#nominal:${++__nominalCounter}` });
        const nominalTag = morfer.internNamespace(new Map([[idKey, proof]]));

        const entries = new Map(nsVal.entries);
        entries.set(nominalKey, nominalTag);
        return morfer.internNamespace(entries);
      }

      // 2. 求值函数本身
      const func = evaluate(node.func, env, ctx);

      // 3. 处理参数 (核心：Automatic Thunking)
      // 如果被调用者是 TypeFunction，我们需要根据其参数定义来决定是否包装实参
      const prepareArg = (expr: Expression, index: number): MorfType => {
        // 如果实参是 DirectlyExpression，则强制不进行任何包装
        if (expr.kind === 'Directly') {
          return evaluate(expr.expression, env, ctx);
        }

        // 检查函数签名
        if (func.kind === 'TypeFunction') {
          const paramDef = func.params[index] || (func.isVariadic ? func.params[func.params.length - 1] : null);
          if (paramDef && paramDef.modifier === 'wrap') {
            // 进行自动包装 (Automatic Thunk)
            // 创建一个零参函数，它在被调用时才 evaluate 当前表达式
            return {
              kind: 'TypeFunction',
              name: 'thunk',
              params: [],
              isVariadic: false,
              bodyAST: [], // 原生 Thunk 不需要 bodyAST
              hash: 0, 
              apply: (_args, callCtx) => evaluate(expr, env, callCtx)
            };
          }
        }
        return evaluate(expr, env, ctx);
      };

      if (node.style === 'Paren') {
        const args = node.args.map((arg, i) => prepareArg(arg, i));
        return invoke(func, args, ctx);
      }

      // Brace call: f { ... }
      // 如果是 f { a, b }，它会被脱糖为 positional 参数调用（按照插入顺序）
      const nsVal = evaluateNamespace(node.argNamespace, env, ctx, prepareArg);
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
      const { params, isVariadic, body, hash } = node;
      
      return {
        kind: 'TypeFunction',
        name: 'anonymous',
        params,
        isVariadic,
        bodyAST: body,
        hash,
        apply: (argsMap, callCtx) => {
          const scope = new Environment(env, callCtx.env.context);
          for (const [k, v] of argsMap) {
            scope.define(k, v);
          }
          return evaluateBlock(body, scope, callCtx);
        }
      };
    }

    case 'Block': {
      return evaluateBlock(node.statements, env, ctx);
    }

    case 'Directly': {
      // 在正常的 evaluate 中，Directly 只是解包。
      // 它真正的作用是在 CallExpression 的参数处理中被识别。
      return evaluate(node.expression, env, ctx);
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

    case 'Binary': {
      const left = evaluate(node.left, env, ctx);
      const right = evaluate(node.right, env, ctx);
      return evaluateBinary(node.op, left, right, ctx);
    }

    case 'Unary': {
      const arg = evaluate(node.argument, env, ctx);
      return evaluateUnary(node.op, arg, ctx);
    }
  }
  
  return ctx.env.context.VOID;
}

// ============================================================================
// Operator Implementations
// ============================================================================

function evaluateBinary(op: string, left: MorfType, right: MorfType, ctx: ExecutionContext): MorfType {
  const morfer = ctx.env.context;

  switch (op) {
    // 1. Logical
    case 'DoubleAnd': return OPS.and(left, right, morfer);
    case 'DoubleOr':  return OPS.or(left, right, morfer);
    
    // 2. Equality
    case 'DoubleEq': return OPS.eq(left, right, morfer);
    case 'BangEq':   return OPS.neq(left, right, morfer);
    
    // 3. Subtyping / Comparison
    case 'Lt':   return OPS.lt(left, right, morfer);
    case 'LtEq': return OPS.lte(left, right, morfer);
    case 'Gt':   return OPS.gt(left, right, morfer);
    case 'GtEq': return OPS.gte(left, right, morfer);

    // 4. Type Algebra
    case 'Intersection': return OPS.intersection(left, right, morfer);
    case 'Union':        return OPS.union(left, right, morfer);

    // 5. Ordinal Math
    case 'Plus':    return OPS.add(left, right, morfer);
    case 'Minus':   return OPS.sub(left, right, morfer);
    case 'Star':    return OPS.mul(left, right, morfer);
    case 'Slash':   return OPS.div(left, right, morfer);
    case 'Percent': return OPS.mod(left, right, morfer);
  }

  return morfer.NEVER;
}

function evaluateUnary(op: string, arg: MorfType, ctx: ExecutionContext): MorfType {
  const morfer = ctx.env.context;

  if (op === 'Bang') {
    return OPS.not(arg, morfer);
  }
  if (op === 'Minus') {
    // We can simulate negation as 0 - arg or special unary impl in OPS
    // Let's implement unary minus in OPS or do 0 - arg?
    // OPS currently doesn't export neg. Let's do 0 - arg.
    // Wait, creating 0 is expensive here. Let's add neg to OPS later or use sub(0, arg).
    // But `evaluateUnary` implementation in previous version handled Rat manually.
    // I should probably add `neg` to OPS or keep manual implementation if trivial.
    // Previous impl:
    /*
    if (isNamespace(arg) && arg.ordinal && arg.ordinal.kind === 'Rat') {
      return morfer.internNamespace(new Map(), { 
        kind: 'Rat', 
        n: -arg.ordinal.n, 
        d: arg.ordinal.d 
      });
    }
    */
    // Let's just inline it for now or move to OPS.
    // Moving to OPS is cleaner.
    if (isNamespace(arg) && arg.ordinal && arg.ordinal.kind === 'Rat') {
       return morfer.internNamespace(new Map(), { 
         kind: 'Rat', 
         n: -arg.ordinal.n, 
         d: arg.ordinal.d 
       });
    }
  }
  return morfer.NEVER;
}

function evaluateNamespace(
  node: NamespaceLiteral, 
  env: Environment, 
  ctx: ExecutionContext,
  argEvaluator?: (expr: Expression, index: number) => MorfType
): MorfType {
  const entries = new Map<Key, MorfType>();
  let index = 0;
  
  for (const entry of node.entries) {
    if (entry.kind === 'Spread') {
      const val = env.lookup(entry.name);
      if (!val) throw new Error(`Undefined variable in spread: ${entry.name}`);
      if (!isNamespace(val)) throw new Error(`Cannot spread non-namespace: ${entry.name}`);
      
      for (const [k, v] of val.entries) {
        entries.set(k, v);
        index++;
      }
    } else {
      // Entry
      const val = argEvaluator 
        ? argEvaluator(entry.value, index)
        : evaluate(entry.value, env, ctx);
      entries.set(entry.key, val);
      index++;
    }
  }
  
  return ctx.env.context.internNamespace(entries);
}
