import { IRenderer, LayerDrawFn } from "../../IRenderer";

type Layer = { id: string; draw: LayerDrawFn; visible: boolean; order: number };

export function createCanvas2DRenderer(): IRenderer {
  let container: HTMLElement | null = null;
  const canvas = document.createElement("canvas");
  const layers: Layer[] = [];
  let dpi = 1;
  let raf = 0;
  let statsListener: ((s: { rendererMs: number; layerCount: number }) => void) | null = null;

  function resize() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.floor(rect.width * dpi));
    canvas.height = Math.max(1, Math.floor(rect.height * dpi));
  }

  function drawFrame() {
    if (!container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const t0 = performance.now();
    ctx.save();
    ctx.scale(dpi, dpi);
    // clear
    ctx.clearRect(0, 0, width, height);
    // bg
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--uf-stage-bg") || "#0b1020";
    ctx.fillRect(0, 0, width, height);
    // layers in order
    const ordered = layers.slice().sort((a, b) => a.order - b.order);
    for (const l of ordered) {
      if (!l.visible) continue;
      l.draw({ ctx, width: width / dpi, height: height / dpi, dpi });
    }
    ctx.restore();
    const t1 = performance.now();
    statsListener?.({ rendererMs: t1 - t0, layerCount: ordered.length });
  }

  function requestFrame() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawFrame);
  }

  const api: IRenderer = {
    mount(el, opts) {
      container = el;
      dpi = opts.dpi ?? 1;
      container.appendChild(canvas);
      const ro = new ResizeObserver(() => {
        resize();
        requestFrame();
      });
      ro.observe(container);
      resize();
      requestFrame();
    },
    registerLayer(id, draw) {
      const existing = layers.find((l) => l.id === id);
      if (existing) {
        existing.draw = draw;
      } else {
        layers.push({ id, draw, visible: true, order: layers.length });
      }
      requestFrame();
    },
    setLayerVisible(id, visible) {
      const l = layers.find((x) => x.id === id);
      if (l) {
        l.visible = visible;
        requestFrame();
      }
    },
    setOrder(id, order) {
      const l = layers.find((x) => x.id === id);
      if (l) {
        l.order = order;
        requestFrame();
      }
    },
    requestFrame,
    onStats(listener) {
      statsListener = listener;
    },
    dispose() {
      cancelAnimationFrame(raf);
      if (container && canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      container = null;
    },
  };

  return api;
}


