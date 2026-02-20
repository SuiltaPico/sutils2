import { createSignal, createEffect, onMount, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { mdiSwordCross } from "@mdi/js";
import { getBestMove } from "../ai";
import {
  type CardData,
  HIGH_LEVEL_PATTERNS,
  analyzeBuffs,
  getRankValue,
  getSuitValue,
  identifyPattern,
} from "../core";
import { createDeck, gameState, setGameState } from "../store";
import {
  AppState,
  GamePhase,
  PlayerState,
  isAttackPhase,
  isDefendPhase,
} from "../types";

export function useBattle() {
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

  const drawCards = (
    playerSetter: any,
    playerGetter: PlayerState,
    targetCount: number = 7
  ) => {
    const count = targetCount - playerGetter.hand.length;
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

  const initGame = () => {
    drawCards(setPlayerA, playerA, 8);
    drawCards(setPlayerB, playerB, 8);
    setPhase(GamePhase.P1_ATTACK);
    setAttackerId("A");
    setLogs(["战斗开始！"]);
  };

  const handleBattleEnd = (winnerId: string) => {
    setPhase(GamePhase.GAME_OVER);
    if (winnerId === "A") {
      addLog("战斗胜利！");
      setGameState("run", "playerHp", playerA.hp);
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
    setter("selectedIds", newSet);
  };

  const getSelectedCards = (player: PlayerState) =>
    player.hand.filter((c) => player.selectedIds.has(c.id));

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

    if (currentPhase === GamePhase.P2_ATTACK) {
      if (selectedCards.length > 3) {
        setFeedback("追击只能出基础牌型 (<=3张)");
        setTimeout(() => setFeedback(null), 1500);
        return;
      }
      if (patternResult.name === "单张") {
        setFeedback("追击禁止出单张牌型");
        setTimeout(() => setFeedback(null), 1500);
        return;
      }
    }

    const totalValue = multiplier;
    const buffs = analyzeBuffs(
      selectedCards,
      patternName,
      isAttackPhase(currentPhase) ? "ATTACK" : "DEFEND"
    );

    setter("lastAction", {
      pattern: patternName,
      multiplier,
      totalValue,
      cards: selectedCards,
      relevantCardIds: new Set(patternResult.relevantCards.map((c) => c.id)),
      buffs,
    });

    setter("hand", (h) => h.filter((c) => !selectedIdsSnapshot.has(c.id)));
    setter("discardPile", (d) => [...d, ...selectedCards]);
    setter("selectedIds", new Set());

    addLog(`${player.name} 打出 ${patternResult.name} (${totalValue})`);
    if (buffs.descriptions.length > 0)
      addLog(`触发增益: ${buffs.descriptions.join(", ")}`);

    if (buffs.heal > 0)
      setter("hp", (h) => Math.min(player.maxHp, h + buffs.heal));
    if (buffs.cleanse > 0)
      setter("poisonStacks", (p) => Math.max(0, p - buffs.cleanse));
    if (buffs.poison > 0)
      (isA ? setPlayerB : setPlayerA)("poisonStacks", (p) => p + buffs.poison);
    if (buffs.shield > 0) setter("shield", (s) => s + buffs.shield);

    if (buffs.nextAttackBonus > 0) {
      setter("nextAttackBonus", (b) => b + buffs.nextAttackBonus);
      setter("rageDuration", 2);
    }
    if (buffs.damageReduction > 0) {
      setter("damageReduction", (r) => r + buffs.damageReduction);
      setter("reductionDuration", 1);
    }

    if (currentPhase === GamePhase.P1_ATTACK) setPhase(GamePhase.P1_DEFEND);
    else if (currentPhase === GamePhase.P1_DEFEND) startShowdown(1);
    else if (currentPhase === GamePhase.P2_ATTACK)
      setPhase(GamePhase.P2_DEFEND);
    else if (currentPhase === GamePhase.P2_DEFEND) startShowdown(2);
  };

  const startShowdown = (roundNum: number) => {
    setPhase(GamePhase.COMBAT_SHOWDOWN);
    setTimeout(() => resolveCombat(roundNum), 1500);
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
    });
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
    });
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
    setter("selectedIds", new Set());
    addLog(`${player.name} 弃掉了 ${selectedCards.length} 张牌并抽取了新牌。`);
    setter("lastAction", {
      pattern: "弃牌",
      multiplier: 0,
      totalValue: 0,
      cards: selectedCards,
      relevantCardIds: new Set(),
    });
    setPhase(GamePhase.ROUND_END);
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

    const reduction = defender.damageReduction;
    if (reduction > 0 && rawDmg > 0) {
      const reducedAmount = Math.floor(rawDmg * reduction);
      rawDmg -= reducedAmount;
      addLog(
        `${defender.name} 的减伤效果降低了 ${reducedAmount} 点伤害 (${Math.round(
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
    drawCards(setPlayerA, playerA, 8);
    drawCards(setPlayerB, playerB, 8);
    setPlayerA("lastAction", null);
    setPlayerB("lastAction", null);
    setPlayerA("selectedIds", new Set());
    setPlayerB("selectedIds", new Set());
    setPhase(GamePhase.P1_ATTACK);
    addLog(
      `--- 新回合 --- ${
        newAttacker === "A" ? "玩家 A" : "玩家 B"
      } 现在是攻击方。`
    );
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
          setPlayerB("selectedIds", newSet);
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
            setPlayerB("selectedIds", newSet);
            discardCards();
          } else skipAttack();
        } else skipDefense();
      }, 1000);
      return () => clearTimeout(timer);
    }
  });

  onMount(initGame);

  const phaseInfo = createMemo(() => {
    const p = phase();
    const attName = attackerId() === "A" ? playerA.name : playerB.name;
    const defName = attackerId() === "A" ? playerB.name : playerA.name;
    switch (p) {
      case GamePhase.P1_ATTACK:
        return {
          title: "进攻阶段",
          desc: `${attName} 正在准备进攻`,
          color: "text-rose-400 shadow-rose-500/50",
          icon: mdiSwordCross,
        };
      case GamePhase.P1_DEFEND:
        return {
          title: "防守阶段",
          desc: `${defName} 正在准备防御`,
          color: "text-cyan-400 shadow-cyan-500/50",
          icon: "🛡️",
        };
      case GamePhase.P2_ATTACK:
        return {
          title: "追击 · 连携",
          desc: `${attName} 正在准备追击`,
          color: "text-amber-400 shadow-amber-500/50 animate-pulse",
          icon: "⚡",
        };
      case GamePhase.P2_DEFEND:
        return {
          title: "追击 · 御守",
          desc: `${defName} 正在准备防御追击`,
          color: "text-orange-400 shadow-orange-500/50",
          icon: "🛡️",
        };
      case GamePhase.COMBAT_SHOWDOWN:
        return {
          title: "灵压对决",
          desc: "伤害结算中...",
          color: "text-slate-200",
          icon: "⚖️",
        };
      case GamePhase.ROUND_END:
        return {
          title: "回合调息",
          desc: "准备下一回合",
          color: "text-slate-400",
          icon: "⏳",
        };
      default:
        return {
          title: "准备中",
          desc: "",
          color: "text-slate-500",
          icon: "...",
        };
    }
  });

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
    phaseInfo,
    getSelectedCards,
    getDamageSourceWithTotal,
  };
}
