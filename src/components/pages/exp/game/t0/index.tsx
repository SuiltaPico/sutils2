import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { getBestMove } from './ai';
import {
  type CardData,
  RANKS,
  SUITS,
  HIGH_LEVEL_PATTERNS,
  analyzeBuffs,
  type BuffResult,
  getRankValue,
  getSuitValue,
  identifyPattern
} from './core';

// Custom FLIP Animation Hook
const useFlipAnimation = (
  listAccessor: () => any[],
  options: { duration: number; easing: string } = { duration: 300, easing: 'ease-in-out' }
) => {
  let containerRef: HTMLDivElement | undefined;
  // Store layout positions (left, top) instead of DOMRect to avoid transform interference
  const positions = new Map<string, { left: number; top: number }>();

  createEffect(() => {
    const list = listAccessor(); // Track dependency
    if (!containerRef) return;

    const children = Array.from(containerRef.children) as HTMLElement[];
    const currentPositions = new Map<string, { left: number; top: number }>();

    // 1. Capture current layout positions (unaffected by transforms)
    children.forEach(child => {
      const id = child.dataset.id;
      if (id) {
        currentPositions.set(id, {
          left: child.offsetLeft,
          top: child.offsetTop
        });
      }
    });

    // 2. Compare and Animate
    children.forEach(child => {
      const id = child.dataset.id;
      if (!id) return;

      const newPos = currentPositions.get(id);
      const oldPos = positions.get(id);

      if (newPos && oldPos) {
        const deltaX = oldPos.left - newPos.left;
        const deltaY = oldPos.top - newPos.top;

        // Only animate if there is a significant layout change
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          // Cancel any running animations to prevent conflict
          child.getAnimations().forEach(anim => anim.cancel());

          child.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: 'translate(0, 0)' }
            ],
            {
              duration: options.duration,
              easing: options.easing,
              fill: 'both'
            }
          );
        }
      }
    });

    // 3. Update positions for next run
    positions.clear();
    currentPositions.forEach((pos, id) => positions.set(id, pos));
  });

  return (el: HTMLDivElement) => {
    containerRef = el;
  };
};

