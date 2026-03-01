import {
  mdiExitToApp,
  mdiHistory,
  mdiMenu,
  mdiHelpCircleOutline,
  mdiEmoticonHappyOutline,
} from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { PlayerStatus } from "./PlayerStatus";
import { PlayerState, GamePhase, AppState } from "../types";
import { setGameState } from "../store";
import { createSignal, Show, onCleanup, onMount } from "solid-js";

interface BattleTopBarProps {
  playerA: PlayerState;
  playerB: PlayerState;
  phase: GamePhase;
  attackerId: string;
  phaseInfoColor: string;
  onShowLogs: () => void;
  onShowHelp: () => void;
  onWinBattle?: () => void;
}

export const BattleTopBar = (props: BattleTopBarProps) => {
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      setShowMenu(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return (
    <div class="flex items-center justify-between w-full mx-auto bg-slate-950/60 backdrop-blur-md px-4 z-20 border-b border-white/10 relative">
      <div class="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

      <PlayerStatus
        player={props.playerA}
        opponent={props.playerB}
        phase={props.phase}
        attackerId={props.attackerId}
      />

      <div class="flex flex-col items-center gap-1 min-w-[160px] relative">
        <div
          class={`text-xl max-lg:text-4 text-slate-300 ${props.phaseInfoColor} flex items-center gap-2 drop-shadow-[0_0_8px_currentColor] transition-all duration-300`}
        >
          <span>战斗</span>
        </div>

        {/* Decor lines */}
        <div class="absolute -left-4 top-1/2 w-8 h-[1px] bg-white/10"></div>
        <div class="absolute -right-4 top-1/2 w-8 h-[1px] bg-white/10"></div>
      </div>

      <div class="flex items-center gap-4">
        <PlayerStatus
          player={props.playerB}
          opponent={props.playerA}
          phase={props.phase}
          attackerId={props.attackerId}
        />
        <div class="flex items-center gap-2 relative" ref={menuRef}>
          {/* <button
            class="p-2 hover:bg-slate-800 text-slate-500 hover:text-cyan-400 rounded-sm transition-colors"
            onClick={props.onShowLogs}
            title="查看日志"
          >
            <Icon path={mdiHistory} size={20} />
          </button> */}

          <button
            class={`p-2 rounded-sm transition-all duration-200 ${
              showMenu()
                ? "bg-cyan-500/20 text-cyan-400"
                : "hover:bg-slate-800 text-slate-500 hover:text-cyan-400"
            }`}
            onClick={() => setShowMenu(!showMenu())}
            title="菜单"
          >
            <Icon path={mdiMenu} size={22} />
          </button>

          <Show when={showMenu()}>
            <div class="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <button
                class="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400 flex items-center gap-3 transition-colors"
                onClick={() => {
                  props.onShowHelp();
                  setShowMenu(false);
                }}
              >
                <Icon path={mdiHelpCircleOutline} size={18} />
                <span>查看帮助</span>
              </button>

              <Show when={props.onWinBattle}>
                <button
                  class="w-full px-4 py-2.5 text-left text-sm text-amber-400 hover:bg-amber-900/20 flex items-center gap-3 transition-colors"
                  onClick={() => {
                    props.onWinBattle?.();
                    setShowMenu(false);
                  }}
                >
                  <Icon path={mdiEmoticonHappyOutline} size={18} />
                  <span>立即胜利 (测试)</span>
                </button>
              </Show>

              <div class="h-px bg-slate-800 mx-1 my-1"></div>

              <button
                class="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                onClick={() => {
                  if (confirm("确定要退出战斗吗？当前进度将会丢失。")) {
                    setGameState("appState", AppState.MENU);
                  }
                  setShowMenu(false);
                }}
              >
                <Icon path={mdiExitToApp} size={18} />
                <span>退出游戏</span>
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
