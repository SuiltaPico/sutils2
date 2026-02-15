import { CardData, identifyPattern, calculateBaseSum } from './core';

// Helper to generate all subsets of the hand
function getSubsets(cards: CardData[]): CardData[][] {
  const result: CardData[][] = [];
  const n = cards.length;
  
  // We only care about subsets of size 1 to 5 (max pattern size)
  // Optimization: 2^7 is small (128), so iterating all is fine.
  for (let i = 1; i < (1 << n); i++) {
    const subset: CardData[] = [];
    for (let j = 0; j < n; j++) {
      if ((i >> j) & 1) {
        subset.push(cards[j]);
      }
    }
    if (subset.length <= 5) {
      result.push(subset);
    }
  }
  return result;
}

interface MoveOption {
  cards: CardData[];
  patternName: string;
  value: number;
  isHighLevel: boolean;
}

export function getBestMove(
  hand: CardData[], 
  isAttack: boolean, 
  isSecondAttack: boolean, 
  incomingDamage: number = 0
): CardData[] {
  const subsets = getSubsets(hand);
  const options: MoveOption[] = [];

  for (const subset of subsets) {
    const pattern = identifyPattern(subset);
    if (pattern.name === '无效牌型' || pattern.name === '') continue;

    // Constraint: Second attack must be Basic Pattern (<= 3 cards)
    const isHighLevel = subset.length > 3;
    if (isSecondAttack && isHighLevel) continue;
    if (isSecondAttack && subset.length === 1) continue;

    const baseSum = calculateBaseSum(subset);
    const value = baseSum * pattern.multiplier;

    options.push({
      cards: subset,
      patternName: pattern.name,
      value,
      isHighLevel
    });
  }

  if (options.length === 0) return [];

  // Sort options based on strategy
  if (isAttack) {
    // Attack Strategy: Maximize Damage
    // If First Attack, prioritize High Level patterns if values are comparable?
    // Simple Greedy: Just Maximize Value.
    // However, High Level triggers a second attack, which is huge value.
    // So we should probably add potential future value to High Level patterns.
    // But we don't know what the second attack would be.
    // Let's just strictly prioritize High Level patterns in First Attack if they exist.
    
    if (!isSecondAttack) {
      // Prioritize High Level, then Value
      options.sort((a, b) => {
        if (a.isHighLevel !== b.isHighLevel) {
          return a.isHighLevel ? -1 : 1; // High Level first
        }
        return b.value - a.value; // Then highest value
      });
    } else {
      // Second Attack (must be basic): Just highest value
      options.sort((a, b) => b.value - a.value);
    }
  } else {
    // Defense Strategy:
    // 1. Try to block fully (myValue >= incomingDamage) with minimal waste.
    // 2. If can't block fully, mitigate as much as possible (max value).
    
    const winningMoves = options.filter(o => o.value >= incomingDamage);
    
    if (winningMoves.length > 0) {
      // Find the smallest winning move (Optimal efficiency)
      winningMoves.sort((a, b) => a.value - b.value);
      return winningMoves[0].cards;
    } else {
      // Can't win, just mitigate max damage
      options.sort((a, b) => b.value - a.value);
    }
  }

  return options[0].cards;
}
