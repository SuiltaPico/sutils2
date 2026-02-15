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

/**
 * 计算单张牌的战斗力数值
 * 1-10: 正常算
 * JQK: 11, 12, 13
 * A: 14
 * 2: 15
 */
export const getPowerValue = (rank: Rank): number => {
  return 1;
};

export const getStraightRankValue = (rank: Rank): number => {
  switch (rank) {
    case 'A': return 14;
    case 'K': return 13;
    case 'Q': return 12;
    case 'J': return 11;
    case '2': return 15;
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
    
    // Check normal straight (using current values)
    const values = sorted.map(c => getStraightRankValue(c.rank)).sort((a, b) => a - b);
    let isConsecutive = true;
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i+1] !== values[i] + 1) {
        isConsecutive = false;
        break;
      }
    }
    if (isConsecutive) return true;

    // Check special straight A,2,3,4,5 (A=1, 2=2, 3=3, 4=4, 5=5)
    // In our current value system: A=14, 2=15, 3=3, 4=4, 5=5
    // We need to map A->1, 2->2 for this check
    const lowValues = sorted.map(c => {
      if (c.rank === 'A') return 1;
      if (c.rank === '2') return 2;
      return getStraightRankValue(c.rank);
    }).sort((a, b) => a - b);
    
    isConsecutive = true;
    for (let i = 0; i < lowValues.length - 1; i++) {
      if (lowValues[i+1] !== lowValues[i] + 1) {
        isConsecutive = false;
        break;
      }
    }
    if (isConsecutive) return true;

    // Check special straight 2,3,4,5,6 (2=2)
    // Map 2->2
    const low2Values = sorted.map(c => {
      if (c.rank === '2') return 2;
      return getStraightRankValue(c.rank);
    }).sort((a, b) => a - b);

    isConsecutive = true;
    for (let i = 0; i < low2Values.length - 1; i++) {
      if (low2Values[i+1] !== low2Values[i] + 1) {
        isConsecutive = false;
        break;
      }
    }
    
    return isConsecutive;
  };

  const isFlush = (len: number) => {
    const firstSuit = suits[0];
    return suits.every(s => s === firstSuit);
  };

  const len = cards.length;

  // 1. Check 5-card patterns (Strictly need 5 cards to form these)
  if (len === 5) {
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

  // 5. Check Single (If len >= 1, fallback to single high card)
  if (len >= 1) {
      return { name: '单张', multiplier: 1, relevantCards: [sorted[0]] };
  }

  // 6. Trash (Only empty)
  return { name: '无效牌型', multiplier: 0, relevantCards: [] };
}

export const analyzeBuffs = (cards: CardData[], pattern: string): string[] => {
  if (pattern === '无效牌型' || pattern === '') return [];
  
  const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♣': 0, '♦': 0 };
  cards.forEach(c => suitCounts[c.suit]++);
  
  const buffs: string[] = [];
  if (suitCounts['♠'] >= 3) buffs.push('黑桃: 真伤');
  if (suitCounts['♥'] >= 3) buffs.push('红桃: 吸血');
  if (suitCounts['♣'] >= 3) buffs.push('梅花: 毒伤');
  if (suitCounts['♦'] >= 3) buffs.push('方片: 易伤');
  
  return buffs;
};

export function calculateBaseSum(cards: CardData[]): number {
  return cards.reduce((sum, card) => sum + getPowerValue(card.rank), 0);
}

export function calculateMultiplier(cards: CardData[], pattern: string): number {
  const result = identifyPattern(cards);
  if (result.name === '无效牌型' || result.name === '') return 0;
  return calculateBaseSum(result.relevantCards) * result.multiplier;
}
