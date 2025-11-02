import type { IRenderer } from "../../platform/render/RendererRegistry";
import type { AppStore } from "../../core/state/createAppStore";
import { attachPointer } from "../../platform/input/pointer";
import { attachKeyboard } from "../../platform/input/keyboard";

export function registerEditorFeature(renderer: IRenderer, app: AppStore, container: HTMLDivElement) {
  // 注册图层元数据
  app.layers.setVisible("ui.selection", true);
  app.layers.setOpacity("ui.selection", 1);
  app.layers.setOrder("ui.selection", 9);

  let selection: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let dragging = false;

  function drawSelection(dc: { ctx: CanvasRenderingContext2D; width: number; height: number }) {
    if (!app.layers.isVisible("ui.selection")) return;
    if (!selection) return;
    const { ctx } = dc;
    const x = Math.min(selection.x0, selection.x1);
    const y = Math.min(selection.y0, selection.y1);
    const w = Math.abs(selection.x1 - selection.x0);
    const h = Math.abs(selection.y1 - selection.y0);
    if (w < 1 || h < 1) return;
    const alpha = app.layers.getOpacity("ui.selection");
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#66ccff";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w), Math.floor(h));
    ctx.fillStyle = "#66ccff22";
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  }

  renderer.registerLayer("ui.selection", (dc) => drawSelection(dc));

  const toWorld = (sx: number, sy: number) => {
    const s = app.view.scale;
    const off = app.view.offset;
    return { worldX: (sx - off.x) / s, worldY: (sy - off.y) / s };
  };

  const detachPointer = attachPointer(container, toWorld, {
    onDown: ({ button, screenX, screenY }) => {
      if (button !== 0) return; // 左键
      dragging = true;
      selection = { x0: screenX, y0: screenY, x1: screenX, y1: screenY };
      renderer.requestFrame();
    },
    onMove: ({ screenX, screenY }) => {
      if (!dragging || !selection) return;
      selection.x1 = screenX;
      selection.y1 = screenY;
      renderer.requestFrame();
    },
    onUp: ({ button, screenX, screenY }) => {
      if (button !== 0) return;
      if (!selection) return;
      selection.x1 = screenX;
      selection.y1 = screenY;
      dragging = false;
      renderer.requestFrame();
    },
    onLeave: () => {
      if (!dragging) return;
      dragging = false;
      renderer.requestFrame();
    },
  });

  const detachKeyboard = attachKeyboard(window, {
    onKey: (ev) => {
      if (ev.key === "Escape" || ev.key === "Delete") {
        if (selection) {
          selection = null;
          renderer.requestFrame();
        }
      }
    },
  });

  return () => {
    detachPointer();
    detachKeyboard();
  };
}


