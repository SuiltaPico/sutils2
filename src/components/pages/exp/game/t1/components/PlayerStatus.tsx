import { Show, createMemo, createEffect, createSignal } from "solid-js";
import { PlayerState, GamePhase, isAttackPhase, isDefendPhase } from "../types";
import { identifyPattern, CardData } from "../core";
import { mdiShield, mdiSwordCross } from "@mdi/js";
import { Icon } from "../../../../../common/Icon";

export const PlayerStatus = (props: {
  player: PlayerState;
  opponent: PlayerState;
  phase: GamePhase;
  attackerId: string;
}) => {
  const isAttacker = () => props.attackerId === props.player.id;
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

  return (
    <div class={"flex flex-col gap-1 max-lg:gap-0.5 min-w-50 max-lg:min-w-40 p-2 max-lg:p-1"}>
      <div class="flex items-center gap-1">
        <span
          class={`px-0.5 py-0.5 text-xs ${
            isAttacker() ? "text-rose-400" : "text-sky-400"
          }`}
        >
          <Show when={isAttacker()}>
            <Icon path={mdiSwordCross} size={14} />
          </Show>
          <Show when={!isAttacker()}>
            <Icon path={mdiShield} size={14} />
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
          <div class="flex items-center gap-1 text-green-400 text-xs font-bold">
            <span>☠️</span> {props.player.poisonStacks}
          </div>
        </Show>
        {/* <div class="flex items-center gap-3 ml-auto text-xs text-slate-500 font-bold">
           <span class="opacity-50">剩余</span> {props.player.deck.length}
           <span class="opacity-50">已弃</span> {props.player.discardPile.length}
        </div> */}
      </div>
    </div>
  );
};
