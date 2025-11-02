type Props = {
  perf: {
    fps: number;
    simHz: number;
    rendererMs?: number;
    simMs?: number;
    hz: number;
  };
  onSetHz: (hz: number) => void;
};

export default function PerformancePanel(props: Props) {
  const onInputHz = (e: Event) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    const hz = Math.max(1, Math.min(120, Math.floor(v)));
    props.onSetHz(hz);
  };

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
      </div>
    </div>
  );
}



