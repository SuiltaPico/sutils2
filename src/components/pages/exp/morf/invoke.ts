import { MorfInterner } from './interner';
import type { MorfType, TypeFunctionType } from './ir';
import type { ExecutionContext } from './env';
import { isTypeFunction } from './ir';

/**
 * 调用类型函数
 * 
 * @param func 目标函数
 * @param args 参数列表 (位置参数)
 * @param ctx 执行上下文
 */
export function invoke(
  func: MorfType, 
  args: MorfType[], 
  ctx: ExecutionContext
): MorfType {
  // 1. 类型检查: 必须是函数
  if (!isTypeFunction(func)) {
    // TODO: 抛出运行时错误，或者返回 Never
    ctx.effect('error', 'Attempt to invoke a non-function value');
    return ctx.env.context.NEVER;
  }

  // 2. 参数绑定
  const bindings = new Map<string, MorfType>();
  
  if (func.isVariadic) {
    // 变长参数处理
    // 假设最后一个参数名是 "...rest"，我们将所有剩余参数作为 Key-Value 传入
    // 但为了简化 Native 实现，这里我们直接把参数按 "0", "1", "2" 索引存入 map
    // (这取决于 stdlib.ts 里的约定，之前我们约定了按 map 传)
    
    // 非变长部分
    const fixedParamCount = func.params.length - 1; 
    for (let i = 0; i < fixedParamCount; i++) {
      if (i < args.length) {
        bindings.set(func.params[i], args[i]);
      } else {
        bindings.set(func.params[i], ctx.env.context.VOID); // 缺省为 Void
      }
    }
    
    // 变长部分: 收集剩余参数
    // 我们暂时不包装成 Tuple/List，而是直接混入 bindings，或者使用特殊 key
    // 根据 stdlib.ts Console.Log 的实现，它期望直接拿到 map
    // 让我们稍微修正一下约定：
    // 对于 Native，我们将 args 转换为 Map<string, MorfType>
    // 键为参数名。对于变长部分，键为 "0", "1"... (相对于 rest 的偏移)
    
    const restName = func.params[func.params.length - 1];
    const nsEntries = new Map<any, MorfType>();

    for (let i = fixedParamCount; i < args.length; i++) {
      const offset = i - fixedParamCount;
      const k = offset.toString();

      // 兼容 Native variadic：平铺数字键
      bindings.set(k, args[i]);

      // 供用户函数 `...P` 展开：把 rest 也打包成 Namespace
      nsEntries.set(ctx.env.context.key(k), args[i]);
    }

    // 额外绑定 rest 变量本身（例如 P）
    // 注意：Native 里可能写成 "...msgs" 这种名字，也不会影响现有实现
    bindings.set(restName, ctx.env.context.internNamespace(nsEntries));

  } else {
    // 固定参数处理
    for (let i = 0; i < func.params.length; i++) {
      const paramName = func.params[i];
      if (i < args.length) {
        bindings.set(paramName, args[i]);
      } else {
        bindings.set(paramName, ctx.env.context.VOID);
      }
    }
  }

  // 3. 执行
  // 原生函数直接调用 apply
  // 未来如果支持用户定义函数(Morf AST)，这里需要 Eval Block
  try {
    return func.apply(bindings, ctx);
  } catch (e: any) {
    ctx.effect('error', `Function execution failed: ${e.message}`);
    return ctx.env.context.NEVER;
  }
}

