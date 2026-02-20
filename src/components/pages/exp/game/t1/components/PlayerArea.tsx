import { For, Show, createMemo, createEffect, createSignal } from "solid-js";
import { PlayerState, GamePhase, isAttackPhase, isDefendPhase } from "../types";
import { Card } from "./Card";
import { identifyPattern, CardData } from "../core";
import { useFlipAnimation } from "../hooks";

export const PlayerArea = (props: {
  player: PlayerState;
  opponent: PlayerState;
  phase: GamePhase;
  attackerId: string;
  isOpponent?: boolean;
  onToggleSelect: (playerId: string, cardId: string) => void;
}) => {
  const setRef = useFlipAnimation(() => props.player.hand);

  const isAttacker = () => props.attackerId === props.player.id;
  const isMyTurn = () =>
    (isAttacker() && isAttackPhase(props.phase)) ||
    (!isAttacker() && isDefendPhase(props.phase));
  const role = () => (isAttacker() ? "攻击方" : "防守方");
  const effectiveMax = () =>
    Math.max(props.player.maxHp, props.player.hp + props.player.shield);

  const hpPercent = () => (props.player.hp / effectiveMax()) * 100;
  const shieldPercent = () => (props.player.shield / effectiveMax()) * 100;

  const [trailKey, setTrailKey] = createSignal(0);
  let lastMax = 0;

  createEffect(() => {
    const cur = effectiveMax();
    if (cur > lastMax) {
      setTrailKey((k) => k + 1);
    }
    lastMax = cur;
  });

  const pendingDamageInfo = createMemo(() => {
    if (isAttacker() || !isDefendPhase(props.phase)) return null;

    const opponent = props.opponent;
    const incoming = opponent.lastAction?.totalValue || 0;
    const selectedCards = props.player.hand.filter((c: CardData) =>
      props.player.selectedIds.has(c.id)
    );

    let defense = 0;
    if (selectedCards.length > 0) {
      const pattern = identifyPattern(selectedCards);
      if (pattern.name !== "无效牌型") {
        defense = pattern.multiplier;
      }
    }

    const trueDmg = opponent.lastAction?.buffs?.trueDamage || 0;
    const rawIncoming = Math.max(0, incoming - defense);
    const actualIncoming = rawIncoming + trueDmg;

    const blockedByShield = Math.min(props.player.shield, actualIncoming);
    const netDamageToHp = actualIncoming - blockedByShield;
    const actualHpDamage = Math.min(props.player.hp, netDamageToHp);

    let projectedShield = 0;
    if (defense > incoming) {
      projectedShield = defense - incoming;
    }

    return {
      incoming,
      defense,
      blockedByShield,
      netDamage: netDamageToHp,
      actualDamage: actualHpDamage,
      projectedShield,
    };
  });

  const suitBoostedCardIds = createMemo(() => {
    const result = new Set<string>();
    if (!isAttacker() || !isAttackPhase(props.phase)) return result;

    const selectedCards = props.player.hand.filter((c: CardData) =>
      props.player.selectedIds.has(c.id)
    );
    if (selectedCards.length < 3) return result;

    const bySuit: Record<string, CardData[]> = {};
    selectedCards.forEach((card: CardData) => {
      if (!bySuit[card.suit]) bySuit[card.suit] = [];
      bySuit[card.suit].push(card);
    });

    Object.values(bySuit).forEach((cards) => {
      if (cards.length >= 3) {
        cards.forEach((card) => result.add(card.id));
      }
    });

    return result;
  });

  return (
    <div
      class={`w-full max-w-6xl p-6 max-md:p-1.5 ${
        isMyTurn()
          ? "bg-gradient-to-r from-amber-900/40 to-slate-900/40 border-amber-500/30"
          : "bg-slate-900/40 border-slate-700/30"
      } backdrop-blur-sm rounded-md border transition-all duration-300 shadow-xl`}
    >
      <div class="flex gap-6 max-md:gap-1.5">
        {/* 左侧：名字、血条、状态 */}
        <div class="flex flex-col gap-4 max-md:gap-1.5 w-36 shrink-0">
          <div class="flex items-center gap-3">
            <h2 class="text-xl max-md:text-sm font-bold tracking-tight text-slate-100">
              {props.player.name}
            </h2>
            <span
              class={`px-3 max-md:px-1.5 py-0.5 rounded-full text-xs max-md:text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                isAttacker()
                  ? "bg-rose-600 text-white"
                  : "bg-sky-600 text-white"
              }`}
            >
              {role()}
            </span>
          </div>

          <div class="flex flex-col gap-2">
            <div class="w-full h-4 bg-slate-800 rounded-full overflow-hidden relative shadow-inner flex">
              <Show when={props.player.shield > 0}>
                <div
                  class="absolute top-0 h-full bg-slate-400 border-l border-slate-500/30 transition-all duration-300 ease-out z-0"
                  style={{
                    left: `${hpPercent()}%`,
                    width: `${shieldPercent()}%`,
                  }}
                >
                  <Show
                    when={
                      pendingDamageInfo() &&
                      pendingDamageInfo()!.blockedByShield > 0
                    }
                  >
                    <div
                      class="absolute right-0 top-0 h-full bg-rose-500/70 animate-pulse z-10"
                      style={{
                        width: `${
                          (pendingDamageInfo()!.blockedByShield /
                            props.player.shield) *
                          100
                        }%`,
                      }}
                    />
                  </Show>
                </div>
              </Show>
              <Show when={trailKey()} keyed>
                {(_) => (
                  <div
                    class="absolute top-0 left-0 h-full bg-rose-900 transition-all duration-700 ease-out delay-300 z-10"
                    style={{ width: `${hpPercent()}%` }}
                  />
                )}
              </Show>
              <div
                class="absolute top-0 left-0 h-full transition-all duration-200 ease-out flex overflow-hidden z-20"
                style={{ width: `${hpPercent()}%` }}
              >
                <div
                  class={`h-full transition-colors duration-300 ${
                    props.player.hp / props.player.maxHp > 0.2
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                  }`}
                  style={{
                    width: `${
                      pendingDamageInfo() && props.player.hp > 0
                        ? ((props.player.hp -
                            pendingDamageInfo()!.actualDamage) /
                            props.player.hp) *
                          100
                        : 100
                    }%`,
                  }}
                />
                <Show
                  when={
                    pendingDamageInfo() && pendingDamageInfo()!.actualDamage > 0
                  }
                >
                  <div class="flex-1 h-full bg-rose-500/80 animate-pulse relative">
                    <div class="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
                  </div>
                </Show>
              </div>
              <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white drop-shadow-md z-30 flex gap-1 whitespace-nowrap pointer-events-none items-center">
                {props.player.hp}
                <Show when={props.player.shield > 0}>
                  <span class="text-slate-300 drop-shadow-sm text-[9px] ml-0.5 font-normal">
                    (+{props.player.shield})
                  </span>
                </Show>
                <Show
                  when={
                    pendingDamageInfo() &&
                    pendingDamageInfo()!.projectedShield > 0
                  }
                >
                  <span class="text-emerald-300 drop-shadow-sm text-[9px] ml-0.5 font-bold animate-pulse">
                    (+{pendingDamageInfo()!.projectedShield})
                  </span>
                </Show>
                <span class="text-slate-400 mx-0.5">/</span>
                {props.player.maxHp}
                <Show
                  when={
                    pendingDamageInfo() && pendingDamageInfo()!.netDamage > 0
                  }
                >
                  <span class="text-rose-200 drop-shadow-md font-black ml-1">
                    (-{pendingDamageInfo()!.netDamage})
                  </span>
                </Show>
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <Show when={props.player.poisonStacks > 0}>
                <div class="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full text-green-300 text-xs font-bold border border-green-500/30 animate-pulse">
                  <span>☠️</span> {props.player.poisonStacks}
                </div>
              </Show>
              {/* 这里可以扩展其他状态图标 */}
            </div>
          </div>

          <div class="flex flex-col gap-2 text-[10px] text-slate-400 font-mono max-md:hidden">
            <div class="flex items-center gap-2">
              <span class="w-12">📚 牌堆:</span>
              <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  class="h-full bg-slate-600"
                  style={{ width: `${(props.player.deck.length / 52) * 100}%` }}
                />
              </div>
              <span class="w-4 text-right">{props.player.deck.length}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-12">🗑️ 弃牌:</span>
              <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  class="h-full bg-slate-700"
                  style={{
                    width: `${(props.player.discardPile.length / 52) * 100}%`,
                  }}
                />
              </div>
              <span class="w-4 text-right">
                {props.player.discardPile.length}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧：手牌区（牌堆布局） */}
        <div class="flex-1 min-w-0">
          <div
            class="flex items-center overflow-x-auto p-4 max-md:px-4 max-md:py-2 bg-black/20 rounded-xl border border-white/5 shadow-inner"
          >
            <div 
              ref={setRef}
              class="flex items-center justify-center group/hand px-4"
            >
              <For each={props.player.hand}>
                {(card, index) => (
                  <div
                    data-id={card.id}
                    class="-ml-3 transition-all duration-300 ease-out"
                    style={{
                      "z-index": index(),
                      transform: `
                        rotate(${
                          (index() - (props.player.hand.length - 1) / 2) * 1
                        }deg)
                    `,
                    }}
                  >
                    <Card
                      card={card}
                      index={index()}
                      selected={props.player.selectedIds.has(card.id)}
                      suitBoosted={suitBoostedCardIds().has(card.id)}
                      onClick={() =>
                        props.onToggleSelect(props.player.id, card.id)
                      }
                      // small={props.isOpponent}
                      small
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
