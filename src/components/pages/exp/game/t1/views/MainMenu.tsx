import { Component, createSignal, Show, For } from "solid-js";
import { gameState, setGameState } from "../store";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { Icon } from "../../../../../common/Icon";
import { mdiSword, mdiBookOpenPageVariant, mdiBagPersonal, mdiDatabase } from "@mdi/js";
import { AppState } from "../types";
import { DifficultySelection } from "../components/DifficultySelection";
import { ARTIFACTS } from "../artifacts";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

interface MenuButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  class?: string;
  iconClass?: string;
}

const MenuButton: Component<MenuButtonProps> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      class={clsx(
        "group relative w-full transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]",
        props.variant === "primary"
          ? isMobileDevice
            ? "h-16"
            : "h-20"
          : "h-16",
        props.class
      )}
    >
      {/* Button Background & Border */}
      <div
        class={clsx(
          "absolute inset-0 clip-cut transition-all duration-300 border backdrop-blur-md",
          props.variant === "primary"
            ? hovered()
              ? "bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
              : "bg-gradient-to-r from-slate-950/80 via-slate-900/80 to-slate-950/80 border-amber-900/50"
            : hovered()
            ? "bg-gradient-to-r from-slate-800/80 via-slate-700/80 to-slate-800/80 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            : "bg-gradient-to-r from-slate-900/60 via-slate-900/60 to-slate-900/60 border-slate-700/50"
        )}
      >
        {/* Interior Scanline/Texture */}
        <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%,transparent_100%)] bg-[length:4px_4px]"></div>
      </div>

      {/* Hover Glow Lines */}
      <Show when={hovered()}>
        <div class="absolute inset-0 pointer-events-none">
          <div
            class={clsx(
              "absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent",
              props.variant === "primary" ? "via-amber-300" : "via-cyan-300"
            )}
          ></div>
          <div
            class={clsx(
              "absolute bottom-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent",
              props.variant === "primary" ? "via-amber-300" : "via-cyan-300"
            )}
          ></div>
        </div>
      </Show>

      {/* Content */}
      <div class="relative flex items-center justify-center gap-4 h-full px-8 z-10">
        <Icon
          path={props.icon}
          class={clsx(
            "transition-all duration-300 filter drop-shadow-lg",
            props.variant === "primary"
              ? hovered()
                ? "text-amber-300 scale-110"
                : "text-amber-700/70"
              : hovered()
              ? "text-cyan-300 scale-110"
              : "text-slate-600",
            props.iconClass
          )}
          size={props.variant === "primary" ? 28 : 24}
        />
        <div class="flex flex-col items-start">
          <span
            class={clsx(
              "font-black tracking-[0.2em] transition-all duration-300 uppercase",
              props.variant === "primary" ? "text-2xl" : "text-base",
              hovered()
                ? props.variant === "primary"
                  ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-200 to-amber-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "text-cyan-100 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]"
                : "text-slate-400"
            )}
          >
            {props.label}
          </span>
          <Show when={props.variant === "primary"}>
             <span class={clsx(
               "text-[10px] tracking-[0.3em] font-mono transition-colors duration-300",
               hovered() ? "text-amber-400/60" : "text-slate-600"
             )}>
               START JOURNEY
             </span>
          </Show>
        </div>
      </div>
      
      {/* Corner Accents */}
      <div class={clsx("absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 transition-colors duration-300", 
        hovered() ? (props.variant === 'primary' ? 'border-amber-400' : 'border-cyan-400') : 'border-transparent')}></div>
      <div class={clsx("absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 transition-colors duration-300", 
        hovered() ? (props.variant === 'primary' ? 'border-amber-400' : 'border-cyan-400') : 'border-transparent')}></div>
      <div class={clsx("absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 transition-colors duration-300", 
        hovered() ? (props.variant === 'primary' ? 'border-amber-400' : 'border-cyan-400') : 'border-transparent')}></div>
      <div class={clsx("absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 transition-colors duration-300", 
        hovered() ? (props.variant === 'primary' ? 'border-amber-400' : 'border-cyan-400') : 'border-transparent')}></div>
    </button>
  );
};

