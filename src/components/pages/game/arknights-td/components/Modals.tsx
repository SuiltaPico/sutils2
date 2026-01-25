import { Show, For, Accessor, Setter } from "solid-js";
import { LEVELS } from "../constants";
import { LevelConfig } from "../types";

interface ModalsProps {
    showEnemyInfo: Accessor<boolean>;
    setShowEnemyInfo: Setter<boolean>;
    showMapPreview: Accessor<boolean>;
    setShowMapPreview: Setter<boolean>;
    showPauseModal: Accessor<boolean>;
    setShowPauseModal: Setter<boolean>;
    setIsPaused: Setter<boolean>;
    setGameState: Setter<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
    activeDetail: Accessor<number>;
}

export const EnemyInfoModal = (props: { show: Accessor<boolean>, onClose: () => void }) => {
    return (
        <Show when={props.show()}>
            <div
                class="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-12 cursor-pointer"
                onClick={props.onClose}
            >
                <div class="w-full max-w-4xl bg-slate-900 border border-white/10 p-8 relative cursor-default" onClick={(e) => e.stopPropagation()}>
                    <button onClick={props.onClose} class="absolute -top-4 -right-4 w-10 h-10 bg-white text-black font-black flex items-center justify-center text-2xl rotate-45 hover:scale-110 transition-transform">
                        <span class="-rotate-45">+</span>
                    </button>
                    <h3 class="text-3xl font-black italic tracking-tighter mb-8 border-l-4 border-yellow-500 pl-4">敌方情报</h3>
                    <div class="grid grid-cols-4 md:grid-cols-6 gap-6">
                        <For each={[...Array(4)]}>
                            {(_, i) => (
                                <div class="flex flex-col items-center gap-2">
                                    <div class="w-20 h-20 bg-black/40 border border-white/10 flex items-center justify-center grayscale hover:grayscale-0 transition-all cursor-help group">
                                        <span class="text-4xl group-hover:scale-110 transition-transform">{i() % 2 === 0 ? '🧟' : '🐺'}</span>
                                    </div>
                                    <span class="text-[10px] font-bold text-white/40 uppercase">敌人_{i()}</span>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export const MapPreviewModal = (props: { show: Accessor<boolean>, onClose: () => void, level: LevelConfig }) => {
    return (
        <Show when={props.show()}>
            <div
                class="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-12 cursor-pointer"
                onClick={props.onClose}
            >
                <div class="w-full max-w-4xl bg-slate-900 border border-white/10 p-2 relative cursor-default" onClick={(e) => e.stopPropagation()}>
                    <button onClick={props.onClose} class="absolute -top-4 -right-4 w-10 h-10 bg-white text-black font-black flex items-center justify-center text-2xl rotate-45 hover:scale-110 transition-transform">
                        <span class="-rotate-45">+</span>
                    </button>
                    <div class="bg-black aspect-video flex items-center justify-center overflow-hidden">
                        <div
                            class="grid gap-0.5"
                            style={`grid-template-columns: repeat(${props.level.map[0].length}, 1fr); width: 80%;`}
                        >
                            <For each={props.level.map.flat()}>
                                {(tile) => (
                                    <div class={`
                                  aspect-square
                                  ${tile === 1 ? 'bg-white/20' : tile === 2 ? 'bg-red-500/40' : tile === 3 ? 'bg-blue-500/40' : 'bg-white/5'}
                                `} />
                                )}
                            </For>
                        </div>
                    </div>
                    <div class="p-4 bg-black/40 flex justify-between items-center font-mono text-[10px] text-white/30">
                        <span>ZEROTH-ORDER-OIL-TANK</span>
                        <span>// MAP PREVIEW //</span>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export const PauseModal = (props: { show: Accessor<boolean>, setShowPauseModal: Setter<boolean>, setIsPaused: Setter<boolean>, setGameState: Setter<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'> }) => {
    return (
        <Show when={props.show()}>
            <div class="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-300 pointer-events-auto">
                <div class="w-full max-w-md bg-slate-950 border-t-4 border-yellow-500 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
                    {/* Background Decorative Elements */}
                    <div class="absolute top-0 right-0 w-32 h-32 bg-white/5 -rotate-45 translate-x-16 -translate-y-16"></div>
                    <div class="absolute bottom-0 left-0 w-24 h-4 bg-yellow-500/20 skew-x-[-45deg] -translate-x-8"></div>

                    <div class="p-8 md:p-12">
                        <div class="flex items-center gap-4 mb-10">
                            <div class="w-2 h-8 bg-yellow-500"></div>
                            <h2 class="text-3xl md:text-4xl font-black italic tracking-widest text-white">暂停</h2>
                            <span class="text-[10px] text-white/20 font-bold uppercase tracking-[0.5em] mt-2">PAUSED</span>
                        </div>

                        <div class="space-y-4">
                            <button
                                onClick={() => {
                                    props.setShowPauseModal(false);
                                    props.setIsPaused(false);
                                }}
                                class="w-full bg-white hover:bg-yellow-500 text-black py-4 font-black italic text-xl tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-4 group"
                            >
                                返回战斗
                                <span class="text-2xl group-hover:translate-x-1 transition-transform">▶</span>
                            </button>

                            <button
                                onClick={() => {
                                    props.setGameState('IDLE');
                                    props.setShowPauseModal(false);
                                    props.setIsPaused(false);
                                }}
                                class="w-full bg-transparent border border-red-600/50 text-red-500 hover:bg-red-600 hover:text-white py-4 font-black italic text-xl tracking-[0.2em] transition-all active:scale-95"
                            >
                                放弃行动
                            </button>
                        </div>

                        <div class="mt-12 flex justify-between items-center text-[8px] font-mono text-white/20 tracking-widest">
                            <span>RHODES ISLAND TERMINAL</span>
                            <span>SYS.LOG // PAUSE_COMMAND</span>
                        </div>
                    </div>
                </div>
            </div>
        </Show>
    );
};
