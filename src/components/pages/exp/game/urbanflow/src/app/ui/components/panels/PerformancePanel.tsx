import { createSignal } from "solid-js";
import MiniTimeSeries from "../charts/MiniTimeSeries";

type PerfSample = {
  ts: number;
  fps: number;
  simHz: number;
  rendererP50?: number;
  rendererP95?: number;
  simP50?: number;
  simP95?: number;
};

type Props = {
  perf: {
    fps: number;
    simHz: number;
    rendererMs?: number;
    simMs?: number;
    layerCount?: number;
    hz: number;
    rendererP50?: number;
    rendererP95?: number;
    simP50?: number;
    simP95?: number;
    rendererSamples?: number;
    simSamples?: number;
  };
  history: PerfSample[];
  onSetHz: (hz: number) => void;
  onExportCsv: () => void;
};

export default function PerformancePanel(props: Props) {
  const WINDOW_KEY = "urbanflow:perf:windowSec:v0";
  const initialWindow = (() => {
    try { const v = Number(localStorage.getItem(WINDOW_KEY)); return [60,180,300].includes(v) ? v : 180; } catch { return 180; }
  })();
  const [windowSec, setWindowSecRaw] = createSignal<number>(initialWindow);
  const setWindowSec = (n: number) => {
    const clamped = [60,180,300].includes(n) ? n : 180;
    setWindowSecRaw(clamped);
    try { localStorage.setItem(WINDOW_KEY, String(clamped)); } catch {}
  };
  const onInputHz = (e: Event) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    const hz = Math.max(1, Math.min(120, Math.floor(v)));
    props.onSetHz(hz);
  };

  // d3 渲染的阈值线配置
  const thresholds = [
    { value: 16, color: "#f59e0b", label: "16ms" },
    { value: 50, color: "#ef4444", label: "50ms" },
  ] as const;

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">性能</div>
      <div class="grid grid-cols-2 gap-x-2">
        <div class="opacity-70">FPS</div>
        <div>{props.perf.fps}</div>
        <div class="opacity-70">Sim Hz</div>
        <div>{props.perf.simHz}</div>
        <div class="opacity-70">Renderer ms</div>
        <div>{props.perf.rendererMs?.toFixed(2) ?? "-"}</div>
        <div class="opacity-70">Sim ms</div>
        <div>{props.perf.simMs?.toFixed(2) ?? "-"}</div>
        <div class="opacity-70">Layers</div>
        <div>{props.perf.layerCount ?? "-"}</div>
        <div class="opacity-70">Renderer p50/p95</div>
        <div>{props.perf.rendererP50 !== undefined ? props.perf.rendererP50.toFixed(2) : "-"} / {props.perf.rendererP95 !== undefined ? props.perf.rendererP95.toFixed(2) : "-"}</div>
        <div class="opacity-70">Sim p50/p95</div>
        <div>{props.perf.simP50 !== undefined ? props.perf.simP50.toFixed(2) : "-"} / {props.perf.simP95 !== undefined ? props.perf.simP95.toFixed(2) : "-"}</div>
        <div class="opacity-70">采样数 (R/Sim)</div>
        <div>{props.perf.rendererSamples ?? 0} / {props.perf.simSamples ?? 0}</div>
      </div>
      <div class="pt-2 space-y-1">
        <div class="flex items-center justify-between">
          <label class="opacity-70">历史曲线（最近）</label>
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              {[60,180,300].map((sec) => (
                <button
                  class="px-2 py-0.5 text-xs border rounded"
                  classList={{ "bg-slate-900 text-white": windowSec() === sec }}
                  onClick={() => setWindowSec(sec)}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <button class="px-2 py-0.5 text-xs border rounded" onClick={props.onExportCsv}>导出 CSV</button>
          </div>
        </div>
        <div class="w-full border rounded p-1">
          {(() => {
            const MAX_POINTS = Math.max(1, windowSec()); // 每秒一条样本
            const samples = props.history.slice(-MAX_POINTS);
            const W = 220;
            const H = 52;
            const r50 = samples.map(s => s.rendererP50);
            const s50 = samples.map(s => s.simP50);
            const CAP = 50; // 共享上限，避免双轴
            return (
              <MiniTimeSeries
                width={W}
                height={H}
                cap={CAP}
                thresholds={thresholds as any}
                series={[
                  { label: "renderer p50", color: "#22c55e", values: r50 },
                  { label: "sim p50", color: "#60a5fa", values: s50 },
                ]}
              />
            );
          })()}
        </div>
      </div>
      <div class="pt-2">
        <label class="block mb-1 opacity-70">时钟 Hz</label>
        <input
          type="number"
          class="w-full px-2 py-1 border rounded bg-transparent"
          min={1}
          max={120}
          value={props.perf.hz}
          onInput={onInputHz}
        />
        <div class="mt-2 flex flex-wrap gap-2">
          {[5, 10, 20, 40, 80].map((v) => (
            <button
              class="px-2 py-0.5 text-xs border rounded"
              classList={{ "bg-slate-900 text-white": props.perf.hz === v }}
              onClick={() => props.onSetHz(v)}
            >
              {v} Hz
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}






