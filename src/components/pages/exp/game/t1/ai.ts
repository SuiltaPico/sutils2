import { CardData, identifyPattern, analyzeBuffs, HIGH_LEVEL_PATTERNS } from './core';
import { Difficulty } from './types';

// Helper to generate all subsets of the hand
function getSubsets(cards: CardData[]): CardData[][] {
  const result: CardData[][] = [];
  const n = cards.length;
  
  // We only care about subsets of size 1 to 5 (max pattern size)
  // Optimization: 2^8 is small (256), so iterating all is fine.
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
  baseValue: number;
  buffValue: number;
  totalScore: number;
  isHighLevel: boolean;
}

export function getBestMove(
  hand: CardData[], 
  isAttack: boolean, 
  isSecondAttack: boolean, 
  difficulty: Difficulty = 'NORMAL',
  incomingDamage: number = 0,
  currentHp: number = 50,
  maxHp: number = 50
): CardData[] {
  let subsets = getSubsets(hand);
  
  // 1. Apply Difficulty-based Subset Reduction
  if (difficulty === 'EASY') {
    // Randomly pick only 10 subsets
    subsets = subsets.sort(() => Math.random() - 0.5).slice(0, 10);
  } else if (difficulty === 'NORMAL') {
    // Randomly pick only 50 subsets
    subsets = subsets.sort(() => Math.random() - 0.5).slice(0, 50);
  }

  const options: MoveOption[] = [];

  for (const subset of subsets) {
    const pattern = identifyPattern(subset);
    
    // Easy AI only recognizes basic patterns
    if (difficulty === 'EASY') {
      const basicPatterns = new Set(['单张', '对子', '两对', '三条']);
      if (!basicPatterns.has(pattern.name)) {
        // Degrade to single card or treat as trash
        pattern.name = subset.length === 1 ? '单张' : '无效牌型';
        pattern.multiplier = subset.length === 1 ? 1 : 0;
      }
    }
    
    // Constraint: Second attack must be Basic Pattern (<= 3 cards)
    if (isSecondAttack && subset.length > 3) continue;
    if (isSecondAttack && pattern.name === '单张') continue;

    const baseValue = pattern.multiplier;
    const buffs = analyzeBuffs(subset, pattern.name, isAttack ? "ATTACK" : "DEFEND");
    
    // Calculate Buff Value
    let buffValue = 0;
    
    if (isAttack) {
       // Attack Phase
       // Difficulty influence on weighting
       const w = (difficulty === 'HARD') ? 1.0 : (difficulty === 'NORMAL' ? 0.8 : 0);
       
       buffValue += buffs.trueDamage * 2.0 * w; 
       buffValue += buffs.poison * 1.0 * w;
       buffValue += buffs.shield * 0.8 * w;     
       
       const healW = (difficulty === 'HARD' && currentHp < maxHp * 0.4) ? 2.0 : 0.5;
       buffValue += buffs.heal * healW * w; 
       buffValue += buffs.cleanse * 0.5 * w;
    } else {
       // Defense Phase
       const w = (difficulty === 'HARD' || difficulty === 'NORMAL') ? 1.0 : 0;
       
       buffValue += buffs.shield * 1.0 * w;
       
       if (incomingDamage > 0 && buffs.damageReduction > 0) {
         const reduced = Math.min(incomingDamage, incomingDamage * buffs.damageReduction);
         buffValue += reduced * 1.2 * w;
       }
       
       const healW = (difficulty === 'HARD' && currentHp < maxHp * 0.4) ? 2.0 : 0.5;
       buffValue += buffs.heal * healW * w;
       buffValue += buffs.cleanse * 0.5 * w;
       buffValue += buffs.nextAttackBonus * 0.8 * w; 
    }

    // If no value at all, skip
    if (baseValue === 0 && buffValue === 0) continue;

    const isHighLevel = HIGH_LEVEL_PATTERNS.has(pattern.name);
    
    // Total Score with Random perturbation for Normal difficulty
    let totalScore = baseValue + buffValue;
    if (difficulty === 'NORMAL') {
      totalScore *= (0.8 + Math.random() * 0.4); // ±20%
    } else if (difficulty === 'EASY') {
       // Easy AI might just pick random moves, but let's give it some score bias
       totalScore *= (0.5 + Math.random() * 1.0);
    }

    options.push({
      cards: subset,
      patternName: pattern.name,
      baseValue,
      buffValue,
      totalScore,
      isHighLevel
    });
  }

  if (options.length === 0) return [];

  // Sort options based on strategy
  if (isAttack) {
    if (!isSecondAttack) {
      // Prioritize High Level patterns to trigger Second Attack (Hard Only)
      options.sort((a, b) => {
        if (difficulty === 'HARD' && a.isHighLevel !== b.isHighLevel) {
          return a.isHighLevel ? -1 : 1;
        }
        return b.totalScore - a.totalScore;
      });
    } else {
      options.sort((a, b) => b.totalScore - a.totalScore);
    }
  } else {
    options.sort((a, b) => b.totalScore - a.totalScore);
  }

  return options[0].cards;
}

// Re-export constants needed
// import { HIGH_LEVEL_PATTERNS } from './core'; // Removed as moved to top
