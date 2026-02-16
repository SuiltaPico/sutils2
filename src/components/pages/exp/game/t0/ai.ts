import { CardData, identifyPattern, analyzeBuffs } from './core';

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
  incomingDamage: number = 0,
  currentHp: number = 50, // Default for compatibility
  maxHp: number = 50
): CardData[] {
  const subsets = getSubsets(hand);
  const options: MoveOption[] = [];

  for (const subset of subsets) {
    const pattern = identifyPattern(subset);
    
    // Constraint: Second attack must be Basic Pattern (<= 3 cards)
    // But wait, identifyPattern might return "Single" for a 5-card trash hand.
    // The game rule says "Second attack must be Basic Pattern (<= 3 cards)".
    // So we must strictly check subset length for Second Attack.
    if (isSecondAttack && subset.length > 3) continue;
    
    // Also Second Attack forbids Single card pattern (unless it has buffs? No, rule says "No Single Pattern").
    // Let's stick to the rule: "No Single Pattern" for Second Attack.
    if (isSecondAttack && pattern.name === '单张') continue;

    const baseValue = pattern.multiplier;
    const buffs = analyzeBuffs(subset, pattern.name);
    
    // Calculate Buff Value
    let buffValue = 0;
    
    if (isAttack) {
       // Attack Phase
       buffValue += buffs.trueDamage * 2.0; // True damage is very strong
       buffValue += buffs.poison * 1.0;
       buffValue += buffs.shield * 0.8;     // Shield is okay for setup
       buffValue += buffs.heal * (currentHp < maxHp * 0.4 ? 2.0 : 0.5); // Heal critical when low
       buffValue += buffs.cleanse * 0.5;
    } else {
       // Defend Phase - Buffs do not trigger on defense!
       buffValue = 0;
    }

    // If no value at all, skip
    if (baseValue === 0 && buffValue === 0) continue;

    const isHighLevel = HIGH_LEVEL_PATTERNS.has(pattern.name);
    
    // Total Score
    // We weigh base damage/defense slightly higher than buffs generally, 
    // but buffs can tip the scale.
    const totalScore = baseValue + buffValue;

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
      // Prioritize High Level patterns to trigger Second Attack
      // Then maximize Total Score
      options.sort((a, b) => {
        if (a.isHighLevel !== b.isHighLevel) {
          return a.isHighLevel ? -1 : 1; // High Level first
        }
        return b.totalScore - a.totalScore;
      });
    } else {
      // Second Attack: Just highest score
      options.sort((a, b) => b.totalScore - a.totalScore);
    }
  } else {
    // Defense Strategy:
    // 1. Try to block fully (baseValue + shieldBuff >= incomingDamage) with minimal waste.
    // Note: Shield buff counts as blocking power immediately in this game logic?
    // In resolveCombat: 
    //   rawDmg = max(0, attack - defenseVal)
    //   blocked = min(shield, rawDmg)
    // So defenseVal reduces damage first, then shield blocks the rest.
    // Effectively, both contribute to survival.
    
    // Filter moves that can mitigate most/all damage
    // We want: (baseValue + buff.shield) >= incomingDamage
    // But we also want to save good cards if possible? 
    // For now, let's just pick the best mitigation efficiency.
    
    // Sort by:
    // 1. Can survive? (Effective Defense >= Incoming)
    // 2. If both survive, pick lowest cost (lowest totalScore used)? Or highest counter-value (buffs)?
    // Let's simplify: Just pick highest Total Score to be safe, 
    // unless we can perfectly block with a lower score to save cards?
    // AI is simple for now: Maximize Score.
    
    options.sort((a, b) => b.totalScore - a.totalScore);
    
    // Optimization: If the best move is way overkill, maybe pick a weaker one?
    // Not implementing for now to keep it robust.
  }

  return options[0].cards;
}

// Re-export constants needed
import { HIGH_LEVEL_PATTERNS } from './core';
