import { For, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { RendererProvider } from "../providers/RendererProvider";
import FeatureLoader from "../providers/FeatureLoader";
import { createAppStore } from "../../core/state/createAppStore";
import { createClock } from "../../core/time/clock";
import PerformancePanel from "../ui/components/panels/PerformancePanel";
import MiniBarChart from "../ui/components/charts/MiniBarChart";
import LayerToggles from "../ui/components/panels/LayerToggles";
import { attachPointer } from "../../platform/input/pointer";
import { attachKeyboard } from "../../platform/input/keyboard";
import { BLOCK_PRESETS, DEFAULT_BLOCK_PRESET_ID } from "../../features/editor/presets";
import { featuresManifest } from "../../core/config/features.manifest";
import BlockLibrary from "../../features/blocks/ui/panels/BlockLibrary";
import RoadEditor from "../../features/roads/ui/panels/RoadEditor";
import IntersectionPanel from "../../features/intersections/ui/panels/IntersectionPanel";
import GraphInspector from "../../features/traffic/ui/panels/GraphInspector";
import VehicleInspector from "../../features/traffic/ui/panels/VehicleInspector";
import TrafficControls from "../../features/traffic/ui/panels/TrafficControls";
import { selectVehicleAtWorld } from "../../features/traffic";
import { MetricsAggregator } from "../../features/analytics/systems/metrics";

export default function AppShell() {
  const app = createAppStore();
  const [fps, setFps] = createSignal(0);
  const [simHz, setSimHz] = createSignal(0);
  const [rendererMs, setRendererMs] = createSignal<number | undefined>(undefined);
  const [simMs, setSimMs] = createSignal<number | undefined>(undefined);
  const [rendererP50, setRendererP50] = createSignal<number | undefined>(undefined);
  const [rendererP95, setRendererP95] = createSignal<number | undefined>(undefined);
  const [simP50, setSimP50] = createSignal<number | undefined>(undefined);
  const [simP95, setSimP95] = createSignal<number | undefined>(undefined);
  const [rendererSampleCount, setRendererSampleCount] = createSignal<number>(0);
  const [simSampleCount, setSimSampleCount] = createSignal<number>(0);
  const [layerCount, setLayerCount] = createSignal<number | undefined>(undefined);
  const [hz, setHz] = createSignal(10);
  type PerfSample = { ts: number; fps: number; simHz: number; rendererP50?: number; rendererP95?: number; simP50?: number; simP95?: number };
  const [perfHistory, setPerfHistory] = createSignal<PerfSample[]>([]);

  let rafId = 0;
  let lastTs = performance.now();
  let frames = 0;
  let simTicks = 0;

  const loop = (ts: number) => {
    frames += 1;
    if (ts - lastTs >= 1000) {
      setFps(frames);
      setSimHz(simTicks);
      frames = 0;
      simTicks = 0;
      lastTs = ts;
    }
    rafId = requestAnimationFrame(loop);
  };

  onMount(() => {
    rafId = requestAnimationFrame(loop);
    clock.start();
  });
  onCleanup(() => {
    cancelAnimationFrame(rafId);
    clock.stop();
  });

  const scaleLabel = createMemo(() => (app.time.paused ? "暂停" : `${app.time.scale}x`));
  const activeTool = createMemo(() => app.editor.activeTool);
  const activeBlockPresetId = createMemo(() => app.editor.blockPresetId);

  const [renderer, setRenderer] = createSignal<import("../../platform/render/RendererRegistry").IRenderer | null>(null);
  let containerEl: HTMLDivElement | null = null;
  const [pointer, setPointer] = createSignal<{ x: number; y: number } | null>(null);
  let isPanning = false;
  let lastPanPos: { x: number; y: number } | null = null;
  const clock = createClock({
    getPaused: () => app.time.paused,
    getScale: () => app.time.scale,
    hz: hz(),
  });

  // 时钟驱动最小重绘
  const metrics = new MetricsAggregator();
  clock.onTick((dtSec) => {
    const t0 = performance.now();
    simTicks += 1;
    renderer()?.requestFrame();
    const t1 = performance.now();
    metrics.addSim(t1 - t0);
    try {
      window.dispatchEvent(new CustomEvent("urbanflow:simTick", { detail: { dtSec } }));
    } catch {}
  });

  // 注册十字准星图层
  createEffect(() => {
    const r = renderer();
    if (!r) return;
    r.registerLayer("ui.crosshair", ({ ctx, width, height }) => {
      if (!app.layers.isVisible("ui.crosshair")) return;
      const alpha = app.layers.getOpacity("ui.crosshair");
      const p = pointer();
      if (!p) return;
      ctx.save();
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#66ccff55";
      ctx.lineWidth = 1;
      // 横线
      ctx.beginPath();
      ctx.moveTo(0, p.y + 0.5);
      ctx.lineTo(width, p.y + 0.5);
      ctx.stroke();
      // 竖线
      ctx.beginPath();
      ctx.moveTo(p.x + 0.5, 0);
      ctx.lineTo(p.x + 0.5, height);
      ctx.stroke();
      // 坐标读数
      const label = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
      ctx.fillStyle = "#cfe9ff";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas";
      const pad = 6;
      const tw = ctx.measureText(label).width;
      const th = 14;
      const bx = Math.min(width - tw - pad * 2 - 4, Math.max(4, p.x + 8));
      const by = Math.min(height - th - pad * 2 - 4, Math.max(4, p.y + 8));
      ctx.fillStyle = "#0b1020aa";
      ctx.fillRect(bx, by, tw + pad * 2, th + pad * 2);
      ctx.fillStyle = "#cfe9ff";
      ctx.fillText(label, bx + pad, by + pad + th - 4);
      ctx.globalAlpha = prevAlpha;
      ctx.restore();
    });
  });

  createEffect(() => {
    // 触发重绘
    app.layers.all();
    renderer()?.requestFrame();
  });

  // 同步图层显隐与顺序给渲染器
  createEffect(() => {
    const r = renderer();
    if (!r) return;
    const all = app.layers.all();
    for (const [id, meta] of Object.entries(all)) {
      r.setLayerVisible(id, !!meta.visible);
      r.setOrder(id, meta.order ?? 0);
    }
    r.requestFrame();
  });

  // 每秒统计一次模拟/渲染耗时
  createEffect(() => {
    // 依赖 fps 刷新周期（每秒）
    fps();
    const snap = metrics.flush();
    setSimMs(snap.simAvgMs);
    setSimP50(snap.simP50);
    setSimP95(snap.simP95);
    setSimSampleCount(snap.simCount);
    setRendererP50(snap.rendererP50);
    setRendererP95(snap.rendererP95);
    setRendererSampleCount(snap.rendererCount);
    // 聚合历史样本（每秒一条）
    setPerfHistory((prev) => {
      const next = prev.slice();
      next.push({
        ts: Date.now(),
        fps: fps(),
        simHz: simHz(),
        rendererP50: rendererP50(),
        rendererP95: rendererP95(),
        simP50: simP50(),
        simP95: simP95(),
      });
      const MAX = 300; // 最多保留 5 分钟（若 1Hz 聚合）
      while (next.length > MAX) next.shift();
      return next;
    });
  });

  return (
    <div class="w-full h-full flex flex-col">
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <span class="font-semibold">UrbanFlow 原型</span>
          <span class="text-xs opacity-70">FPS {fps()} · Sim {simHz()} Hz</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-2 py-1 border rounded" onClick={() => app.time.pause()}>暂停</button>
          <button class="px-2 py-1 border rounded" onClick={() => app.time.resume()}>播放</button>
          <button class="px-2 py-1 border rounded" onClick={() => app.time.setScale(0.5)}>0.5x</button>
          <button class="px-2 py-1 border rounded" onClick={() => app.time.setScale(1)}>1x</button>
          <button class="px-2 py-1 border rounded" onClick={() => app.time.setScale(2)}>2x</button>
          <span class="text-sm opacity-70">{scaleLabel()}</span>
        </div>
      </div>
      <div class="flex flex-1 min-h-0">
        <div class="w-12 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-2 gap-2">
          <div class="flex flex-col items-stretch gap-2 w-full px-1">
            <button
              class="px-2 py-1 text-xs border rounded"
              classList={{ "bg-slate-900 text-white": activeTool() === "select" }}
              onClick={() => {
                app.editor.setActiveTool("select");
                renderer()?.requestFrame();
              }}
            >
              选择
            </button>
            <button
              class="px-2 py-1 text-xs border rounded"
              classList={{ "bg-slate-900 text-white": activeTool() === "block" }}
              onClick={() => {
                if (!app.editor.blockPresetId) {
                  app.editor.setBlockPreset(DEFAULT_BLOCK_PRESET_ID);
                }
                app.editor.setActiveTool("block");
                renderer()?.requestFrame();
              }}
            >
              区块
            </button>
          </div>
          <div class="h-px w-8 bg-gray-200 dark:bg-gray-700" />
          <button class="px-2 py-1 text-xs border rounded" onClick={() => app.layers.toggle("world.grid")}>
            网格
          </button>
        </div>
        <div class="flex-1 min-h-0">
          <RendererProvider
            graphics={{ backend: "canvas2d" }}
            onReady={(r) => {
              setRenderer(r);
              r.onStats((s) => {
                setRendererMs(s.rendererMs);
                setLayerCount(s.layerCount);
                metrics.addRenderer(s.rendererMs);
              });
            }}
            onContainerReady={(el) => {
              containerEl = el;
              const toWorld = (sx: number, sy: number) => {
                const s = app.view.scale;
                const off = app.view.offset;
                return { worldX: (sx - off.x) / s, worldY: (sy - off.y) / s };
              };
              const detachPointer = attachPointer(el, toWorld, {
                onMove: ({ screenX, screenY }) => {
                  setPointer({ x: screenX, y: screenY });
                  if (isPanning && lastPanPos) {
                    const dx = screenX - lastPanPos.x;
                    const dy = screenY - lastPanPos.y;
                    app.view.panBy(dx, dy);
                    lastPanPos = { x: screenX, y: screenY };
                  }
                  renderer()?.requestFrame();
                },
                onDown: ({ button, screenX, screenY, ev }) => {
                  if (button === 1 || button === 2) {
                    isPanning = true;
                    try { el.setPointerCapture(ev.pointerId); } catch {}
                    lastPanPos = { x: screenX, y: screenY };
                  } else if (button === 0) {
                    // 左键：尝试拾取车辆
                    const w = toWorld(screenX, screenY);
                    selectVehicleAtWorld(w.worldX, w.worldY);
                    renderer()?.requestFrame();
                  }
                },
                onUp: ({ ev }) => {
                  if (isPanning) {
                    isPanning = false;
                    lastPanPos = null;
                    try { el.releasePointerCapture((ev as any).pointerId); } catch {}
                  }
                },
                onWheel: ({ screenX, screenY, deltaY }) => {
                  const factor = Math.exp(-deltaY * 0.0015);
                  const next = app.view.scale * factor;
                  app.view.zoomAt(screenX, screenY, next);
                  renderer()?.requestFrame();
                },
                onLeave: () => {
                  setPointer(null);
                  renderer()?.requestFrame();
                },
              });

              const detachKeyboard = attachKeyboard(window, {
                onKey: (ev) => {
                  if (ev.code === "Space") {
                    if (app.time.paused) app.time.resume(); else app.time.pause();
                  } else if (ev.key === "+" || ev.key === "=") {
                    const seq: (0.5 | 1 | 2 | 4 | 8)[] = [0.5, 1, 2, 4, 8];
                    const i = seq.indexOf(app.time.scale as any);
                    const next = seq[Math.min(seq.length - 1, i + 1)];
                    app.time.setScale(next);
                  } else if (ev.key === "-" || ev.key === "_") {
                    const seq: (0.5 | 1 | 2 | 4 | 8)[] = [0.5, 1, 2, 4, 8];
                    const i = seq.indexOf(app.time.scale as any);
                    const next = seq[Math.max(0, i - 1)];
                    app.time.setScale(next);
                  } else if (ev.key === "b" || ev.key === "B") {
                    if (!app.editor.blockPresetId) {
                      app.editor.setBlockPreset(DEFAULT_BLOCK_PRESET_ID);
                    }
                    app.editor.setActiveTool("block");
                    renderer()?.requestFrame();
                  } else if (ev.key === "v" || ev.key === "V") {
                    app.editor.setActiveTool("select");
                    renderer()?.requestFrame();
                  } else if (ev.key === "g" || ev.key === "G") {
                    app.layers.toggle("world.grid");
                    renderer()?.requestFrame();
                  } else if (ev.key === "t" || ev.key === "T") {
                    app.layers.toggle("traffic.debugGraph");
                    renderer()?.requestFrame();
                  }
                },
              });

              onCleanup(() => {
                detachPointer();
                detachKeyboard();
              });
            }}
          />
          {renderer() && containerEl && (
            <FeatureLoader renderer={renderer()!} app={app} container={containerEl} />
          )}
        </div>
        <div class="w-64 shrink-0 border-l border-gray-200 dark:border-gray-700 p-3 text-sm space-y-4">
          <LayerToggles app={app} onChangeOrder={() => renderer()?.requestFrame()} />
          <PerformancePanel
            perf={{
              fps: fps(),
              simHz: simHz(),
              rendererMs: rendererMs(),
              simMs: simMs(),
              layerCount: layerCount(),
              hz: hz(),
              rendererP50: rendererP50(),
              rendererP95: rendererP95(),
              simP50: simP50(),
              simP95: simP95(),
              rendererSamples: rendererSampleCount(),
              simSamples: simSampleCount(),
            }}
            history={perfHistory()}
            onSetHz={(v) => {
              setHz(v);
              clock.setHz(v);
            }}
            onExportCsv={() => {
              const rows = [
                ["ts","fps","simHz","rendererP50","rendererP95","simP50","simP95"].join(","),
                ...perfHistory().map((s) => [
                  new Date(s.ts).toISOString(),
                  s.fps,
                  s.simHz,
                  s.rendererP50 ?? "",
                  s.rendererP95 ?? "",
                  s.simP50 ?? "",
                  s.simP95 ?? "",
                ].join(","))
              ];
              const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `urbanflow-perf-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          />
          {featuresManifest.blocks && (
            <BlockLibrary onPick={(b) => {
              // 将库项映射为编辑器原型放置（使用 footprint 与 orientation）
              const [w, h] = b.footprint;
              app.editor.setPrototype({ id: b.id, category: b.category, wCells: w, hCells: h, orientation: b.orientation ?? 0 });
              app.editor.setActiveTool("block");
              renderer()?.requestFrame();
            }} />
          )}
          {featuresManifest.roads && (
            <RoadEditor />
          )}
          {featuresManifest.intersections && (
            <IntersectionPanel />
          )}
          {featuresManifest.traffic && (
            <>
              <GraphInspector />
              <TrafficControls app={app} />
              <VehicleInspector />
            </>
          )}
          <div>
            <div class="font-semibold mb-1">BlockTool 预设</div>
            <div class="space-y-1">
              <For each={BLOCK_PRESETS}>
                {(preset) => (
                  <button
                    class="w-full px-2 py-1 border rounded text-left"
                    classList={{ "border-slate-900 bg-slate-900 text-white": activeBlockPresetId() === preset.id }}
                    onClick={() => {
                      if (activeBlockPresetId() !== preset.id) {
                        app.editor.setBlockPreset(preset.id);
                      }
                      if (app.editor.activeTool !== "block") {
                        app.editor.setActiveTool("block");
                      }
                      renderer()?.requestFrame();
                    }}
                    title={`${preset.label} · ${preset.span * 32}px`}
                  >
                    <div class="flex items-center justify-between">
                      <span>{preset.label}</span>
                      <span class="text-xs opacity-70">{preset.span}×{preset.span}</span>
                    </div>
                  </button>
                )}
              </For>
            </div>
            <div class="mt-1 text-xs opacity-70">B 启用预览 · V 返回选择 · Esc 清除预览 · 1/2/3 切换吸附 细/中/粗</div>
          </div>
          <div class="pt-2">
            <div class="font-semibold mb-1">统计</div>
            <div class="flex items-center justify-between">
              <span class="opacity-70">实体计数</span>
              <span>{app.stats.entities}</span>
            </div>
            <div class="mt-2">
              <div class="opacity-70 mb-1 text-xs">FPS（最近 30s）</div>
              {(() => {
                const vals = perfHistory().slice(-30).map((s) => s.fps);
                return (
                  <MiniBarChart width={220} height={40} cap={120} values={vals} color="#93c5fd" />
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs opacity-75">
        渲染: {rendererMs() !== undefined ? `${rendererMs()!.toFixed(2)} ms` : "-"} · 模拟: {simMs() !== undefined ? `${simMs()!.toFixed(2)} ms` : "-"} · 图层: {layerCount() ?? "-"} · 时钟 {hz()} Hz
      </div>
    </div>
  );
}

