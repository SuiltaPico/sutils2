import { For, JSX } from "solid-js";
import type { AppStore } from "../../../core/state/createAppStore";

type Props = {
  app: AppStore;
  onChangeOrder?: (id: string, order: number) => void;
};

export default function LayerToggles(props: Props): JSX.Element {
  const entries = () => Object.entries(props.app.layers.all()).sort((a, b) => a[1].order - b[1].order);
  return (
    <div class="space-y-3">
      <div class="font-semibold">图层</div>
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