export const MainMenu: Component = () => {
  const [showDifficultySelect, setShowDifficultySelect] = createSignal(false);

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
          clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
        }
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
          pointer-events: none;
        }
        .title-glow {
          text-shadow: 0 0 30px rgba(251, 191, 36, 0.4), 0 0 60px rgba(251, 191, 36, 0.2);
        }
        .bg-grid-pattern {
           background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
           linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
           background-size: 40px 40px;
        }
      `}</style>

      {/* Decorative scanline & grid overlay */}
      <div class="absolute inset-0 scanline z-20 opacity-20"></div>
      <div class="absolute inset-0 bg-grid-pattern z-10 pointer-events-none"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/80 z-10 pointer-events-none"></div>

      {/* Top Status Bar */}
      <div 
        class={clsx(
          "absolute top-0 inset-x-0 z-40 flex justify-end p-8 transition-all duration-700 delay-100 animate-in fade-in slide-in-from-top-4 duration-1000",
          showDifficultySelect() ? "blur-xl opacity-0 pointer-events-none translate-y-[-20px]" : "opacity-100"
        )}
      >
        <div class="flex items-start gap-4">
          {/* Awakening Points */}
          <div class="group relative">
            <div class="absolute inset-0 bg-amber-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="relative flex items-center gap-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 clip-cut hover:border-amber-500/50 transition-colors duration-300">
              <Icon path={mdiDatabase} class="text-amber-500/80 w-5 h-5" />
              <span class="font-mono text-xl font-black text-amber-400 leading-none drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]">
                {gameState.playerData.merits}
              </span>
            </div>
            {/* Decoration */}
            <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500/30"></div>
            <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/30"></div>
          </div>

          {/* Current Weapon */}
          <div class="group relative">
             <div class="absolute inset-0 bg-cyan-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
             <div class="relative flex items-center gap-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 clip-cut hover:border-cyan-500/50 transition-colors duration-300">
                <Icon path={mdiSword} class="text-cyan-500/80 w-5 h-5" />
                <span class="font-bold text-lg text-cyan-300 tracking-widest leading-none drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                  {ARTIFACTS[gameState.playerData.selectedArtifactId]?.name || "未选择"}
                </span>
             </div>
             {/* Decoration */}
             <div class="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-500/30"></div>
             <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-500/30"></div>
          </div>
        </div>
      </div>

      <div
        class={clsx(
          "relative z-30 flex flex-col items-center w-full p-8 transition-all duration-700",
          isMobileDevice ? "gap-12 max-w-84" : "gap-20 max-w-[500px]",
          showDifficultySelect()
            ? "blur-xl scale-95 opacity-0 pointer-events-none translate-y-10"
            : "opacity-100 translate-y-0"
        )}
      >
        {/* Title Section */}
        <div class="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-top-12 duration-1000">
          <div class="relative">
            <h1
              class={clsx(
                "font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-yellow-600 title-glow relative z-10",
                isMobileDevice ? "text-6xl" : "text-9xl"
              )}
            >
              长生塔
            </h1>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-amber-500/10 blur-[80px] rounded-full z-0 pointer-events-none"></div>
          </div>
          
          <div class="flex items-center gap-6 text-cyan-500/40 font-mono text-xs tracking-[0.8em] uppercase">
            <div class="h-px w-12 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
            <span class="drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">Longevity Tower</span>
            <div class="h-px w-12 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
          </div>
        </div>

        {/* Menu Buttons */}
        <div class="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <MenuButton
            label="开始游戏"
            icon={mdiSword}
            variant="primary"
            onClick={() => setShowDifficultySelect(true)}
          />

          <div class="grid grid-cols-2 gap-6">
            <MenuButton
              label="秘闻录"
              icon={mdiBookOpenPageVariant}
              onClick={() => setGameState("appState", AppState.COMPENDIUM)}
              iconClass="text-cyan-500/70"
            />
            <MenuButton
              label="战前整备"
              icon={mdiBagPersonal}
              onClick={() => setGameState("appState", AppState.PREPARATION)}
              iconClass="text-amber-500/70"
            />
          </div>
        </div>

        {/* Footer */}
        <div class="fixed bottom-8 flex flex-col items-center gap-2 text-slate-600 text-[10px] font-mono tracking-widest opacity-30 hover:opacity-60 transition-opacity">
          <div class="flex items-center gap-3">
            <span>VER 0.1.0</span>
            <span class="w-1 h-1 rounded-full bg-slate-700"></span>
            <span>STRATEGY ROGUELIKE</span>
            <span class="w-1 h-1 rounded-full bg-slate-700"></span>
            <span>EARLY ACCESS</span>
          </div>
        </div>
      </div>

      {/* Difficulty Selection Overlay */}
      <Show when={showDifficultySelect()}>
        <DifficultySelection onClose={() => setShowDifficultySelect(false)} />
      </Show>
    </div>
  );
};
