import { Component, createSignal } from "solid-js";
import { startRun } from "../store";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { Icon } from "../../../../../common/Icon";
import { mdiSword, mdiBookOpenPageVariant, mdiBagPersonal } from "@mdi/js";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

export const MainMenu: Component = () => {
  const [hoveredBtn, setHoveredBtn] = createSignal<string | null>(null);

  return (
    <div class="w-full h-full relative flex flex-col items-center justify-center overflow-hidden bg-[#050508] font-sans text-slate-200 select-none">
      <BackgroundEffect
        theme="mystic"
        speed={0.3}
        intensity={1.0}
        direction={[0.1, 0.1]}
      />

      <style>{`
        .clip-cut {
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
          pointer-events: none;
        }
        .title-glow {
          text-shadow: 0 0 20px rgba(251, 191, 36, 0.3), 0 0 40px rgba(251, 191, 36, 0.1);
        }
      `}</style>

      {/* Decorative scanline overlay */}
      <div class="absolute inset-0 scanline z-20"></div>

      <div
        class={clsx(
          "relative z-30 flex flex-col items-center w-full max-w-md p-8",
          isMobileDevice ? "gap-8" : "gap-16"
        )}
      >
        {/* Title Section */}
        <div class="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-8 duration-1000">
          <h1 class="text-7xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-yellow-600 title-glow relative">
            长生塔
            <div class="absolute -inset-1 blur-2xl bg-amber-500/20 rounded-full z-[-1]"></div>
          </h1>
          <div class="flex items-center gap-4 text-cyan-500/60 font-mono text-sm tracking-[0.5em] uppercase">
            <div class="h-[1px] w-12 bg-gradient-to-r from-transparent to-cyan-500/60"></div>
            <span>Longevity Tower</span>
            <div class="h-[1px] w-12 bg-gradient-to-l from-transparent to-cyan-500/60"></div>
          </div>
        </div>

        {/* Menu Buttons */}
        <div class="flex flex-col gap-5 w-full">
          {/* Start Game Button */}
          <button
            onClick={() => startRun()}
            onMouseEnter={() => setHoveredBtn("start")}
            onMouseLeave={() => setHoveredBtn(null)}
            class="group relative h-16 w-full clip-cut transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div
              class={`absolute inset-0 bg-gradient-to-r transition-all duration-300 ${
                hoveredBtn() === "start"
                  ? "from-amber-900/80 via-amber-800/80 to-amber-900/80 border-amber-500/50"
                  : "from-slate-900/80 via-slate-800/80 to-slate-900/80 border-slate-700/50"
              } border backdrop-blur-sm`}
            ></div>

            {/* Animated border glow */}
            <div
              class={`absolute inset-0 transition-opacity duration-300 ${
                hoveredBtn() === "start" ? "opacity-100" : "opacity-0"
              }`}
            >
              <div class="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
              <div class="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
            </div>

            <div class="relative flex items-center justify-center gap-3 h-full px-8">
              <Icon
                path={mdiSword}
                class={`w-6 h-6 transition-colors duration-300 ${
                  hoveredBtn() === "start" ? "text-amber-300" : "text-slate-500"
                }`}
              />
              <span
                class={`text-xl font-bold tracking-widest transition-colors duration-300 ${
                  hoveredBtn() === "start"
                    ? "text-amber-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                    : "text-slate-400"
                }`}
              >
                开始游戏
              </span>
            </div>
          </button>

          {/* Secondary Buttons */}
          <div class="grid grid-cols-2 gap-4">
            {/* Compendium */}
            <button class="group relative h-14 clip-cut bg-slate-900/40 border border-slate-800 text-slate-600 cursor-not-allowed hover:bg-slate-800/40 transition-colors">
              <div class="flex items-center justify-center gap-2 h-full">
                <Icon
                  path={mdiBookOpenPageVariant}
                  class="w-5 h-5 opacity-50"
                />
                <span class="font-bold tracking-wider text-sm">秘闻录</span>
              </div>
            </button>

            {/* Preparation */}
            <button class="group relative h-14 clip-cut bg-slate-900/40 border border-slate-800 text-slate-600 cursor-not-allowed hover:bg-slate-800/40 transition-colors">
              <div class="flex items-center justify-center gap-2 h-full">
                <Icon path={mdiBagPersonal} class="w-5 h-5 opacity-50" />
                <span class="font-bold tracking-wider text-sm">战前整备</span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div class="absolute bottom-8 flex flex-col items-center gap-2 text-slate-600 text-xs font-mono">
          <div class="flex items-center gap-2 opacity-50">
            <span>v0.1.0</span>
            <span>•</span>
            <span>ROGUELIKE CARD GAME</span>
          </div>
        </div>
      </div>
    </div>
  );
};
