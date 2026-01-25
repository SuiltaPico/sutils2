import { Accessor, Setter, Show, For } from "solid-js";
import { GameStats, Operator, OperatorTemplate } from "../types";
import { OP_STATS, LEVELS } from "../constants";

interface HUDProps {
  gameState: Accessor<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
  setIsPaused: Setter<boolean>;
  setShowPauseModal: Setter<boolean>;
  stats: Accessor<GameStats>;
  toggleFullscreen: () => void;
  isFullscreen: Accessor<boolean>;
  setStats: Setter<GameStats>;
  gameSpeed: Accessor<1 | 2>;
  setGameSpeed: Setter<1 | 2>;
  isPaused: Accessor<boolean>;
  dragOp: Accessor<string | null>;
  setDragOp: Setter<string | null>;
  placingOp: Accessor<{ type: string, pos: { x: number, y: number } } | null>;
  setPointerPos: Setter<{ x: number, y: number } | null>;
  setGameState: Setter<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
  operatorTemplates?: Accessor<OperatorTemplate[]>;
}

export const TopBar = (props: HUDProps) => {
  return (
    <div class="h-10 md:h-12 bg-black/40 flex items-center justify-between px-4 md:px-10 z-20 border-b border-white/5 shrink-0">
      <div class="flex items-center gap-4 md:gap-8">
        <div
          class="p-1 md:p-2 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer transition-colors group"
          onClick={() => {
            props.setIsPaused(true);
            props.setShowPauseModal(true);
          }}
        >
          <div class="w-4 h-4 md:w-6 md:h-6 flex items-center justify-center relative">
            <span class="text-white/40 group-hover:text-white transition-colors text-lg md:text-2xl">⚙️</span>
          </div>
        </div>

        {/* Enemy Counter */}
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 md:w-5 md:h-5 bg-red-600 rotate-45 flex items-center justify-center">
            <div class="w-1.5 h-1.5 bg-white -rotate-45"></div>
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-[8px] md:text-[10px] text-white/40 font-black uppercase">击败敌方</span>
            <span class="text-lg md:text-2xl font-mono font-black italic">{props.stats().kills}/{props.stats().totalEnemies}</span>
          </div>
        </div>

        {/* Lives Counter */}
        <div class="flex items-center gap-2 ml-2 md:ml-4">
          <div class="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center relative">
            <div class="absolute inset-0 border border-blue-400 rotate-45"></div>
            <span class="text-blue-400 font-black text-[10px] md:text-xs relative z-10 -mt-0.5 md:-mt-1">▲</span>
          </div>
          <div class="text-xl md:text-3xl font-mono font-black italic text-blue-400">
            {props.stats().lives}
          </div>
        </div>
      </div>
      {/* Right Controls */}
      <div class="flex items-center gap-2 md:gap-4">
        <button
          onClick={props.toggleFullscreen}
          class="bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded text-[8px] transition-colors font-bold tracking-widest text-white/60"
        >
          {props.isFullscreen() ? '退出全屏' : '全屏'}
        </button>
        <button
          onClick={() => props.setStats(prev => ({ ...prev, dp: 99 }))}
          class="bg-purple-600/10 hover:bg-purple-600/20 text-purple-400/60 border border-purple-500/20 px-2 py-0.5 rounded text-[8px] transition-colors font-bold"
        >
          作弊
        </button>

        {/* Game Speed and Pause Controls */}
        <div class="flex items-center bg-black/40 rounded-sm border border-white/10 overflow-hidden">
          {/* Speed Toggle */}
          <button
            onClick={() => props.setGameSpeed(prev => prev === 1 ? 2 : 1)}
            class={`flex items-center gap-1 px-2 md:px-3 py-1 transition-all ${props.gameSpeed() === 2 ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/40'}`}
          >
            <span class="text-[10px] md:text-xs font-black italic tracking-tighter">{props.gameSpeed()}X</span>
            <div class="flex gap-0.5 items-center">
              <div class={`w-1 h-2.5 md:w-1.5 md:h-3 ${props.gameSpeed() >= 1 ? 'bg-current' : 'bg-white/20'}`}></div>
              <div class={`w-1 h-2.5 md:w-1.5 md:h-3 ${props.gameSpeed() >= 2 ? 'bg-current' : 'bg-white/20'}`}></div>
            </div>
          </button>

          <div class="w-px h-4 bg-white/10"></div>

          {/* Pause/Play Toggle */}
          <button
            onClick={() => props.setIsPaused(prev => !prev)}
            class={`px-3 md:px-4 py-1 transition-all ${props.isPaused() ? 'bg-yellow-500/20 text-yellow-500' : 'hover:bg-white/5 text-white/60'}`}
          >
            <Show when={props.isPaused()} fallback={
              /* Pause Icon */
              <div class="flex gap-1 items-center justify-center">
                <div class="w-1 h-3 md:w-1.5 md:h-4 bg-current"></div>
                <div class="w-1 h-3 md:w-1.5 md:h-4 bg-current"></div>
              </div>
            }>
              {/* Play Icon */}
              <div class="w-0 h-0 border-y-[6px] md:border-y-[8px] border-y-transparent border-l-[10px] md:border-l-[12px] border-l-current ml-0.5"></div>
            </Show>
          </button>
        </div>
      </div>
    </div>
  );
};

