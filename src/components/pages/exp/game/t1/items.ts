import { CardData, BuffResult } from "./core";
import { EffectHooks, EffectPlugin } from "./effects";

export interface Relic {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY';
  family?: '司命' | '铸锋' | '引脉' | '镇岳' | '淬鼎' | '巡天';
  priority?: number;
  hooks?: EffectHooks;
  passiveEffects?: {
    maxHpBonus?: number;
    handSizeBonus?: number;
    goldBonus?: number;
  };
}

export const RELIC_LIBRARY: Record<string, Relic> = {
  'relic-zf-01': {
    id: 'relic-zf-01',
    name: '铸锋磨刀石',
    description: '锋芒毕露：每一张黑桃(♠)进攻时额外造成 1 点真实伤害。',
    icon: '⚔️',
    rarity: 'COMMON',
    family: '铸锋',
    hooks: {
      onAnalyzeAction: (ctx, result) => {
        if (ctx.player.id !== 'A' || ctx.phase !== 'ATTACK' || !ctx.cards) return;
        const spadeCount = ctx.cards.filter(c => c.suit === '♠').length;
        if (spadeCount > 0) {
          result.trueDamage += spadeCount;
          result.descriptions.push(`铸锋磨刀石: 真伤 +${spadeCount}`);
        }
      }
    }
  },
  'relic-zy-01': {
    id: 'relic-zy-01',
    name: '镇岳甲片',
    description: '重装御守：进入防御阶段时，获得 3 点护盾。',
    icon: '🛡️',
    rarity: 'COMMON',
    family: '镇岳',
    hooks: {
      onAnalyzeAction: (ctx, result) => {
        if (ctx.phase !== 'DEFEND') return;
        result.shield += 3;
        result.descriptions.push(`镇岳甲片: 护盾 +3`);
      }
    }
  },
  'relic-ym-01': {
    id: 'relic-ym-01',
    name: '引脉试剂',
    description: '毒素强化：梅花(♣)施加的中毒层数 +1。',
    icon: '🧪',
    rarity: 'COMMON',
    family: '引脉',
    hooks: {
      onAnalyzeAction: (ctx, result) => {
        if (ctx.phase !== 'ATTACK') return;
        if (result.poison > 0) {
          result.poison += 1;
          result.descriptions.push(`引脉试剂: 中毒 +1`);
        }
      }
    }
  },
  'relic-cd-01': {
    id: 'relic-cd-01',
    name: '淬鼎回生膏',
    description: '药理精通：红桃(♥)提供的回复效果 +2。',
    icon: '💊',
    rarity: 'COMMON',
    family: '淬鼎',
    hooks: {
      onAnalyzeAction: (ctx, result) => {
        if (result.heal > 0) {
          result.heal += 2;
          result.descriptions.push(`淬鼎回生膏: 回复 +2`);
        }
      }
    }
  },
  'relic-sm-01': {
    id: 'relic-sm-01',
    name: '司命残章',
    description: '灵台清明：初始手牌上限 +1。',
    icon: '📜',
    rarity: 'UNCOMMON',
    family: '司命',
    passiveEffects: {
      handSizeBonus: 1
    }
  },
  'relic-xt-01': {
    id: 'relic-xt-01',
    name: '巡天目镜',
    description: '洞若观火：每回合开始时，获得 1 点护盾。',
    icon: '🥽',
    rarity: 'COMMON',
    family: '巡天',
    hooks: {
      onTurnStart: (ctx) => {
        if (ctx.player.id === 'A') {
          return { shield: ctx.player.shield + 1 };
        }
      }
    }
  },
  'relic-gen-01': {
    id: 'relic-gen-01',
    name: '太岁血瓶',
    description: '不竭生命：最大生命值 +5。',
    icon: '🩸',
    rarity: 'UNCOMMON',
    passiveEffects: {
      maxHpBonus: 5
    }
  },
  'relic-gen-02': {
    id: 'relic-gen-02',
    name: '贪婪之戒',
    description: '利欲熏心：战斗胜利后获得的髓玉增加 50%。',
    icon: '💍',
    rarity: 'UNCOMMON',
    passiveEffects: {
      goldBonus: 0.5
    }
  },
  'relic-zf-02': {
    id: 'relic-zf-02',
    name: '断剑重铸',
    description: '破釜沉舟：当生命值低于 20% 时，所有进攻倍率 +1。',
    icon: '🗡️',
    rarity: 'RARE',
    family: '铸锋',
    hooks: {
      onAnalyzeAction: (ctx, result) => {
        if (ctx.phase !== 'ATTACK') return;
        if (ctx.player.hp / ctx.player.maxHp < 0.2) {
          result.nextAttackBonus += 1;
          result.descriptions.push(`断剑重铸: 攻击强化 +1`);
        }
      }
    }
  },
  'relic-sm-02': {
    id: 'relic-sm-02',
    name: '司命之眼',
    description: '洞察先机：抽牌时多抽 1 张。',
    icon: '👁️',
    rarity: 'RARE',
    family: '司命',
    hooks: {
      onDraw: (ctx, count) => count + 1
    }
  }
};

export const relicToPlugin = (relic: Relic): EffectPlugin => ({
  id: relic.id,
  name: relic.name,
  priority: relic.priority ?? 0,
  hooks: relic.hooks ?? {}
});

export const getRandomRelic = (rarity?: Relic['rarity']): Relic => {
  const relics = Object.values(RELIC_LIBRARY);
  const filtered = rarity ? relics.filter(r => r.rarity === rarity) : relics;
  return filtered[Math.floor(Math.random() * filtered.length)];
};
