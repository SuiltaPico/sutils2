import { Component, For, Show } from "solid-js";
import { gameState, setGameState } from "../store";
import { AppState, MapNode, PlayerState } from "../types";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { PlayerStatus } from "../components/PlayerStatus";
import { Icon } from "../../../../../common/Icon";
import {
  mdiBagPersonal,
  mdiCards,
  mdiExitToApp,
  mdiHeart,
  mdiSwordCross,
  mdiSkull,
  mdiHelp,
  mdiCampfire,
  mdiCrown,
  mdiClose,
} from "@mdi/js";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

export const MapView: Component = () => {
  const handleNodeClick = (node: MapNode) => {
    if (node.status === "LOCKED") return;

    if (
      node.type === "BATTLE" ||
      node.type === "ELITE" ||
      node.type === "BOSS"
    ) {
      setGameState("appState", AppState.BATTLE);
    } else {
      setGameState("appState", AppState.EVENT);
    }

    setGameState("run", "currentNodeId", node.id);
  };

  // Helper to generate curved paths for connections
  const getPath = (n1: MapNode, n2: MapNode) => {
    // Assuming Left-to-Right flow.
    // We want the line to exit from the right of n1 and enter the left of n2.
    // But coordinates are centers.
    // Let's just use centers for simplicity of SVG, or adjust if nodes have size.
    // With percentages, it's easier to use centers.

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;

    // Curvature factor
    const tension = 0.5;

    // Control points for a horizontal S-curve
    const cp1x = n1.x + dx * tension;
    const cp1y = n1.y;
    const cp2x = n2.x - dx * tension;
    const cp2y = n2.y;

    return `M ${n1.x} ${n1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${n2.x} ${n2.y}`;
  };

  return (
    <div class="w-full h-full relative flex flex-col overflow-hidden bg-[#050508] font-sans text-slate-200 select-none">
      <BackgroundEffect
        theme="default"
        speed={0.2}
        intensity={0.8}
        direction={[0.05, 0.05]}
      />

      {/* Reusing styles from Battle.tsx for consistency */}
      <style>{`
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
        }
        .node-hover:hover {
          filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5));
        }
      `}</style>

      {/* Header Bar */}
      <div class="flex items-center justify-between w-full p-3 py-1.5 z-20 relative">
        {/* Left: Player Info & Menu */}
        <div class="flex flex-col gap-4 w-40">
          {/* Player Status Panel */}
          <PlayerStatus
            player={{
              id: "player",
              name: "玩家",
              hp: gameState.run.playerHp,
              maxHp: gameState.run.playerMaxHp,
              shield: 0,
              poisonStacks: 0,
              hand: [],
              deck: gameState.run.deck,
              discardPile: [],
              selectedIds: new Set(),
              lastAction: null,
            }}
          />
        </div>

        {/* Center: Title */}
        <div class="flex flex-col items-center rounded-full backdrop-blur-sm">
          第 {gameState.run.currentFloor} 层
        </div>

        {/* Right: Exit */}
        <button
          class={clsx(
            "bg-slate-900/60 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 text-slate-400 hover:text-red-400 rounded-sm flex items-center gap-2 transition-all backdrop-blur-sm",
            isMobileDevice ? "px-2 py-1.5" : "px-4 py-2"
          )}
          onClick={() => {
            if (confirm("确定要离开吗？")) {
              setGameState("appState", AppState.MENU);
            }
          }}
        >
          <span class="text-sm font-bold tracking-widest">离开</span>
          <Icon path={mdiExitToApp} size={18} />
        </button>
      </div>

      {/* Main Map Area */}
      <div class="flex-1 w-full relative">
        {/* Floating Action Buttons */}
        <div
          class={clsx(
            "absolute z-30 flex flex-col gap-3",
            isMobileDevice ? "top-3 left-3" : "top-6 left-6"
          )}
        >
          <button
            class={clsx(
              "bg-slate-900/80 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-sm flex items-center justify-center transition-all group backdrop-blur-sm shadow-lg hover:scale-105",
              isMobileDevice ? "w-10 h-10" : "w-12 h-12"
            )}
            title="背包"
          >
            <div class="text-slate-400 group-hover:text-emerald-400 transition-colors">
              <Icon path={mdiBagPersonal} size={isMobileDevice ? 20 : 24} />
            </div>
          </button>
          <button
            class={clsx(
              "bg-slate-900/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-sm flex items-center justify-center transition-all group backdrop-blur-sm shadow-lg hover:scale-105",
              isMobileDevice ? "w-10 h-10" : "w-12 h-12"
            )}
            title="牌组"
          >
            <div class="text-slate-400 group-hover:text-cyan-400 transition-colors">
              <Icon path={mdiCards} size={isMobileDevice ? 20 : 24} />
            </div>
          </button>
        </div>

        <div class="absolute inset-0 overflow-auto scanline flex items-center justify-center">
          <div class="relative w-[90%] h-[80%] max-w-6xl">
            {/* Render Connections */}
            <svg
              class="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="4"
                  markerHeight="7"
                  refX="15"
                  refY="2"
                  orient="auto"
                >
                  <polygon points="0 0, 4 3.5, 0 7" fill="#fff" />
                </marker>
              </defs>
              <For each={gameState.run.map}>
                {(node) => (
                  <For each={node.next}>
                    {(nextId) => {
                      const nextNode = gameState.run.map.find(
                        (n) => n.id === nextId
                      );
                      if (!nextNode) return null;
                      return (
                        <path
                          d={getPath(node, nextNode)}
                          fill="none"
                          stroke="#fff"
                          stroke-width="0.3"
                          stroke-dasharray="1 1"
                          marker-end="url(#arrowhead)"
                          class="opacity-60"
                        />
                      );
                    }}
                  </For>
                )}
              </For>
            </svg>

            {/* Render Nodes */}
            <For each={gameState.run.map}>
              {(node) => (
                <button
                  onClick={() => handleNodeClick(node)}
                  disabled={node.status === "LOCKED"}
                  class={clsx(
                    `absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300 transform`,
                    node.status === "LOCKED"
                      ? "grayscale cursor-not-allowed"
                      : "node-hover cursor-pointer",
                    node.status === "AVAILABLE"
                      ? "animate-pulse scale-105 z-10"
                      : "",
                    node.status === "CURRENT" ? "scale-110 z-20" : "",
                    isMobileDevice ? "w-8 h-8" : "w-14 h-14"
                  )}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  {/* Node Box Styling */}
                  <div
                    class={`
                  w-full h-full border-2 transform rotate-45 flex items-center justify-center shadow-lg transition-colors duration-300
                  ${
                    node.status === "LOCKED"
                      ? "bg-slate-900 border-slate-700"
                      : ""
                  }
                  ${
                    node.status === "AVAILABLE"
                      ? "bg-amber-950/80 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                      : ""
                  }
                  ${
                    node.status === "COMPLETED"
                      ? "bg-slate-800 border-slate-500"
                      : ""
                  }
                  ${
                    node.status === "CURRENT"
                      ? "bg-cyan-950/80 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                      : ""
                  }
                `}
                  >
                    {/* Inner Icon (Counter-rotated) */}
                    <div
                      class={`transform -rotate-45 transition-colors duration-300
                    ${node.status === "LOCKED" ? "text-slate-600" : ""}
                    ${
                      node.status === "AVAILABLE"
                        ? "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]"
                        : ""
                    }
                    ${node.status === "COMPLETED" ? "text-slate-500" : ""}
                    ${
                      node.status === "CURRENT"
                        ? "text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]"
                        : ""
                    }
                  `}
                    >
                      <Show when={node.type === "BATTLE"}>
                        <Icon
                          path={mdiSwordCross}
                          size={isMobileDevice ? 16 : 24}
                        />
                      </Show>
                      <Show when={node.type === "ELITE"}>
                        <Icon path={mdiSkull} size={isMobileDevice ? 16 : 24} />
                      </Show>
                      <Show when={node.type === "BOSS"}>
                        <Icon path={mdiCrown} size={isMobileDevice ? 16 : 24} />
                      </Show>
                      <Show when={node.type === "EVENT"}>
                        <Icon path={mdiHelp} size={isMobileDevice ? 16 : 24} />
                      </Show>
                      <Show when={node.type === "REST"}>
                        <Icon
                          path={mdiCampfire}
                          size={isMobileDevice ? 16 : 24}
                        />
                      </Show>
                    </div>

                    {/* Completed Overlay */}
                    <Show when={node.status === "COMPLETED"}>
                      <div class="absolute inset-0 flex items-center justify-center transform -rotate-45">
                        <Icon
                          path={mdiClose}
                          size={32}
                          class="text-slate-500/50"
                        />
                      </div>
                    </Show>
                  </div>

                  {/* Label (Optional, showing below node) */}
                  <Show
                    when={
                      node.status === "CURRENT" || node.status === "AVAILABLE"
                    }
                  >
                    <div
                      class={clsx(
                        "absolute text-[10px] whitespace-nowrap font-mono font-bold tracking-widest px-2 py-0.5 bg-black/80 rounded text-slate-300 pointer-events-none",
                        isMobileDevice ? "top-11" : "top-16"
                      )}
                    >
                      {node.type}
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
