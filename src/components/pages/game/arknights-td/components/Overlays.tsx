import { Show, Accessor, Setter } from "solid-js";
import { Operator, GameStats, OperatorTemplate } from "../types";
import { OP_STATS } from "../constants";

interface OverlaysProps {
    gameState: Accessor<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
    setGameState: Setter<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
    selectedOp: Accessor<Operator | undefined>;
    setSelectedOpId: Setter<string | null>;
    setStats: Setter<GameStats>;
    setOperators: Setter<Operator[]>;
    getOpTemplate: (id: string) => OperatorTemplate | undefined;
    activateSkill: (opId: string) => void;
}

export const MissionAccomplished = (props: { show: boolean, onContinue: () => void }) => {
    return (
        <Show when={props.show}>
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-700 pointer-events-auto">
                <div class="w-full h-64 bg-black/80 flex items-center justify-center relative border-y-2 border-white/20 shadow-[0_0_100px_rgba(0,0,0,1)]">
                    <div class="absolute left-1/4 -translate-x-full flex flex-col items-center">
                        <div class="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center">
                            <div class="absolute inset-0 border-[2px] md:border-[3px] border-white rotate-180" style="clip-path: polygon(50% 0%, 0% 100%, 100% 100%);"></div>
                            <div class="relative z-10 w-12 h-16 md:w-20 md:h-28 bg-white" style="clip-path: polygon(20% 0%, 80% 0%, 100% 10%, 100% 30%, 80% 30%, 80% 50%, 100% 50%, 100% 70%, 80% 70%, 80% 100%, 20% 100%, 20% 70%, 0% 70%, 0% 50%, 20% 50%, 20% 30%, 0% 30%, 0% 10%);"></div>
                            <div class="absolute bottom-2 md:bottom-4 text-black font-black text-[6px] md:text-[10px] tracking-[0.2em] z-20">RHODES ISLAND</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-6 md:gap-10">
                        <div class="flex flex-col items-center">
                            <h1 class="text-5xl md:text-9xl font-black text-white tracking-widest drop-shadow-[10px_10px_0_rgba(255,255,255,0.1)]">行动结束</h1>
                        </div>
                        <div class="flex flex-col gap-0.5 md:gap-1 border-l-2 md:border-l-4 border-white pl-4 md:pl-6">
                            <span class="text-xl md:text-3xl font-black italic tracking-tighter text-white uppercase leading-none">任务</span>
                            <span class="text-xl md:text-3xl font-black italic tracking-tighter text-white uppercase opacity-80 leading-none">成功</span>
                        </div>
                    </div>
                    <button onClick={props.onContinue} class="absolute bottom-4 right-10 text-white/50 hover:text-white text-[10px] font-bold tracking-[0.5em] uppercase border-b border-white/20 pb-1 transition-all">
                        点击此处继续 | CLICK TO CONTINUE
                    </button>
                </div>
            </div>
        </Show>
    );
};

export const GameOver = (props: { show: boolean, onRestart: () => void }) => {
    return (
        <Show when={props.show}>
            <div class="absolute inset-0 bg-red-900/40 backdrop-blur-md flex items-center justify-center z-50 pointer-events-auto">
                <div class="bg-black/90 p-8 md:p-12 border-2 md:border-4 border-red-600 skew-x-[-10deg]">
                    <h1 class="text-5xl md:text-8xl font-black italic text-red-600 tracking-tighter skew-x-[10deg]">作战失败</h1>
                    <button onClick={props.onRestart} class="mt-6 md:mt-8 w-full py-3 md:py-4 bg-red-600 text-white font-black italic tracking-widest skew-x-[10deg] hover:bg-red-500 transition-colors">
                        重新开始关卡
                    </button>
                </div>
            </div>
        </Show>
    );
};

