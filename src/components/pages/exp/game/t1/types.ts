import { CardData, BuffResult } from "./core";

export enum GamePhase {
  INIT = "INIT",
  P1_ATTACK = "P1_ATTACK",
  P1_DEFEND = "P1_DEFEND",
  P2_ATTACK = "P2_ATTACK",
  P2_DEFEND = "P2_DEFEND",
  COMBAT_SHOWDOWN = "COMBAT_SHOWDOWN",
  ROUND_END = "ROUND_END",
  GAME_OVER = "GAME_OVER",
  VICTORY = "VICTORY",
  PREPARATION = "PREPARATION",
  COMPENDIUM = "COMPENDIUM",
}

export enum AppState {
  MENU = "MENU",
  MAP = "MAP",
  BATTLE = "BATTLE",
  EVENT = "EVENT",
  REWARD = "REWARD",
  GAME_OVER = "GAME_OVER",
  VICTORY = "VICTORY",
  PREPARATION = "PREPARATION",
  COMPENDIUM = "COMPENDIUM",
}

export interface CombatAction {
  pattern: string;
  multiplier: number;
  totalValue: number;
  cards: CardData[];
  relevantCardIds: Set<string>;
  buffs?: BuffResult;
}

export interface PlayerState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  poisonStacks: number;
  hand: CardData[];
  deck: CardData[];
  discardPile: CardData[];
  selectedIds: Set<string>;
  lastAction: CombatAction | null;
  nextAttackBonus: number;
  rageDuration: number;
  damageReduction: number;
  reductionDuration: number;
}

export type NodeType = 'BATTLE' | 'ELITE' | 'EVENT' | 'REST' | 'BOSS';

export type Difficulty = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MapNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  next: string[]; // IDs of next accessible nodes
  status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' | 'CURRENT';
}

export interface RunState {
  currentFloor: number;
  floorIntroPlayed?: boolean;
  map: MapNode[];
  currentNodeId: string | null;
  playerHp: number;
  playerMaxHp: number;
  deck: CardData[]; // Player's permanent deck
  gold: number; 
  relics: string[]; // Store relic IDs
  difficulty: Difficulty;
}

export interface PlayerData {
  merits: number; // 觉醒点 (Merits)
  unlockedArtifacts: string[]; // Unlocked artifact IDs
  selectedArtifactId: string | null; // Currently equipped artifact
  artifactLevels: Record<string, number>; // Level for each artifact (id -> level)
  unlockedTalents: string[]; // Unlocked talent IDs
  discoveredRelics: string[]; // IDs of discovered relics
  discoveredClues: string[]; // IDs of discovered clues
  maxUnlockedDifficulty: Difficulty; // Highest unlocked difficulty level
}

export const isAttackPhase = (p: GamePhase) => 
  p === GamePhase.P1_ATTACK || p === GamePhase.P2_ATTACK;

export const isDefendPhase = (p: GamePhase) => 
  p === GamePhase.P1_DEFEND || p === GamePhase.P2_DEFEND;
