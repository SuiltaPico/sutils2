import { Icon } from "../../../../common/Icon";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { getBestMove } from "./ai";
import {
  type CardData,
  RANKS,
  SUITS,
  HIGH_LEVEL_PATTERNS,
  analyzeBuffs,
  getRankValue,
  getSuitValue,
  identifyPattern,
} from "./core";
import { GamePhase, PlayerState, isAttackPhase, isDefendPhase } from "./types";
import { PlayerArea } from "./components/PlayerArea";
import { BattleArea } from "./components/BattleArea";
import { LogModal } from "./components/LogModal";

const isMobileDevice =
  window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);


export default function RoundSimulation() {
  const requestFullscreenForMobile = () => {
    if (!isMobileDevice) return;
    if (document.fullscreenElement) return;

    const target = document.body as HTMLElement & {
      webkitRequestFullscreen?: () => void;
      msRequestFullscreen?: () => void;
    };
    target.requestFullscreen();
  };

  const [hasTriedMobileFullscreen, setHasTriedMobileFullscreen] =
    createSignal(false);

  const handleFirstMobileTap = () => {
    if (!isMobileDevice) return;
    var docElm = document.documentElement as HTMLElement & {
      requestFullscreen?: () => void;
      msRequestFullscreen?: () => void;
      mozRequestFullScreen?: () => void;
      webkitRequestFullScreen?: () => void;
    };
    if (docElm.requestFullscreen) {
      docElm.requestFullscreen();
    } else if (docElm.msRequestFullscreen) {
      docElm.msRequestFullscreen();
    } else if (docElm.mozRequestFullScreen) {
      docElm.mozRequestFullScreen();
    } else if (docElm.webkitRequestFullScreen) {
      docElm.webkitRequestFullScreen();
    }
  };

  const styles = `
    @keyframes card-enter {
      0% { opacity: 0; transform: translateY(60px) translateX(-20px) rotate(-10deg); }
      100% { opacity: 1; transform: translateY(0) translateX(0) rotate(0); }
    }
    .animate-card-enter {
      animation: card-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      animation-fill-mode: backwards;
    }
    @keyframes fade-in-up {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up { animation: fade-in-up 0.3s ease-out; }
    @keyframes bounce-in {
      0% { opacity: 0; transform: scale(0.3); }
      50% { opacity: 1; transform: scale(1.05); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }
    .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.215, 0.61, 0.355, 1); }
    @keyframes fly-in-bottom {
      0% { opacity: 0; transform: translateY(100px) scale(0.8); }
      70% { transform: translateY(-10px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    .animate-fly-in-bottom { animation: fly-in-bottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `;

  const [playerA, setPlayerA] = createStore<PlayerState>({
    id: "A",
    name: "玩家",
    hp: 10,
    maxHp: 10,
    shield: 0,
    poisonStacks: 0,
    hand: [],
    deck: [],
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
    deck: [],
    discardPile: [],
    selectedIds: new Set(),
    lastAction: null,
  });

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.INIT);
  const [attackerId, setAttackerId] = createSignal<string>("A");
  const [logs, setLogs] = createSignal<string[]>([]);
  const [showLogs, setShowLogs] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  let logsEndRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (showLogs() && logs().length > 0 && logsEndRef) {
      logsEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const getDamageSourceFormula = (
    attackVal: number,
    defenseVal: number,
    trueDmg: number
  ) => {
    const truePart = trueDmg > 0 ? ` + 真实伤害[${trueDmg}]` : "";
    return `攻击[${attackVal}]-防御[${defenseVal}]${truePart}`;
  };

  const getDamageSourceWithTotal = (
    attackVal: number,
    defenseVal: number,
    trueDmg: number
  ) => {
    const rawDmg = Math.max(0, attackVal - defenseVal);
    const totalBeforeShield = rawDmg + trueDmg;
    return `${totalBeforeShield} (${getDamageSourceFormula(
      attackVal,
      defenseVal,
      trueDmg
    )})`;
  };

  const createDeck = (): CardData[] => {
    const deck: CardData[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const color = suit === "♥" || suit === "♦" ? "red" : "black";
        deck.push({
          suit,
          rank,
          color,
          id: Math.random().toString(36).substr(2, 9),
        });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
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
    const deckA = createDeck();
    const deckB = createDeck();
    setPlayerA({
      hp: 10,
      maxHp: 10,
      shield: 0,
      poisonStacks: 0,
      hand: [],
      deck: deckA,
      discardPile: [],
      selectedIds: new Set(),
      lastAction: null,
    });
    setPlayerB({
      hp: 10,
      maxHp: 10,
      shield: 0,
      poisonStacks: 0,
      hand: [],
      deck: deckB,
      discardPile: [],
      selectedIds: new Set(),
      lastAction: null,
    });

    const handA = deckA
      .splice(0, 8)
      .sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
    const handB = deckB
      .splice(0, 8)
      .sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

    setPlayerA("hand", handA);
    setPlayerA("deck", deckA);
    setPlayerB("hand", handB);
    setPlayerB("deck", deckB);

    setPhase(GamePhase.P1_ATTACK);
    setAttackerId("A");
    setLogs(["游戏开始。"]);
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
    setTimeout(() => resolveCombat(roundNum), 2000);
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
      `战斗结果: ${attacker.name} 对 ${
        defender.name
      } 造成 ${finalDmg} 点伤害 (${sourceText}${
        blocked > 0 ? ` - 护盾抵消[${blocked}]` : ""
      })`
    );

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
            blockedByShield > 0
              ? ` (护盾抵消 ${blockedByShield}，实际掉血 ${hpDmg})`
              : ""
          }`
        );
      }
    });

    if (playerA.hp <= 0 || playerB.hp <= 0) {
      if (playerA.hp <= 0 && playerB.hp <= 0) addLog(`双方同时倒下！平局！`);
      else if (playerA.hp <= 0)
        addLog(`${playerA.name} 被击败！${playerB.name} 获胜！`);
      else addLog(`${playerB.name} 被击败！${playerA.name} 获胜！`);
      setPhase(GamePhase.GAME_OVER);
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
        if (isHighLevel)
          addLog(`${attacker.name} 打出高级牌型，但手牌无法追击 (无对子/三条)`);
        setPhase(GamePhase.ROUND_END);
      }
    } else {
      setPhase(GamePhase.ROUND_END);
    }
  };

  const nextRound = () => {
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
            Math.min(sortedHand.length, 5)
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
          desc: `${attName} 正在出牌`,
          color: "text-rose-400",
          icon: "⚔️",
        };
      case GamePhase.P1_DEFEND:
        return {
          title: "防守阶段",
          desc: `${defName} 正在防御`,
          color: "text-sky-400",
          icon: "🛡️",
        };
      case GamePhase.P2_ATTACK:
        return {
          title: "⚡ 追击阶段 ⚡",
          desc: `${attName} 获得额外攻击机会！`,
          color: "text-yellow-400 animate-pulse",
          icon: "⚡",
        };
      case GamePhase.P2_DEFEND:
        return {
          title: "追击防守",
          desc: `${defName} 需要抵挡追击`,
          color: "text-orange-400",
          icon: "🛡️",
        };
      case GamePhase.COMBAT_SHOWDOWN:
        return {
          title: "战斗结算",
          desc: "计算伤害中...",
          color: "text-slate-200",
          icon: "⚖️",
        };
      case GamePhase.ROUND_END:
        return {
          title: "回合结束",
          desc: "准备下一回合",
          color: "text-slate-400",
          icon: "⏳",
        };
      case GamePhase.GAME_OVER:
        return {
          title: "游戏结束",
          desc: "",
          color: "text-red-500",
          icon: "🏁",
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

  return (
    <div
      onPointerDown={handleFirstMobileTap}
      class="w-full min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black flex flex-col items-center p-3 max-md:p-0 gap-6 font-sans text-slate-200"
    >
      <style>{styles}</style>
      <Show when={feedback()}>
        <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-bounce tracking-tighter">
            {feedback()}
          </div>
        </div>
      </Show>

      <Show when={phase() === GamePhase.P2_ATTACK}>
        <div class="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce-in">
          <div class="bg-yellow-500/20 backdrop-blur-md border border-yellow-500/50 px-8 py-2 rounded-full shadow-[0_0_30px_rgba(234,179,8,0.3)]">
            <div class="text-yellow-400 font-black text-xl tracking-widest uppercase flex items-center gap-3">
              <span>⚡</span> 额外追击阶段 <span>⚡</span>
            </div>
          </div>
        </div>
      </Show>

      <PlayerArea
        player={playerB}
        opponent={playerA}
        phase={phase()}
        attackerId={attackerId()}
        isOpponent
        onToggleSelect={toggleSelect}
      />
      <BattleArea
        phase={phase()}
        attackerId={attackerId()}
        playerA={playerA}
        playerB={playerB}
        phaseInfo={phaseInfo()}
        getDamageSourceWithTotal={getDamageSourceWithTotal}
      />
      <LogModal
        show={showLogs()}
        logs={logs()}
        onClose={() => setShowLogs(false)}
        endRef={(el) => (logsEndRef = el)}
      />

      <div class="w-full max-w-7xl flex gap-6 items-start">
        <div class="flex-1 min-w-0">
          <PlayerArea
            player={playerA}
            opponent={playerB}
            phase={phase()}
            attackerId={attackerId()}
            onToggleSelect={toggleSelect}
          />
        </div>
        <div class="w-72 flex flex-col gap-3 justify-center items-center bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm shrink-0 self-stretch relative">
          <div class="text-2xl font-black text-white mb-4 tracking-tight">
            {phaseInfo().title}
          </div>
          <Show
            when={
              phase() !== GamePhase.ROUND_END && phase() !== GamePhase.GAME_OVER
            }
          >
            <button
              onClick={executeAction}
              class={`w-full px-6 py-4 font-bold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 text-xl tracking-wide ${
                isAttackPhase(phase())
                  ? "bg-gradient-to-br from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-900/20"
                  : "bg-gradient-to-br from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white shadow-sky-900/20"
              }`}
            >
              {isAttackPhase(phase()) ? "出牌" : "防御"}
            </button>
            <Show when={isDefendPhase(phase())}>
              <button
                onClick={skipDefense}
                class="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl shadow-md transition-all duration-200 text-sm tracking-wider uppercase border border-slate-600 mt-2"
              >
                跳过
              </button>
            </Show>
            <Show when={isAttackPhase(phase())}>
              <button
                onClick={skipAttack}
                class="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl shadow-md transition-all duration-200 text-sm tracking-wider uppercase border border-slate-600 mt-2"
              >
                跳过
              </button>
            </Show>
          </Show>
          <button
            onClick={() => setShowLogs(true)}
            class="absolute top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 font-medium rounded-lg border border-slate-700/50 transition-colors hover:text-white"
            title="战斗日志"
          >
            <Icon path="M13 12h7v1.5h-7V12zm0-2.5h7V11h-7V9.5zM13 15h7v1.5h-7V15zM4 20h16c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2zM4 6h16v12H4V6zm2 2h5v8H6V8z" />
          </button>
        </div>
      </div>
    </div>
  );
}
