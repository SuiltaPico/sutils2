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
}

export enum AppState {
  MENU = "MENU",
  MAP = "MAP",
  BATTLE = "BATTLE",
  EVENT = "EVENT",
  REWARD = "REWARD",
  GAME_OVER = "GAME_OVER",
  VICTORY = "VICTORY",
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
}

export type NodeType = 'BATTLE' | 'ELITE' | 'EVENT' | 'REST' | 'BOSS';

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
  map: MapNode[];
  currentNodeId: string | null;
  playerHp: number;
  playerMaxHp: number;
  deck: CardData[]; // Player's permanent deck
  gold: number; 
  relics: string[]; 
}

export const isAttackPhase = (p: GamePhase) => 
  p === GamePhase.P1_ATTACK || p === GamePhase.P2_ATTACK;

export const isDefendPhase = (p: GamePhase) => 
  p === GamePhase.P1_DEFEND || p === GamePhase.P2_DEFEND;
