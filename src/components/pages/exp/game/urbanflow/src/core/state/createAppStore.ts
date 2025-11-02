import { createSignal } from "solid-js";

export type LayersState = { [id: string]: { visible: boolean; order: number; opacity: number } };

export function createAppStore() {
  const [scale, setScale] = createSignal<0.5 | 1 | 2 | 4 | 8>(1);
  const [paused, setPaused] = createSignal(false);
  const [layers, setLayers] = createSignal<LayersState>({
    "world.grid": { visible: true, order: 0, opacity: 1 },
    "ui.crosshair": { visible: true, order: 10, opacity: 1 },
  });
  const [viewScale, setViewScale] = createSignal(1);
  const [viewOffset, setViewOffset] = createSignal({ x: 0, y: 0 });
  const [entityCount, setEntityCount] = createSignal(0);

  return {
    time: {
      get scale() {
        return scale();
      },
      get paused() {
        return paused();
      },
      setScale(s: 0.5 | 1 | 2 | 4 | 8) {
        setScale(s);
        setPaused(false);
      },
      pause() {
        setPaused(true);
      },
      resume() {
        setPaused(false);
      },
    },
    layers: {
      isVisible(id: string) {
        return !!layers()[id]?.visible;
      },
      setVisible(id: string, visible: boolean) {
        setLayers((prev) => ({ ...prev, [id]: { ...(prev[id] || { order: 0, opacity: 1 }), visible } }));
      },
      toggle(id: string) {
        const vis = !!layers()[id]?.visible;
        this.setVisible(id, !vis);
      },
      getOpacity(id: string) {
        return layers()[id]?.opacity ?? 1;
      },
      setOpacity(id: string, opacity: number) {
        const o = Math.max(0, Math.min(1, opacity));
        setLayers((prev) => ({ ...prev, [id]: { ...(prev[id] || { order: 0, visible: true }), opacity: o } }));
      },
      getOrder(id: string) {
        return layers()[id]?.order ?? 0;
      },
      setOrder(id: string, order: number) {
        setLayers((prev) => ({ ...prev, [id]: { ...(prev[id] || { visible: true, opacity: 1 }), order } }));
      },
      all() {
        return layers();
      },
    },
    view: {
      get scale() {
        return viewScale();
      },
      get offset() {
        return viewOffset();
      },
      setScale(s: number) {
        const clamped = Math.max(0.25, Math.min(8, s));
        setViewScale(clamped);
      },
      zoomAt(cx: number, cy: number, nextScale: number) {
        const cur = viewScale();
        const ns = Math.max(0.25, Math.min(8, nextScale));
        if (ns === cur) return;
        const off = viewOffset();
        // 保持光标所指世界点在屏幕位置不变：
        // screen = world*scale + offset → world = (screen - offset)/scale
        const worldX = (cx - off.x) / cur;
        const worldY = (cy - off.y) / cur;
        const newOffsetX = cx - worldX * ns;
        const newOffsetY = cy - worldY * ns;
        setViewScale(ns);
        setViewOffset({ x: newOffsetX, y: newOffsetY });
      },
      panBy(dx: number, dy: number) {
        const off = viewOffset();
        setViewOffset({ x: off.x + dx, y: off.y + dy });
      },
      setOffset(x: number, y: number) {
        setViewOffset({ x, y });
      },
    },
    stats: {
      get entities() {
        return entityCount();
      },
      setEntities(n: number) {
        const v = Math.max(0, Math.floor(n));
        setEntityCount(v);
      },
      incEntities(delta = 1) {
        setEntityCount((v) => Math.max(0, v + Math.floor(delta)));
      },
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;


