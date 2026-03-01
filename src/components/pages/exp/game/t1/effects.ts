import { CardData, BuffResult } from "./core";
import { PlayerState } from "./types";

export type EffectPriority = number;

export interface EffectContext {
  player: PlayerState;
  opponent: PlayerState;
  cards?: CardData[];
  pattern?: string;
  phase?: 'ATTACK' | 'DEFEND';
  data?: any; // For flexible data passing
}

export interface EffectHooks {
  /**
   * Called during action analysis (attack/defend) to calculate/modify buffs.
   * Modifies the BuffResult in place or returns partial updates.
   */
  onAnalyzeAction?: (ctx: EffectContext, result: BuffResult) => void;

  /** Called at the start of a turn. Can return partial player state updates. */
  onTurnStart?: (ctx: EffectContext) => Partial<PlayerState> | void;

  /** Called at the end of a turn. Can return partial player state updates. */
  onTurnEnd?: (ctx: EffectContext) => Partial<PlayerState> | void;

  /** Called when battle starts */
  onBattleStart?: (ctx: EffectContext) => void;

  /** Called when drawing cards, can modify the count */
  onDraw?: (ctx: EffectContext, count: number) => number;

  /** Called when taking damage, can modify the damage amount */
  onDamaged?: (ctx: EffectContext, damage: number) => number;

  /** Called when killing an opponent */
  onKill?: (ctx: EffectContext) => void;
}

export interface EffectPlugin {
  id: string;
  name: string;
  priority: EffectPriority;
  hooks: EffectHooks;
  enabled?: boolean;
}

export class EffectManager {
  private plugins: EffectPlugin[] = [];

  register(plugin: EffectPlugin) {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  unregister(id: string) {
    this.plugins = this.plugins.filter(p => p.id !== id);
  }

  clear() {
    this.plugins = [];
  }

  getPlugins() {
    return this.plugins;
  }

  /**
   * Executes a hook across all registered plugins.
   */
  emit<K extends keyof EffectHooks>(
    hook: K,
    ctx: EffectContext,
    ...args: any[]
  ): any {
    let result = args[0];

    for (const plugin of this.plugins) {
      if (plugin.enabled === false) continue;
      const hookFn = plugin.hooks[hook];
      if (hookFn) {
        // Different hooks have different return types and update patterns
        if (hook === 'onAnalyzeAction') {
          (hookFn as EffectHooks['onAnalyzeAction'])(ctx, result as BuffResult);
        } else if (hook === 'onDraw' || hook === 'onDamaged') {
          result = (hookFn as any)(ctx, result);
        } else if (hook === 'onTurnStart' || hook === 'onTurnEnd') {
          const update = (hookFn as any)(ctx);
          if (update && result) {
            Object.assign(result, update);
          } else if (update) {
            result = update;
          }
        } else {
          (hookFn as any)(ctx, ...args);
        }
      }
    }

    return result;
  }
}

// Global instance or per-battle instance? 
// For this game, a per-battle or player-owned instance might be better, 
// but let's start with a simple way to manage them.
