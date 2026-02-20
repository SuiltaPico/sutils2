import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { mdiBagPersonal, mdiCards, mdiExitToApp, mdiSwordCross } from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { getBestMove } from "../ai";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { BattleArea } from "../components/BattleArea"; // Revised version
import { HandArea } from "../components/HandArea";
import { HandPreview } from "../components/HandPreview";
import { LogModal } from "../components/LogModal";
import { PlayerStatus } from "../components/PlayerStatus";
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
import { isMobileDevice } from "../utils";
import clsx from "clsx";

export default function BattleView() {
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
  });

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.INIT);
  const [attackerId, setAttackerId] = createSignal<string>("A");
  const [logs, setLogs] = createSignal<string[]>([]);
  const [showLogs, setShowLogs] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<"hand" | "backpack">("hand");

  let logsEndRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (showLogs() && logs().length > 0 && logsEndRef) {
      logsEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

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
    const buffs = isAttackPhase(currentPhase)
      ? analyzeBuffs(selectedCards, patternName)
      : {
          shield: 0,
          trueDamage: 0,
          heal: 0,
          cleanse: 0,
          poison: 0,
          descriptions: [],
        };

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
    const attacker = attackerId() === "A" ? playerA : playerB;
    const defender = attackerId() === "A" ? playerB : playerA;
    const defSetter = attackerId() === "A" ? setPlayerB : setPlayerA;

    const attackVal = attacker.lastAction?.totalValue || 0;
    const defenseVal = defender.lastAction?.totalValue || 0;
    const rawDmg = Math.max(0, attackVal - defenseVal);
    const trueDmg = attacker.lastAction?.buffs?.trueDamage || 0;
    const totalIncoming = rawDmg + trueDmg;

    const shield = defender.shield;
    const blocked = Math.min(shield, totalIncoming);
    const finalDmg = totalIncoming - blocked;

    if (blocked > 0) {
      defSetter("shield", (s) => s - blocked);
      addLog(`${defender.name} 护盾抵消了 ${blocked} 点伤害`);
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
    // 中毒结算
    [playerA, playerB].forEach((p, idx) => {
      if (p.poisonStacks > 0) {
        const poisonDmg = p.poisonStacks;
        const setter = idx === 0 ? setPlayerA : setPlayerB;
        const blockedByShield = Math.min(p.shield, poisonDmg);
        const hpDmg = poisonDmg - blockedByShield;

        if (blockedByShield > 0) setter("shield", (s) => s - blockedByShield);
        if (hpDmg > 0) setter("hp", (h) => Math.max(0, h - hpDmg));
        setter("poisonStacks", (s) => Math.max(0, s - 1));
        addLog(
          `${p.name} 受到 ${poisonDmg} 点中毒伤害${
            blockedByShield > 0 ? ` (护盾抵消 ${blockedByShield})` : ""
          }`
        );
      }
    });

    // 中毒导致死亡判定
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

  const bgTheme = createMemo(() => {
    // 根据当前节点类型决定背景
    const currentNodeId = gameState.run.currentNodeId;
    if (!currentNodeId) return "default";

    const currentNode = gameState.run.map.find((n) => n.id === currentNodeId);
    if (!currentNode) return "default";

    switch (currentNode.type) {
      case "BATTLE":
        return "default";
      case "ELITE":
        return "elite";
      case "BOSS":
        return "boss";
      case "EVENT":
        return "event";
      case "REST":
        return "calm";
      default:
        return "default";
    }
  });

  return (
    <div class="w-full h-full relative flex flex-col overflow-hidden bg-[#050508] font-sans text-slate-200 select-none">
      <BackgroundEffect
        theme={bgTheme()}
        intensity={1.5}
        // speed={phase() === GamePhase.COMBAT_SHOWDOWN ? 2.0 : 0.5}
      />
      <style>{`
        .clip-cut {
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .clip-hex {
          clip-path: polygon(15px 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 15px 100%, 0 50%);
        }
        .cyber-border {
          position: relative;
        }
        .cyber-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border: 1px solid rgba(6, 182, 212, 0.3);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          pointer-events: none;
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
        }
      `}</style>

      <Show when={feedback()}>
        <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-yellow-600 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-bounce tracking-tighter font-mono">
            {feedback()}
          </div>
        </div>
      </Show>

      {/* TOP: Status Bar */}
      <div class="flex items-center justify-between w-full mx-auto bg-slate-950/60 backdrop-blur-md px-4 z-20 border-b border-white/10 relative">
        <div class="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

        <PlayerStatus
          player={playerA}
          opponent={playerB}
          phase={phase()}
          attackerId={attackerId()}
        />

        <div class="flex flex-col items-center gap-1 min-w-[160px] relative">
          <div
            class={`text-xl max-lg:text-4 text-slate-300 ${
              phaseInfo().color
            } flex items-center gap-2 drop-shadow-[0_0_8px_currentColor] transition-all duration-300`}
          >
            <span>战斗</span>
          </div>

          {/* Decor lines */}
          <div class="absolute -left-4 top-1/2 w-8 h-[1px] bg-white/10"></div>
          <div class="absolute -right-4 top-1/2 w-8 h-[1px] bg-white/10"></div>
        </div>

        <div class="flex items-center gap-4">
          <PlayerStatus
            player={playerB}
            opponent={playerA}
            phase={phase()}
            attackerId={attackerId()}
          />
          <button
            class="p-2 hover:bg-red-900/50 text-slate-500 hover:text-red-400 rounded-sm transition-colors"
            onClick={() => {
              if (confirm("确定要退出战斗吗？进度将会丢失。")) {
                setGameState("appState", AppState.MENU);
              }
            }}
            title="退出战斗"
          >
            <Icon path={mdiExitToApp} size={20} />
          </button>
        </div>
      </div>

      {/* MIDDLE: Battle Area */}
      <div
        class={clsx(
          "flex-1 w-full h-full flex items-center justify-center relative z-10 min-h-0 scanline",
          isMobileDevice ? "p-2" : "p-4"
        )}
      >
        <BattleArea
          phase={phase()}
          attackerId={attackerId()}
          playerA={playerA}
          playerB={playerB}
          phaseInfo={phaseInfo()}
          getDamageSourceWithTotal={getDamageSourceWithTotal}
        />
      </div>

      {/* BOTTOM: Control Area */}
      <div
        class={clsx(
          "w-full h-auto z-20 shrink-0",
          isMobileDevice ? "p-2" : "p-4"
        )}
      >
        <div class="max-w-7xl mx-auto flex items-stretch gap-4 h-[220px] max-lg:h-20">
          {/* Left Buttons */}
          <div
            class={clsx(
              "flex flex-col gap-3 shrink-0",
              isMobileDevice ? "" : "w-24"
            )}
          >
            {/* 手牌按钮 */}
            <button
              onClick={() => setActiveTab("hand")}
              class={`relative flex-1 group overflow-hidden transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] ${
                activeTab() === "hand"
                  ? "bg-cyan-900/20 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  : "bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50"
              }`}
            >
              <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-800/50 group-hover:border-cyan-400 transition-colors"></div>
              <div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-800/50 group-hover:border-cyan-400 transition-colors"></div>
              <div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-800/50 group-hover:border-cyan-400 transition-colors"></div>
              <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-800/50 group-hover:border-cyan-400 transition-colors"></div>

              <div class="relative z-10 h-full flex flex-col items-center justify-center gap-2">
                <div class="relative">
                  <div class="absolute inset-0 bg-cyan-500/20 blur-md rounded-full scale-0 group-hover:scale-150 transition-transform duration-500"></div>
                  <div class="relative p-2 rounded-sm bg-slate-900 border border-slate-700 group-hover:border-cyan-500/50 group-hover:bg-slate-800 transition-all transform group-hover:-translate-y-1">
                    <div class="text-slate-400 group-hover:text-cyan-400 transition-colors duration-300">
                      <Icon path={mdiCards} size={24} />
                    </div>
                  </div>
                </div>
                <Show when={!isMobileDevice}>
                  <div class="flex flex-col items-center gap-0.5">
                    <span class="text-xs font-serif font-bold text-slate-400 group-hover:text-cyan-100 tracking-[0.3em] transition-colors shadow-black drop-shadow-md">
                      手牌
                    </span>
                  </div>
                </Show>
              </div>
            </button>

            {/* 背包按钮 */}
            <button
              onClick={() => setActiveTab("backpack")}
              class={`relative flex-1 group overflow-hidden transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] ${
                activeTab() === "backpack"
                  ? "bg-emerald-900/20 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  : "bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50"
              }`}
            >
              {/* 装饰换成翡翠色/古玉色 */}
              <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-800/50 group-hover:border-emerald-400 transition-colors"></div>
              <div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-800/50 group-hover:border-emerald-400 transition-colors"></div>
              <div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-800/50 group-hover:border-emerald-400 transition-colors"></div>
              <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-800/50 group-hover:border-emerald-400 transition-colors"></div>

              <div class="relative z-10 h-full flex flex-col items-center justify-center gap-2">
                <div class="relative">
                  <div class="absolute inset-0 bg-emerald-500/20 blur-md rounded-full scale-0 group-hover:scale-150 transition-transform duration-500"></div>
                  <div class="relative p-2 rounded-sm bg-slate-900 border border-slate-700 group-hover:border-emerald-500/50 group-hover:bg-slate-800 transition-all transform group-hover:-translate-y-1">
                    <div class="text-slate-400 group-hover:text-emerald-400 transition-colors duration-300">
                      <Icon path={mdiBagPersonal} size={24} />
                    </div>
                  </div>
                </div>
                <Show when={!isMobileDevice}>
                  <div class="flex flex-col items-center gap-0.5">
                    <span class="text-xs font-serif font-bold text-slate-400 group-hover:text-emerald-100 tracking-[0.3em] transition-colors shadow-black drop-shadow-md">
                      背包
                    </span>
                  </div>
                </Show>
              </div>
            </button>
          </div>

          {/* Center Hand */}
          <div class="relative flex-1 min-w-0 flex flex-col justify-end h-full">
            <Show when={activeTab() === "hand"}>
              <HandPreview
                selectedCards={getSelectedCards(playerA)}
                isAttackPhase={isAttackPhase(phase())}
              />
              <HandArea
                player={playerA}
                phase={phase()}
                attackerId={attackerId()}
                onToggleSelect={toggleSelect}
              />
            </Show>
            <Show when={activeTab() === "backpack"}>
              <div class="w-full h-full flex items-center justify-center text-slate-500 font-mono tracking-widest border border-dashed border-emerald-900/30 bg-emerald-950/10 rounded-sm overflow-hidden relative group">
                {/* Backpack background effect */}
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/10 to-transparent opacity-50"></div>

                <div class="flex flex-col items-center gap-4 relative z-10">
                  <div class="opacity-20 text-emerald-500 group-hover:opacity-40 group-hover:scale-110 transition-all duration-500">
                    <Icon path={mdiBagPersonal} size={64} />
                  </div>
                  <div class="text-sm opacity-50 group-hover:opacity-80 transition-opacity">
                    背包功能开发中...
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Right Actions */}
          <div
            class={clsx(
              "flex flex-col gap-2 shrink-0",
              isMobileDevice ? "w-20" : "w-24"
            )}
          >
            <Show
              when={
                phase() !== GamePhase.ROUND_END &&
                phase() !== GamePhase.GAME_OVER
              }
            >
              <button
                onClick={executeAction}
                class={clsx(
                  `flex-[2] rounded-sm font-bold shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-1 border border-white/10`,
                  isAttackPhase(phase())
                    ? "bg-rose-900/80 text-rose-100 hover:bg-rose-800 hover:shadow-[0_0_20px_rgba(225,29,72,0.4)] border-rose-500/30"
                    : "bg-cyan-900/80 text-cyan-100 hover:bg-cyan-800 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] border-cyan-500/30",
                  isMobileDevice ? "text-sm" : "text-xl"
                )}
              >
                {isAttackPhase(phase()) ? "攻击" : "格挡"}
              </button>

              <Show when={isAttackPhase(phase())}>
                <button
                  onClick={skipAttack}
                  class="flex-1 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 rounded-sm text-slate-500 hover:text-slate-300 font-bold text-sm transition-all"
                >
                  空过
                </button>
              </Show>

              <Show when={isDefendPhase(phase())}>
                <button
                  onClick={skipDefense}
                  class="flex-1 bg-slate-900/80 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 rounded-sm text-slate-400 hover:text-red-300 font-bold text-sm transition-all"
                >
                  放弃
                </button>
              </Show>
            </Show>
          </div>
        </div>
      </div>

      <LogModal
        show={showLogs()}
        logs={logs()}
        onClose={() => setShowLogs(false)}
        endRef={(el) => (logsEndRef = el)}
      />
    </div>
  );
}
