import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { RendererProvider } from "../providers/RendererProvider";
import FeatureLoader from "../providers/FeatureLoader";
import { createAppStore } from "../../core/state/createAppStore";
import { createClock } from "../../core/time/clock";
import PerformancePanel from "../ui/components/panels/PerformancePanel";
import LayerToggles from "../ui/components/panels/LayerToggles";
import { attachPointer } from "../../platform/input/pointer";
import { attachKeyboard } from "../../platform/input/keyboard";

export default function AppShell() {
  const app = createAppStore();
  const [fps, setFps] = createSignal(0);
  const [simHz, setSimHz] = createSignal(0);
  const [rendererMs, setRendererMs] = createSignal<number | undefined>(undefined);
  const [simMs, setSimMs] = createSignal<number | undefined>(undefined);
  const [hz, setHz] = createSignal(10);

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
  let simAcc = 0;
  let simCount = 0;
  clock.onTick(() => {
    const t0 = performance.now();
    simTicks += 1;
    renderer()?.requestFrame();
    const t1 = performance.now();
    simAcc += t1 - t0;
    simCount += 1;
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

  // 每秒统计一次 sim 平均耗时
  createEffect(() => {
    // 依赖 fps 刷新周期（每秒）
    fps();
    if (simCount > 0) {
      setSimMs(simAcc / simCount);
      simAcc = 0;
      simCount = 0;
    }
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
          <button class="px-2 py-1 text-xs border rounded" onClick={() => app.layers.toggle("world.grid")}>\n            网格\n          </button>
        </div>
        <div class="flex-1 min-h-0">
          <RendererProvider
            graphics={{ backend: "canvas2d" }}
            onReady={(r) => {
              setRenderer(r);
              r.onStats((s) => setRendererMs(s.rendererMs));
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
            perf={{ fps: fps(), simHz: simHz(), rendererMs: rendererMs(), simMs: simMs(), hz: hz() }}
            onSetHz={(v) => {
              setHz(v);
              clock.setHz(v);
            }}
          />
          <div class="pt-2">
            <div class="font-semibold mb-1">统计</div>
            <div class="flex items-center justify-between">
              <span class="opacity-70">实体计数</span>
              <span>{app.stats.entities}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs opacity-75">
        渲染预算: renderer ≤4 ms（占位） · 模拟 ≤30 ms（占位）
      </div>
    </div>
  );
}

