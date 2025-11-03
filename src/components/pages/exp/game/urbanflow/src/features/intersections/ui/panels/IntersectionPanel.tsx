import { For, Show, createMemo, createSignal } from "solid-js";
import { applyTemplateToPlan, listTemplates, validateSignalPlan, computeGateWindows, type SignalPlan as TSignalPlan, type ValidationIssue, type MovementId } from "../../systems/signals";

type SignalPhase = {
  id: string;
  durationSec: number;
  // more fields later
};

type SignalPlan = {
  id: string;
  label: string;
  phases: SignalPhase[];
  updatedAt?: string;
};

const LS_KEY = "urbanflow:signalPlan:v0";

function loadFromLocal(): SignalPlan | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function IntersectionPanel() {
  const [text, setText] = createSignal<string>((() => {
    const plan = loadFromLocal();
    if (plan) return JSON.stringify(plan, null, 2);
    const init: SignalPlan = {
      id: "plan.default",
      label: "默认相位计划",
      phases: [
        { id: "P1", durationSec: 30 },
        { id: "P2", durationSec: 30 }
      ],
      updatedAt: new Date().toISOString(),
    };
    return JSON.stringify(init, null, 2);
  })() as unknown as string);
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  const [issues, setIssues] = createSignal<ValidationIssue[]>([]);
  const [selectedTemplate, setSelectedTemplate] = createSignal<string>(listTemplates()[0]?.id ?? "");
  const templates = listTemplates();

  const gatePreview = createMemo(() => {
    try {
      const plan = JSON.parse(text()) as SignalPlan;
      const { cycleSec, windows } = computeGateWindows(plan as unknown as TSignalPlan);
      const labelOf = (m: MovementId) =>
        m === "NS_THRU" ? "NS 直行" :
        m === "EW_THRU" ? "EW 直行" :
        m === "NS_LEFT" ? "NS 左转" :
        m === "EW_LEFT" ? "EW 左转" :
        "行人";
      const by: Record<MovementId, { label: string; intervals: [number, number][] }> = {
        NS_THRU: { label: labelOf("NS_THRU"), intervals: [] },
        EW_THRU: { label: labelOf("EW_THRU"), intervals: [] },
        NS_LEFT: { label: labelOf("NS_LEFT"), intervals: [] },
        EW_LEFT: { label: labelOf("EW_LEFT"), intervals: [] },
        PED: { label: labelOf("PED"), intervals: [] },
      };
      for (const w of windows) {
        by[w.movementId].intervals.push([w.openStartSec, w.openEndSec]);
      }
      // 简并：将同一 movement 连续的窗口合并（占位实现，阈值 0 秒）
      for (const k of Object.keys(by) as MovementId[]) {
        const arr = by[k].intervals.sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const it of arr) {
          if (merged.length === 0) { merged.push(it); continue; }
          const last = merged[merged.length - 1]!;
          if (Math.abs(it[0] - last[1]) <= 0) {
            last[1] = Math.max(last[1], it[1]);
          } else {
            merged.push(it);
          }
        }
        by[k].intervals = merged;
      }
      // 冲突检测（占位规则）：
      const conflictsBy: Record<MovementId, [number, number][]> = {
        NS_THRU: [], EW_THRU: [], NS_LEFT: [], EW_LEFT: [], PED: [],
      };
      const movements: MovementId[] = ["NS_THRU", "EW_THRU", "NS_LEFT", "EW_LEFT", "PED"];
      const conflictPair = (a: MovementId, b: MovementId) => {
        if (a === b) return false;
        if (a === "PED" || b === "PED") return true;
        const isNS = (m: MovementId) => m.startsWith("NS");
        const isEW = (m: MovementId) => m.startsWith("EW");
        return (isNS(a) && isEW(b)) || (isEW(a) && isNS(b));
      };
      const pushInterval = (arr: [number, number][], seg: [number, number]) => {
        if (seg[1] <= seg[0]) return;
        arr.push([seg[0], seg[1]]);
      };
      for (let i = 0; i < movements.length; i += 1) {
        for (let j = i + 1; j < movements.length; j += 1) {
          const a = movements[i]!; const b = movements[j]!;
          if (!conflictPair(a, b)) continue;
          for (const [a0, a1] of by[a].intervals) {
            for (const [b0, b1] of by[b].intervals) {
              const s = Math.max(a0, b0);
              const e = Math.min(a1, b1);
              if (e > s) {
                pushInterval(conflictsBy[a], [s, e]);
                pushInterval(conflictsBy[b], [s, e]);
              }
            }
          }
        }
      }
      // 合并冲突片段
      for (const k of movements) {
        const arr = conflictsBy[k].sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const it of arr) {
          if (merged.length === 0) { merged.push(it); continue; }
          const last = merged[merged.length - 1]!;
          if (it[0] <= last[1]) last[1] = Math.max(last[1], it[1]); else merged.push(it);
        }
        conflictsBy[k] = merged;
      }
      return { cycleSec, by, conflictsBy };
    } catch {
      return null;
    }
  });

  // 时间轴视图：缩放与滚动
  const [zoom, setZoom] = createSignal<number>(1); // 支持非整数缩放以提升滚轮平滑度
  const [offsetSec, setOffsetSec] = createSignal<number>(0);
  const [hoverSec, setHoverSec] = createSignal<number | null>(null);
  const [dragging, setDragging] = createSignal<boolean>(false);
  let lastDragX = 0;
  const TIMELINE_W = 220;
  const TIMELINE_H = 10;
  const view = createMemo(() => {
    const g = gatePreview();
    if (!g) return { start: 0, end: 0, cycle: 0 };
    const cycle = Math.max(0, g.cycleSec);
    const z = Math.max(1, Math.min(4, zoom()));
    const span = cycle > 0 ? cycle / z : 0;
    const maxOffset = Math.max(0, cycle - span);
    const off = Math.max(0, Math.min(maxOffset, offsetSec()));
    return { start: off, end: off + span, cycle };
  });
  const clampZoom = (z: number) => Math.max(1, Math.min(4, z));
  const clampOffset = (off: number, cycle: number, span: number) => Math.max(0, Math.min(Math.max(0, cycle - span), off));
  const spanSec = () => {
    const g = gatePreview();
    if (!g) return 0;
    const z = clampZoom(zoom());
    return g.cycleSec > 0 ? g.cycleSec / z : 0;
  };
  const secAtX = (x: number, rectLeft: number) => {
    const frac = Math.max(0, Math.min(1, (x - rectLeft) / TIMELINE_W));
    const v = view();
    return v.start + frac * Math.max(1e-6, (v.end - v.start));
  };

  const onLoad = () => {
    const plan = loadFromLocal();
    if (!plan) {
      setStatus("无本地保存");
      return;
    }
    setText(JSON.stringify(plan, null, 2));
    setError(null);
    setStatus("已从本地读取");
  };

  const onSave = () => {
    try {
      const plan = JSON.parse(text()) as SignalPlan;
      plan.updatedAt = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify(plan));
      setText(JSON.stringify(plan, null, 2));
      setError(null);
      setStatus("已保存");
      // 事件打通（最小）：派发一个浏览器级事件，后续可接入统一 bus
      window.dispatchEvent(new CustomEvent("signalChanged", { detail: { id: plan.id, at: plan.updatedAt } }));
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
    }
  };

  const onValidate = () => {
    try {
      const plan = JSON.parse(text()) as SignalPlan;
      const result = validateSignalPlan(plan as unknown as TSignalPlan);
      setIssues(result.issues);
      setError(null);
      if (result.counts.error > 0 || result.counts.warn > 0) {
        setStatus(`校验完成 · error ${result.counts.error} · warn ${result.counts.warn}`);
      } else {
        setStatus("校验通过");
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
    }
  };

  const onApplyTemplate = () => {
    try {
      const plan = JSON.parse(text()) as TSignalPlan;
      const next = applyTemplateToPlan(plan, selectedTemplate());
      setText(JSON.stringify(next, null, 2));
      setError(null);
      setStatus("已应用模板");
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
    }
  };

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">Intersections / Signals</div>
      <div class="flex items-center gap-2">
        <button class="px-2 py-1 border rounded" onClick={onLoad}>读取</button>
        <button class="px-2 py-1 border rounded" onClick={onSave}>保存</button>
        <button class="px-2 py-1 border rounded" onClick={onValidate}>校验</button>
        <select
          class="px-2 py-1 border rounded bg-transparent"
          value={selectedTemplate()}
          onChange={(e) => setSelectedTemplate((e.target as HTMLSelectElement).value)}
        >
          <For each={templates}>{(t) => (
            <option value={t.id}>{t.label}</option>
          )}</For>
        </select>
        <button class="px-2 py-1 border rounded" onClick={onApplyTemplate}>应用模板</button>
        <Show when={status()}>
          <div class="text-xs opacity-70">{status()}</div>
        </Show>
      </div>
      <textarea
        class="w-full h-40 px-2 py-1 border rounded bg-transparent font-mono text-xs"
        value={text()}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />
      <Show when={error()}>
        <div class="text-xs text-red-500">{error()}</div>
      </Show>
      <Show when={issues().length > 0}>
        <div class="text-xs space-y-1">
          <For each={issues()}>
            {(it) => (
              <div
                class="flex items-start gap-2"
                classList={{
                  "text-red-500": it.severity === "error",
                  "text-amber-500": it.severity === "warn",
                  "text-emerald-500": it.severity === "ok",
                }}
              >
                <span class="shrink-0 uppercase">{it.severity}</span>
                <span class="opacity-80">[{it.code}]</span>
                <span class="flex-1">{it.message}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={gatePreview()}>
        <div class="text-xs space-y-1 border rounded p-2">
          <div class="font-medium">Gate 预览 · 周期 {gatePreview()!.cycleSec}s</div>
          <div class="flex items-center gap-2 py-1">
            <label class="opacity-70">缩放</label>
            <input type="range" min="1" max="4" step="1" value={zoom()} onInput={(e) => setZoom(Number((e.target as HTMLInputElement).value))} />
            <span class="opacity-70">{zoom()}x</span>
            <label class="opacity-70 ml-2">滚动</label>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.floor(Math.max(0, gatePreview()!.cycleSec - (gatePreview()!.cycleSec / Math.max(1, zoom())))))}
              step={1}
              value={offsetSec()}
              onInput={(e) => setOffsetSec(Number((e.target as HTMLInputElement).value))}
            />
            <span class="opacity-70">{Math.floor(view().start)}s</span>
          </div>
          <For each={Object.entries(gatePreview()!.by)}>
            {([mid, v]) => {
              const W = TIMELINE_W;
              const H = TIMELINE_H;
              const cycle = Math.max(0, gatePreview()!.cycleSec);
              const viewStart = view().start;
              const viewEnd = view().end;
              return (
                <div class="flex gap-2 items-center">
                  <span class="w-16 opacity-80">{v.label}</span>
                  <svg
                    width={W}
                    height={H}
                    class="shrink-0"
                    onWheel={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                      const centerBefore = secAtX(e.clientX, rect.left);
                      const factor = Math.exp(-e.deltaY * 0.0012);
                      const nextZ = clampZoom(zoom() * factor);
                      const g = gatePreview();
                      if (!g) return;
                      const oldSpan = spanSec();
                      setZoom(nextZ);
                      const newSpan = g.cycleSec / nextZ;
                      const newStart = centerBefore - (centerBefore - view().start) * (newSpan / Math.max(1e-6, oldSpan));
                      setOffsetSec(clampOffset(newStart, g.cycleSec, newSpan));
                    }}
                    onMouseDown={(e) => {
                      setDragging(true);
                      lastDragX = e.clientX;
                    }}
                    onMouseMove={(e) => {
                      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                      const t = secAtX(e.clientX, rect.left);
                      setHoverSec(t);
                      if (dragging()) {
                        const dx = e.clientX - lastDragX;
                        lastDragX = e.clientX;
                        const span = Math.max(1e-6, (view().end - view().start));
                        const dt = -dx * (span / W);
                        const g = gatePreview();
                        if (g) setOffsetSec(clampOffset(view().start + dt, g.cycleSec, span));
                      }
                    }}
                    onMouseUp={() => setDragging(false)}
                    onMouseLeave={() => { setDragging(false); setHoverSec(null); }}
                  >
                    <rect x="0" y="0" width={W} height={H} fill="#4b55633a" rx="2" />
                    {cycle > 0 && v.intervals.map(([a, b]) => {
                      const s = Math.max(a, viewStart);
                      const e = Math.min(b, viewEnd);
                      if (e <= s) return null;
                      const x = Math.max(0, Math.min(W, Math.floor(((s - viewStart) / Math.max(1e-6, (viewEnd - viewStart))) * W)));
                      const w = Math.max(1, Math.floor(((e - s) / Math.max(1e-6, (viewEnd - viewStart))) * W));
                      return <rect x={x} y={1} width={w} height={H - 2} fill="#22c55e" rx="2" />;
                    })}
                    {/* 冲突高亮（半透明红） */}
                    {cycle > 0 && gatePreview()!.conflictsBy[mid as MovementId].map(([a, b]) => {
                      const s = Math.max(a, viewStart);
                      const e = Math.min(b, viewEnd);
                      if (e <= s) return null;
                      const x = Math.max(0, Math.min(W, Math.floor(((s - viewStart) / Math.max(1e-6, (viewEnd - viewStart))) * W)));
                      const w = Math.max(1, Math.floor(((e - s) / Math.max(1e-6, (viewEnd - viewStart))) * W));
                      return <rect x={x} y={2} width={w} height={H - 4} fill="#ef444433" rx="2" />;
                    })}
                    {/* 悬停竖线 */}
                    {hoverSec() !== null && (() => {
                      const t = hoverSec()!;
                      if (t < viewStart || t > viewEnd) return null;
                      const xx = Math.max(0, Math.min(W, Math.floor(((t - viewStart) / Math.max(1e-6, (viewEnd - viewStart))) * W)));
                      return <line x1={xx} y1={0} x2={xx} y2={H} stroke="#ffffff55" stroke-width="1" />;
                    })()}
                  </svg>
                  <span class="flex-1">
                    {v.intervals.length === 0
                      ? <span class="opacity-50">无放行</span>
                      : v.intervals.map(([a, b]) => `${a}–${b}s`).join(", ")}
                  </span>
                </div>
              );
            }}
          </For>
          {/* 悬停摘要 */}
          <Show when={hoverSec() !== null}>
            <div class="text-[11px] opacity-80 pt-1">
              {(() => {
                const g = gatePreview();
                const t = hoverSec();
                if (!g || t == null) return null as any;
                const open: string[] = [];
                for (const [_, v] of Object.entries(g.by)) {
                  if (v.intervals.some(([a,b]) => t >= a && t <= b)) open.push(v.label);
                }
                const hasConflict = (Object.values(g.conflictsBy) as [number,number][][]).some((arr) => arr.some(([a,b]) => t >= a && t <= b));
                return <span>t={t.toFixed(1)}s · 放行: {open.length > 0 ? open.join("/") : "无"} {hasConflict ? "· 冲突" : ""}</span> as any;
              })()}
            </div>
          </Show>
        </div>
      </Show>
      <div class="text-xs opacity-70">说明：此面板演示计划对象的载入/保存，与事件流打通将在后续接入统一事件总线。</div>
    </div>
  );
}