export const BottomBar = (props: HUDProps) => {
  const templates = () => props.operatorTemplates ? props.operatorTemplates() : Object.entries(OP_STATS).map(([id, stats]) => ({ id, type: id, ...stats }));

  return (
    <div class="h-16 md:h-20 flex items-end justify-between px-4 md:px-8 pb-1 md:pb-2 absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      {/* Operator Cards Area */}
      <div class="flex gap-1 md:gap-2 pointer-events-auto bg-black/20 backdrop-blur-sm p-1 rounded-sm border border-white/5">
        <For each={templates()}>
          {(stat) => (
            <div
              class={`
                            relative w-14 h-14 md:w-18 md:h-18 bg-slate-800 border-t border-slate-600 flex flex-col items-center justify-between p-0.5 cursor-pointer transition-all overflow-hidden
                            ${props.stats().dp < stat.cost ? 'brightness-50 grayscale cursor-not-allowed' : 'hover:border-white hover:-translate-y-1 active:scale-95'}
                            ${props.dragOp() === stat.id ? 'ring-2 ring-white opacity-50' : ''}
                        `}
              style={{ "touch-action": "none" }}
              onPointerDown={(e) => {
                if (props.stats().dp >= stat.cost && !props.placingOp()) {
                  props.setDragOp(stat.id);
                  props.setPointerPos({ x: e.clientX, y: e.clientY });
                }
              }}
            >
              <div class="absolute top-0.5 left-0.5 text-[8px] opacity-60 z-10 scale-75">
                {stat.type === 'DEFENDER' && '🛡️'}
                {stat.type === 'GUARD' && '⚔️'}
                {stat.type === 'SNIPER' && '🏹'}
              </div>
              <div class="absolute top-0 right-0 px-1 py-0.5 text-xs md:text-sm font-mono font-black text-white italic drop-shadow-md z-10">
                {stat.cost}
              </div>
              <div class={`flex-1 w-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 border-b border-white/5`}>
                <div class="text-xl md:text-3xl opacity-40 grayscale-[0.5]" style={{ "color": stat.color }}>
                  {stat.type === 'DEFENDER' && '🐻'}
                  {stat.type === 'GUARD' && '🐺'}
                  {stat.type === 'SNIPER' && '🐱'}
                </div>
              </div>
              <div class="text-[6px] md:text-[8px] font-black uppercase text-white/40 truncate w-full text-center">
                {stat.label}
              </div>
            </div>
          )}
        </For>
      </div>

      {/* Right Side: Deployment, DP, Retreat */}
      <div class="flex items-center gap-4 md:gap-8 pointer-events-auto">
        {/* Deployment Info */}
        <div class="flex flex-col items-end gap-0.5">
          <div class="text-[8px] md:text-[10px] font-bold text-white/40 tracking-widest uppercase">
            剩余部署: <span class="text-white text-xs md:text-base font-black italic ml-1">
              {props.stats().maxDeployment - props.stats().currentDeployment}
            </span>
          </div>

          {/* DP Circle / Hexagon Area */}
          <div class="flex items-center gap-2 md:gap-4">
            <div class="relative w-10 h-10 md:w-14 md:h-14 flex items-center justify-center">
              <div class="absolute inset-0 bg-black/60 border border-white/20" style="clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);"></div>
              <div class="flex flex-col items-center relative z-10">
                <span class="text-[6px] md:text-[8px] font-black text-white/40 -mb-0.5">部署费用</span>
                <span class="text-lg md:text-2xl font-mono font-black italic text-white leading-none">
                  {Math.floor(props.stats().dp)}
                </span>
              </div>
            </div>

            {/* Retreat Button */}
            <button
              onClick={() => props.setGameState('IDLE')}
              class="bg-red-700 hover:bg-red-600 px-3 md:px-5 py-1.5 md:py-2 rounded-sm skew-x-[-15deg] font-black italic tracking-tighter shadow-lg transition-colors border border-red-500/30"
            >
              <span class="block skew-x-[15deg] text-xs md:text-base text-white">撤退</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};