const Card = (props: { card: CardData; selected: boolean; onClick: () => void; small?: boolean; index?: number; noEntryAnimation?: boolean; dimmed?: boolean }) => {
  return (
    <div
      data-id={props.card.id} // Important for FLIP tracking
      onClick={props.onClick}
      style={{ "animation-delay": `${(props.index || 0) * 0.1}s` }}
      class={`${props.small ? 'w-16 h-24 text-sm' : 'w-24 h-36 text-lg'} bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col justify-between p-2 select-none cursor-pointer relative overflow-hidden ${props.noEntryAnimation ? '' : 'animate-card-enter'} ${props.selected ? '-translate-y-4 ring-4 ring-yellow-400' : 'hover:-translate-y-2 transition-transform duration-200'} ${props.dimmed ? 'grayscale opacity-60' : ''}`}
    >
      <div class={`font-bold ${props.card.color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {props.card.rank}
        <div class="text-xs">{props.card.suit}</div>
      </div>

      <div class={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 ${props.card.color === 'red' ? 'text-red-600' : 'text-gray-900'} ${props.small ? 'text-2xl' : 'text-4xl'}`}>
        {props.card.suit}
      </div>

      <div class={`font-bold self-end rotate-180 ${props.card.color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {props.card.rank}
        <div class="text-xs">{props.card.suit}</div>
      </div>
    </div>
  );
};

export enum GamePhase {
  INIT = 'INIT',
  P1_ATTACK = 'P1_ATTACK',
  P1_DEFEND = 'P1_DEFEND',
  P2_ATTACK = 'P2_ATTACK',
  P2_DEFEND = 'P2_DEFEND',
  COMBAT_SHOWDOWN = 'COMBAT_SHOWDOWN',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER'
}

const isAttackPhase = (p: GamePhase) => p === GamePhase.P1_ATTACK || p === GamePhase.P2_ATTACK;
const isDefendPhase = (p: GamePhase) => p === GamePhase.P1_DEFEND || p === GamePhase.P2_DEFEND;

  interface PlayerState {
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
    lastAction: {
      pattern: string;
      multiplier: number;
      totalValue: number;
      cards: CardData[];
      relevantCardIds: Set<string>;
      buffs?: BuffResult;
    } | null;
  }

export default function RoundSimulation() {
  const styles = `
    @keyframes card-enter {
      0% {
        opacity: 0;
        transform: translateY(60px) translateX(-20px) rotate(-10deg);
      }
      100% {
        opacity: 1;
        transform: translateY(0) translateX(0) rotate(0);
      }
    }
    .animate-card-enter {
      animation: card-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      animation-fill-mode: backwards;
    }
    @keyframes fade-in-up {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up {
      animation: fade-in-up 0.3s ease-out;
    }
    @keyframes bounce-in {
      0% { opacity: 0; transform: scale(0.3); }
      50% { opacity: 1; transform: scale(1.05); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }
    .animate-bounce-in {
      animation: bounce-in 0.6s cubic-bezier(0.215, 0.61, 0.355, 1);
    }
    @keyframes fly-in-bottom {
      0% {
        opacity: 0;
        transform: translateY(100px) scale(0.8);
      }
      70% {
        transform: translateY(-10px) scale(1.02);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .animate-fly-in-bottom {
      animation: fly-in-bottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    }
  `;

    const [playerA, setPlayerA] = createStore<PlayerState>({
    id: 'A',
    name: '玩家 A',
    hp: 10,
    maxHp: 10,
    shield: 0,
    poisonStacks: 0,
    hand: [],
    deck: [],
    discardPile: [],
    selectedIds: new Set(),
    lastAction: null
  });

  const [playerB, setPlayerB] = createStore<PlayerState>({
    id: 'B',
    name: '玩家 B',
    hp: 10,
    maxHp: 10,
    shield: 0,
    poisonStacks: 0,
    hand: [],
    deck: [],
    discardPile: [],
    selectedIds: new Set(),
    lastAction: null
  });

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.INIT);
  const [attackerId, setAttackerId] = createSignal<string>('A');
  const [logs, setLogs] = createSignal<string[]>([]);
  const [showLogs, setShowLogs] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  
  let logsEndRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (showLogs() && logs().length > 0 && logsEndRef) {
      logsEndRef.scrollIntoView({ behavior: 'smooth' });
    }
  });

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const createDeck = (): CardData[] => {
    const deck: CardData[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
        deck.push({ suit, rank, color, id: Math.random().toString(36).substr(2, 9) });
      }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };

  const drawCards = (playerSetter: any, playerGetter: PlayerState, targetCount: number = 7) => {
    const count = targetCount - playerGetter.hand.length;
    if (count <= 0) return;

    let currentDeck = [...playerGetter.deck];
    let currentDiscard = [...playerGetter.discardPile];
    const newCards: CardData[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDeck.length === 0) {
        if (currentDiscard.length === 0) {
            break; // No cards left at all
        }
        // Reshuffle discard pile
        currentDeck = [...currentDiscard];
        // Shuffle logic
        for (let k = currentDeck.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [currentDeck[k], currentDeck[j]] = [currentDeck[j], currentDeck[k]];
        }
        currentDiscard = [];
        addLog(`${playerGetter.name} 牌堆耗尽，重新洗牌。`);
      }
      
      const card = currentDeck.pop();
      if (card) {
        newCards.push(card);
      }
    }

    const combined = [...playerGetter.hand, ...newCards]
      .filter(c => !!c) // Filter out any potential undefined/nulls
      .sort((a, b) => {
        const diff = getRankValue(b.rank) - getRankValue(a.rank);
        if (diff !== 0) return diff;
        return getSuitValue(b.suit) - getSuitValue(a.suit);
      });

    playerSetter('hand', combined);
    playerSetter('deck', currentDeck);
    playerSetter('discardPile', currentDiscard);
  };

  const initGame = () => {
    const deckA = createDeck();
    const deckB = createDeck();

    setPlayerA({ hp: 10, maxHp: 10, shield: 0, poisonStacks: 0, hand: [], deck: deckA, discardPile: [], selectedIds: new Set(), lastAction: null });
    setPlayerB({ hp: 10, maxHp: 10, shield: 0, poisonStacks: 0, hand: [], deck: deckB, discardPile: [], selectedIds: new Set(), lastAction: null });

    // Draw initial cards
    // Need to use a timeout or effect to ensure state is updated? 
    // Actually setPlayerA updates immediately for the next read in the same function scope? No, it's async batching usually.
    // But we can just pass the initial state objects to a modified draw helper or just do it manually here for init.
    
    // Let's just use the helper but we need to be careful about reading state immediately after setting.
    // Since we just created the decks, we can just slice them.
    
    const handA = deckA.splice(0, 8).sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
    const handB = deckB.splice(0, 8).sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

    setPlayerA('hand', handA);
    setPlayerA('deck', deckA);
    
    setPlayerB('hand', handB);
    setPlayerB('deck', deckB);

    setPhase(GamePhase.P1_ATTACK);
    setAttackerId('A');
    setLogs(['游戏开始。']);
  };

  const toggleSelect = (playerId: string, cardId: string) => {
    const isA = playerId === 'A';
    const player = isA ? playerA : playerB;
    const setter = isA ? setPlayerA : setPlayerB;

    // Only allow selection for current active player
    const isAttacker = attackerId() === playerId;
    const currentPhase = phase();

    const canAct = (isAttacker && isAttackPhase(currentPhase)) ||
      (!isAttacker && isDefendPhase(currentPhase));

    if (!canAct) return;

    const newSet = new Set(player.selectedIds);
    if (newSet.has(cardId)) newSet.delete(cardId);
    else newSet.add(cardId);

    setter('selectedIds', newSet);
  };

  const getSelectedCards = (player: PlayerState) => {
    return player.hand.filter(c => player.selectedIds.has(c.id));
  };

  const executeAction = () => {
    const currentPhase = phase();
    const isAttackerTurn = isAttackPhase(currentPhase);
    const activeId = isAttackerTurn ? attackerId() : (attackerId() === 'A' ? 'B' : 'A');
    const isA = activeId === 'A';
    const player = isA ? playerA : playerB;
    const setter = isA ? setPlayerA : setPlayerB;

    const selectedCards = getSelectedCards(player);
    const selectedIdsSnapshot = new Set(player.selectedIds);
    if (selectedCards.length === 0) return;

    if (selectedCards.length > 5) {
      setFeedback('最多只能出 5 张牌');
      setTimeout(() => setFeedback(null), 1000);
      return;
    }

    const patternResult = identifyPattern(selectedCards);
    
    // Allow playing "useless" cards (Trash)
    const isTrash = patternResult.name === '无效牌型';
    const patternName = isTrash ? '杂牌' : patternResult.name;
    const multiplier = isTrash ? 0 : patternResult.multiplier;

    // Validate Phase 2 Attack (Must be Basic Pattern <= 3 cards)
    if (currentPhase === GamePhase.P2_ATTACK) {
      if (selectedCards.length > 3) {
        setFeedback('追击只能出基础牌型 (<=3张)');
        setTimeout(() => setFeedback(null), 1500);
        return;
      }
      if (patternResult.name === '单张') {
        setFeedback('追击禁止出单张牌型');
        setTimeout(() => setFeedback(null), 1500);
        return;
      }
    }

    const totalValue = multiplier;

    // Buffs only trigger during Attack Phase
    const buffs = isAttackPhase(currentPhase) 
      ? analyzeBuffs(selectedCards, patternName)
      : { shield: 0, trueDamage: 0, heal: 0, cleanse: 0, poison: 0, descriptions: [] };

    // Record Action
    setter('lastAction', {
      pattern: patternName,
      multiplier: multiplier,
      totalValue: totalValue,
      cards: selectedCards,
      relevantCardIds: new Set(patternResult.relevantCards.map(c => c.id)),
      buffs: buffs
    });

    // Remove cards
    setter('hand', h => h.filter(c => !selectedIdsSnapshot.has(c.id)));
    // Add to discard pile
    setter('discardPile', d => [...d, ...selectedCards]);
    setter('selectedIds', new Set());

    addLog(`${player.name} 打出 ${patternResult.name} (${totalValue})`);

    if (buffs.descriptions.length > 0) {
      addLog(`触发增益: ${buffs.descriptions.join(', ')}`);
    }

    // Apply Immediate Buff Effects
    if (buffs.heal > 0) {
      setter('hp', h => Math.min(player.maxHp, h + buffs.heal));
    }
    if (buffs.cleanse > 0) {
      setter('poisonStacks', p => Math.max(0, p - buffs.cleanse));
    }
    if (buffs.poison > 0) {
      const opponentSetter = isA ? setPlayerB : setPlayerA;
      opponentSetter('poisonStacks', p => p + buffs.poison);
    }
    if (buffs.shield > 0) {
      setter('shield', s => s + buffs.shield);
    }

    // State Transition
    if (currentPhase === GamePhase.P1_ATTACK) {
      setPhase(GamePhase.P1_DEFEND);
    } else if (currentPhase === GamePhase.P1_DEFEND) {
      startShowdown(1);
    } else if (currentPhase === GamePhase.P2_ATTACK) {
      setPhase(GamePhase.P2_DEFEND);
    } else if (currentPhase === GamePhase.P2_DEFEND) {
      startShowdown(2);
    }
  };

  const startShowdown = (roundNum: number) => {
    setPhase(GamePhase.COMBAT_SHOWDOWN);

    // Animation delay before resolving combat
    setTimeout(() => {
      resolveCombat(roundNum);
    }, 2000); // 2 seconds for showdown animation
  };

  const skipDefense = () => {
    const currentPhase = phase();
    if (!isDefendPhase(currentPhase)) return;

    // Determine defender
    const isAttackerA = attackerId() === 'A';
    const defender = isAttackerA ? playerB : playerA;
    const defSetter = isAttackerA ? setPlayerB : setPlayerA;

    defSetter('lastAction', {
      pattern: '放弃防御',
      multiplier: 0,
      totalValue: 0,
      cards: [],
      relevantCardIds: new Set()
    });

    addLog(`${defender.name} 放弃防御。`);

    if (currentPhase === GamePhase.P1_DEFEND) startShowdown(1);
    else startShowdown(2);
  };

  const skipAttack = () => {
    const currentPhase = phase();
    if (!isAttackPhase(currentPhase)) return;

    const isAttackerA = attackerId() === 'A';
    const attacker = isAttackerA ? playerA : playerB;
    const attSetter = isAttackerA ? setPlayerA : setPlayerB;

    attSetter('lastAction', {
      pattern: '放弃攻击',
      multiplier: 0,
      totalValue: 0,
      cards: [],
      relevantCardIds: new Set()
    });

    addLog(`${attacker.name} 放弃攻击。`);

    if (currentPhase === GamePhase.P1_ATTACK) {
      setPhase(GamePhase.P1_DEFEND);
    } else {
      setPhase(GamePhase.ROUND_END);
    }
  };

  const discardCards = () => {
    const currentPhase = phase();
    if (!isAttackPhase(currentPhase)) return;

    const isAttackerA = attackerId() === 'A';
    const player = isAttackerA ? playerA : playerB;
    const setter = isAttackerA ? setPlayerA : setPlayerB;

    const selectedCards = getSelectedCards(player);
    const selectedIdsSnapshot = new Set(player.selectedIds);

    if (selectedCards.length === 0) {
      setFeedback('请选择要丢弃的牌');
      setTimeout(() => setFeedback(null), 1000);
      return;
    }

    if (selectedCards.length > 5) {
      setFeedback('最多只能丢弃 5 张牌');
      setTimeout(() => setFeedback(null), 1000);
      return;
    }

    // Remove cards
    const remainingHand = player.hand.filter(c => !selectedIdsSnapshot.has(c.id));
    setter('hand', remainingHand);
    // Add to discard pile
    setter('discardPile', d => [...d, ...selectedCards]);

    // Draw new cards (refill to 8)
    drawCards(setter, { ...player, hand: remainingHand }, 8); // Use updated hand snapshot

    setter('selectedIds', new Set());

    addLog(`${player.name} 弃掉了 ${selectedCards.length} 张牌并抽取了新牌。`);

    setter('lastAction', {
      pattern: '弃牌',
      multiplier: 0,
      totalValue: 0,
      cards: selectedCards,
      relevantCardIds: new Set()
    });

    // End Round
    setPhase(GamePhase.ROUND_END);
  };

  const resolveCombat = (roundNum: number) => {
    const attacker = attackerId() === 'A' ? playerA : playerB;
    const defender = attackerId() === 'A' ? playerB : playerA;
    const defSetter = attackerId() === 'A' ? setPlayerB : setPlayerA;
    const attSetter = attackerId() === 'A' ? setPlayerA : setPlayerB;

    // 1. Calculate Combat Damage
    // Raw damage is Attack - Defense
    // But we need to handle "Full Defense" logic carefully.
    // If Defense > Attack, damage is 0.
    // The "Full Defense" bonus (Shield) is handled separately.
    
    const attackVal = attacker.lastAction?.totalValue || 0;
    const defenseVal = defender.lastAction?.totalValue || 0;
    
    const rawDmg = Math.max(0, attackVal - defenseVal);
    const trueDmg = attacker.lastAction?.buffs?.trueDamage || 0;
    const totalIncoming = rawDmg + trueDmg;

    // 2. Apply Shield Mitigation
    const shield = defender.shield;
    const blocked = Math.min(shield, totalIncoming);
    const finalDmg = totalIncoming - blocked;

    // Update Shield (Reduce by damage taken)
    if (blocked > 0) {
      defSetter('shield', s => s - blocked);
      addLog(`${defender.name} 护盾抵消了 ${blocked} 点伤害`);
    }

    // Check for Full Defense (Overkill Defense -> Shield)
    // Only if defender actually played a defense card (not skipped) and defense > attack
    if (defenseVal > attackVal && defender.lastAction?.pattern !== '放弃防御') {
      const overkill = defenseVal - attackVal;
      defSetter('shield', s => s + overkill);
      addLog(`${defender.name} 完全防御！溢出的 ${overkill} 点防御转化为护盾`);
    }

    // Update HP
    const currentHp = defender.hp;
    const newHp = Math.max(0, currentHp - finalDmg);
    defSetter('hp', newHp);
    
    addLog(`战斗结果: ${attacker.name} 对 ${defender.name} 造成 ${finalDmg} 点伤害 (真伤: ${trueDmg})`);

    // 3. Apply Poison Damage (End of Round)
    // Apply to both players
    [playerA, playerB].forEach((p, idx) => {
      if (p.poisonStacks > 0) {
        const pDmg = p.poisonStacks;
        const setter = idx === 0 ? setPlayerA : setPlayerB;
        setter('hp', h => Math.max(0, h - pDmg));
        setter('poisonStacks', s => Math.max(0, s - 1));
        addLog(`${p.name} 受到 ${pDmg} 点中毒伤害`);
      }
    });

    // 4. Check Game Over
    if (playerA.hp <= 0 || playerB.hp <= 0) {
      if (playerA.hp <= 0 && playerB.hp <= 0) {
        addLog(`双方同时倒下！平局！`);
      } else if (playerA.hp <= 0) {
        addLog(`${playerA.name} 被击败！${playerB.name} 获胜！`);
      } else {
        addLog(`${playerB.name} 被击败！${playerA.name} 获胜！`);
      }
      setPhase(GamePhase.GAME_OVER);
      return;
    }

    if (roundNum === 1) {
      // Check for High Level Pattern to trigger Phase 2
      const lastPattern = attacker.lastAction?.pattern || '';
      const isHighLevel = HIGH_LEVEL_PATTERNS.has(lastPattern);
      
      // Check if attacker has potential for combo (Pair or Three of a Kind)
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
        if (isHighLevel) {
          addLog(`${attacker.name} 打出高级牌型，但手牌无法追击 (无对子/三条)`);
        }
        setPhase(GamePhase.ROUND_END);
      }
    } else {
      setPhase(GamePhase.ROUND_END);
    }
  };

  const nextRound = () => {
    // Switch roles
    const newAttacker = attackerId() === 'A' ? 'B' : 'A';
    setAttackerId(newAttacker);

    // Draw cards
    drawCards(setPlayerA, playerA, 8);
    drawCards(setPlayerB, playerB, 8);

    // Clear actions
    setPlayerA('lastAction', null);
    setPlayerB('lastAction', null);
    setPlayerA('selectedIds', new Set());
    setPlayerB('selectedIds', new Set());

    setPhase(GamePhase.P1_ATTACK);
    addLog(`--- 新回合 --- ${newAttacker === 'A' ? '玩家 A' : '玩家 B'} 现在是攻击方。`);
  };

  // Auto Next Round
  createEffect(() => {
    if (phase() === GamePhase.ROUND_END) {
      nextRound();
    }
  });

  // AI Logic
  createEffect(() => {
    const currentPhase = phase();
    const currentAttacker = attackerId();

    // Check if it's AI's turn (Player B)
    let isAiTurn = false;
    let isAttack = false;
    let isSecondAttack = false;
    let incomingDamage = 0;

    if (currentAttacker === 'B') {
      // AI is Attacker
      if (currentPhase === GamePhase.P1_ATTACK) {
        isAiTurn = true;
        isAttack = true;
      } else if (currentPhase === GamePhase.P2_ATTACK) {
        isAiTurn = true;
        isAttack = true;
        isSecondAttack = true;
      }
    } else {
      // AI is Defender (Attacker is A)
      if (isDefendPhase(currentPhase)) {
        isAiTurn = true;
        isAttack = false;
        // Calculate incoming damage from Player A's last action
        incomingDamage = playerA.lastAction?.totalValue || 0;
      }
    }

    if (isAiTurn) {
      // AI Thinking Time
      const timer = setTimeout(() => {
        // Calculate best move
        const bestCards = getBestMove(
          playerB.hand, 
          isAttack, 
          isSecondAttack, 
          incomingDamage,
          playerB.hp,
          playerB.maxHp
        );

        if (bestCards.length > 0) {
          // Select cards
          const newSet = new Set<string>();
          bestCards.forEach(c => newSet.add(c.id));
          setPlayerB('selectedIds', newSet);

          // Execute
          executeAction();
        } else {
          // No valid move? 
          if (isAttack) {
            // AI Strategy: Discard worst cards if can't attack
            // Sort by value (low to high)
            const sortedHand = [...playerB.hand].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
            // Pick up to 5
            const count = Math.min(sortedHand.length, 5);
            const cardsToDiscard = sortedHand.slice(0, count);

            if (cardsToDiscard.length > 0) {
              const newSet = new Set<string>();
              cardsToDiscard.forEach(c => newSet.add(c.id));
              setPlayerB('selectedIds', newSet);
              discardCards();
            } else {
              skipAttack();
            }
          } else {
            skipDefense();
          }
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  });

  onMount(() => {
    initGame();
  });

  const PlayerArea = (props: { player: PlayerState, isOpponent?: boolean }) => {
    // Use our custom FLIP animation hook
    const setRef = useFlipAnimation(() => props.player.hand);

    const isAttacker = () => attackerId() === props.player.id;
    const isMyTurn = () => (isAttacker() && isAttackPhase(phase())) || (!isAttacker() && isDefendPhase(phase()));
    const role = () => isAttacker() ? '攻击方' : '防守方';
    const effectiveMax = () => Math.max(props.player.maxHp, props.player.hp + props.player.shield);

    const hpPercent = () => {
      return (props.player.hp / effectiveMax()) * 100;
    };

    const shieldPercent = () => {
      return (props.player.shield / effectiveMax()) * 100;
    };

    // Logic to prevent damage trail animation when shield is added (scale changes)
    const [trailKey, setTrailKey] = createSignal(0);
    let lastMax = 0; // Initialize with 0

    createEffect(() => {
      const cur = effectiveMax();
      // If max increases, we are rescaling down the green bar visually.
      // We don't want the red bar to lag behind (which looks like damage).
      // So we force a re-render of the trail element to snap it.
      if (cur > lastMax) {
        setTrailKey(k => k + 1);
      }
      lastMax = cur;
    });

    // Calculate Pending Damage
    const pendingDamageInfo = createMemo(() => {
      // Only relevant if I am the defender and it is defense phase
      if (isAttacker() || !isDefendPhase(phase())) return null;

      const opponent = props.player.id === 'A' ? playerB : playerA;
      const incoming = opponent.lastAction?.totalValue || 0;

      // Calculate my current selected defense
      const selectedCards = props.player.hand.filter(c => props.player.selectedIds.has(c.id));
      let defense = 0;
      if (selectedCards.length > 0) {
        const pattern = identifyPattern(selectedCards);
        if (pattern.name !== '无效牌型') {
          defense = pattern.multiplier;
        }
      }

      // 1. Shield mitigation
      const totalIncoming = incoming; // Assuming no true damage preview for now or it's included
      // Note: The original logic in resolveCombat handles true damage separately.
      // Here we are just estimating visual feedback.
      // Let's grab true damage if possible, but it's in the action.
      const trueDmg = opponent.lastAction?.buffs?.trueDamage || 0;
      
      const rawIncoming = Math.max(0, totalIncoming - defense);
      const actualIncoming = rawIncoming + trueDmg;

      const blockedByShield = Math.min(props.player.shield, actualIncoming);
      const netDamageToHp = actualIncoming - blockedByShield;
      
      const actualHpDamage = Math.min(props.player.hp, netDamageToHp);

      return {
        incoming,
        defense,
        blockedByShield,
        netDamage: netDamageToHp,
        actualDamage: actualHpDamage,
        damagePercent: 0 // Unused now
      };
    });

    return (
      <div class={`w-full max-w-6xl p-6 ${isMyTurn() ? 'bg-gradient-to-r from-amber-900/40 to-slate-900/40 border-amber-500/30' : 'bg-slate-900/40 border-slate-700/30'} backdrop-blur-sm rounded-2xl border transition-all duration-300 shadow-xl`}>
        <div class="flex justify-between items-end mb-4 text-white">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-3">
              <h2 class="text-3xl font-bold tracking-tight text-slate-100">{props.player.name}</h2>
              <span class={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${isAttacker() ? 'bg-rose-600 text-white' : 'bg-sky-600 text-white'}`}>
                {role()}
              </span>
              
              {/* Poison Indicator */}
              <Show when={props.player.poisonStacks > 0}>
                <div class="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full text-green-300 text-xs font-bold border border-green-500/30 animate-pulse">
                  <span>☠️</span> {props.player.poisonStacks}
                </div>
              </Show>
            </div>
            <div class="w-64 h-4 bg-slate-800 rounded-full overflow-hidden relative shadow-inner flex">
              
              {/* Layer 1: Shield (Grey) - Behind Trail */}
              <Show when={props.player.shield > 0}>
                <div
                  class="absolute top-0 h-full bg-slate-400 border-l border-slate-500/30 transition-all duration-300 ease-out z-0"
                  style={{
                    left: `${hpPercent()}%`,
                    width: `${shieldPercent()}%`
                  }}
                >
                   {/* Shield Pending Damage */}
                   <Show when={pendingDamageInfo() && pendingDamageInfo()!.blockedByShield > 0}>
                     <div 
                        class="absolute right-0 top-0 h-full bg-rose-500/70 animate-pulse z-10"
                        style={{
                          width: `${(pendingDamageInfo()!.blockedByShield / props.player.shield) * 100}%`
                        }}
                     />
                   </Show>
                </div>
              </Show>

              {/* Layer 2: Damage Trail (Delayed Red Bar) */}
              <Show when={trailKey()} keyed>
                {(_) => (
                  <div
                    class="absolute top-0 left-0 h-full bg-rose-900 transition-all duration-700 ease-out delay-300 z-10"
                    style={{ width: `${hpPercent()}%` }}
                  />
                )}
              </Show>

              {/* Layer 3: Actual HP (Contains Safe + Pending) */}
              <div
                class="absolute top-0 left-0 h-full transition-all duration-200 ease-out flex overflow-hidden z-20"
                style={{ width: `${hpPercent()}%` }}
              >
                {/* Safe Part */}
                <div
                  class={`h-full transition-colors duration-300 ${(props.player.hp / props.player.maxHp) > 0.2 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{
                    width: `${pendingDamageInfo() && props.player.hp > 0 ? ((props.player.hp - pendingDamageInfo()!.actualDamage) / props.player.hp) * 100 : 100}%`
                  }}
                />

                {/* Pending Part (Only visible during defense phase) */}
                <Show when={pendingDamageInfo() && pendingDamageInfo()!.actualDamage > 0}>
                  <div class="flex-1 h-full bg-rose-500/80 animate-pulse relative">
                    <div class="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
                  </div>
                </Show>
              </div>

              <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white drop-shadow-md z-30 flex gap-1 whitespace-nowrap pointer-events-none items-center">
                {props.player.hp}
                <Show when={props.player.shield > 0}>
                   <span class="text-slate-300 drop-shadow-sm text-[9px] ml-0.5 font-normal">(+{props.player.shield})</span>
                </Show>
                <span class="text-slate-400 mx-0.5">/</span>
                {props.player.maxHp}
                <Show when={pendingDamageInfo() && pendingDamageInfo()!.netDamage > 0}>
                  <span class="text-rose-200 drop-shadow-md font-black ml-1">(-{pendingDamageInfo()!.netDamage})</span>
                </Show>
              </span>
            </div>
            {/* Deck Info */}
            <div class="flex gap-4 text-[10px] text-slate-400 font-mono mt-1">
               <div class="flex items-center gap-1">
                 <span>📚</span> 牌堆: {props.player.deck.length}
               </div>
               <div class="flex items-center gap-1">
                 <span>🗑️</span> 弃牌: {props.player.discardPile.length}
               </div>
            </div>
          </div>
          <Show when={props.player.lastAction}>
            <div class="flex flex-col items-end animate-fade-in-up">
              <span class="text-xs text-slate-400 uppercase tracking-widest mb-1">上一步行动</span>
              <div class="text-xl font-bold text-amber-400 drop-shadow-sm">
                {props.player.lastAction?.pattern} <span class="text-sm text-slate-300">({props.player.lastAction?.totalValue})</span>
              </div>
            </div>
          </Show>
        </div>

        <div
          ref={setRef}
          class="flex gap-3 min-h-[180px] items-center overflow-x-auto p-4 bg-black/20 rounded-xl border border-white/5 shadow-inner"
        >
          <For each={props.player.hand}>
            {(card, index) => (
              <Card
                card={card}
                index={index()}
                selected={props.player.selectedIds.has(card.id)}
                onClick={() => toggleSelect(props.player.id, card.id)}
                small={props.isOpponent}
              />
            )}
          </For>
        </div>
      </div>
    );
  };

  const BattleArea = () => {
    const currentPhase = () => phase();
    const currentAttackerId = () => attackerId();

    const isShowdown = () => currentPhase() === GamePhase.COMBAT_SHOWDOWN;
    const isDefend = () => currentPhase() === GamePhase.P1_DEFEND || currentPhase() === GamePhase.P2_DEFEND;
    const shouldShow = () => isShowdown() || isDefend();

    const attacker = () => currentAttackerId() === 'A' ? playerA : playerB;
    const defender = () => currentAttackerId() === 'A' ? playerB : playerA;

    return (
      <Show when={shouldShow()} fallback={
        <div class="h-64 w-full max-w-4xl mx-auto flex flex-col items-center justify-center gap-4 select-none transition-all duration-500">
          <div class={`text-4xl font-black tracking-widest uppercase flex items-center gap-4 ${phaseInfo().color} drop-shadow-lg animate-pulse`}>
            <span>{phaseInfo().icon}</span>
            {phaseInfo().title}
            <span>{phaseInfo().icon}</span>
          </div>
          <div class="text-slate-400 font-bold text-lg tracking-wider bg-black/30 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm">
            {phaseInfo().desc}
          </div>
        </div>
      }>
        <div class="w-full max-w-5xl mx-auto flex flex-col items-center justify-center gap-6 p-8 bg-black/40 rounded-3xl border border-slate-800/50 shadow-2xl backdrop-blur-md animate-fade-in-up relative overflow-hidden transition-all duration-500 min-h-[320px]">
          {/* Background Glow */}
          <div class={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full blur-3xl -z-10 transition-colors duration-1000 ${isShowdown() ? 'bg-amber-900/20' : 'bg-rose-900/10'}`} />

          <div class="flex w-full justify-between items-start gap-8 relative">

            {/* Attacker Side (Left) */}
            <div class="flex-1 flex flex-col items-center gap-4">
              <div class="text-rose-400 font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-2 drop-shadow-md">
                <span>⚔️</span> {attacker().name}
              </div>

              <Show when={attacker().lastAction} keyed>
                {(action) => (
                  <>
                    <Show when={action.pattern === '放弃攻击'} fallback={
                      <div class="flex gap-2 justify-center perspective-1000 flex-wrap">
                        <For each={[...action.cards].sort((a, b) => (action.relevantCardIds.has(b.id) ? 1 : 0) - (action.relevantCardIds.has(a.id) ? 1 : 0))}>
                          {(card, index) => (
                            <Card
                              card={card}
                              index={index()}
                              selected={false}
                              onClick={() => { }}
                              small
                              dimmed={!action.relevantCardIds.has(card.id)}
                            />
                          )}
                        </For>
                      </div>
                    }>
                      <div class="text-slate-500 font-bold text-xl py-8">放弃攻击</div>
                    </Show>

                    <div class="flex flex-col items-center gap-1 bg-black/30 px-4 py-2 rounded-xl border border-white/5 w-full">
                      <div class="text-xs text-slate-400 uppercase tracking-wider font-bold">攻击力</div>
                      <div class="text-2xl font-black text-rose-500 drop-shadow-lg font-mono">
                        {action.totalValue}
                      </div>
                      <div class="text-[10px] text-slate-500 font-mono">
                        {action.multiplier} ({action.pattern})
                      </div>
                    </div>
                  </>
                )}
              </Show>
            </div>

            {/* VS / Result Center */}
            <div class="flex flex-col items-center justify-center pt-12 relative z-10 w-32">
              <Show when={isShowdown()} fallback={
                <div class="text-4xl font-black text-slate-700/50 italic pr-2 animate-pulse">VS</div>
              }>
                <div class="flex flex-col items-center gap-2 animate-bounce-in bg-black/60 p-4 rounded-2xl border border-amber-500/30 shadow-2xl backdrop-blur-xl">
                  <div class="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-600 drop-shadow-lg">
                    {Math.max(0, (attacker().lastAction?.totalValue || 0) - (defender().lastAction?.totalValue || 0))}
                  </div>
                  <div class="text-xs font-bold text-amber-500 uppercase tracking-[0.2em] bg-black/50 px-2 py-1 rounded">
                    最终伤害
                  </div>
                  <div class="w-full h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent my-1" />
                  <div class="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    {attacker().lastAction?.totalValue || 0} - {defender().lastAction?.totalValue || 0}
                  </div>
                </div>
              </Show>
            </div>

            {/* Defender Side (Right) */}
            <div class="flex-1 flex flex-col items-center gap-4 transition-opacity duration-500" style={{ opacity: isShowdown() ? 1 : 0.3, filter: isShowdown() ? 'none' : 'blur(2px)' }}>
              <div class="text-sky-400 font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-2 drop-shadow-md">
                <span>🛡️</span> {defender().name}
              </div>

              <Show when={isShowdown()}>
                <Show when={defender().lastAction} keyed>
                  {(action) => (
                    <>
                      <Show when={action.pattern === '放弃防御'} fallback={
                        <div class="flex gap-2 justify-center perspective-1000 flex-wrap">
                          <For each={[...action.cards].sort((a, b) => (action.relevantCardIds.has(b.id) ? 1 : 0) - (action.relevantCardIds.has(a.id) ? 1 : 0))}>
                            {(card, index) => (
                              <div
                                class="animate-fly-in-bottom"
                                style={{ "animation-delay": `${index() * 0.1}s` }}
                              >
                                <Card
                                  card={card}
                                  index={index()}
                                  selected={false}
                                  onClick={() => { }}
                                  small
                                  noEntryAnimation
                                  dimmed={!action.relevantCardIds.has(card.id)}
                                />
                              </div>
                            )}
                          </For>
                        </div>
                      }>
                        <div class="text-slate-500 font-bold text-xl py-8 animate-fade-in-up">放弃防御</div>
                      </Show>

                      <div class="flex flex-col items-center gap-1 bg-black/30 px-4 py-2 rounded-xl border border-white/5 w-full animate-fade-in-up">
                        <div class="text-xs text-slate-400 uppercase tracking-wider font-bold">防御力</div>
                        <div class="text-2xl font-black text-sky-500 drop-shadow-lg font-mono">
                          {action.totalValue}
                        </div>
                        <div class="text-[10px] text-slate-500 font-mono">
                        {action.multiplier} ({action.pattern})
                      </div>
                      </div>
                    </>
                  )}
                </Show>
              </Show>

              <Show when={!isShowdown()}>
                <div class="h-32 flex items-center justify-center text-slate-600 font-bold text-sm uppercase tracking-widest animate-pulse">
                  思考中...
                </div>
              </Show>
            </div>

          </div>
        </div>
      </Show>
    );
  };

  const phaseInfo = createMemo(() => {
    const p = phase();
    const attName = attackerId() === 'A' ? playerA.name : playerB.name;
    const defName = attackerId() === 'A' ? playerB.name : playerA.name;

    switch (p) {
      case GamePhase.P1_ATTACK:
        return { title: '进攻阶段', desc: `${attName} 正在出牌`, color: 'text-rose-400', icon: '⚔️' };
      case GamePhase.P1_DEFEND:
        return { title: '防守阶段', desc: `${defName} 正在防御`, color: 'text-sky-400', icon: '🛡️' };
      case GamePhase.P2_ATTACK:
        return { title: '⚡ 追击阶段 ⚡', desc: `${attName} 获得额外攻击机会！`, color: 'text-yellow-400 animate-pulse', icon: '⚡' };
      case GamePhase.P2_DEFEND:
        return { title: '追击防守', desc: `${defName} 需要抵挡追击`, color: 'text-orange-400', icon: '🛡️' };
      case GamePhase.COMBAT_SHOWDOWN:
        return { title: '战斗结算', desc: '计算伤害中...', color: 'text-slate-200', icon: '⚖️' };
      case GamePhase.ROUND_END:
        return { title: '回合结束', desc: '准备下一回合', color: 'text-slate-400', icon: '⏳' };
      case GamePhase.GAME_OVER:
        return { title: '游戏结束', desc: '', color: 'text-red-500', icon: '🏁' };
      default:
        return { title: '准备中', desc: '', color: 'text-slate-500', icon: '...' };
    }
  });

  return (
    <div class="w-full min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black flex flex-col items-center p-6 gap-6 font-sans text-slate-200">
      <style>{styles}</style>
      <Show when={feedback()}>
        <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] animate-bounce tracking-tighter">
            {feedback()}
          </div>
        </div>
      </Show>

      {/* Phase Banner for Extra Attack */}
      <Show when={phase() === GamePhase.P2_ATTACK}>
        <div class="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce-in">
          <div class="bg-yellow-500/20 backdrop-blur-md border border-yellow-500/50 px-8 py-2 rounded-full shadow-[0_0_30px_rgba(234,179,8,0.3)]">
            <div class="text-yellow-400 font-black text-xl tracking-widest uppercase flex items-center gap-3">
              <span>⚡</span> 额外追击阶段 <span>⚡</span>
            </div>
          </div>
        </div>
      </Show>

      {/* Opponent Area (B) */}
      <PlayerArea player={playerB} isOpponent />

      {/* Battle Field Area */}
      <BattleArea />

      {/* Log Modal */}
      <Show when={showLogs()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLogs(false)}>
          <div class="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div class="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
              <h3 class="text-lg font-bold text-slate-200">战斗日志</h3>
              <button onClick={() => setShowLogs(false)} class="text-slate-400 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 font-mono text-sm text-slate-300 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <For each={logs()}>
                {(log) => <div class="border-b border-slate-800/50 pb-1 last:border-0">{log}</div>}
              </For>
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </Show>

      {/* Player Area (A) + Control Panel */}
      <div class="w-full max-w-7xl flex gap-6 items-start">
        <div class="flex-1 min-w-0">
          <PlayerArea player={playerA} />
        </div>

        <div class="w-72 flex flex-col gap-3 justify-center items-center bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden shrink-0">
          <div class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">当前阶段</div>
          <div class="text-2xl font-black text-white mb-4 tracking-tight">{phase()}</div>

          <Show when={phase() !== GamePhase.ROUND_END && phase() !== GamePhase.GAME_OVER}>
            <button
              onClick={executeAction}
              class={`w-full px-6 py-4 font-bold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 text-xl tracking-wide ${isAttackPhase(phase())
                  ? 'bg-gradient-to-br from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-900/20'
                  : 'bg-gradient-to-br from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white shadow-sky-900/20'
                }`}
            >
              {isAttackPhase(phase()) ? '攻击' : '防御'}
            </button>

            <Show when={isDefendPhase(phase())}>
              <button
                onClick={skipDefense}
                class="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl shadow-md transition-all duration-200 text-sm tracking-wider uppercase border border-slate-600"
              >
                跳过防御
              </button>
            </Show>

            <Show when={isAttackPhase(phase())}>
              <button
                onClick={skipAttack}
                class="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl shadow-md transition-all duration-200 text-sm tracking-wider uppercase border border-slate-600 mt-2"
              >
                跳过攻击
              </button>
              <button
                onClick={discardCards}
                class="w-full px-6 py-3 bg-amber-900/50 hover:bg-amber-800/50 text-amber-200 font-bold rounded-xl shadow-md transition-all duration-200 text-sm tracking-wider uppercase border border-amber-800/50 mt-2"
              >
                弃牌
              </button>
            </Show>
          </Show>


          <button
            onClick={() => setShowLogs(true)}
            class="mt-2 w-full px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 font-medium rounded-lg border border-slate-700/50 transition-colors text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <span>📜</span> 查看日志
          </button>

          <button
            onClick={initGame}
            class="mt-4 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
          >
            重置游戏
          </button>
        </div>
      </div>
    </div>
  );
}
