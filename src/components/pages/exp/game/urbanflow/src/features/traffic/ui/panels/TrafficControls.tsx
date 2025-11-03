import type { AppStore } from "../../../../core/state/createAppStore";

export default function TrafficControls(props: { app: AppStore }) {
  const app = props.app;
  return (
    <div class="text-sm space-y-3">
      <div class="font-semibold">Traffic 控制</div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="opacity-70">生成速率</span>
          <span>{app.traffic.spawnRate.toFixed(1)} 辆/秒</span>
        </div>
        <input
          type="range"
          min="0"
          max="5"
          step="0.1"
          value={app.traffic.spawnRate}
          onInput={(e) => app.traffic.setSpawnRate(Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="opacity-70">车辆上限</span>
          <span>{app.traffic.maxVehicles}</span>
        </div>
        <input
          type="range"
          min="50"
          max="500"
          step="10"
          value={app.traffic.maxVehicles}
          onInput={(e) => app.traffic.setMaxVehicles(Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="opacity-70">限速因子</span>
          <span>{Math.round(app.traffic.speedLimitFactor * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.05"
          value={app.traffic.speedLimitFactor}
          onInput={(e) => app.traffic.setSpeedLimitFactor(Number((e.target as HTMLInputElement).value))}
        />
        <div class="text-xs opacity-70">对道路分段限速的全局缩放（50% – 150%）</div>
      </div>
    </div>
  );
}


