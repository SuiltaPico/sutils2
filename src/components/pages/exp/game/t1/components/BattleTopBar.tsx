import { mdiExitToApp, mdiHistory } from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { PlayerStatus } from "./PlayerStatus";
import { PlayerState, GamePhase, AppState } from "../types";
import { setGameState } from "../store";

interface BattleTopBarProps {
  playerA: PlayerState;
  playerB: PlayerState;
  phase: GamePhase;
  attackerId: string;
  phaseInfoColor: string;
  onShowLogs: () => void;
}

export const BattleTopBar = (props: BattleTopBarProps) => {
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
        <div class="flex items-center gap-2">
          <button
            class="p-2 hover:bg-slate-800 text-slate-500 hover:text-cyan-400 rounded-sm transition-colors"
            onClick={props.onShowLogs}
            title="查看日志"
          >
            <Icon path={mdiHistory} size={20} />
          </button>
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
    </div>
  );
};
