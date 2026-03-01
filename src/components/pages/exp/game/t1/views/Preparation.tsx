import { Component, createSignal, For, Show } from "solid-js";
import { gameState, setGameState } from "../store";
import { AppState } from "../types";
import { Icon } from "../../../../../common/Icon";
import { BackgroundEffect } from "../components/BackgroundEffect"; // 引入背景特效
import {
  mdiArrowLeft,
  mdiBagPersonal,
  mdiSwordCross,
  mdiCheckCircle,
  mdiLock,
} from "@mdi/js";
import clsx from "clsx";
import { TALENT_TREE, Talent } from "../talents";

// Mock data for artifacts based on the design doc
const ARTIFACT_DATA = [
  {
    id: "001",
    name: "断渊",
    description: "斩击特化的基础法器，能够轻易撕裂敌人的护盾。",
    skillName: "解神斩",
    baseThreshold: 100,
    skillDesc: "对敌方造成相当于 基础伤害倍率 * 10 + 超限值 * 0.1 的伤害。以及基础伤害倍率 * 20 + 超限值 * 0.2 的护盾特攻伤害。",
    levels: [
      { level: 0, effect: "基础攻击倍率: 1.0；生命值上限: 20" },
      { level: 1, effect: "生命上限 +5" },
      { level: 2, effect: "基础攻击倍率提升至 1.1" },
      { level: 3, effect: "生命上限 +10" },
      { level: 4, effect: "基础攻击倍率提升至 1.3" },
      { level: 5, effect: "生命上限 +20" },
      { level: 6, effect: "基础攻击倍率提升至 1.5" },
      { level: 7, effect: "生命上限 +30；基础攻击倍率提升至 1.7" },
    ],
  },
  {
    id: "002",
    name: "镇岳",
    description: "防御型法器，能够将受到的冲击转化为自身的力量。",
    skillName: "岳峙渊渟",
    baseThreshold: 120,
    skillDesc: "获得大量护盾，并在下一次攻击时附加护盾值一定比例的伤害。",
    levels: [
      { level: 0, effect: "基础攻击倍率: 0.8；生命值上限: 40" },
      { level: 1, effect: "生命上限 +10" },
      { level: 2, effect: "基础防御倍率提升" },
      { level: 3, effect: "生命上限 +20" },
      { level: 4, effect: "技能护盾转化率提升" },
      { level: 5, effect: "生命上限 +40" },
      { level: 6, effect: "受击充能效率提升" },
      { level: 7, effect: "生命上限 +60；反震伤害提升" },
    ],
  },
];

