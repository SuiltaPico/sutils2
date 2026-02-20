import { createMemo, Show, For } from "solid-js";
import { CardData, identifyPattern, analyzeBuffs } from "../core";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

interface HandPreviewProps {
  selectedCards: CardData[];
  isAttackPhase: boolean;
}

export const HandPreview = (props: HandPreviewProps) => {
  const patternInfo = createMemo(() => identifyPattern(props.selectedCards));

  const buffs = createMemo(() => {
    if (!props.isAttackPhase) return null;
    return analyzeBuffs(props.selectedCards, patternInfo().name);
  });

  const buffTags = createMemo(() => {
    const b = buffs();
    if (!b) return [];
    const tags = [];
    if (b.trueDamage > 0)
      tags.push({
        label: "真伤",
        val: b.trueDamage,
        color: "text-purple-400 border-purple-500/30 bg-purple-950/40",
      });
    if (b.shield > 0)
      tags.push({
        label: "护盾",
        val: b.shield,
        color: "text-amber-400 border-amber-500/30 bg-amber-950/40",
      });
    if (b.heal > 0)
      tags.push({
        label: "回复",
        val: b.heal,
        color: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
      });
    if (b.cleanse > 0)
      tags.push({
        label: "净化",
        val: b.cleanse,
        color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/40",
      });
    if (b.poison > 0)
      tags.push({
        label: "中毒",
        val: b.poison,
        color: "text-lime-400 border-lime-500/30 bg-lime-950/40",
      });
    return tags;
  });

  return (
    <Show when={props.selectedCards.length > 0}>
      <div
        class={clsx(
          "absolute bottom-[calc(100%+32px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center w-max animate-in fade-in slide-in-from-bottom-2 duration-200",
          isMobileDevice
            ? ""
            : "gap-2"
        )}
      >
        {/* Sub: Buff Tags */}
        <Show when={buffTags().length > 0}>
          <div class="flex items-center gap-1.5 flex-wrap justify-center">
            <For each={buffTags()}>
              {(tag) => (
                <div
                  class={`px-2 py-0.5 rounded-sm border text-xs font-bold font-mono tracking-tight shadow-sm flex items-center gap-1.5 ${tag.color}`}
                >
                  <span>{tag.label}</span>
                  <span class="opacity-80">{tag.val}</span>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Main: Pattern (Multiplier) */}
        <div class="px-5 py-0 flex items-center gap-3">
          <span
            class={`text-lg font-bold tracking-widest ${
              patternInfo().name === "无效牌型"
                ? "text-slate-500"
                : "text-slate-100"
            }`}
          >
            {patternInfo().name}
          </span>
          <Show when={patternInfo().name !== "无效牌型"}>
            <span class="text-xl font-black text-amber-400 font-mono tracking-tighter drop-shadow-md">
              <span class="text-sm opacity-60 mr-0.5">x</span>
              {patternInfo().multiplier}
            </span>
          </Show>
          <Show when={patternInfo().name === "无效牌型"}>
            <span class="text-xs text-red-400 font-mono bg-red-950/30 px-1.5 py-0.5 rounded border border-red-500/20">
              无效
            </span>
          </Show>
        </div>
      </div>
    </Show>
  );
};
