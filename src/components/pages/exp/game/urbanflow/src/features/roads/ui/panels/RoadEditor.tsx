import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import type { AppStore } from "../../../../core/state/createAppStore";

type SectionTemplate = {
  id: string;
  label: string;
  laneCount: number;
  widthMeters: number;
  laneWidthMeters?: number;
  shoulderLeftMeters?: number;
  shoulderRightMeters?: number;
  laneUse?: string[];
  notes?: string;
};

type SectionTemplateData = {
  templates: SectionTemplate[];
};

async function fetchTemplates(): Promise<SectionTemplateData> {
  const url = new URL("../../model/section-templates.json", import.meta.url).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败: ${res.status}`);
  return res.json();
}

type Issue = { level: "warn" | "error"; message: string };
function validate(t: SectionTemplate): { level: "ok" | "warn" | "error"; issues: Issue[] } {
  const issues: Issue[] = [];
  const lc = t.laneCount;
  const w = t.widthMeters;
  const lw = t.laneWidthMeters;
  const sL = t.shoulderLeftMeters ?? 0;
  const sR = t.shoulderRightMeters ?? 0;
  const hasShoulder = (t.shoulderLeftMeters ?? 0) > 0 || (t.shoulderRightMeters ?? 0) > 0;

  if (lc <= 0 || w <= 0) issues.push({ level: "error", message: "laneCount/width 非法" });

  if (t.laneUse) {
    if (t.laneUse.length !== lc) {
      issues.push({ level: "error", message: `laneUse 长度(${t.laneUse.length})与车道数(${lc})不一致` });
    }
  }

  if (t.shoulderLeftMeters !== undefined && t.shoulderLeftMeters < 0) {
    issues.push({ level: "error", message: "左侧路肩为负值" });
  }
  if (t.shoulderRightMeters !== undefined && t.shoulderRightMeters < 0) {
    issues.push({ level: "error", message: "右侧路肩为负值" });
  }
  if (sL > 2.0 || sR > 2.0) {
    issues.push({ level: "warn", message: `路肩偏大 L=${sL}m R=${sR}m` });
  }

  const expectCore = lw && lw > 0 ? lc * lw : undefined;
  const expectTotal = expectCore !== undefined ? expectCore + sL + sR : undefined;
  if (expectTotal !== undefined) {
    const diff = Math.abs(expectTotal - w);
    if (diff > 0.5) issues.push({ level: "error", message: `总宽应≈${expectTotal.toFixed(2)}m（含路肩），实际=${w.toFixed(2)}m` });
    else if (diff > 0.2) issues.push({ level: "warn", message: `总宽≈${expectTotal.toFixed(2)}m（含路肩），实际=${w.toFixed(2)}m` });
  } else {
    const avg = w / lc;
    if (!(avg >= 2.75 && avg <= 4.0)) {
      if (avg >= 2.5 && avg <= 4.5) issues.push({ level: "warn", message: `平均车道宽≈${avg.toFixed(2)}m 非常规` });
      else issues.push({ level: "error", message: `平均车道宽≈${avg.toFixed(2)}m 不合理` });
    }
  }

  const level = issues.some(i => i.level === "error") ? "error" : (issues.some(i => i.level === "warn") ? "warn" : "ok");
  return { level, issues };
}

export default function RoadEditor(props: { app: AppStore }) {
  const app = props.app;
  const [query, setQuery] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [data] = createResource(fetchTemplates);

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const arr = data.latest?.templates ?? [];
    if (!q) return arr;
    return arr.filter(t => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
  });

  const selected = createMemo(() => filtered().find(t => t.id === selectedId()) ?? null);

  const issues = createMemo(() => {
    const list = filtered();
    let warn = 0, err = 0;
    for (const t of list) {
      const v = validate(t);
      if (v.level === "warn") warn += 1;
      else if (v.level === "error") err += 1;
    }
    return { warn, err };
  });

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">SectionTemplates</div>
      <div class="flex items-center gap-2">
        <input
          type="text"
          class="flex-1 px-2 py-1 border rounded bg-transparent"
          placeholder="搜索（id/名称）"
          value={query()}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <Show when={data()}>
          <div class="text-xs opacity-70">共 {filtered().length} · ⚠ {issues().warn} · ✖ {issues().err}</div>
        </Show>
      </div>
      <Show when={data()} fallback={<div class="opacity-70">加载中...</div>}>
        <div class="space-y-1 max-h-48 overflow-auto pr-1">
          <For each={filtered()}>
            {(t) => {
              const v = validate(t);
              return (
                <button
                  class="w-full px-2 py-1 border rounded text-left"
                  classList={{ "border-slate-900 bg-slate-900 text-white": selectedId() === t.id }}
                  onClick={() => { setSelectedId(t.id); app.editor.setRoadTemplate(t.id); app.editor.setActiveTool("road"); }}
                  title={`${t.id}`}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate">{t.label}</span>
                    <div class="flex items-center gap-2 text-xs">
                      <span class="opacity-70">{t.laneCount} 车道 · {t.widthMeters} m</span>
                      <Show when={v.level !== "ok"}>
                        <span classList={{ "text-amber-500": v.level === "warn", "text-red-500": v.level === "error" }}>{v.level}</span>
                      </Show>
                      <Show when={v.issues.length > 0}>
                        <span class="px-1 rounded bg-amber-100 text-amber-800 border border-amber-300">{v.issues.length}</span>
                      </Show>
                    </div>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={selected()}>
          {(t) => {
            const v = validate(t());
            return (
              <div class="mt-2 border-t pt-2 space-y-1">
                <div class="font-medium">详情</div>
                <div class="grid grid-cols-3 gap-x-2">
                  <div class="opacity-70">ID</div>
                  <div class="col-span-2 break-all">{t().id}</div>
                  <div class="opacity-70">名称</div>
                  <div class="col-span-2">{t().label}</div>
                  <div class="opacity-70">车道数</div>
                  <div class="col-span-2">{t().laneCount}</div>
                  <div class="opacity-70">总宽</div>
                  <div class="col-span-2">{t().widthMeters} m</div>
                  <div class="opacity-70">车道宽</div>
                  <div class="col-span-2">{t().laneWidthMeters ? `${t().laneWidthMeters} m` : "(未声明)"}</div>
                  <div class="opacity-70">路肩</div>
                  <div class="col-span-2">L {t().shoulderLeftMeters ?? 0} m · R {t().shoulderRightMeters ?? 0} m</div>
                  <div class="opacity-70">laneUse</div>
                  <div class="col-span-2 text-xs">{t().laneUse ? t().laneUse.join(" | ") : "(未声明)"}</div>
                  <div class="opacity-70">校验</div>
                  <div class="col-span-2">
                    <span classList={{ "text-amber-600": v.level === "warn", "text-red-600": v.level === "error", "text-emerald-600": v.level === "ok" }}>{v.level}</span>
                    <div class="mt-1 space-y-0.5">
                      <For each={v.issues}>
                        {(it) => (
                          <div class="text-xs flex items-center gap-2">
                            <span classList={{ "text-amber-600": it.level === "warn", "text-red-600": it.level === "error" }}>{it.level}</span>
                            <span class="opacity-80">{it.message}</span>
                          </div>
                        )}
                      </For>
                      <Show when={v.issues.length === 0}>
                        <div class="text-xs opacity-60">无问题</div>
                      </Show>
                    </div>
                  </div>
                </div>
                <div>
                  <button
                    class="mt-2 px-2 py-1 border rounded text-sm"
                    onClick={() => { if (selectedId()) { app.editor.setRoadTemplate(selectedId()); app.editor.setActiveTool("road"); } }}
                  >
                    启用道路工具（两点建路）
                  </button>
                </div>
                <Show when={t().notes}>
                  <div class="text-xs opacity-75">{t().notes}</div>
                </Show>
              </div>
            );
          }}
        </Show>
      </Show>
    </div>
  );
}


