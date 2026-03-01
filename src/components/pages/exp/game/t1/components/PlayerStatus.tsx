import { Show, createMemo, createEffect, createSignal, For } from "solid-js";
import { PlayerState, GamePhase, isAttackPhase, isDefendPhase } from "../types";
import { identifyPattern, CardData } from "../core";
import { mdiShield, mdiSwordCross } from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { gameState } from "../store";
import { RELIC_LIBRARY } from "../items";

export const PlayerStatus = (props: {
  player: PlayerState;
  opponent?: PlayerState;
  phase?: GamePhase;
  attackerId?: string;
}) => {
  const isAttacker = () =>
    props.attackerId && props.player.id === props.attackerId;
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
    if (!props.phase || !props.opponent || !props.attackerId) return null;
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
    
    // Apply Rage to incoming damage
    const rageBonus = opponent.nextAttackBonus;
    const effectiveIncoming = incoming > 0 ? incoming + rageBonus : 0;
    
    let rawIncoming = Math.max(0, effectiveIncoming - defense);

    // Apply Damage Reduction
    const reduction = props.player.damageReduction;
    if (reduction > 0 && rawIncoming > 0) {
      rawIncoming -= Math.floor(rawIncoming * reduction);
    }

    const actualIncoming = rawIncoming + trueDmg;

    const blockedByShield = Math.min(props.player.shield, actualIncoming);
    const netDamageToHp = actualIncoming - blockedByShield;
    const actualHpDamage = Math.min(props.player.hp, netDamageToHp);

    let projectedShield = 0;
    if (defense > effectiveIncoming) {
      projectedShield = defense - effectiveIncoming;
    }

    return {
      incoming: effectiveIncoming,
      defense,
      blockedByShield,
      netDamage: netDamageToHp,
      actualDamage: actualHpDamage,
      projectedShield,
    };
  });

  return (
    <div
      class={
        "flex flex-col gap-1 max-lg:gap-0.5 min-w-50 max-lg:min-w-40 p-2 max-lg:p-1"
      }
    >
      <div class="flex items-center gap-1">
        <span
          class={`px-0.5 py-0.5 text-xs ${
            isAttacker() ? "text-rose-400" : "text-sky-400"
          }`}
        >
          <Show when={props.phase && props.attackerId}>
            <Show when={isAttacker()}>
              <Icon path={mdiSwordCross} size={14} />
            </Show>
            <Show when={!isAttacker()}>
              <Icon path={mdiShield} size={14} />
            </Show>
          </Show>
        </span>
        <h2 class="text-xs font-bold tracking-widest text-slate-100 font-serif uppercase drop-shadow-md">
          {props.player.name}
        </h2>
        <div class="flex-1"></div>
        <div class="text-[10px] font-bold text-slate-400 px-0.5">
          {props.player.hp} <span class="text-slate-600">/</span>{" "}
          {props.player.maxHp}
        </div>
      </div>

      <div class="flex flex-col">
        <div class="w-full h-2 bg-slate-950 border border-slate-700 relative overflow-hidden rounded-sm">
          <Show when={props.player.shield > 0}>
            <div
              class="absolute top-0 h-full bg-slate-500 border-r border-white/50 transition-all duration-300 ease-out z-10"
              style={{
                left: `${hpPercent()}%`,
                width: `${shieldPercent()}%`,
              }}
            >
              <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:10px_10px]" />
            </div>
          </Show>

          {/* HP Bar */}
          <div
            class="absolute top-0 left-0 h-full transition-all duration-200 ease-out flex overflow-hidden z-0"
            style={{ width: `${hpPercent()}%` }}
          >
            <div
              class={`h-full w-full transition-colors duration-300 ${
                props.player.hp / props.player.maxHp > 0.2
                  ? "bg-emerald-600"
                  : "bg-rose-600 animate-pulse"
              }`}
            />
            {/* Shine overlay */}
            <div class="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <Show when={props.player.poisonStacks > 0}>
          <div
            class="flex items-center gap-1 text-green-400 text-[10px] font-bold bg-green-900/30 px-1 rounded border border-green-500/20"
            title="中毒：每回合结束损失 HP，无视护盾"
          >
            <span>☠️</span> {props.player.poisonStacks}
          </div>
        </Show>
        <Show when={props.player.nextAttackBonus > 0}>
          <div
            class="flex items-center gap-1 text-amber-400 text-[10px] font-bold bg-amber-900/30 px-1 rounded border border-amber-500/20"
            title="愤怒：下一次进攻强度提升"
          >
            <span>🔥</span> {props.player.nextAttackBonus}
          </div>
        </Show>
        <Show when={props.player.damageReduction > 0}>
          <div
            class="flex items-center gap-1 text-cyan-400 text-[10px] font-bold bg-cyan-900/30 px-1 rounded border border-cyan-500/20"
            title="减伤：降低受到的常规伤害"
          >
            <span>🛡️</span> {Math.round(props.player.damageReduction * 100)}%
          </div>
        </Show>
        {/* <div class="flex items-center gap-3 ml-auto text-xs text-slate-500 font-bold">
           <span class="opacity-50">剩余</span> {props.player.deck.length}
           <span class="opacity-50">已弃</span> {props.player.discardPile.length}
        </div> */}
      </div>

      {/* Relic display for Player A */}
      <Show when={props.player.id === "A" && gameState.run.relics.length > 0}>
        <div class="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-white/5">
          <For each={gameState.run.relics}>
            {(id) => {
              const relic = RELIC_LIBRARY[id];
              return (
                <div
                  class="w-6 h-6 flex items-center justify-center bg-slate-900/80 rounded border border-slate-700/50 text-sm cursor-help hover:border-cyan-500/50 hover:bg-slate-800 transition-all group relative"
                  title={`${relic?.name}: ${relic?.description}`}
                >
                  <span class="group-hover:scale-110 transition-transform">
                    {relic?.icon}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};
