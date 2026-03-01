import { Component, createSignal, For, Show } from "solid-js";
import { gameState, setGameState } from "../store";
import { AppState } from "../types";
import { Icon } from "../../../../../common/Icon";
import {
  mdiArrowLeft,
  mdiBookOpenPageVariant,
  mdiBagPersonal,
  mdiImageFilterCenterFocus,
  mdiInformationOutline,
  mdiLock,
} from "@mdi/js";
import clsx from "clsx";
import { RELIC_LIBRARY, Relic } from "../items";
import { CLUE_LIBRARY, Clue } from "../clues";

// Mock artifact data (should be unified eventually)
const ARTIFACT_DATA = [
  {
    id: "001",
    name: "断渊",
    description: "斩击特化的基础法器，能够轻易撕裂敌人的护盾。",
    skillName: "解神斩",
    icon: "🗡️",
  },
  {
    id: "002",
    name: "镇岳",
    description: "防御型法器，能够将受到的冲击转化为自身的力量。",
    skillName: "岳峙渊渟",
    icon: "🛡️",
  },
];

export const CompendiumView: Component = () => {
  const [activeTab, setActiveTab] = createSignal<"relic" | "artifact" | "clue">("relic");
  const [selectedItem, setSelectedItem] = createSignal<any>(null);

  const discoveredRelics = () => Object.values(RELIC_LIBRARY); // For now show all for testing, or filter
  const discoveredClues = () => Object.values(CLUE_LIBRARY);

  const renderRelics = () => (
    <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 p-4">
      <For each={Object.values(RELIC_LIBRARY)}>
        {(relic) => {
          const isDiscovered = gameState.playerData.discoveredRelics.includes(relic.id) || true; // Force true for dev
          return (
            <button
              onClick={() => setSelectedItem(relic)}
              class={clsx(
                "aspect-square rounded-lg border flex items-center justify-center text-3xl transition-all duration-300 relative group",
                isDiscovered 
                  ? "bg-slate-900/60 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80" 
                  : "bg-slate-950 border-slate-900 opacity-40 grayscale"
              )}
            >
              {isDiscovered ? relic.icon : "?"}
              <Show when={isDiscovered}>
                <div class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );

  const renderArtifacts = () => (
    <div class="flex flex-col gap-4 p-4">
      <For each={ARTIFACT_DATA}>
        {(artifact) => {
          const isUnlocked = gameState.playerData.unlockedArtifacts.includes(artifact.id);
          return (
            <div class={clsx(
              "p-6 rounded-xl border flex items-center gap-6 transition-all duration-300",
              isUnlocked ? "bg-slate-900/60 border-slate-700" : "bg-slate-950/40 border-slate-900 opacity-60"
            )}>
              <div class="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">
                {artifact.icon}
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-1">
                  <h3 class="text-xl font-bold tracking-widest text-cyan-400">{artifact.name}</h3>
                  <Show when={!isUnlocked}>
                    <Icon path={mdiLock} class="w-4 h-4 text-slate-500" />
                  </Show>
                </div>
                <p class="text-sm text-slate-400 leading-relaxed">{artifact.description}</p>
                <div class="mt-3 text-xs text-amber-500/70 font-bold uppercase tracking-widest">
                  专属技能: {artifact.skillName}
                </div>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );

  const renderClues = () => (
    <div class="flex flex-col gap-4 p-4">
      <For each={Object.values(CLUE_LIBRARY)}>
        {(clue) => {
          const isDiscovered = gameState.playerData.discoveredClues.includes(clue.id) || true; // Force true for dev
          return (
            <div class={clsx(
              "p-5 rounded-lg border flex items-start gap-5 transition-all duration-300",
              isDiscovered ? "bg-slate-900/40 border-slate-800" : "bg-slate-950 border-slate-900/50 opacity-40"
            )}>
              <div class="w-12 h-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                {isDiscovered ? clue.icon : "?"}
              </div>
              <div>
                <h3 class={clsx("font-bold tracking-widest mb-1", isDiscovered ? "text-amber-200" : "text-slate-500")}>
                  {isDiscovered ? clue.name : "未知线索"}
                </h3>
                <p class="text-xs text-slate-400 leading-relaxed italic">
                  {isDiscovered ? clue.description : "在塔内探索以发现这份情报。"}
                </p>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );

  return (
    <div class="w-full h-full bg-[#050508] text-slate-200 flex flex-col font-sans select-none overflow-hidden relative">
      {/* Header */}
      <div class="flex-none h-16 border-b border-slate-800/50 bg-slate-900/50 flex items-center justify-between px-6 z-10">
        <div class="flex items-center gap-4">
          <button
            onClick={() => setGameState("appState", AppState.MENU)}
            class="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Icon path={mdiArrowLeft} class="w-5 h-5" />
            <span class="font-bold tracking-widest text-sm">返回</span>
          </button>
          <div class="h-6 w-px bg-slate-700/50"></div>
          <h1 class="text-xl font-bold tracking-widest text-cyan-400/90 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
            秘闻录
          </h1>
        </div>
      </div>

      <div class="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div class="w-64 border-r border-slate-800/50 bg-slate-900/30 flex flex-col p-4 gap-2">
          <button
            onClick={() => setActiveTab("relic")}
            class={clsx(
              "flex items-center gap-3 p-4 rounded-lg border transition-all duration-300",
              activeTab() === "relic"
                ? "bg-cyan-900/20 border-cyan-500/50 text-cyan-200 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
            )}
          >
            <Icon path={mdiBookOpenPageVariant} class="w-5 h-5" />
            <span class="font-bold tracking-widest text-sm">奇珍一览</span>
          </button>
          
          <button
            onClick={() => setActiveTab("artifact")}
            class={clsx(
              "flex items-center gap-3 p-4 rounded-lg border transition-all duration-300",
              activeTab() === "artifact"
                ? "bg-cyan-900/20 border-cyan-500/50 text-cyan-200 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
            )}
          >
            <Icon path={mdiBagPersonal} class="w-5 h-5" />
            <span class="font-bold tracking-widest text-sm">法器一览</span>
          </button>

          <button
            onClick={() => setActiveTab("clue")}
            class={clsx(
              "flex items-center gap-3 p-4 rounded-lg border transition-all duration-300",
              activeTab() === "clue"
                ? "bg-cyan-900/20 border-cyan-500/50 text-cyan-200 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
            )}
          >
            <Icon path={mdiImageFilterCenterFocus} class="w-5 h-5" />
            <span class="font-bold tracking-widest text-sm">线索拼凑</span>
          </button>
        </div>

        {/* Content Area */}
        <div class="flex-1 flex overflow-hidden relative">
          {/* Main List */}
          <div class="flex-1 overflow-y-auto bg-slate-950/20">
            <Show when={activeTab() === "relic"}>{renderRelics()}</Show>
            <Show when={activeTab() === "artifact"}>{renderArtifacts()}</Show>
            <Show when={activeTab() === "clue"}>{renderClues()}</Show>
          </div>

          {/* Details Sidebar (for Relics) */}
          <Show when={activeTab() === "relic" && selectedItem()}>
            <div class="w-80 border-l border-slate-800/50 bg-slate-900/40 p-6 flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300">
              <div class="flex flex-col items-center gap-4 text-center">
                <div class="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-6xl shadow-2xl">
                  {selectedItem()?.icon}
                </div>
                <div>
                  <h2 class="text-2xl font-bold tracking-widest text-amber-200">{selectedItem()?.name}</h2>
                  <div class={clsx(
                    "text-[10px] font-black tracking-[0.3em] uppercase mt-1 px-2 py-0.5 rounded border inline-block",
                    selectedItem()?.rarity === 'RARE' ? "text-purple-400 border-purple-500/30 bg-purple-500/10" :
                    selectedItem()?.rarity === 'UNCOMMON' ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" :
                    "text-slate-400 border-slate-500/30 bg-slate-500/10"
                  )}>
                    {selectedItem()?.rarity}
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <Icon path={mdiInformationOutline} class="w-4 h-4" />
                    效果描述
                  </div>
                  <p class="text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-4 rounded border border-slate-800/50">
                    {selectedItem()?.description}
                  </p>
                </div>

                <Show when={selectedItem()?.family}>
                  <div class="flex items-center justify-between p-3 bg-slate-800/30 rounded border border-slate-700/50">
                    <span class="text-xs text-slate-500 font-bold tracking-widest uppercase">归属家族</span>
                    <span class="text-xs text-amber-500/80 font-black">{selectedItem()?.family}</span>
                  </div>
                </Show>
              </div>

              <div class="mt-auto pt-6 border-t border-slate-800/50 text-[10px] text-slate-600 font-mono uppercase tracking-widest text-center">
                ID: {selectedItem()?.id}
              </div>
            </div>
          </Show>

          <Show when={!selectedItem() && activeTab() === "relic"}>
            <div class="w-80 border-l border-slate-800/50 bg-slate-900/40 flex flex-col items-center justify-center p-8 text-center gap-4">
              <Icon path={mdiBookOpenPageVariant} class="w-12 h-12 text-slate-700 opacity-50" />
              <p class="text-xs text-slate-600 font-bold uppercase tracking-[0.2em]">请选择一个奇珍以查看详情</p>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