export const PreparationView: Component = () => {
  const [activeTab, setActiveTab] = createSignal<"bloodline" | "artifact">("bloodline");
  const [selectedArtifact, setSelectedArtifact] = createSignal<string>(gameState.playerData.selectedArtifactId || "001");
  const [selectedTalent, setSelectedTalent] = createSignal<Talent | null>(null);

  const currentArtifact = () => ARTIFACT_DATA.find((a) => a.id === selectedArtifact());
  
  // Find nodes to connect
  const getConnections = () => {
    const connections: Array<{ from: Talent; to: Talent }> = [];
    for (const talent of TALENT_TREE) {
      for (const depId of talent.dependencies) {
        const dep = TALENT_TREE.find(t => t.id === depId);
        if (dep) {
          connections.push({ from: dep, to: talent });
        }
      }
    }
    return connections;
  };

  const handleEquip = (id: string) => {
    if (gameState.playerData.unlockedArtifacts.includes(id)) {
      setSelectedArtifact(id);
      setGameState("playerData", "selectedArtifactId", id);
    }
  };

  const handleUnlockTalent = (talent: Talent) => {
    if (gameState.playerData.unlockedTalents.includes(talent.id)) return;
    
    // Check dependencies
    const hasDependencies = talent.dependencies.every(depId => 
      gameState.playerData.unlockedTalents.includes(depId)
    );
    
    if (!hasDependencies) return;

    if (gameState.playerData.merits >= talent.cost) {
      setGameState("playerData", "merits", (m) => m - talent.cost);
      setGameState("playerData", "unlockedTalents", (t) => [...t, talent.id]);
    }
  };

  return (
    <div class="w-full h-full bg-[#050508] text-slate-200 flex flex-col font-sans select-none overflow-hidden relative">
      <BackgroundEffect theme="default" intensity={1.5} />
      
      <style>{`
        .clip-cut {
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .cyber-border {
          position: relative;
        }
        .cyber-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border: 1px solid rgba(6, 182, 212, 0.3);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          pointer-events: none;
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
        }
      `}</style>

      {/* Header */}
      <div class="flex-none h-16 bg-slate-950/60 backdrop-blur-md flex items-center justify-between px-6 z-20 border-b border-white/10 relative">
        <div class="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
        
        <div class="flex items-center gap-4">
          <button
            onClick={() => setGameState("appState", AppState.MENU)}
            class="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-all group px-3 py-1.5 rounded hover:bg-white/5"
          >
            <Icon path={mdiArrowLeft} class="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span class="font-bold tracking-widest text-sm">返回菜单</span>
          </button>
          <div class="h-6 w-px bg-white/10"></div>
          <h1 class="text-xl font-black tracking-[0.2em] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]">
            战前整备
          </h1>
        </div>

        {/* Resources */}
        <div class="flex items-center gap-6">
          <div class="flex flex-col items-end">
            <span class="text-[10px] font-black text-amber-500/70 uppercase tracking-widest mb-0.5">当前觉醒点</span>
            <div class="flex items-center gap-3 bg-slate-950/80 px-4 py-1 border border-amber-500/30 clip-cut shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <span class="text-amber-400 font-mono text-xl font-bold tracking-widest drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">{gameState.playerData.merits}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div class="flex-1 flex overflow-hidden z-10">
        {/* Sidebar */}
        <div class="w-64 border-r border-white/5 bg-slate-950/40 flex flex-col p-4 gap-4">
          <button
            onClick={() => setActiveTab("bloodline")}
            class={clsx(
              "relative h-16 group overflow-hidden transition-all duration-300",
              activeTab() === "bloodline"
                ? "bg-cyan-900/20 border border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                : "bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50"
            )}
          >
            <div class="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-800/50 group-hover:border-cyan-400"></div>
            <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-800/50 group-hover:border-cyan-400"></div>
            <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-800/50 group-hover:border-cyan-400"></div>
            <div class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-800/50 group-hover:border-cyan-400"></div>
            
            <div class="relative z-10 flex items-center gap-4 px-6 h-full">
              <Icon path={mdiSwordCross} class={clsx("w-5 h-5 transition-colors", activeTab() === "bloodline" ? "text-cyan-400" : "text-slate-500 group-hover:text-cyan-400")} />
              <span class={clsx("font-bold tracking-[0.2em] transition-colors", activeTab() === "bloodline" ? "text-cyan-100" : "text-slate-400 group-hover:text-slate-200")}>血脉天赋</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab("artifact")}
            class={clsx(
              "relative h-16 group overflow-hidden transition-all duration-300",
              activeTab() === "artifact"
                ? "bg-emerald-900/20 border border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50"
            )}
          >
            <div class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-800/50 group-hover:border-emerald-400"></div>
            <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-emerald-800/50 group-hover:border-emerald-400"></div>
            <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-emerald-800/50 group-hover:border-emerald-400"></div>
            <div class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-800/50 group-hover:border-emerald-400"></div>

            <div class="relative z-10 flex items-center gap-4 px-6 h-full">
              <Icon path={mdiBagPersonal} class={clsx("w-5 h-5 transition-colors", activeTab() === "artifact" ? "text-emerald-400" : "text-slate-500 group-hover:text-emerald-400")} />
              <span class={clsx("font-bold tracking-[0.2em] transition-colors", activeTab() === "artifact" ? "text-emerald-100" : "text-slate-400 group-hover:text-slate-200")}>法器装配</span>
            </div>
          </button>
        </div>

        {/* Content Area */}
        <div class="flex-1 relative overflow-hidden scanline">
          {activeTab() === "artifact" ? (
            <div class="flex h-full">
              {/* Artifact List */}
              <div class="w-1/3 border-r border-white/5 p-6 overflow-y-auto bg-slate-950/20">
                <h2 class="text-[10px] font-black tracking-[0.3em] text-slate-500 uppercase mb-6 flex items-center gap-2">
                  <span class="w-1.5 h-3 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                  法器列表
                </h2>
                <div class="flex flex-col gap-4">
                  <For each={ARTIFACT_DATA}>
                    {(artifact) => {
                      const isUnlocked = gameState.playerData.unlockedArtifacts.includes(artifact.id);
                      const isSelected = selectedArtifact() === artifact.id;
                      const isEquipped = gameState.playerData.selectedArtifactId === artifact.id;
                      
                      return (
                        <button
                          onClick={() => isUnlocked && handleEquip(artifact.id)}
                          class={clsx(
                            "relative flex flex-col p-5 text-left transition-all duration-300 clip-cut",
                            isSelected
                              ? "bg-emerald-900/20 border border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                              : "bg-slate-900/40 border border-slate-800 hover:border-emerald-500/30",
                            !isUnlocked && "opacity-50 grayscale cursor-not-allowed"
                          )}
                        >
                          <div class="flex items-center justify-between mb-2">
                            <span class={clsx("font-black text-lg tracking-widest transition-colors", isSelected ? "text-emerald-400" : "text-slate-400")}>
                              {artifact.name}
                            </span>
                            {isEquipped && (
                              <div class="px-2 py-0.5 bg-amber-500/20 border border-amber-500/50 clip-cut">
                                <span class="text-[10px] font-black text-amber-400">已装备</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>

              {/* Artifact Details */}
              <div class="flex-1 p-8 overflow-y-auto bg-slate-950/40 relative">
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.03)_0%,_transparent_70%)] pointer-events-none"></div>
                {currentArtifact() ? (
                  <div class="max-w-2xl mx-auto flex flex-col gap-8 pb-16 animate-in fade-in slide-in-from-right-8 duration-500 relative z-10">
                    
                    {/* Header Info */}
                    <div class="flex flex-col gap-4">
                      <div class="flex items-end justify-between border-b border-emerald-900/20 pb-4">
                        <div>
                          <h2 class="text-5xl font-black tracking-widest text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                            {currentArtifact()?.name}
                          </h2>
                        </div>
                      </div>
                      <p class="text-slate-400 leading-relaxed text-sm bg-slate-900/20 p-4 border-l-2 border-emerald-500/30">
                        {currentArtifact()?.description}
                      </p>
                    </div>

                    {/* Skill Info */}
                    <div class="relative group">
                      <div class="absolute inset-0 bg-amber-500/5 blur-xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-700"></div>
                      <div class="relative bg-slate-900/40 border border-slate-800 p-6 flex flex-col gap-4 clip-cut">
                        <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Icon path={mdiSwordCross} class="w-16 h-16 text-amber-500" />
                        </div>
                        <h3 class="text-sm font-bold tracking-widest text-amber-500 flex items-center gap-2">
                          <div class="w-1 h-4 bg-amber-500"></div>
                          法器核心技能: {currentArtifact()?.skillName}
                        </h3>
                        <div class="text-xs font-mono text-amber-500/70 bg-amber-500/10 px-3 py-1.5 border border-amber-500/20 w-fit">
                          灵压阈值: {currentArtifact()?.baseThreshold} MP
                        </div>
                        <p class="text-sm text-slate-300 leading-relaxed font-medium">
                          {currentArtifact()?.skillDesc}
                        </p>
                      </div>
                    </div>

                    {/* Liberation Preview */}
                    <div class="flex flex-col gap-6">
                      <h3 class="text-[10px] font-black tracking-[0.3em] text-slate-500 uppercase flex items-center gap-2">
                        <span class="w-4 h-[1px] bg-slate-800"></span>
                        解放等级预览
                        <span class="w-4 h-[1px] bg-slate-800"></span>
                        </h3>
                      
                      <div class="grid grid-cols-1 gap-3 relative">
                        <div class="absolute left-[19px] top-4 bottom-4 w-px bg-slate-800/50"></div>
                        
                        <For each={currentArtifact()?.levels}>
                          {(levelData) => (
                            <div class="flex items-center gap-4 relative z-10 group">
                              <div class={clsx(
                                "w-10 h-10 shrink-0 flex items-center justify-center text-[10px] font-mono transition-all duration-300 border clip-cut",
                                "bg-slate-950 border-slate-800 text-slate-500 group-hover:border-emerald-500/50 group-hover:text-emerald-400 group-hover:bg-emerald-950/30"
                              )}>
                                L{levelData.level}
                              </div>
                              <div class="flex-1 p-4 bg-slate-900/30 border border-slate-800/30 text-xs text-slate-400 group-hover:bg-slate-900/50 group-hover:text-slate-200 transition-all clip-cut group-hover:border-emerald-500/20">
                                {levelData.effect}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>

                    <div class="mt-8 flex justify-center pb-8">
                      <button
                        onClick={() => handleEquip(selectedArtifact())}
                        disabled={gameState.playerData.selectedArtifactId === selectedArtifact()}
                        class={clsx(
                          "relative px-16 py-4 font-black tracking-[0.3em] transition-all duration-300 overflow-hidden group",
                          gameState.playerData.selectedArtifactId === selectedArtifact()
                            ? "bg-slate-900 border border-slate-800 text-slate-600 cursor-default"
                            : "bg-emerald-600/20 border border-emerald-500 text-emerald-100 hover:bg-emerald-600/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                        )}
                      >
                        <Show when={gameState.playerData.selectedArtifactId !== selectedArtifact()}>
                          <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                          <div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                          <div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                          <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                        </Show>
                        <span class="relative z-10">
                          {gameState.playerData.selectedArtifactId === selectedArtifact() ? "ACTIVE UNIT 已装备" : "CONFIRM EQUIP 确认装备"}
                        </span>
                      </button>
                    </div>

                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div class="flex h-full overflow-hidden bg-slate-950/20">
              {/* Left: Talent Tree Visualization */}
              <div class="flex-1 relative overflow-hidden border-r border-white/5">
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="relative w-[600px] h-[500px] pointer-events-none">
                    {/* SVG Layer for Connections */}
                    <svg class="absolute inset-0 w-full h-full pointer-events-none">
                      <For each={getConnections()}>
                        {(conn) => {
                          const x1 = 300 + conn.from.x * 100;
                          const y1 = 150 + conn.from.y * 120;
                          const x2 = 300 + conn.to.x * 100;
                          const y2 = 150 + conn.to.y * 120;
                          const isUnlocked = gameState.playerData.unlockedTalents.includes(conn.to.id);
                          return (
                            <line
                              x1={x1} y1={y1}
                              x2={x2} y2={y2}
                              stroke={isUnlocked ? "rgba(245, 158, 11, 0.6)" : "rgba(71, 85, 105, 0.3)"}
                              stroke-width="2"
                              stroke-dasharray={isUnlocked ? "none" : "4 4"}
                            />
                          );
                        }}
                      </For>
                    </svg>

                    {/* Nodes Layer */}
                    <For each={TALENT_TREE}>
                      {(talent) => {
                        const isUnlocked = gameState.playerData.unlockedTalents.includes(talent.id);
                        const isSelected = selectedTalent()?.id === talent.id;
                        const canUnlock = !isUnlocked && talent.dependencies.every(depId => 
                          gameState.playerData.unlockedTalents.includes(depId)
                        );
                        const isLockedByDependency = !isUnlocked && !canUnlock;

                        const posX = 300 + talent.x * 100;
                        const posY = 150 + talent.y * 120;

                        return (
                          <div
                            class="absolute pointer-events-auto transition-all duration-300"
                            style={{
                              left: `${posX}px`,
                              top: `${posY}px`,
                              transform: "translate(-50%, -50%)"
                            }}
                          >
                            <button
                              onClick={() => setSelectedTalent(talent)}
                              class={clsx(
                                "w-14 h-14 flex items-center justify-center text-xl font-black transition-all duration-500 clip-cut border-2",
                                isUnlocked 
                                  ? "bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-400" 
                                  : isLockedByDependency
                                    ? "bg-slate-900/60 border-slate-800 text-slate-700 opacity-60"
                                    : "bg-slate-800/80 border-slate-600 hover:border-amber-500/50 text-slate-400",
                                isSelected && "ring-2 ring-white/50 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                              )}
                            >
                              <span class={clsx(
                                "relative z-10 transition-transform",
                                isUnlocked ? "scale-110 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" : ""
                              )}>
                                {talent.icon}
                              </span>
                              <Show when={isUnlocked}>
                                <div class="absolute inset-0 bg-amber-500/10 animate-pulse pointer-events-none"></div>
                              </Show>
                            </button>
                            
                            <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap">
                              <span class={clsx(
                                "text-[10px] font-black tracking-widest uppercase",
                                isUnlocked ? "text-amber-400" : isSelected ? "text-white" : "text-slate-500"
                              )}>
                                {talent.name}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>

              {/* Right: Talent Details Panel */}
              <div class="w-80 bg-slate-950/40 backdrop-blur-md p-6 flex flex-col gap-6 overflow-y-auto">
                <Show
                  when={selectedTalent()}
                  fallback={
                    <div class="h-full flex flex-col items-center justify-center text-center opacity-30 gap-4">
                      <div class="w-16 h-16 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-3xl">?</div>
                      <p class="text-xs font-bold tracking-widest uppercase">选择一个天赋节点以查看详情</p>
                    </div>
                  }
                >
                  <div class="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div class="flex flex-col gap-2">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">天赋详情</span>
                        <div class="text-[10px] font-mono text-slate-600">ID: {selectedTalent()?.id}</div>
                      </div>
                      <h3 class="text-2xl font-black tracking-widest text-amber-400">
                        {selectedTalent()?.name}
                      </h3>
                    </div>

                    <div class="p-4 bg-slate-900/50 border-l-2 border-amber-500/50 clip-cut">
                      <p class="text-xs text-slate-300 leading-relaxed">
                        {selectedTalent()?.description}
                      </p>
                    </div>

                    <div class="flex flex-col gap-3">
                      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">属性加成</span>
                      <div class="px-4 py-3 bg-cyan-950/20 border border-cyan-500/30 text-cyan-400 text-sm font-bold flex items-center gap-3">
                        <div class="w-1.5 h-1.5 bg-cyan-400 rotate-45"></div>
                        {selectedTalent()?.effect}
                      </div>
                    </div>

                    <div class="mt-auto flex flex-col gap-4">
                      <Show when={!gameState.playerData.unlockedTalents.includes(selectedTalent()!.id)}>
                        <div class="pt-6 border-t border-white/5 flex flex-col gap-4">
                          <div class="flex items-center justify-between px-2">
                            <span class="text-[10px] text-slate-500 font-black uppercase">激活所需觉醒点</span>
                            <div class="flex items-center gap-2">
                              <span class={clsx(
                                "text-2xl font-mono font-black",
                                gameState.playerData.merits >= (selectedTalent()?.cost || 0) ? "text-amber-400" : "text-red-500"
                              )}>
                                {selectedTalent()?.cost}
                              </span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => selectedTalent() && handleUnlockTalent(selectedTalent()!)}
                            disabled={
                              !selectedTalent()?.dependencies.every(depId => gameState.playerData.unlockedTalents.includes(depId)) ||
                              gameState.playerData.merits < (selectedTalent()?.cost || 0)
                            }
                            class={clsx(
                              "w-full py-4 clip-cut font-black tracking-[0.3em] transition-all relative overflow-hidden group",
                              gameState.playerData.merits >= (selectedTalent()?.cost || 0) && selectedTalent()?.dependencies.every(depId => gameState.playerData.unlockedTalents.includes(depId))
                                ? "bg-amber-500/20 border border-amber-500 text-amber-400 hover:bg-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                                : "bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"
                            )}
                          >
                            <span class="relative z-10">激活此天赋</span>
                          </button>
                        </div>
                      </Show>
                      
                      <Show when={gameState.playerData.unlockedTalents.includes(selectedTalent()!.id)}>
                        <div class="pt-6 border-t border-white/5 flex flex-col items-center gap-3">
                          <div class="w-12 h-12 rounded-full border border-amber-500/30 flex items-center justify-center">
                            <Icon path={mdiCheckCircle} class="w-6 h-6 text-amber-500" />
                          </div>
                          <span class="text-[10px] font-black tracking-[0.3em] text-amber-500/50 uppercase">天赋已激活</span>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
