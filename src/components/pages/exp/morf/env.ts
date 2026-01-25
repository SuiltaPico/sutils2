import { MorfInterner } from './interner';
import type { Key, MorfType } from './ir';
import { isNamespace, isUnion, isNever } from './ir';

/**
 * 运行时环境 (Scope)
 * 用于存储变量绑定、类型别名等
 */
export class Environment {
  private bindings = new Map<string, MorfType>();
  
  constructor(
    private parent?: Environment,
    private ctx: MorfInterner = (parent ? parent.ctx : new MorfInterner())
  ) {}

  public get context(): MorfInterner {
    return this.ctx;
  }

  /**
   * 定义变量/类型
   */
  define(name: string, type: MorfType): void {
    this.bindings.set(name, type);
  }

  /**
   * 查找变量/类型
   */
  lookup(name: string): MorfType | undefined {
    const val = this.bindings.get(name);
    if (val) return val;
    if (this.parent) return this.parent.lookup(name);
    return undefined;
  }

  /**
   * 创建子环境
   */
  fork(): Environment {
    return new Environment(this);
  }
}

/**
 * 作用域执行上下文
 * 包含当前环境和副作用收集器
 */
export interface ExecutionContext {
  env: Environment;
  // 副作用处理 (例如输出日志)
  effect: (effectType: string, payload: any) => void;
}

