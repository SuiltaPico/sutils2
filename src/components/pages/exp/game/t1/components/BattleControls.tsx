import { Show } from "solid-js";
import { mdiBagPersonal, mdiCards } from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { HandArea } from "./HandArea";
import { HandPreview } from "./HandPreview";
import { PlayerState, GamePhase, isAttackPhase, isDefendPhase } from "../types";
import { isMobileDevice } from "../utils";
import clsx from "clsx";

interface BattleControlsProps {
  playerA: PlayerState;
  phase: GamePhase;
  attackerId: string;
  activeTab: "hand" | "backpack";
  setActiveTab: (tab: "hand" | "backpack") => void;
  toggleSelect: (playerId: string, cardId: string) => void;
  executeAction: () => void;
  skipAttack: () => void;
  skipDefense: () => void;
  getSelectedCards: (player: PlayerState) => any[];
}

export const BattleControls = (props: BattleControlsProps) => {
  return (
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
            onClick={() => props.setActiveTab("hand")}
            class={`relative flex-1 group overflow-hidden transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] ${
              props.activeTab === "hand"
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
            onClick={() => props.setActiveTab("backpack")}
            class={`relative flex-1 group overflow-hidden transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] ${
              props.activeTab === "backpack"
                ? "bg-emerald-900/20 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                : "bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50"
            }`}
          >
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
          <Show when={props.activeTab === "hand"}>
            <HandPreview
              selectedCards={props.getSelectedCards(props.playerA)}
              isAttackPhase={isAttackPhase(props.phase)}
            />
            <HandArea
              player={props.playerA}
              phase={props.phase}
              attackerId={props.attackerId}
              onToggleSelect={props.toggleSelect}
            />
          </Show>
          <Show when={props.activeTab === "backpack"}>
            <div class="w-full h-full flex items-center justify-center text-slate-500 font-mono tracking-widest border border-dashed border-emerald-900/30 bg-emerald-950/10 rounded-sm overflow-hidden relative group">
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
              props.phase !== GamePhase.ROUND_END &&
              props.phase !== GamePhase.GAME_OVER
            }
          >
            <button
              onClick={props.executeAction}
              class={clsx(
                `flex-[2] rounded-sm font-bold shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-1 border border-white/10`,
                isAttackPhase(props.phase)
                  ? "bg-rose-900/80 text-rose-100 hover:bg-rose-800 hover:shadow-[0_0_20px_rgba(225,29,72,0.4)] border-rose-500/30"
                  : "bg-cyan-900/80 text-cyan-100 hover:bg-cyan-800 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] border-cyan-500/30",
                isMobileDevice ? "text-sm" : "text-xl"
              )}
            >
              {isAttackPhase(props.phase) ? "攻击" : "格挡"}
            </button>

            <Show when={isAttackPhase(props.phase)}>
              <button
                onClick={props.skipAttack}
                class="flex-1 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 rounded-sm text-slate-500 hover:text-slate-300 font-bold text-sm transition-all"
              >
                空过
              </button>
            </Show>

            <Show when={isDefendPhase(props.phase)}>
              <button
                onClick={props.skipDefense}
                class="flex-1 bg-slate-900/80 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 rounded-sm text-slate-400 hover:text-red-300 font-bold text-sm transition-all"
              >
                放弃
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};
