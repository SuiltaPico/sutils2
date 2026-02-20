export type Suit = '♠' | '♥' | '♣' | '♦';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface CardData {
  suit: Suit;
  rank: Rank;
  color: 'red' | 'black';
  id: string;
}

export const SUITS: Suit[] = ['♠', '♥', '♣', '♦'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// High level patterns that trigger visual feedback
export const HIGH_LEVEL_PATTERNS = new Set([
  '顺子',
  '同花',
  '三带二',
  '四条',
  '两对',
  '同花顺'
]);

export const getRankValue = (rank: Rank): number => {
  switch (rank) {
    case '2': return 15;
    case 'A': return 14;
    case 'K': return 13;
    case 'Q': return 12;
    case 'J': return 11;
    case '10': return 10;
    default: return parseInt(rank);
  }
};


export const getStraightRankValue = (rank: Rank): number => {
  switch (rank) {
    case '2': return 15;
    case 'A': return 14;
    case 'K': return 13;
    case 'Q': return 12;
    case 'J': return 11;
    case '10': return 10;
    default: return parseInt(rank);
  }
};

export const getSuitValue = (suit: Suit): number => {
  switch (suit) {
    case '♠': return 4;
    case '♥': return 3;
    case '♣': return 2;
    case '♦': return 1;
  }
};

export interface PatternResult {
  name: string;
  multiplier: number;
  relevantCards: CardData[];
}

export function identifyPattern(cards: CardData[]): PatternResult {
  if (cards.length === 0) return { name: '', multiplier: 0, relevantCards: [] };
  
  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);
  
  // Helper: Check for same rank count
  const rankCounts: Record<string, number> = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const rankEntries = Object.entries(rankCounts).sort((a, b) => b[1] - a[1]);

  // Helper to get cards by ranks
  const getCardsByRanks = (targetRanks: string[]) => {
    return cards.filter(c => targetRanks.includes(c.rank));
  };

  // Helper: Check for consecutive (Straight)
  const isStraight = (len: number) => {
    if (len < 5) return false;

    const values = sorted
      .map(c => getStraightRankValue(c.rank))
      .sort((a, b) => a - b);

    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] !== values[i] + 1) {
        return false;
      }
    }

    return true;
  };

  const isFlush = (len: number) => {
    const firstSuit = suits[0];
    return suits.every(s => s === firstSuit);
  };

  const len = cards.length;

  // 1. Check 5-card patterns (Strictly need 5 cards to form these)
  if (len >= 5) {
     const straight = isStraight(5); // Checks if all 5 are straight
     const flush = isFlush(5);       // Checks if all 5 are flush
     
     if (straight && flush) return { name: '同花顺', multiplier: 11, relevantCards: cards };
     if (counts[0] === 4) return { name: '四条', multiplier: 8, relevantCards: getCardsByRanks([rankEntries[0][0]]) };
     if (counts[0] === 3 && counts[1] === 2) return { name: '三带二', multiplier: 5, relevantCards: cards };
     if (flush) return { name: '同花', multiplier: 5, relevantCards: cards };
     if (straight) return { name: '顺子', multiplier: 5, relevantCards: cards };
  }

  // 2. Check 4-card patterns (if len >= 4)
  if (len >= 4) {
      if (counts[0] === 4) return { name: '四条', multiplier: 8, relevantCards: getCardsByRanks([rankEntries[0][0]]) };
      if (counts[0] === 2 && counts[1] === 2) return { name: '两对', multiplier: 3, relevantCards: getCardsByRanks([rankEntries[0][0], rankEntries[1][0]]) };
  }

  // 3. Check 3-card patterns (if len >= 3)
  if (len >= 3) {
      if (counts[0] === 3) return { name: '三条', multiplier: 4, relevantCards: getCardsByRanks([rankEntries[0][0]]) };
  }

  // 4. Check Pair (if len >= 2)
  if (len >= 2) {
      if (counts[0] === 2) return { name: '对子', multiplier: 2, relevantCards: getCardsByRanks([rankEntries[0][0]]) };
  }

  // 5. Fallback: Single (Any unrecognized combination counts as Single)
  return { name: '单张', multiplier: 1, relevantCards: [sorted[0]] };
}

export interface BuffResult {
  shield: number;
  trueDamage: number;
  heal: number;
  cleanse: number;
  poison: number;
  descriptions: string[];
}

export const analyzeBuffs = (cards: CardData[], pattern: string): BuffResult => {
  const result: BuffResult = {
    shield: 0,
    trueDamage: 0,
    heal: 0,
    cleanse: 0,
    poison: 0,
    descriptions: []
  };

  if (pattern === '') return result;
  
  // Initialize counts using SUITS constant to avoid typo/encoding issues
  const suitCounts: Record<string, number> = {};
  SUITS.forEach(s => suitCounts[s] = 0);

  // Count suits
  for (const card of cards) {
    if (card && card.suit) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
  }
  
  // ♠ Spade: True Damage
  if (suitCounts['♠'] >= 3) {
    const val = suitCounts['♠'] - 2;
    if (val > 0) {
      const trueDamageGain = val * 2;
      result.trueDamage += trueDamageGain;
      result.descriptions.push(`黑桃: 真伤 +${trueDamageGain}`);
    }
  }

  // ♥ Heart: Heal + Cleanse
  if (suitCounts['♥'] >= 3) {
    const val = suitCounts['♥'] - 2;
    if (val > 0) {
      result.heal += val;
      result.cleanse += val;
      result.descriptions.push(`红桃: 回复/净化 +${val}`);
    }
  }

  // ♣ Club: Poison
  if (suitCounts['♣'] >= 3) {
    const val = suitCounts['♣'] - 2;
    if (val > 0) {
      const poisonGain = val;
      result.poison += poisonGain;
      result.descriptions.push(`梅花: 中毒 +${poisonGain}`);
    }
  }

  // ♦ Diamond: Shield
  if (suitCounts['♦'] >= 3) {
    const val = suitCounts['♦'] - 2;
    if (val > 0) {
      result.shield += val;
      result.descriptions.push(`方片: 护盾 +${val}`);
    }
  }
  
  return result;
};


export function calculateMultiplier(cards: CardData[], pattern: string): number {
  const result = identifyPattern(cards);
  if (result.name === '无效牌型' || result.name === '') return 0;
  return result.multiplier;
}
