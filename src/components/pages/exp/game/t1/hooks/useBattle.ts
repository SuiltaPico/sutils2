import { createEffect, onMount } from "solid-js";
import { getBestMove } from "../ai/symmetrical_ai";
import { getRankValue } from "../core";
import { gameState } from "../store";
import { GamePhase, isDefendPhase } from "../types";
import { RELIC_LIBRARY, relicToPlugin } from "../items";
import { EffectManager } from "../effects";
import { DEFAULT_PLUGINS } from "../defaultPlugins";

import { useBattleState } from "./useBattleState";
import { useBattleUI } from "./useBattleUI";
import { useBattleCombat } from "./useBattleCombat";

export function useBattle() {
  const effectManager = new EffectManager();

  // Register default suit plugins
  DEFAULT_PLUGINS.forEach((p) => effectManager.register(p));

  const state = useBattleState();
  const {
    playerA,
    setPlayerA,
    playerB,
    setPlayerB,
    phase,
    setPhase,
    attackerId,
    setAttackerId,
    logs,
    showLogs,
    setShowLogs,
    feedback,
    setFeedback,
    activeTab,
    setActiveTab,
    addLog,
  } = state;

  const ui = useBattleUI(phase, attackerId, playerA, playerB);

  const combat = useBattleCombat({
    playerA,
    setPlayerA,
    playerB,
    setPlayerB,
    phase,
    setPhase,
    attackerId,
    setAttackerId,
    addLog,
    setFeedback,
    effectManager,
  });

  const {
    drawCards,
    toggleSelect,
    getSelectedCards,
    executeAction,
    skipDefense,
    skipAttack,
    discardCards,
    nextRound,
    getDamageSourceWithTotal,
    handleBattleEnd,
  } = combat;

  const initGame = () => {
    // Register player relics
    gameState.run.relics.forEach((id) => {
      const relic = RELIC_LIBRARY[id];
      if (relic) effectManager.register(relicToPlugin(relic));
    });

    // Apply passive relic effects (like Max HP bonus)
    let extraMaxHp = 0;
    let extraHandSize = 0;
    gameState.run.relics.forEach((id) => {
      const relic = RELIC_LIBRARY[id];
      if (relic?.passiveEffects?.maxHpBonus)
        extraMaxHp += relic.passiveEffects.maxHpBonus;
      if (relic?.passiveEffects?.handSizeBonus)
        extraHandSize += relic.passiveEffects.handSizeBonus;
    });

    if (extraMaxHp > 0) {
      setPlayerA("maxHp", (m) => m + extraMaxHp);
      setPlayerA("hp", (h) => h + extraMaxHp);
    }

    const baseHandSize = 8;
    drawCards(setPlayerA, playerA, baseHandSize + extraHandSize);
    drawCards(setPlayerB, playerB, 8);
    setPhase(GamePhase.P1_ATTACK);
    setAttackerId("A");
    state.setLogs(["战斗开始！"]);
  };

  createEffect(() => {
    if (phase() === GamePhase.ROUND_END) nextRound();
  });

  createEffect(() => {
    const currentPhase = phase();
    const currentAttacker = attackerId();
    let isAiTurn = false,
      isAttack = false,
      isSecondAttack = false,
      incomingDamage = 0;

    if (currentAttacker === "B") {
      if (currentPhase === GamePhase.P1_ATTACK) {
        isAiTurn = true;
        isAttack = true;
      } else if (currentPhase === GamePhase.P2_ATTACK) {
        isAiTurn = true;
        isAttack = true;
        isSecondAttack = true;
      }
    } else if (isDefendPhase(currentPhase)) {
      isAiTurn = true;
      isAttack = false;
      incomingDamage = playerA.lastAction?.totalValue || 0;
    }

    if (isAiTurn) {
      const timer = setTimeout(() => {
        const bestCards = getBestMove(
          playerB.hand,
          isAttack,
          isSecondAttack,
          gameState.run.difficulty,
          incomingDamage,
          playerB.hp,
          playerB.maxHp
        );
        if (bestCards.length > 0) {
          const newSet = new Set<string>();
          bestCards.forEach((c) => newSet.add(c.id));
          setPlayerB("selectedIds", newSet as any);
          executeAction();
        } else if (isAttack) {
          const sortedHand = [...playerB.hand].sort(
            (a, b) => getRankValue(a.rank) - getRankValue(b.rank)
          );
          const cardsToDiscard = sortedHand.slice(
            0,
            Math.min(sortedHand.length, 4)
          );
          if (cardsToDiscard.length > 0) {
            const newSet = new Set<string>();
            cardsToDiscard.forEach((c) => newSet.add(c.id));
            setPlayerB("selectedIds", newSet as any);
            discardCards();
          } else skipAttack();
        } else skipDefense();
      }, 1000);
      return () => clearTimeout(timer);
    }
  });

  onMount(initGame);

  return {
    playerA,
    playerB,
    phase,
    attackerId,
    logs,
    showLogs,
    setShowLogs,
    feedback,
    activeTab,
    setActiveTab,
    toggleSelect,
    executeAction,
    skipDefense,
    skipAttack,
    discardCards,
    phaseInfo: ui.phaseInfo,
    getSelectedCards,
    getDamageSourceWithTotal,
    winBattle: () => handleBattleEnd("A"),
  };
}
