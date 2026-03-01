import { mdiChevronRight, mdiMenu } from "@mdi/js";
import clsx from "clsx";
import { Component, createMemo, createSignal, For } from "solid-js";
import { Icon } from "../../../../../common/Icon";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { PlayerStatus } from "../components/PlayerStatus";
import { completeCurrentNode, gameState, setGameState } from "../store";
import { AppState, PlayerState } from "../types";

export const RewardView: Component = () => {
  const [selectedRewardIds, setSelectedRewardIds] = createSignal<Set<string>>(
    new Set()
  );

  const directRewards = createMemo(() =>
    gameState.pendingRewards.filter(
      (r) => r.type === "GOLD" || r.type === "RELIC"
    )
  );

  const optionalRewards = createMemo(() =>
    gameState.pendingRewards.filter((r) => r.type === "CARD")
  );

  const toggleReward = (id: string) => {
    const newSet = new Set(selectedRewardIds());
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      // For cards, let's limit to 1 (traditional rogue-like style)
      // Actually, let's allow multiple if the game design allows, but usually it's "pick one"
      // Based on the image "可选拿走的资源", it seems like a list.
      newSet.add(id);
    }
    setSelectedRewardIds(newSet);
  };

  const handleConfirm = () => {
    const selected = gameState.pendingRewards.filter(
      (r) => r.type !== "CARD" || selectedRewardIds().has(r.id)
    );

    // Apply rewards to state
    selected.forEach((reward) => {
      if (reward.type === "GOLD" && reward.amount) {
        setGameState("run", "gold", (g) => g + (reward.amount || 0));
      } else if (reward.type === "CARD" && reward.cardData) {
        setGameState("run", "deck", (d) => [...d, reward.cardData!]);
      } else if (reward.type === "RELIC") {
        setGameState("run", "relics", (r) => [...r, reward.relicId || reward.name]);
      }
    });

    completeCurrentNode();
    setGameState("appState", AppState.MAP);
  };

  const playerState: PlayerState = {
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
    nextAttackBonus: 0,
    rageDuration: 0,
    damageReduction: 0,
    reductionDuration: 0,
  };

  return (
    <div class="w-full h-full relative flex flex-col overflow-hidden bg-[#050508] font-sans text-slate-200 select-none">
      <BackgroundEffect theme="default" intensity={1.2} />

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

      {/* Header Bar */}
      <div class="flex items-center justify-between w-full p-3 py-1.5 z-20 relative bg-slate-950/60 backdrop-blur-md border-b border-white/10">
        <div class="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

        <div class="flex flex-col gap-4 w-64">
          <PlayerStatus player={playerState} />
        </div>

        <div class="flex flex-col items-center gap-1 min-w-[160px] relative">
          <div class="text-2xl font-black italic tracking-widest text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">
            战斗胜利
          </div>
          <div class="absolute -left-8 top-1/2 w-8 h-[1px] bg-gradient-to-r from-transparent to-amber-500/30"></div>
          <div class="absolute -right-8 top-1/2 w-8 h-[1px] bg-gradient-to-l from-transparent to-amber-500/30"></div>
        </div>

        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-sm flex items-center gap-2 transition-all group backdrop-blur-sm"
            onClick={() => {}}
          >
            <span class="text-sm font-bold tracking-widest text-slate-400 group-hover:text-cyan-400">
              菜单
            </span>
            <Icon
              path={mdiMenu}
              size={18}
              class="text-slate-500 group-hover:text-cyan-400"
            />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div class="flex-1 w-full flex gap-6 p-6 overflow-hidden relative z-10 scanline">
        {/* Left Panel: Direct Rewards */}
        <div class="flex-1 flex flex-col">
          <div class="flex-1 bg-slate-900/40 rounded-lg border border-slate-800/50 flex flex-col backdrop-blur-sm relative overflow-hidden clip-cut cyber-border">
            <div class="bg-slate-800/50 px-6 py-3 border-b border-slate-700/50 flex items-center gap-3">
              <div class="w-1 h-4 bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"></div>
              <h3 class="text-sm font-black tracking-[0.2em] text-slate-300 uppercase">
                直接获取的资源
              </h3>
            </div>

            <div class="flex-1 p-6 flex flex-col items-center justify-center gap-8 relative">
              <div class="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none"></div>

              <div class="flex flex-col gap-6 w-full max-w-md">
                <For each={directRewards()}>
                  {(reward) => (
                    <div class="flex items-center gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded group hover:border-cyan-500/30 transition-colors">
                      <div class="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform">
                        {reward.icon}
                      </div>
                      <div class="flex-1">
                        <div class="text-slate-200 font-bold tracking-wide">
                          {reward.name}
                        </div>
                        <div class="text-slate-500 text-sm mt-0.5">
                          {reward.description}
                        </div>
                      </div>
                      <div class="text-cyan-400 font-mono font-bold">
                        {reward.type === 'GOLD' ? `+${reward.amount}` : '已获取'}
                      </div>
                    </div>
                  )}
                </For>
              </div>

              <div class="text-slate-600 text-[10px] font-mono tracking-widest uppercase mt-4">
                这些资源已自动加入您的背包
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Optional Rewards */}
        <div class="flex-1 flex flex-col">
          <div class="flex-1 bg-slate-900/40 rounded-lg border border-slate-800/50 flex flex-col backdrop-blur-sm relative overflow-hidden clip-cut cyber-border">
            <div class="bg-slate-800/50 px-6 py-3 border-b border-slate-700/50 flex items-center gap-3">
              <div class="w-1 h-4 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
              <h3 class="text-sm font-black tracking-[0.2em] text-slate-300 uppercase">
                可选拿走的资源
              </h3>
            </div>

            <div class="flex-1 p-6 flex flex-col gap-4 relative">
              <div class="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none"></div>

              <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
                <For each={optionalRewards()}>
                  {(reward) => {
                    const isSelected = () => selectedRewardIds().has(reward.id);
                    return (
                      <div
                        class={clsx(
                          "flex items-center gap-4 p-4 bg-slate-950/60 border rounded transition-all cursor-pointer group",
                          isSelected()
                            ? "border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                            : "border-slate-800 hover:border-slate-600"
                        )}
                        onClick={() => toggleReward(reward.id)}
                      >
                        <div
                          class={clsx(
                            "w-12 h-12 flex items-center justify-center text-2xl bg-slate-900 rounded border border-slate-800 transition-colors",
                            isSelected()
                              ? "text-amber-400 border-amber-500/40"
                              : "text-slate-400"
                          )}
                        >
                          {reward.icon}
                        </div>
                        <div class="flex-1">
                          <div
                            class={clsx(
                              "font-bold tracking-wide transition-colors",
                              isSelected() ? "text-amber-400" : "text-slate-200"
                            )}
                          >
                            {reward.name}
                          </div>
                          <div class="text-slate-500 text-sm mt-0.5">
                            {reward.description}
                          </div>
                        </div>
                        <button
                          class={clsx(
                            "px-4 py-2 rounded-sm font-bold text-xs tracking-widest uppercase transition-all",
                            isSelected()
                              ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                          )}
                        >
                          {isSelected() ? "已选择" : "确认"}
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>

              <div class="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div class="text-xs text-slate-500 italic">
                  {selectedRewardIds().size === 0
                    ? "请选择您想要带走的战利品"
                    : `已选择 ${selectedRewardIds().size} 个项目`}
                </div>
                <button
                  class={clsx(
                    "px-8 py-3 rounded-sm font-black tracking-[0.2em] uppercase transition-all flex items-center gap-2",
                    selectedRewardIds().size > 0
                      ? "bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:scale-105 active:scale-95"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                  )}
                  onClick={handleConfirm}
                  disabled={selectedRewardIds().size === 0}
                >
                  <span>确定带走</span>
                  <Icon path={mdiChevronRight} size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
