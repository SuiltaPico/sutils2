import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { GamePhase, PlayerState } from "../types";
import { createDeck, gameState } from "../store";

export function useBattleState() {
  const [playerA, setPlayerA] = createStore<PlayerState>({
    id: "A",
    name: "玩家",
    hp: gameState.run.playerHp,
    maxHp: gameState.run.playerMaxHp,
    shield: 0,
    poisonStacks: 0,
    hand: [],
    deck: [...gameState.run.deck],
    discardPile: [],
    selectedIds: new Set(),
    lastAction: null,
    nextAttackBonus: 0,
    rageDuration: 0,
    damageReduction: 0,
    reductionDuration: 0,
  });

  const [playerB, setPlayerB] = createStore<PlayerState>({
    id: "B",
    name: "敌人",
    hp: 10,
    maxHp: 10,
    shield: 0,
    poisonStacks: 0,
    hand: [],
    deck: createDeck(),
    discardPile: [],
    selectedIds: new Set(),
    lastAction: null,
    nextAttackBonus: 0,
    rageDuration: 0,
    damageReduction: 0,
    reductionDuration: 0,
  });

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.INIT);
  const [attackerId, setAttackerId] = createSignal<string>("A");
  const [logs, setLogs] = createSignal<string[]>([]);
  const [showLogs, setShowLogs] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<"hand" | "backpack">("hand");

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  return {
    playerA,
    setPlayerA,
    playerB,
    setPlayerB,
    phase,
    setPhase,
    attackerId,
    setAttackerId,
    logs,
    setLogs,
    showLogs,
    setShowLogs,
    feedback,
    setFeedback,
    activeTab,
    setActiveTab,
    addLog,
  };
}
