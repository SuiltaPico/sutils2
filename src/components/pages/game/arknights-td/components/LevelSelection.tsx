import { For, Show, Accessor, Setter, createSignal, onMount, onCleanup } from 'solid-js';
import { LEVELS } from '../constants';
import { LevelConfig } from '../types';
import { db } from '../db';
import { audioSystem } from '../audio';

interface LevelSelectionProps {
  currentLevel: Accessor<LevelConfig>;
  setCurrentLevel: Setter<LevelConfig>;
  initGame: () => void;
  showEnemyInfo: Accessor<boolean>;
  setShowEnemyInfo: Setter<boolean>;
  showMapPreview: Accessor<boolean>;
  setShowMapPreview: Setter<boolean>;
  toggleFullscreen: () => void;
  isFullscreen: Accessor<boolean>;
}

export const LevelSelection = (props: LevelSelectionProps) => {
  const [customLevels, setCustomLevels] = createSignal<LevelConfig[]>([]);

  const refreshCustomLevels = async () => {
    try {
      const levels = await db.getAllLevels();
      setCustomLevels(levels);

      // If the current level is a custom level that was just updated, update the selection
      const current = props.currentLevel();
      const updated = levels.find(l => l.id === current.id);
      if (updated) {
        props.setCurrentLevel(updated);
      }
    } catch (e) {
      console.error("Failed to load custom levels", e);
    }
  };

  onMount(() => {
    refreshCustomLevels();

    const channel = new BroadcastChannel('arknights-td-sync');
    channel.onmessage = (event) => {
      if (event.data.type === 'LEVEL_SAVED') {
        refreshCustomLevels();
      }
    };

    onCleanup(() => {
      channel.close();
    });
  });

  return (
    <div class="absolute inset-0 z-40 bg-slate-950 flex flex-row overflow-hidden">
      {/* Sidebar / Map Area */}
      <div class="flex-1 relative bg-[url('https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"></div>

        {/* Header */}
        <div class="absolute top-4 left-4 md:top-8 md:left-8 z-10">
          <h1 class="text-lg md:text-6xl font-black italic tracking-tighter text-white border-l-2 md:border-l-8 border-yellow-500 pl-2 md:pl-6">
            终端
          </h1>
        </div>

        {/* Level Nodes Area */}
        <div class="absolute inset-0 flex flex-col items-center justify-center p-4 md:p-20 overflow-x-auto scrollbar-hide">

          {/* Official Levels */}
          <div class="w-full flex items-center justify-center gap-6 md:gap-12 mb-10 md:mb-20">
            <For each={LEVELS}>
              {(level) => (
                <div
                  class="relative group cursor-pointer transition-all shrink-0"
                  onClick={() => {
                    audioSystem.init();
                    audioSystem.playLevelSelectSound();
                    props.setCurrentLevel(level);
                  }}
                >
                  {/* Connection Line */}
                  <div class="absolute top-1/2 left-full w-6 md:w-12 h-0.5 bg-white/20 -translate-y-1/2 last:hidden"></div>

                  {/* Node Shape */}
                  <div class={`
                                    w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rotate-45 border-2 transition-all
                                    ${props.currentLevel().id === level.id ? 'bg-white border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-black/60 border-white/40 hover:border-white hover:bg-black/80'}
                                `}>
                    <span class={`
                                        -rotate-45 text-[10px] md:text-base font-black tracking-tighter
                                        ${props.currentLevel().id === level.id ? 'text-black' : 'text-white'}
                                    `}>
                      {level.code}
                    </span>
                  </div>

                  {/* Selection Indicator */}
                  {props.currentLevel().id === level.id && (
                    <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></div>
                  )}
                </div>
              )}
            </For>
          </div>

          {/* Custom Levels */}
          <Show when={customLevels().length > 0}>
            <div class="w-full border-t border-white/10 pt-8">
              <h3 class="text-white/40 text-xs font-bold uppercase tracking-widest text-center mb-6">本地自定义关卡</h3>
              <div class="flex items-center justify-center gap-6 flex-wrap">
                <For each={customLevels()}>
                  {(level) => (
                    <div
                      class={`
                                        group cursor-pointer transition-all shrink-0 px-4 py-3 rounded border
                                        ${props.currentLevel().id === level.id ? 'bg-white border-white text-black' : 'bg-black/40 border-white/20 text-white hover:bg-white/10 hover:border-white/50'}
                                      `}
                      onClick={() => {
                        audioSystem.init();
                        audioSystem.playLevelSelectSound();
                        props.setCurrentLevel(level);
                      }}
                    >
                      <div class="font-black italic text-sm md:text-lg">{level.name}</div>
                      <div class="text-[10px] opacity-60 font-mono mt-1">{level.code}</div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

        </div>
      </div>

      {/* Detail Panel */}
      <div class="w-64 md:w-96 bg-black/90 border-l border-white/10 p-4 md:p-8 flex flex-col relative z-50 shrink-0 shadow-2xl">
        <div class="flex-1 overflow-y-auto scrollbar-hide">
          <div class="flex items-center gap-2 mb-1">
            <span class="bg-white/10 text-white/40 px-1.5 py-0.5 text-[8px] md:text-[10px] font-black uppercase tracking-widest">作战行动</span>
            <span class="text-yellow-500 font-mono font-black text-sm md:text-xl italic">{props.currentLevel().code}</span>
          </div>
          <h2 class="text-lg md:text-4xl font-black text-white mb-2 md:mb-6 tracking-tight leading-none">{props.currentLevel().name}</h2>

          <div class="inline-block bg-red-600/20 border border-red-500/50 px-2 py-0.5 mb-4 md:mb-6">
            <span class="text-red-500 text-[8px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap">推荐平均等级 {props.currentLevel().recommendedLevel}</span>
          </div>

          <p class="text-white/60 text-[10px] md:text-sm leading-relaxed italic mb-6 md:10 min-h-[3rem] md:min-h-[5rem]">
            {props.currentLevel().description}
          </p>

          <div class="grid grid-cols-2 gap-2 md:gap-4 mb-6 md:10">
            <button
              onClick={() => props.setShowEnemyInfo(true)}
              class="group bg-white/5 hover:bg-white/10 border border-white/20 p-2 md:p-3 transition-all flex flex-col items-center gap-1 md:gap-2"
            >
              <div class="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center border border-white/20 group-hover:border-white">
                <span class="text-white text-sm md:text-lg">🔍</span>
              </div>
              <span class="text-[8px] md:text-[10px] font-black text-white/50 group-hover:text-white uppercase tracking-[0.1em] md:tracking-[0.2em]">敌方情报</span>
            </button>
            <button
              onClick={() => props.setShowMapPreview(true)}
              class="group bg-white/5 hover:bg-white/10 border border-white/20 p-2 md:p-3 transition-all flex flex-col items-center gap-1 md:gap-2"
            >
              <div class="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center border border-white/20 group-hover:border-white">
                <span class="text-white text-sm md:text-lg">🗺️</span>
              </div>
              <span class="text-[8px] md:text-[10px] font-black text-white/50 group-hover:text-white uppercase tracking-[0.1em] md:tracking-[0.2em]">地图预览</span>
            </button>
          </div>
        </div>

        <div class="space-y-3 md:space-y-4 mt-auto">
          <div class="flex justify-between items-end border-b border-white/10 pb-2 md:pb-4">
            <div class="flex flex-col">
              <span class="text-[8px] md:text-[10px] text-white/30 font-black uppercase tracking-widest">理智消耗</span>
              <div class="flex items-center gap-1 md:gap-2">
                <span class="text-lg md:text-2xl font-black italic">-9</span>
                <div class="w-3 h-3 md:w-4 md:h-4 bg-white rotate-45 flex items-center justify-center">
                  <div class="w-1 h-1 md:w-1.5 md:h-1.5 bg-black rounded-full"></div>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end opacity-50">
              <span class="text-[8px] md:text-[10px] text-white/30 font-black uppercase tracking-widest">代理指挥</span>
              <div class="w-6 h-3 md:w-8 md:h-4 border border-white/40 relative">
                <div class="absolute top-0.5 left-0.5 bottom-0.5 right-3 md:right-4 bg-white/20"></div>
              </div>
            </div>
          </div>

          <button
            onClick={props.initGame}
            class="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 md:py-4 font-black italic text-lg md:text-2xl tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 md:gap-4 shadow-[0_0_30px_rgba(234,179,8,0.4)]"
          >
            开始行动
            <span class="text-2xl md:text-4xl leading-none">▶</span>
          </button>
        </div>
      </div>

      {/* Fullscreen Toggle */}
      <div class="absolute bottom-8 left-8 z-10 pointer-events-auto">
        <button
          onClick={props.toggleFullscreen}
          class="bg-black/60 hover:bg-white/10 border border-white/20 px-4 py-2 rounded text-[10px] transition-all font-bold tracking-widest text-white/50 hover:text-white backdrop-blur-md"
        >
          {props.isFullscreen() ? '退出全屏' : '全屏作战'}
        </button>
      </div>
    </div>
  );
};
