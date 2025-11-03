import { For, Show, createMemo, createResource, createSignal } from "solid-js";

type BlockProto = {
  id: string;
  label: string;
  category: string;
  footprint: [number, number];
  orientation?: 0 | 90 | 180 | 270;
  tags?: string[];
};

type ProtoData = {
  categories: { id: string; label: string }[];
  blocks: BlockProto[];
};

async function fetchPrototypes(): Promise<ProtoData> {
  const url = new URL("../../data/prototypes.json", import.meta.url).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败: ${res.status}`);
  return res.json();
}

export default function BlockLibrary(props: { onPick?: (b: BlockProto) => void }) {
  const [query, setQuery] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [selectedCats, setSelectedCats] = createSignal<string[]>([]);
  const [selectedTags, setSelectedTags] = createSignal<string[]>([]);
  const [wMin, setWMin] = createSignal<string>("");
  const [wMax, setWMax] = createSignal<string>("");
  const [hMin, setHMin] = createSignal<string>("");
  const [hMax, setHMax] = createSignal<string>("");
  const [data] = createResource(fetchPrototypes);

  const selected = createMemo(() => data.latest?.blocks.find(b => b.id === selectedId()) ?? null);

  const allTags = createMemo(() => {
    const set = new Set<string>();
    for (const b of (data.latest?.blocks ?? [])) {
      for (const t of (b.tags ?? [])) set.add(t);
    }
    return Array.from(set).sort();
  });

  const grouped = createMemo(() => {
    const q = query().trim().toLowerCase();
    const cats = new Set(selectedCats());
    const w0 = wMin().trim() === "" ? -Infinity : Number(wMin());
    const w1 = wMax().trim() === "" ? Infinity : Number(wMax());
    const h0 = hMin().trim() === "" ? -Infinity : Number(hMin());
    const h1 = hMax().trim() === "" ? Infinity : Number(hMax());
    const tags = new Set(selectedTags());
    const blocks = (data.latest?.blocks ?? []).filter((b) => {
      if (q && !(b.id.toLowerCase().includes(q) || b.label.toLowerCase().includes(q))) return false;
      if (cats.size > 0 && !cats.has(b.category)) return false;
      const [bw, bh] = b.footprint;
      if (!(bw >= w0 && bw <= w1 && bh >= h0 && bh <= h1)) return false;
      if (tags.size > 0) {
        const bt = new Set(b.tags ?? []);
        let hit = false;
        for (const t of tags) { if (bt.has(t)) { hit = true; break; } }
        if (!hit) return false;
      }
      return true;
    });
    const map = new Map<string, BlockProto[]>();
    for (const b of blocks) {
      const arr = map.get(b.category) ?? [];
      arr.push(b);
      map.set(b.category, arr);
    }
    return map;
  });

  const categoryLabel = (id: string) => data.latest?.categories.find(c => c.id === id)?.label ?? id;

  // 校验逻辑：基础一致性与尺寸阈值
  type Issue = { level: "warn" | "error"; message: string };
  const validateBlock = (b: BlockProto): Issue[] => {
    const issues: Issue[] = [];
    const cats = new Set((data.latest?.categories ?? []).map(c => c.id));
    if (!cats.has(b.category)) {
      issues.push({ level: "error", message: `未知类别: ${b.category}` });
    }
    const [w, h] = b.footprint;
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) {
      issues.push({ level: "error", message: "footprint 非法（需为正数）" });
    }
    if (w > 16 || h > 16) {
      issues.push({ level: "warn", message: `尺寸过大: ${w}×${h}` });
    }
    if ((b.tags ?? []).length === 0) {
      issues.push({ level: "warn", message: "未设置标签（tags）" });
    }
    return issues;
  };

  const blockIssues = createMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const b of (data.latest?.blocks ?? [])) {
      map.set(b.id, validateBlock(b));
    }
    return map;
  });

  const issueSummary = createMemo(() => {
    let warn = 0, err = 0;
    for (const issues of blockIssues().values()) {
      for (const it of issues) {
        if (it.level === "warn") warn += 1; else err += 1;
      }
    }
    return { warn, err };
  });

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">Blocks 原型库</div>
      <div>
        <input
          type="text"
          class="w-full px-2 py-1 border rounded bg-transparent"
          placeholder="搜索（id/名称）"
          value={query()}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </div>
      <Show when={data()}>
        <div class="grid grid-cols-2 gap-2 items-center">
          <div class="col-span-2 text-xs opacity-70">分面筛选</div>
          <div class="col-span-2 flex flex-wrap gap-2">
            <For each={data.latest?.categories ?? []}>
              {(c) => (
                <label class="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCats().includes(c.id)}
                    onInput={(e) => {
                      const on = (e.target as HTMLInputElement).checked;
                      const next = new Set(selectedCats());
                      if (on) next.add(c.id); else next.delete(c.id);
                      setSelectedCats([...next]);
                    }}
                  />
                  <span>{c.label}</span>
                </label>
              )}
            </For>
          </div>
          <div class="col-span-2 flex flex-wrap gap-2">
            <For each={allTags()}>
              {(t) => (
                <label class="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTags().includes(t)}
                    onInput={(e) => {
                      const on = (e.target as HTMLInputElement).checked;
                      const next = new Set(selectedTags());
                      if (on) next.add(t); else next.delete(t);
                      setSelectedTags([...next]);
                    }}
                  />
                  <span>#{t}</span>
                </label>
              )}
            </For>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="opacity-70">宽</span>
            <input class="w-12 px-1 py-0.5 border rounded bg-transparent" value={wMin()} onInput={(e) => setWMin((e.target as HTMLInputElement).value)} placeholder="min" />
            <span>–</span>
            <input class="w-12 px-1 py-0.5 border rounded bg-transparent" value={wMax()} onInput={(e) => setWMax((e.target as HTMLInputElement).value)} placeholder="max" />
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="opacity-70">高</span>
            <input class="w-12 px-1 py-0.5 border rounded bg-transparent" value={hMin()} onInput={(e) => setHMin((e.target as HTMLInputElement).value)} placeholder="min" />
            <span>–</span>
            <input class="w-12 px-1 py-0.5 border rounded bg-transparent" value={hMax()} onInput={(e) => setHMax((e.target as HTMLInputElement).value)} placeholder="max" />
          </div>
          <div class="col-span-2 text-xs opacity-70">校验统计 · ⚠ {issueSummary().warn} · ✖ {issueSummary().err}</div>
        </div>
      </Show>
      <Show when={data()} fallback={<div class="opacity-70">加载中...</div>}>
        <div class="space-y-3">
          <For each={[...grouped().entries()]}> 
            {([catId, items]) => (
              <div>
                <div class="font-medium mb-1 flex items-center justify-between">
                  <span>{categoryLabel(catId)}</span>
                  <span class="text-xs opacity-70">{items.length}</span>
                </div>
                <div class="space-y-1">
                  <For each={items}>
                    {(b) => (
                      <button
                        class="w-full px-2 py-1 border rounded text-left"
                        classList={{ "border-slate-900 bg-slate-900 text-white": selectedId() === b.id }}
                        onClick={() => { setSelectedId(b.id); props.onPick?.(b); }}
                        title={`${b.id}`}
                      >
                        <div class="flex items-center justify-between gap-2">
                          <span class="truncate">{b.label}</span>
                          <div class="flex items-center gap-2 text-xs">
                            <span class="opacity-70">{b.footprint[0]}×{b.footprint[1]}</span>
                            <Show when={(blockIssues().get(b.id)?.length ?? 0) > 0}>
                              <span class="px-1 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                {(blockIssues().get(b.id)?.length ?? 0)}
                              </span>
                            </Show>
                          </div>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
        <Show when={selected()}>
          {(b) => (
            <div class="mt-2 border-t pt-2 space-y-1">
              <div class="font-medium">详情</div>
              <div class="grid grid-cols-3 gap-x-2">
                <div class="opacity-70">ID</div>
                <div class="col-span-2 break-all">{b().id}</div>
                <div class="opacity-70">名称</div>
                <div class="col-span-2">{b().label}</div>
                <div class="opacity-70">类别</div>
                <div class="col-span-2">{categoryLabel(b().category)}</div>
                <div class="opacity-70">尺寸</div>
                <div class="col-span-2">{b().footprint[0]}×{b().footprint[1]}</div>
                <div class="opacity-70">朝向</div>
                <div class="col-span-2">{(b().orientation ?? 0)}°</div>
                <div class="opacity-70">标签</div>
                <div class="col-span-2 flex flex-wrap gap-1">{(b().tags ?? []).map(t => <span class="px-1 py-0.5 border rounded text-[11px]">#{t}</span>)}</div>
              </div>
              <div class="mt-1">
                <div class="text-xs opacity-70 mb-1">校验</div>
                <For each={blockIssues().get(b().id) ?? []}>
                  {(it) => (
                    <div class="text-xs flex items-center gap-2">
                      <span classList={{ "text-amber-600": it.level === "warn", "text-red-600": it.level === "error" }}>{it.level}</span>
                      <span class="opacity-80">{it.message}</span>
                    </div>
                  )}
                </For>
                <Show when={(blockIssues().get(b().id)?.length ?? 0) === 0}>
                  <div class="text-xs opacity-60">无问题</div>
                </Show>
              </div>
            </div>
          )}
        </Show>
        <div class="mt-3 border-t pt-2 space-y-1">
          <div class="font-medium">校验汇总</div>
          <div class="text-xs opacity-70">⚠ {issueSummary().warn} · ✖ {issueSummary().err}</div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-xs font-medium text-red-700">错误</div>
              <div class="max-h-28 overflow-auto pr-1 space-y-1">
                <For each={(data.latest?.blocks ?? []).filter(b => (blockIssues().get(b.id) ?? []).some(it => it.level === "error"))}>
                  {(b) => (
                    <button class="w-full px-2 py-1 border rounded text-left text-xs" onClick={() => setSelectedId(b.id)}>
                      <div class="flex items-center justify-between gap-2">
                        <span class="truncate">{b.label}</span>
                        <span class="opacity-60">{(blockIssues().get(b.id) ?? []).filter(it => it.level === "error").length}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div>
              <div class="text-xs font-medium text-amber-700">告警</div>
              <div class="max-h-28 overflow-auto pr-1 space-y-1">
                <For each={(data.latest?.blocks ?? []).filter(b => (blockIssues().get(b.id) ?? []).every(it => it.level !== "error") && (blockIssues().get(b.id) ?? []).some(it => it.level === "warn"))}>
                  {(b) => (
                    <button class="w-full px-2 py-1 border rounded text-left text-xs" onClick={() => setSelectedId(b.id)}>
                      <div class="flex items-center justify-between gap-2">
                        <span class="truncate">{b.label}</span>
                        <span class="opacity-60">{(blockIssues().get(b.id) ?? []).filter(it => it.level === "warn").length}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}


