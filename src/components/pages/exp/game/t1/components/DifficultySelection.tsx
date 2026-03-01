import { Component, createSignal, Show, For } from "solid-js";
import { gameState, startRun } from "../store";
import { Icon } from "../../../../../common/Icon";
import {
  mdiClose,
  mdiChevronUp,
  mdiChevronDown,
  mdiLock,
} from "@mdi/js";
import { Difficulty } from "../types";
import { DIFFICULTY_DATA } from "../constants";
import clsx from "clsx";

interface DifficultySelectionProps {
  onClose: () => void;
}

export const DifficultySelection: Component<DifficultySelectionProps> = (props) => {
  const [selectedDifficulty, setSelectedDifficulty] = createSignal<number>(0);

  const handleScroll = (e: WheelEvent) => {
    const maxUnlocked = gameState.playerData.maxUnlockedDifficulty || 0;
    if (e.deltaY < 0) {
      setSelectedDifficulty((prev) => Math.min(prev + 1, maxUnlocked));
    } else {
      setSelectedDifficulty((prev) => Math.max(prev - 1, 0));
    }
    e.preventDefault();
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
      <style>{`
        .diff-level-list {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .diff-level-list::-webkit-scrollbar {
          display: none;
        }
        .clip-cut {
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
      `}</style>
      <div class="w-full max-w-4xl h-[500px] flex gap-8 relative">
        {/* Left Side: Difficulty Details */}
        <div class="flex-1 flex flex-col justify-center gap-12 animate-in slide-in-from-left-8 duration-500">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-4">
              <span class="text-sm font-mono text-cyan-500 tracking-[0.3em] uppercase">
                异化层级
              </span>
              <div class="h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent"></div>
            </div>
            <h2
              class={clsx(
                "text-8xl font-black tracking-widest transition-all duration-300 italic",
                DIFFICULTY_DATA[selectedDifficulty()].color
              )}
            >
              {DIFFICULTY_DATA[selectedDifficulty()].name}
            </h2>
          </div>

          <div class="grid grid-cols-2 gap-4 max-w-sm">
            <div class="bg-slate-900/40 border border-slate-800 p-4 rounded-lg flex flex-col gap-1">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                敌人生命倍率
              </span>
              <span class="text-2xl font-mono text-cyan-400">
                x{DIFFICULTY_DATA[selectedDifficulty()].hpMult}
              </span>
            </div>
            <div class="bg-slate-900/40 border border-slate-800 p-4 rounded-lg flex flex-col gap-1">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                敌人伤害倍率
              </span>
              <span class="text-2xl font-mono text-rose-400">
                x{DIFFICULTY_DATA[selectedDifficulty()].dmgMult}
              </span>
            </div>
          </div>

          <div class="flex gap-4">
            <button
              onClick={() => startRun(selectedDifficulty() as Difficulty)}
              class="flex-1 h-16 clip-cut bg-amber-500/20 border border-amber-500/50 text-amber-200 font-bold tracking-[0.3em] hover:bg-amber-500/30 transition-all active:scale-95"
            >
              确认以此难度开启探索
            </button>
            <button
              onClick={() => props.onClose()}
              class="w-16 h-16 clip-cut bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-200 transition-all"
            >
              <Icon path={mdiClose} class="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Right Side: Difficulty Levels Vertical List */}
        <div
          class="w-96 flex flex-col items-center justify-center gap-4 relative diff-level-list"
          onWheel={handleScroll}
        >
          {/* Up/Down Indicators */}
          <div class="absolute top-2 text-cyan-500 animate-bounce">
            <Icon path={mdiChevronUp} class="w-8 h-8 opacity-30" />
          </div>
          <div class="absolute bottom-2 text-cyan-500 animate-bounce">
            <Icon path={mdiChevronDown} class="w-8 h-8 opacity-30" />
          </div>

          <div class="flex flex-col w-full gap-4 py-8">
            <For each={[...DIFFICULTY_DATA].reverse()}>
              {(diff) => {
                const isSelected = () => selectedDifficulty() === diff.id;
                const isUnlocked =
                  diff.id <=
                  (gameState.playerData.maxUnlockedDifficulty || 0);
                const distance = Math.abs(selectedDifficulty() - diff.id);

                return (
                  <button
                    onClick={() =>
                      isUnlocked && setSelectedDifficulty(diff.id)
                    }
                    disabled={!isUnlocked}
                    class={clsx(
                      "transition-all duration-300 flex items-center gap-6 p-4 rounded-lg border text-left",
                      isSelected()
                        ? "bg-white/10 border-white/20 scale-105 opacity-100 shadow-[0_0_30px_rgba(255,255,255,0.05)]"
                        : distance === 1
                        ? "bg-white/5 border-transparent opacity-40 scale-100"
                        : "opacity-10 scale-90",
                      !isUnlocked && "grayscale cursor-not-allowed"
                    )}
                  >
                    <div class="flex flex-col items-center relative">
                      <span
                        class={clsx(
                          "text-3xl font-black font-mono leading-none",
                          isSelected() ? "text-white" : "text-slate-400"
                        )}
                      >
                        {diff.id}
                      </span>
                      {!isUnlocked && (
                        <div class="absolute -top-1 -right-1">
                          <Icon
                            path={mdiLock}
                            class="w-3 h-3 text-slate-500"
                          />
                        </div>
                      )}
                    </div>

                    <div class="flex-1 flex flex-col gap-1 overflow-hidden">
                      <span
                        class={clsx(
                          "font-bold tracking-widest text-sm",
                          isSelected() ? "text-amber-200" : "text-slate-500"
                        )}
                      >
                        {isUnlocked ? diff.name : "锁定"}
                      </span>
                      <Show
                        when={
                          isSelected() || (distance === 1 && isUnlocked)
                        }
                      >
                        <p
                          class={clsx(
                            "text-[10px] leading-tight line-clamp-2 italic",
                            isSelected()
                              ? "text-slate-300"
                              : "text-slate-600"
                          )}
                        >
                          {isUnlocked ? diff.extra : "通关上一异化层级解锁"}
                        </p>
                      </Show>
                    </div>

                    <Show when={isSelected()}>
                      <div class="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,1)]"></div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        {/* Hint Text */}
        <div class="absolute -bottom-12 left-0 right-0 text-center text-[10px] text-slate-600 font-mono tracking-widest uppercase opacity-50">
          使用鼠标滚轮或点击右侧数字切换异化层级
        </div>
      </div>
    </div>
  );
};
