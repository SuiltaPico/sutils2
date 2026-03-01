import { CardData, SUITS } from "./core";
import { EffectPlugin, EffectContext } from "./effects";
import { BuffResult } from "./core";

const countSuits = (cards: CardData[]) => {
  const counts: Record<string, number> = {};
  SUITS.forEach(s => counts[s] = 0);
  cards.forEach(c => {
    if (c?.suit) counts[c.suit]++;
  });
  return counts;
};

export const SuitSpadePlugin: EffectPlugin = {
  id: 'suit-spade',
  name: '黑桃: 锋芒/御守',
  priority: 1000,
  hooks: {
    onAnalyzeAction: (ctx, result) => {
      const { cards, phase } = ctx;
      if (!cards) return;
      const counts = countSuits(cards);
      const val = counts['♠'] - 2;
      if (val > 0) {
        if (phase === 'ATTACK') {
          const trueDamageGain = val * 2;
          result.trueDamage += trueDamageGain;
          result.descriptions.push(`黑桃: 真伤 +${trueDamageGain}`);
        } else {
          const reductionPoints = val;
          result.damageReduction += reductionPoints;
          result.descriptions.push(`黑桃: 减伤强度 +${reductionPoints}`);
        }
      }
    }
  }
};

export const SuitHeartPlugin: EffectPlugin = {
  id: 'suit-heart',
  name: '红桃: 回复/净化',
  priority: 1000,
  hooks: {
    onAnalyzeAction: (ctx, result) => {
      const { cards } = ctx;
      if (!cards) return;
      const counts = countSuits(cards);
      const val = counts['♥'] - 2;
      if (val > 0) {
        result.heal += val;
        result.cleanse += val;
        result.descriptions.push(`红桃: 回复/净化 +${val}`);
      }
    }
  }
};

export const SuitClubPlugin: EffectPlugin = {
  id: 'suit-club',
  name: '梅花: 中毒/愤怒',
  priority: 1000,
  hooks: {
    onAnalyzeAction: (ctx, result) => {
      const { cards, phase } = ctx;
      if (!cards) return;
      const counts = countSuits(cards);
      const val = counts['♣'] - 2;
      if (val > 0) {
        if (phase === 'ATTACK') {
          result.poison += val;
          result.descriptions.push(`梅花: 中毒 +${val}`);
        } else {
          result.nextAttackBonus += val;
          result.descriptions.push(`梅花: 愤怒 +${val}`);
        }
      }
    }
  }
};

export const SuitDiamondPlugin: EffectPlugin = {
  id: 'suit-diamond',
  name: '方片: 护盾',
  priority: 1000,
  hooks: {
    onAnalyzeAction: (ctx, result) => {
      const { cards } = ctx;
      if (!cards) return;
      const counts = countSuits(cards);
      const val = counts['♦'] - 2;
      if (val > 0) {
        result.shield += val;
        result.descriptions.push(`方片: 护盾 +${val}`);
      }
    }
  }
};

export const DEFAULT_PLUGINS = [
  SuitSpadePlugin,
  SuitHeartPlugin,
  SuitClubPlugin,
  SuitDiamondPlugin
];