export const OperatorDetail = (props: {
    selectedOp: Accessor<Operator | undefined>,
    setSelectedOpId: Setter<string | null>,
    setStats: Setter<GameStats>,
    setOperators: Setter<Operator[]>,
    getOpTemplate: (id: string) => OperatorTemplate | undefined,
    activateSkill: (opId: string) => void
}) => {
    const template = () => {
        const op = props.selectedOp();
        if (!op) return undefined;
        return props.getOpTemplate(op.templateId || op.type);
    };

    return (
        <Show when={props.selectedOp() && template()}>
            <div class="absolute inset-0 z-50 pointer-events-auto" onClick={() => props.setSelectedOpId(null)}>

                {/* Left Panel: Stats */}
                <div
                    class="absolute left-0 top-10 md:top-12 bottom-20 md:bottom-24 w-56 md:w-72 bg-gradient-to-r from-black/95 to-transparent p-4 md:p-8 flex flex-col justify-center animate-in slide-in-from-left duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div class="flex items-center gap-2 md:gap-4 mb-2">
                        <div class="w-8 h-8 md:w-12 md:h-12 bg-white flex items-center justify-center rotate-45">
                            <span class="text-black -rotate-45 text-lg md:text-2xl">
                                {props.selectedOp()?.type === 'DEFENDER' ? '🛡️' : props.selectedOp()?.type === 'GUARD' ? '⚔️' : '🏹'}
                            </span>
                        </div>
                        <div>
                            <h2 class="text-xl md:text-3xl font-black italic leading-none">{template()?.label}</h2>
                            <div class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5 md:mt-1">干员档案</div>
                        </div>
                    </div>

                    <div class="space-y-2 md:space-y-4 mt-4 md:mt-8">
                        <div class="flex flex-col">
                            <div class="flex justify-between items-end">
                                <span class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase">生命值</span>
                                <span class="text-[10px] md:text-xs font-mono">{Math.ceil(props.selectedOp()!.hp)} / {props.selectedOp()!.maxHp}</span>
                            </div>
                            <div class="h-1 md:h-1.5 w-full bg-white/10 mt-1">
                                <div class="h-full bg-green-500 transition-all duration-300" style={{ width: `${(props.selectedOp()!.hp / props.selectedOp()!.maxHp) * 100}%` }}></div>
                            </div>
                        </div>

                        <div class="flex flex-col">
                            <div class="flex justify-between items-end">
                                <span class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase">技力 (SP)</span>
                                <span class="text-[10px] md:text-xs font-mono">{Math.floor(props.selectedOp()!.sp)} / {props.selectedOp()!.maxSp}</span>
                            </div>
                            <div class="h-1 md:h-1.5 w-full bg-white/10 mt-1">
                                <div class="h-full bg-blue-400 transition-all duration-300" style={{ width: `${(props.selectedOp()!.sp / props.selectedOp()!.maxSp) * 100}%` }}></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-x-2 md:gap-4 gap-y-1 md:gap-y-2 pt-1 md:pt-2">
                            <div>
                                <span class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase">攻击力</span>
                                <div class="text-lg md:text-xl font-black italic text-yellow-500">{template()?.damage}</div>
                            </div>
                            <div>
                                <span class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase">防御力</span>
                                <div class="text-lg md:text-xl font-black italic text-blue-400">{template()?.def}</div>
                            </div>
                            <div>
                                <span class="text-[8px] md:text-[10px] text-white/40 font-bold uppercase">阻挡数</span>
                                <div class="text-lg md:text-xl font-black italic">{template()?.block}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Right: Retreat Button */}
                <div class="absolute top-12 md:top-16 right-4 md:right-8 animate-in slide-in-from-top duration-300" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => {
                            const op = props.selectedOp();
                            if (op && template()) {
                                props.setStats(prev => ({ ...prev, dp: Math.min(prev.dp + Math.floor(template()!.cost * 0.5), 99) }));
                                props.setOperators(prev => prev.filter(o => o.id !== op.id));
                                props.setSelectedOpId(null);
                            }
                        }}
                        class="bg-red-600 hover:bg-red-500 text-white px-4 py-1 md:px-6 md:py-2 font-black italic flex flex-col items-center border-r-2 md:border-r-4 border-white shadow-xl transition-all active:scale-95"
                    >
                        <span class="text-[6px] md:text-[8px] tracking-widest opacity-70 uppercase">Withdraw</span>
                        <span class="text-sm md:text-lg">撤退</span>
                    </button>
                </div>

                {/* Bottom Right: Skill Button */}
                <div class="absolute bottom-24 md:bottom-28 right-4 md:right-8 animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
                    <div class="flex flex-col items-end gap-1 md:gap-2">
                        <div class="bg-black/80 border border-white/20 p-2 md:p-4 w-48 md:w-64 skew-x-[-10deg]">
                            <div class="skew-x-[10deg]">
                                <h3 class="text-yellow-500 font-black italic text-xs md:text-base">{template()?.skill.name}</h3>
                                <p class="text-[8px] md:text-[10px] text-white/60 italic leading-tight mt-0.5 md:mt-1">{template()?.skill.description}</p>
                            </div>
                        </div>
                        <button
                            disabled={props.selectedOp()!.sp < props.selectedOp()!.maxSp || props.selectedOp()!.skillActive}
                            onClick={() => {
                                const op = props.selectedOp();
                                if (op) {
                                    props.activateSkill(op.id);
                                }
                            }}
                            class={`
                                w-16 h-16 md:w-24 md:h-24 rounded-full border-2 md:border-4 flex flex-col items-center justify-center transition-all relative overflow-hidden
                                ${props.selectedOp()!.skillActive ? 'bg-yellow-500 border-white animate-pulse' :
                                props.selectedOp()!.sp >= props.selectedOp()!.maxSp ? 'bg-blue-600 border-blue-400 hover:scale-110' : 'bg-slate-800 border-slate-700 grayscale'}
                            `}
                        >
                            <span class="text-xl md:text-2xl z-10">{props.selectedOp()!.skillActive ? '⚡' : '🔥'}</span>
                            <span class="text-[8px] md:text-[10px] font-black z-10">{props.selectedOp()!.skillActive ? '开启中' : props.selectedOp()!.sp >= props.selectedOp()!.maxSp ? '就绪' : '充能中'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
};



