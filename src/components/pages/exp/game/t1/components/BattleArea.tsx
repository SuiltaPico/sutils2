import { For, Show } from "solid-js";
import { PlayerState, GamePhase } from "../types";
import { Card } from "./Card";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

export const BattleArea = (props: {
  phase: GamePhase;
  attackerId: string;
  playerA: PlayerState;
  playerB: PlayerState;
  phaseInfo: { title: string; desc: string; color: string; icon: string };
  getDamageSourceWithTotal: (
    attackVal: number,
    defenseVal: number,
    trueDmg: number
  ) => string;
}) => {
  const isShowdown = () => props.phase === GamePhase.COMBAT_SHOWDOWN;

  const attacker = () =>
    props.attackerId === "A" ? props.playerA : props.playerB;
  const defender = () =>
    props.attackerId === "A" ? props.playerB : props.playerA;

  const attackerPower = () => attacker().lastAction?.totalValue || 0;
  const defenderPower = () => defender().lastAction?.totalValue || 0;
  const attackerTrueDamage = () =>
    attacker().lastAction?.buffs?.trueDamage || 0;
  const showdownDamage = () =>
    Math.max(0, attackerPower() - defenderPower()) + attackerTrueDamage();

  const isPlayerAttacking = () => props.attackerId === "A";

  // Helper for rendering player side
  const PlayerSide = (p: { player: PlayerState }) => {
    const action = () => p.player.lastAction;
    const isAttacker = () => props.attackerId === p.player.id;

    // Check if it's this player's turn to act
    const isCurrentTurn = () => {
      if (
        props.phase === GamePhase.P1_ATTACK ||
        props.phase === GamePhase.P2_ATTACK
      ) {
        return isAttacker();
      }
      if (
        props.phase === GamePhase.P1_DEFEND ||
        props.phase === GamePhase.P2_DEFEND
      ) {
        return !isAttacker();
      }
      return false;
    };

    // Determine state text
    const stateText = () => {
      if (!action()) {
        if (p.player.id === "A") {
          return "等待出牌...";
        } else {
          return "等待行动...";
        }
      }
      if (action()?.pattern === "放弃攻击") return "放弃攻击";
      if (action()?.pattern === "放弃防御") return "放弃防御";
      return ""; // Has cards
    };

    return (
      <div class="flex flex-col h-full">
        {/* Body: Cards / Status */}
        <div
          class={`flex-1 bg-slate-900/40 rounded-lg border p-4 relative flex items-center justify-center overflow-hidden backdrop-blur-sm transition-all duration-300 ${
            isCurrentTurn()
              ? isAttacker()
                ? "border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                : "border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              : "border-slate-700/30"
          }`}
        >
          <Show
            when={stateText()}
            fallback={
              <div class="flex flex-wrap justify-center gap-2 max-w-[300px] z-10">
                <For
                  each={[...(action()?.cards || [])].sort(
                    (a, b) =>
                      (action()!.relevantCardIds.has(b.id) ? 1 : 0) -
                      (action()!.relevantCardIds.has(a.id) ? 1 : 0)
                  )}
                >
                  {(card, index) => (
                    <div
                      class="animate-fly-in-bottom"
                      style={{ "animation-delay": `${index() * 0.05}s` }}
                    >
                      <Card
                        card={card}
                        index={index()}
                        onClick={() => {}}
                        small
                        noEntryAnimation
                        dimmed={!action()!.relevantCardIds.has(card.id)}
                      />
                    </div>
                  )}
                </For>
              </div>
            }
          >
            <div class="text-slate-600 font-bold text-lg animate-pulse tracking-widest select-none">
              {stateText()}
            </div>
          </Show>

          {/* Background pattern */}
          <div class="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none"></div>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
      @keyframes slide-in-left {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slide-in-right {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes zoom-in {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      .animate-slide-in-left { animation: slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .animate-slide-in-right { animation: slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .animate-zoom-in { animation: zoom-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    `}</style>
      <div
        class={clsx(
          "w-full max-w-6xl mx-auto flex items-stretch gap-4 h-full relative z-10",
          isMobileDevice ? "p-2" : "p-4"
        )}
      >
        {/* Left Player (Always Player A) */}
        <div class="flex-1 min-w-0">
          <PlayerSide player={props.playerA} />
        </div>

        {/* Center Area */}
        <div class="w-48 flex flex-col items-center justify-center shrink-0 relative z-10">
          {/* Background VS */}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 z-0">
            <span class="text-[12rem] font-black italic tracking-tighter text-slate-400 -skew-x-12 select-none blur-sm">
              VS
            </span>
          </div>

          {/* Combat Visualization */}
          <div
            class={clsx(
              "relative z-10 w-full flex flex-col",
              isMobileDevice ? "gap-2" : "gap-4"
            )}
          >
            <Show
              when={
                attacker().lastAction || defender().lastAction || isShowdown()
              }
              fallback={
                <div class="flex items-center justify-center py-10 opacity-80">
                  <div class="text-6xl font-black italic text-slate-600 tracking-widest drop-shadow-sm">
                    VS
                  </div>
                </div>
              }
            >
              {/* Attack Row */}
              <div class="relative group">
                {/* Background Gradient */}
                <div
                  class={`absolute inset-0 bg-gradient-to-${
                    isPlayerAttacking() ? "r" : "l"
                  } from-rose-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}
                ></div>

                {/* Content */}
                <div
                  class={`flex items-center justify-between px-4 py-2 bg-slate-900/40 backdrop-blur-sm duration-300 ${
                    isPlayerAttacking()
                      ? "border-l-4 border-rose-500/80 animate-in fade-in slide-in-from-left-4"
                      : "border-r-4 border-rose-500/80 animate-in fade-in slide-in-from-right-4 flex-row-reverse text-right"
                  }`}
                >
                  <div
                    class={`flex flex-col ${
                      isPlayerAttacking() ? "" : "items-end"
                    }`}
                  >
                    <span
                      class={clsx(
                        "text-rose-400/70 font-bold uppercase tracking-wider mb-1",
                        isMobileDevice ? "text-[8px]" : "text-[10px]"
                      )}
                    >
                      进攻强度
                    </span>
                    <div class="flex items-baseline gap-2">
                      <div
                        class={clsx(
                          "font-black text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)] leading-none",
                          isMobileDevice ? "text-xl" : "text-3xl"
                        )}
                      >
                        {attackerPower()}
                      </div>
                      <Show when={attacker().lastAction}>
                        <div class="text-sm font-bold text-rose-300">
                          {attacker().lastAction?.pattern}[
                          {attacker().lastAction?.multiplier}]
                        </div>
                      </Show>
                    </div>
                    <Show when={attacker().lastAction}>
                      <For each={attacker().lastAction?.buffs?.descriptions}>
                        {(desc) => (
                          <div
                            class={clsx(
                              "text-rose-300/80 mt-1 font-medium",
                              isMobileDevice ? "text-[8px]" : "text-[10px]"
                            )}
                          >
                            {desc}
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                  <span class="text-2xl opacity-50 grayscale group-hover:grayscale-0 transition-all">
                    ⚔️
                  </span>
                </div>
              </div>

              {/* Defense Row */}
              <div class="relative group">
                <div
                  class={`absolute inset-0 bg-gradient-to-${
                    isPlayerAttacking() ? "l" : "r"
                  } from-cyan-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}
                ></div>

                <div
                  class={`flex items-center justify-between px-4 py-2 bg-slate-900/40 backdrop-blur-sm duration-300 ${
                    isPlayerAttacking()
                      ? "border-r-4 border-cyan-500/80 animate-in fade-in slide-in-from-right-4 text-right"
                      : "border-l-4 border-cyan-500/80 animate-in fade-in slide-in-from-left-4 flex-row-reverse text-left"
                  }`}
                >
                  <span class="text-2xl opacity-50 grayscale group-hover:grayscale-0 transition-all">
                    🛡️
                  </span>
                  <div
                    class={`flex flex-col ${
                      isPlayerAttacking() ? "items-end" : "items-start"
                    }`}
                  >
                    <span
                      class={clsx(
                        "text-cyan-400/70 font-bold uppercase tracking-wider mb-1",
                        isMobileDevice ? "text-[8px]" : "text-[10px]"
                      )}
                    >
                      防御强度
                    </span>
                    <div class="flex items-baseline gap-2">
                      <Show
                        when={defender().lastAction}
                        fallback={
                          <div class="text-sm text-cyan-400/50 font-bold">
                            等待出牌...
                          </div>
                        }
                      >
                        <div
                          class={clsx(
                            "font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] leading-none",
                            isMobileDevice ? "text-xl" : "text-3xl"
                          )}
                        >
                          {defenderPower()}
                        </div>
                        <div class="text-sm font-bold text-cyan-300">
                          {defender().lastAction?.pattern}[
                          {defender().lastAction?.multiplier}]
                        </div>
                      </Show>
                    </div>
                    <Show when={defender().lastAction}>
                      <For each={defender().lastAction?.buffs?.descriptions}>
                        {(desc) => (
                          <div class="text-xs text-cyan-300/80 mt-1 font-medium">
                            {desc}
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Result Display */}
              <div
                class={clsx(
                  "relative flex flex-col items-center justify-center animate-in zoom-in duration-300 delay-200",
                  isMobileDevice ? "" : "pt-2"
                )}
              >
                <Show when={!isMobileDevice}>
                  {/* Divider with Icon */}
                  <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center z-10 shadow-lg">
                    <span class="text-slate-500 text-xs font-black">VS</span>
                  </div>
                  <div class="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                </Show>

                <div
                  class={clsx(
                    "flex flex-col items-center relative",
                    isMobileDevice ? "" : "mt-4"
                  )}
                >
                  <div
                    class={clsx(
                      "font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] leading-none",
                      isMobileDevice ? "text-4xl" : "text-6xl"
                    )}
                  >
                    {showdownDamage()}
                  </div>
                  <Show when={attackerTrueDamage() > 0}>
                    <div class="absolute -right-8 top-0 text-xs text-purple-400 font-bold bg-purple-900/30 px-1 rounded border border-purple-500/30">
                      +{attackerTrueDamage()} 真伤
                    </div>
                  </Show>
                  <div class="text-[10px] text-amber-500/60 font-mono font-bold tracking-[0.4em] uppercase mt-2">
                    最终伤害
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Right Player (Always Player B) */}
        <div class="flex-1 min-w-0">
          <PlayerSide player={props.playerB} />
        </div>
      </div>
    </>
  );
};
