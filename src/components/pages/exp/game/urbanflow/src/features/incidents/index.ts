import type { AppStore } from "../../core/state/createAppStore";
import type { IRenderer } from "../../platform/render/RendererRegistry";
import { getIncidents, getIncidentZones, startIncidentsLifecycle } from "./systems/lifecycle";

export function registerIncidentsFeature(renderer: IRenderer, app: AppStore) {
  // 生命周期：订阅事故事件 + 维护减速区
  const dispose = startIncidentsLifecycle();
  // 叠加图层：绘制事故图钉与倒计时环
  renderer.registerLayer("incidents.overlay", ({ ctx, width, height }) => {
    if (!app.layers.isVisible("incidents.overlay")) return;
    const alpha = app.layers.getOpacity("incidents.overlay");
    const scale = app.view.scale;
    const offset = app.view.offset;
    const incidents = getIncidents();
    const zones = getIncidentZones();
    if (incidents.length === 0 && zones.length === 0) return;
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    // 事故点：红色图钉
    ctx.fillStyle = "#ef4444";
    for (const inc of incidents.slice(-50)) {
      const sx = inc.at.x * scale + offset.x;
      const sy = inc.at.y * scale + offset.y;
      if (sx < -8 || sy < -8 || sx > width + 8 || sy > height + 8) continue;
      ctx.beginPath();
      ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 减速区：半透明环，随剩余时间淡出
    const now = Date.now();
    for (const z of zones) {
      const sx = z.x * scale + offset.x;
      const sy = z.y * scale + offset.y;
      if (sx < -16 || sy < -16 || sx > width + 16 || sy > height + 16) continue;
      const remain = Math.max(0, z.expiresAt - now);
      const t = Math.max(0.1, Math.min(1, remain / 8000));
      const r = Math.max(6, z.radius * scale);
      ctx.strokeStyle = `rgba(239,68,68,${0.25 * t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });
  return () => dispose();
}


