import { Enemy, AnomalyType, AnomalyBuildup, AnomalyEffect, EnemyTemplate, OperatorTemplate } from './types';

/**
 * 异常积蓄与爆发系统 (升级版)
 * 管理8种异常状态的积蓄、触发和效果，支持数值化抗性公式
 */
export class AnomalySystem {
  // 异常积蓄阈值
  static readonly BUILDUP_THRESHOLD = 1000;

  // 异常效果持续时间 (ms)
  static readonly EFFECT_DURATIONS: Record<AnomalyType, number> = {
    BURN: 10000,       // 燃烧持续10秒
    FREEZE: 3000,      // 冻结持续3秒
    CORROSION: 6000,   // 腐蚀持续6秒
    APOPTOSIS: 0,      // 凋亡瞬间生效
    PANIC: 4000,       // 恐慌持续4秒
    SILENCE: 5000,     // 沉默持续5秒
    SLOTH: 7000,       // 迟缓持续7秒
    PARALYSIS: 2000,   // 麻痹持续2秒
  };

  /**
   * 对敌人施加异常积蓄
   * 使用新公式：实际积蓄值 = 异常效能 * (100 / (100 + 异常抗性))
   */
  static applyBuildup(
    enemy: Enemy,
    anomalyType: AnomalyType,
    potency: number,
    template: EnemyTemplate,
    attackerAtk?: number,
    ignoreResistance: boolean = false
  ): AnomalyEffect | null {
    // 检查抗性
    const resistance = template.anomalyResistance?.[anomalyType] ?? 0;
    
    // 计算实际积蓄值
    const actualValue = ignoreResistance ? potency : potency * (100 / (100 + resistance));

    // 查找或创建积蓄槽
    let buildup = enemy.anomalies.find(a => a.type === anomalyType);
    if (!buildup) {
      buildup = {
        type: anomalyType,
        value: 0,
        threshold: this.BUILDUP_THRESHOLD
      };
      enemy.anomalies.push(buildup);
    }

    // 增加积蓄值
    buildup.value += actualValue;

    // 检查是否达到阈值
    if (buildup.value >= buildup.threshold) {
      buildup.value = 0; // 清空积蓄槽
      return this.triggerAnomaly(enemy, anomalyType, template, attackerAtk);
    }

    return null;
  }

  /**
   * 触发异常爆发
   */
  static triggerAnomaly(
    enemy: Enemy,
    anomalyType: AnomalyType,
    template: EnemyTemplate,
    attackerAtk?: number
  ): AnomalyEffect {
    // 移除旧的同类型异常效果 (如果是持续性的)
    enemy.anomalyEffects = enemy.anomalyEffects.filter(e => e.type !== anomalyType);

    const effect: AnomalyEffect = {
      type: anomalyType,
      duration: this.EFFECT_DURATIONS[anomalyType],
      maxDuration: this.EFFECT_DURATIONS[anomalyType],
      value: this.calculateEffectValue(anomalyType, enemy, template),
      attackerAtk: attackerAtk // 记录触发时的攻击力
    };

    enemy.anomalyEffects.push(effect);
    return effect;
  }

  /**
   * 计算异常效果的参数 (如DOT比例、减速倍率)
   */
  private static calculateEffectValue(
    anomalyType: AnomalyType,
    enemy: Enemy,
    template: EnemyTemplate
  ): number {
    switch (anomalyType) {
      case 'BURN':
        return 0.4; // 每次触发造成触发者40% ATK的伤害
      case 'CORROSION':
        return Math.max(80, enemy.maxHp * 0.03); // 每秒3%最大生命
      case 'APOPTOSIS':
        return 0.1; // 10%当前生命值
      case 'PANIC':
        return 1.5; // 150%易伤
      case 'SLOTH':
        return 0.5; // 50%减速
      default:
        return 0;
    }
  }

  /**
   * 更新敌人的异常效果（每帧调用）
   * 返回本帧产生的异常伤害
   */
  static updateAnomalies(enemy: Enemy, dt: number, template: EnemyTemplate): number {
    let totalDamage = 0;
    const now = Date.now();

    // 更新所有异常效果
    for (let i = enemy.anomalyEffects.length - 1; i >= 0; i--) {
      const effect = enemy.anomalyEffects[i];
      const oldDuration = effect.duration;
      effect.duration -= dt;

      // 1. 处理基于间隔的伤害 (如燃烧：每0.5s触发一次)
      if (effect.type === 'BURN') {
        const interval = 500; // 0.5s
        // 计算在这个dt内跨越了几个interval边界
        const oldTicks = Math.floor((effect.maxDuration - oldDuration) / interval);
        const newTicks = Math.floor((effect.maxDuration - effect.duration) / interval);
        
        if (newTicks > oldTicks) {
          const ticks = newTicks - oldTicks;
          // 伤害 = 触发者ATK * 40% * 触发次数
          const dmgPerTick = (effect.attackerAtk || 500) * (effect.value || 0.4);
          totalDamage += dmgPerTick * ticks;
        }
      } 
      // 2. 处理基于持续时间的伤害 (如腐蚀：每秒3%)
      else if (effect.type === 'CORROSION') {
        const damagePerSecond = effect.value || 0;
        totalDamage += (damagePerSecond * dt) / 1000;
      }

      // 3. 处理状态改变
      if (effect.type === 'FREEZE') {
        enemy.frozen = true;
      }

      // 移除过期的效果
      if (effect.duration <= 0) {
        enemy.anomalyEffects.splice(i, 1);
      }
    }

    return totalDamage;
  }

  /**
   * 立即结算剩余的DOT伤害 (爆燃技能使用)
   */
  static settleRemainingDOT(enemy: Enemy, anomalyType: AnomalyType): number {
    const effect = enemy.anomalyEffects.find(e => e.type === anomalyType);
    if (!effect) return 0;

    let remainingDamage = 0;
    if (anomalyType === 'BURN') {
      const interval = 500;
      const remainingTicks = Math.ceil(effect.duration / interval);
      const dmgPerTick = (effect.attackerAtk || 500) * (effect.value || 0.4);
      remainingDamage = dmgPerTick * remainingTicks;
    }

    // 移除该效果
    enemy.anomalyEffects = enemy.anomalyEffects.filter(e => e.type !== anomalyType);
    return remainingDamage;
  }

  /**
   * 检查敌人是否具有某种状态
   */
  static hasEffect(enemy: Enemy, anomalyType: AnomalyType): boolean {
    return enemy.anomalyEffects.some(e => e.type === anomalyType);
  }

  /**
   * 刷新异常持续时间
   */
  static refreshEffect(enemy: Enemy, anomalyType: AnomalyType) {
    const effect = enemy.anomalyEffects.find(e => e.type === anomalyType);
    if (effect) {
      effect.duration = effect.maxDuration;
    }
  }

  // ... 保持原有的 getSpeedModifier, getVulnerabilityMultiplier 等 ...
  static getSpeedModifier(enemy: Enemy): number {
    let modifier = 1.0;
    enemy.anomalyEffects.forEach(effect => {
      if (effect.type === 'FREEZE') modifier = 0;
      else if (effect.type === 'SLOTH') modifier *= (effect.value || 0.5);
    });
    return modifier;
  }

  static getVulnerabilityMultiplier(enemy: Enemy): number {
    let multiplier = 1.0;
    enemy.anomalyEffects.forEach(effect => {
      if (effect.type === 'PANIC') multiplier *= (effect.value || 1.5);
    });
    return multiplier;
  }
}
