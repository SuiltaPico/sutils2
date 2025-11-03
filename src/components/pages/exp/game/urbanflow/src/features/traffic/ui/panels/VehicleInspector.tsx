import { createMemo, createSignal, onCleanup } from "solid-js";
import { getSelectedVehicleStats, setSelectedVehicleSpeedBias } from "../../index";

export default function VehicleInspector() {
  const [version, setVersion] = createSignal(0);
  const stats = createMemo(() => getSelectedVehicleStats());

  // 简单轮询刷新（每 250ms），避免加重主循环
  const timer = setInterval(() => setVersion((v) => (v + 1) % 1_000_000), 250);
  onCleanup(() => clearInterval(timer));
  version();

  const s = stats();
  if (!s) {
    return (
      <div class="text-sm space-y-1">
        <div class="font-semibold">车辆检查器</div>
        <div class="opacity-70 text-xs">在画布中单击一辆车以选中，然后在此调整速度偏置。</div>
      </div>
    );
  }

  const kmh = (s.v * 3.6).toFixed(1);
  const desiredKmh = (s.desiredV * 3.6).toFixed(0);

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">车辆检查器</div>
      <div class="grid grid-cols-2 gap-x-2">
        <div class="opacity-70">速度</div>
        <div>{kmh} km/h</div>
        <div class="opacity-70">期望速度</div>
        <div>{desiredKmh} km/h</div>
        <div class="opacity-70">偏置</div>
        <div>{Math.round(s.bias * 100)}%</div>
      </div>
      <div>
        <input
          type="range"
          min="50"
          max="130"
          value={Math.round(s.bias * 100)}
          onInput={(e) => {
            const val = Number((e.target as HTMLInputElement).value);
            setSelectedVehicleSpeedBias(val / 100);
          }}
        />
        <div class="text-xs opacity-70">滑块范围：50% – 130%</div>
      </div>
    </div>
  );
}


