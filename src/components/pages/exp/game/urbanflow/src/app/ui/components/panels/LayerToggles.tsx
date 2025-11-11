import { For, JSX, createMemo, createSignal } from "solid-js";
import type { AppStore } from "../../../../core/state/createAppStore";

type Props = {
  app: AppStore;
  onChangeOrder?: (id: string, order: number) => void;
};

export default function LayerToggles(props: Props): JSX.Element {
  const [query, setQuery] = createSignal("");
  const entries = createMemo(() => {
    const q = query().trim().toLowerCase();
    return Object.entries(props.app.layers.all())
      .filter(([id]) => (q ? id.toLowerCase().includes(q) : true))
      .sort((a, b) => a[1].order - b[1].order);
  });
  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="font-semibold">图层</div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            class="px-2 py-0.5 text-xs border rounded bg-transparent w-28"
            placeholder="搜索 id"
            value={query()}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <button
            class="px-2 py-0.5 border rounded text-xs"
            title="恢复默认图层可见性/顺序/透明度"
            onClick={() => props.app.layers.resetToDefaults?.()}
          >重置</button>
        </div>
      </div>
      <For each={entries()}>
        {([id, meta]) => (
          <div class="mb-2">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={props.app.layers.isVisible(id)}
                onInput={(e) => props.app.layers.setVisible(id, (e.target as HTMLInputElement).checked)}
              />
              <span class="truncate" title={id}>{id}</span>
            </label>
            <div class="mt-1 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={props.app.layers.getOpacity(id)}
                onInput={(e) => props.app.layers.setOpacity(id, Number((e.target as HTMLInputElement).value))}
              />
              <span class="w-10 text-right text-xs opacity-70">{Math.round(props.app.layers.getOpacity(id) * 100)}%</span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <button
                class="px-2 py-0.5 border rounded text-xs"
                onClick={() => {
                  const cur = props.app.layers.getOrder(id);
                  const next = Math.max(0, cur - 1);
                  props.app.layers.setOrder(id, next);
                  props.onChangeOrder?.(id, next);
                }}
              >上移</button>
              <button
                class="px-2 py-0.5 border rounded text-xs"
                onClick={() => {
                  const cur = props.app.layers.getOrder(id);
                  const next = cur + 1;
                  props.app.layers.setOrder(id, next);
                  props.onChangeOrder?.(id, next);
                }}
              >下移</button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}


