import type { IRenderer } from "../../../platform/render/RendererRegistry";
import type { AppStore } from "../../../core/state/createAppStore";

export function registerWorldLayers(renderer: IRenderer, app: AppStore) {
  renderer.registerLayer("world.grid", ({ ctx, width, height, dpi }) => {
    if (!app.layers.isVisible("world.grid")) return;
    const alpha = app.layers.getOpacity?.("world.grid") ?? 1;
    // 变换：screen = world * scale + offset
    const scale = app.view?.scale ?? 1;
    const offset = app.view?.offset ?? { x: 0, y: 0 };

    // 基础格尺寸（world 单位映射到屏幕像素）
    const base = 32; // world 单位每格（scale=1 时每格32px）
    const minorStep = base * scale;
    const majorStep = base * 4 * scale;

    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    // minor grid
    if (minorStep >= 8) {
      ctx.strokeStyle = "#ffffff10";
      ctx.lineWidth = 1;
      const startX = ((offset.x % minorStep) + minorStep) % minorStep;
      for (let x = startX; x <= width; x += minorStep) {
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, height);
        ctx.stroke();
      }
      const startY = ((offset.y % minorStep) + minorStep) % minorStep;
      for (let y = startY; y <= height; y += minorStep) {
        ctx.beginPath();
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(width, Math.floor(y) + 0.5);
        ctx.stroke();
      }
    }

    // major grid + 刻度标注
    if (majorStep >= 24) {
      ctx.strokeStyle = "#ffffff25";
      ctx.lineWidth = 1;
      const startX2 = ((offset.x % majorStep) + majorStep) % majorStep;
      for (let x = startX2; x <= width; x += majorStep) {
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, height);
        ctx.stroke();
      }
      const startY2 = ((offset.y % majorStep) + majorStep) % majorStep;
      for (let y = startY2; y <= height; y += majorStep) {
        ctx.beginPath();
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(width, Math.floor(y) + 0.5);
        ctx.stroke();
      }

      // 刻度（顶部与左侧）
      ctx.fillStyle = "#a8b3c7";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas";
      const offWorldX0 = (-offset.x) / scale;
      const offWorldY0 = (-offset.y) / scale;
      for (let x = startX2, i = 0; x <= width; x += majorStep, i++) {
        const worldX = Math.round((offWorldX0 + (x) / scale));
        ctx.fillText(String(worldX), Math.floor(x) + 4, 12);
      }
      for (let y = startY2, j = 0; y <= height; y += majorStep, j++) {
        const worldY = Math.round((offWorldY0 + (y) / scale));
        ctx.fillText(String(worldY), 4, Math.floor(y) - 4);
      }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });
}


