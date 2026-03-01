import { Accessor } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import {
  type CardData,
  HIGH_LEVEL_PATTERNS,
  analyzeBuffs,
  calculateReductionPercentage,
  getRankValue,
  getSuitValue,
  identifyPattern,
} from "../core";
import { gameState, setGameState, generateRewards } from "../store";
import {
  AppState,
  GamePhase,
  PlayerState,
  isAttackPhase,
  isDefendPhase,
} from "../types";
import { RELIC_LIBRARY } from "../items";
import { EffectManager } from "../effects";

interface CombatOptions {
  playerA: PlayerState;
  setPlayerA: SetStoreFunction<PlayerState>;
  playerB: PlayerState;
  setPlayerB: SetStoreFunction<PlayerState>;
  phase: Accessor<GamePhase>;
  setPhase: (phase: GamePhase) => void;
  attackerId: Accessor<string>;
  setAttackerId: (id: string) => void;
  addLog: (msg: string) => void;
  setFeedback: (msg: string | null) => void;
  effectManager: EffectManager;
}

export function useBattleCombat({
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
}: CombatOptions) {
  const getHandSize = (player: PlayerState) => {
    if (player.id !== "A") return 8;
    let size = 8;
    gameState.run.relics.forEach((id) => {
      const relic = RELIC_LIBRARY[id];
      if (relic?.passiveEffects?.handSizeBonus)
        size += relic.passiveEffects.handSizeBonus;
    });
    return size;
  };

  const drawCards = (
    playerSetter: SetStoreFunction<PlayerState>,
    playerGetter: PlayerState,
    targetCount?: number
  ) => {
    let finalTargetCount =
      targetCount !== undefined ? targetCount : getHandSize(playerGetter);

    finalTargetCount = effectManager.emit(
      "onDraw",
      {
        player: playerGetter,
        opponent: playerGetter.id === "A" ? playerB : playerA,
      },
      finalTargetCount
    );

    const count = finalTargetCount - playerGetter.hand.length;
    if (count <= 0) return;

    let currentDeck = [...playerGetter.deck];
    let currentDiscard = [...playerGetter.discardPile];
    const newCards: CardData[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDeck.length === 0) {
        if (currentDiscard.length === 0) break;
        currentDeck = [...currentDiscard];
        for (let k = currentDeck.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [currentDeck[k], currentDeck[j]] = [currentDeck[j], currentDeck[k]];
        }
        currentDiscard = [];
        addLog(`${playerGetter.name} 牌堆耗尽，重新洗牌。`);
      }
      const card = currentDeck.pop();
      if (card) newCards.push(card);
    }

    const combined = [...playerGetter.hand, ...newCards]
      .filter((c) => !!c)
      .sort((a, b) => {
        const diff = getRankValue(b.rank) - getRankValue(a.rank);
        if (diff !== 0) return diff;
        return getSuitValue(b.suit) - getSuitValue(a.suit);
      });

    playerSetter("hand", combined);
    playerSetter("deck", currentDeck);
    playerSetter("discardPile", currentDiscard);
  };

  const handleBattleEnd = (winnerId: string) => {
    setPhase(GamePhase.GAME_OVER);
    if (winnerId === "A") {
      addLog("战斗胜利！");
      setGameState("run", "playerHp", playerA.hp);

      // Generate rewards based on current node type
      const currentNode = gameState.run.map.find(
        (n) => n.id === gameState.run.currentNodeId
      );
      generateRewards(currentNode?.type || "BATTLE");

      setTimeout(() => {
        setGameState("appState", AppState.REWARD);
      }, 2000);
    } else {
      addLog("战斗失败...");
      setGameState("appState", AppState.GAME_OVER);
    }
  };

  const toggleSelect = (playerId: string, cardId: string) => {
    const isA = playerId === "A";
    const player = isA ? playerA : playerB;
    const setter = isA ? setPlayerA : setPlayerB;
    const isAttacker = attackerId() === playerId;
    const currentPhase = phase();

    const canAct =
      (isAttacker && isAttackPhase(currentPhase)) ||
      (!isAttacker && isDefendPhase(currentPhase));
    if (!canAct) return;

    const newSet = new Set(player.selectedIds);
    if (newSet.has(cardId)) newSet.delete(cardId);
    else newSet.add(cardId);
    setter("selectedIds", newSet as any); // Type assertion for Set
  };

  const getSelectedCards = (player: PlayerState) =>
    player.hand.filter((c) => player.selectedIds.has(c.id));

  const startShowdown = (roundNum: number) => {
    setPhase(GamePhase.COMBAT_SHOWDOWN);
    setTimeout(() => resolveCombat(roundNum), 1500);
  };

  const executeAction = () => {
    const currentPhase = phase();
    const isAttackerTurn = isAttackPhase(currentPhase);
    const activeId = isAttackerTurn
      ? attackerId()
      : attackerId() === "A"
      ? "B"
      : "A";
    const isA = activeId === "A";
    const player = isA ? playerA : playerB;
    const setter = isA ? setPlayerA : setPlayerB;

    const selectedCards = getSelectedCards(player);
    const selectedIdsSnapshot = new Set(player.selectedIds);
    if (selectedCards.length === 0) return;

    if (selectedCards.length > 5) {
      setFeedback("最多只能出 5 张牌");
      setTimeout(() => setFeedback(null), 1000);
      return;
    }

    const patternResult = identifyPattern(selectedCards);
    const isTrash = patternResult.name === "无效牌型";
    const patternName = isTrash ? "杂牌" : patternResult.name;
    const multiplier = isTrash ? 0 : patternResult.multiplier;

    const opponent = isA ? playerB : playerA;

    // Apply relic bonuses to buffs using the new plugin system
    let finalBuffs = analyzeBuffs(
      selectedCards,
      patternName,
      isAttackPhase(currentPhase) ? "ATTACK" : "DEFEND",
      effectManager,
      { player, opponent }
    );

    setter("lastAction", {
      pattern: patternName,
      multiplier,
      totalValue: multiplier,
      cards: selectedCards,
      relevantCardIds: new Set(patternResult.relevantCards.map((c) => c.id)),
      buffs: finalBuffs,
    } as any);

    setter("hand", (h) => h.filter((c) => !selectedIdsSnapshot.has(c.id)));
    setter("discardPile", (d) => [...d, ...selectedCards]);
    setter("selectedIds", new Set() as any);

    addLog(`${player.name} 打出 ${patternResult.name} (${multiplier})`);
    if (finalBuffs.descriptions.length > 0)
      addLog(`触发增益: ${finalBuffs.descriptions.join(", ")}`);

    if (finalBuffs.heal > 0)
      setter("hp", (h) => Math.min(player.maxHp, h + finalBuffs.heal));
    if (finalBuffs.cleanse > 0)
      setter("poisonStacks", (p) => Math.max(0, p - finalBuffs.cleanse));
    if (finalBuffs.poison > 0)
      (isA ? setPlayerB : setPlayerA)(
        "poisonStacks",
        (p) => p + finalBuffs.poison
      );
    if (finalBuffs.shield > 0) setter("shield", (s) => s + finalBuffs.shield);

    if (finalBuffs.nextAttackBonus > 0) {
      setter("nextAttackBonus", (b) => b + finalBuffs.nextAttackBonus);
      setter("rageDuration", 2);
    }
    if (finalBuffs.damageReduction > 0) {
      setter("damageReduction", (r) => r + finalBuffs.damageReduction);
      setter("reductionDuration", 1);
    }

    if (currentPhase === GamePhase.P1_ATTACK) setPhase(GamePhase.P1_DEFEND);
    else if (currentPhase === GamePhase.P1_DEFEND) startShowdown(1);
    else if (currentPhase === GamePhase.P2_ATTACK)
      setPhase(GamePhase.P2_DEFEND);
    else if (currentPhase === GamePhase.P2_DEFEND) startShowdown(2);
  };

  const skipDefense = () => {
    const currentPhase = phase();
    if (!isDefendPhase(currentPhase)) return;
    const isAttackerA = attackerId() === "A";
    const defender = isAttackerA ? playerB : playerA;
    const defSetter = isAttackerA ? setPlayerB : setPlayerA;

    defSetter("lastAction", {
      pattern: "放弃防御",
      multiplier: 0,
      totalValue: 0,
      cards: [],
      relevantCardIds: new Set(),
    } as any);
    addLog(`${defender.name} 放弃防御。`);
    if (currentPhase === GamePhase.P1_DEFEND) startShowdown(1);
    else startShowdown(2);
  };

  const skipAttack = () => {
    const currentPhase = phase();
    if (!isAttackPhase(currentPhase)) return;
    const isAttackerA = attackerId() === "A";
    const attacker = isAttackerA ? playerA : playerB;
    const attSetter = isAttackerA ? setPlayerA : setPlayerB;

    attSetter("lastAction", {
      pattern: "放弃攻击",
      multiplier: 0,
      totalValue: 0,
      cards: [],
      relevantCardIds: new Set(),
    } as any);
    addLog(`${attacker.name} 放弃攻击。`);
    if (currentPhase === GamePhase.P1_ATTACK) setPhase(GamePhase.P1_DEFEND);
    else setPhase(GamePhase.ROUND_END);
  };

  const discardCards = () => {
    const currentPhase = phase();
    if (!isAttackPhase(currentPhase)) return;
    const isAttackerA = attackerId() === "A";
    const player = isAttackerA ? playerA : playerB;
    const setter = isAttackerA ? setPlayerA : setPlayerB;

    const selectedCards = getSelectedCards(player);
    const selectedIdsSnapshot = new Set(player.selectedIds);

    if (selectedCards.length === 0) {
      setFeedback("请选择要丢弃的牌");
      setTimeout(() => setFeedback(null), 1000);
      return;
    }
    if (selectedCards.length > 5) {
      setFeedback("最多只能丢弃 5 张牌");
      setTimeout(() => setFeedback(null), 1000);
      return;
    }

    const remainingHand = player.hand.filter(
      (c) => !selectedIdsSnapshot.has(c.id)
    );
    setter("hand", remainingHand);
    setter("discardPile", (d) => [...d, ...selectedCards]);
    drawCards(setter, { ...player, hand: remainingHand }, 8);
    setter("selectedIds", new Set() as any);
    addLog(`${player.name} 弃掉了 ${selectedCards.length} 张牌并抽取了新牌。`);
    setter("lastAction", {
      pattern: "弃牌",
      multiplier: 0,
      totalValue: 0,
      cards: selectedCards,
      relevantCardIds: new Set(),
    } as any);
    setPhase(GamePhase.ROUND_END);
  };

  const getDamageSourceWithTotal = (
    attackVal: number,
    defenseVal: number,
    trueDmg: number
  ) => {
    const rawDmg = Math.max(0, attackVal - defenseVal);
    const totalBeforeShield = rawDmg + trueDmg;
    return `${totalBeforeShield} (攻击[${attackVal}]-防御[${defenseVal}]${
      trueDmg > 0 ? ` + 真伤[${trueDmg}]` : ""
    })`;
  };

  const resolveCombat = (roundNum: number) => {
    const isAttackerA = attackerId() === "A";
    const attacker = isAttackerA ? playerA : playerB;
    const defender = isAttackerA ? playerB : playerA;
    const attSetter = isAttackerA ? setPlayerA : setPlayerB;
    const defSetter = isAttackerA ? setPlayerB : setPlayerA;

    const baseAttackVal = attacker.lastAction?.totalValue || 0;
    const rageBonus = attacker.nextAttackBonus;
    const attackVal = baseAttackVal > 0 ? baseAttackVal + rageBonus : 0;

    if (rageBonus > 0 && baseAttackVal > 0) {
      addLog(`${attacker.name} 的愤怒使攻击强度提升了 ${rageBonus}`);
      attSetter("nextAttackBonus", 0);
      attSetter("rageDuration", 0);
    }

    const defenseVal = defender.lastAction?.totalValue || 0;
    let rawDmg = Math.max(0, attackVal - defenseVal);

    const reductionPoints = defender.damageReduction;
    const reduction = calculateReductionPercentage(reductionPoints);
    if (reduction > 0 && rawDmg > 0) {
      const reducedAmount = Math.floor(rawDmg * reduction);
      rawDmg -= reducedAmount;
      addLog(
        `${
          defender.name
        } 的减伤强度[${reductionPoints}]降低了 ${reducedAmount} 点伤害 (${Math.round(
          reduction * 100
        )}%)`
      );
    }
    defSetter("damageReduction", 0);
    defSetter("reductionDuration", 0);

    const trueDmg = attacker.lastAction?.buffs?.trueDamage || 0;

    const shield = defender.shield;
    const blockedByShield = Math.min(shield, rawDmg);
    const finalRawDmg = rawDmg - blockedByShield;
    const finalDmg = finalRawDmg + trueDmg;

    if (blockedByShield > 0) {
      defSetter("shield", (s) => s - blockedByShield);
      addLog(`${defender.name} 护盾抵消了 ${blockedByShield} 点常规伤害`);
    }

    if (defenseVal > attackVal && defender.lastAction?.pattern !== "放弃防御") {
      const overkill = defenseVal - attackVal;
      defSetter("shield", (s) => s + overkill);
      addLog(`${defender.name} 完全防御！溢出的 ${overkill} 点防御转化为护盾`);
    }

    const currentHp = defender.hp;
    const newHp = Math.max(0, currentHp - finalDmg);
    defSetter("hp", newHp);

    const sourceText = getDamageSourceWithTotal(attackVal, defenseVal, trueDmg);
    addLog(
      `战斗结果: ${attacker.name} 对 ${defender.name} 造成 ${finalDmg} 点伤害 (${sourceText})`
    );

    if (playerA.hp <= 0 || playerB.hp <= 0) {
      if (playerA.hp <= 0 && playerB.hp <= 0) handleBattleEnd("DRAW");
      else if (playerA.hp <= 0) handleBattleEnd("B");
      else handleBattleEnd("A");
      return;
    }

    if (roundNum === 1) {
      const lastPattern = attacker.lastAction?.pattern || "";
      const isHighLevel = HIGH_LEVEL_PATTERNS.has(lastPattern);
      const hasComboPotential = () => {
        const counts: Record<string, number> = {};
        for (const card of attacker.hand) {
          counts[card.rank] = (counts[card.rank] || 0) + 1;
          if (counts[card.rank] >= 2) return true;
        }
        return false;
      };

      if (isHighLevel && hasComboPotential()) {
        addLog(`${attacker.name} 打出高级牌型！获得额外攻击阶段！`);
        setPhase(GamePhase.P2_ATTACK);
      } else {
        setPhase(GamePhase.ROUND_END);
      }
    } else {
      setPhase(GamePhase.ROUND_END);
    }
  };

  const nextRound = () => {
    [playerA, playerB].forEach((p, idx) => {
      const setter = idx === 0 ? setPlayerA : setPlayerB;

      if (p.poisonStacks > 0) {
        const poisonDmg = p.poisonStacks;
        setter("hp", (h) => Math.max(0, h - poisonDmg));
        setter("poisonStacks", (s) => Math.max(0, s - 1));
        addLog(`${p.name} 受到 ${poisonDmg} 点中毒伤害 (无视护盾)`);
      }

      if (p.rageDuration > 0) {
        const nextDur = p.rageDuration - 1;
        setter("rageDuration", nextDur);
        if (nextDur === 0 && p.nextAttackBonus > 0) {
          setter("nextAttackBonus", 0);
          addLog(`${p.name} 的愤怒效果已消散。`);
        }
      }

      if (p.reductionDuration > 0) {
        const nextDur = p.reductionDuration - 1;
        setter("reductionDuration", nextDur);
        if (nextDur === 0 && p.damageReduction > 0) {
          setter("damageReduction", 0);
          addLog(`${p.name} 的减伤效果已消散。`);
        }
      }
    });

    if (playerA.hp <= 0 || playerB.hp <= 0) {
      if (playerA.hp <= 0 && playerB.hp <= 0) handleBattleEnd("DRAW");
      else if (playerA.hp <= 0) handleBattleEnd("B");
      else handleBattleEnd("A");
      return;
    }

    const newAttacker = attackerId() === "A" ? "B" : "A";
    setAttackerId(newAttacker);

    // Check for "Turn Start" effects using plugin system
    const currentAttacker = newAttacker === "A" ? playerA : playerB;
    const currentOpponent = newAttacker === "A" ? playerB : playerA;
    const currentSetter = newAttacker === "A" ? setPlayerA : setPlayerB;

    const updates = effectManager.emit(
      "onTurnStart",
      {
        player: currentAttacker,
        opponent: currentOpponent,
      },
      {}
    );

    if (updates && Object.keys(updates).length > 0) {
      Object.entries(updates).forEach(([key, value]) => {
        currentSetter(key as any, value);
      });
      if (updates.shield && updates.shield > currentAttacker.shield) {
        addLog(
          `${currentAttacker.name} 获得 ${
            updates.shield - currentAttacker.shield
          } 点护盾 (遗物效果)`
        );
      }
    }

    drawCards(setPlayerA, playerA);
    drawCards(setPlayerB, playerB, 8);
    setPlayerA("lastAction", null);
    setPlayerB("lastAction", null);
    setPlayerA("selectedIds", new Set() as any);
    setPlayerB("selectedIds", new Set() as any);
    setPhase(GamePhase.P1_ATTACK);
    addLog(
      `--- 新回合 --- ${
        newAttacker === "A" ? "玩家 A" : "玩家 B"
      } 现在是攻击方。`
    );
  };

  return {
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
  };
}
