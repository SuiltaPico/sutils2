import { createEffect, createSignal } from "solid-js";

export type LayersState = { [id: string]: { visible: boolean; order: number; opacity: number } };

export function createAppStore() {
  const LS_LAYERS_KEY = "urbanflow:layers:v0";
  const LS_TRAFFIC_KEY = "urbanflow:traffic:v0";
  const [scale, setScale] = createSignal<0.5 | 1 | 2 | 4 | 8>(1);
  const [paused, setPaused] = createSignal(false);
  // 默认图层
  const defaultLayers: LayersState = {
    "world.grid": { visible: true, order: 0, opacity: 1 },
    "traffic.vehicles": { visible: true, order: 3, opacity: 1 },
    "traffic.debugGraph": { visible: true, order: 2, opacity: 1 },
    "incidents.overlay": { visible: true, order: 6, opacity: 1 },
    "ui.blockPreview": { visible: true, order: 8, opacity: 0.65 },
    "ui.selection": { visible: true, order: 9, opacity: 1 },
    "ui.crosshair": { visible: true, order: 10, opacity: 1 },
  };
  // 从本地读取并合并
  const initialLayers = (() => {
    try {
      const raw = localStorage.getItem(LS_LAYERS_KEY);
      if (!raw) return defaultLayers;
      const saved = JSON.parse(raw) as LayersState;
      return { ...defaultLayers, ...saved } as LayersState;
    } catch {
      return defaultLayers;
    }
  })();
  const [layers, setLayers] = createSignal<LayersState>(initialLayers);
  const [viewScale, setViewScale] = createSignal(1);
  const [viewOffset, setViewOffset] = createSignal({ x: 0, y: 0 });
  const [entityCount, setEntityCount] = createSignal(0);
  const [activeTool, setActiveTool] = createSignal<"select" | "block">("select");
  const [blockPresetId, setBlockPresetId] = createSignal<string | null>(null);
  type PlacedBlock = { id: number; x: number; y: number; w: number; h: number; orientation?: 0 | 90 | 180 | 270; category?: string; protoId?: string };
  const [placedBlocks, setPlacedBlocks] = createSignal<PlacedBlock[]>([]);
  const [blockSeq, setBlockSeq] = createSignal(0);
  // 简单撤销/重做栈（快照级别）
  const history: PlacedBlock[][] = [];
  const redoStack: PlacedBlock[][] = [];
  const pushHistory = (next: PlacedBlock[]) => {
    history.push(next.map(b => ({ ...b })));
    // 保护历史深度
    if (history.length > 100) history.shift();
  };
  const commit = (next: PlacedBlock[]) => {
    setPlacedBlocks(next);
    pushHistory(next);
    redoStack.length = 0;
  };

  // Traffic 配置（生成速率/上限/限速因子），带本地持久化
  type TrafficPersist = { spawnRate?: number; maxVehicles?: number; speedLimitFactor?: number };
  const trafficInitial = (() => {
    try {
      const raw = localStorage.getItem(LS_TRAFFIC_KEY);
      if (!raw) return { spawnRate: 1, maxVehicles: 200, speedLimitFactor: 1 };
      const saved = JSON.parse(raw) as TrafficPersist;
      return {
        spawnRate: Math.max(0, Math.min(10, saved.spawnRate ?? 1)),
        maxVehicles: Math.max(0, Math.min(2000, Math.floor(saved.maxVehicles ?? 200))),
        speedLimitFactor: Math.max(0.5, Math.min(1.5, saved.speedLimitFactor ?? 1)),
      };
    } catch {
      return { spawnRate: 1, maxVehicles: 200, speedLimitFactor: 1 };
    }
  })();
  const [trafficSpawnRate, setTrafficSpawnRate] = createSignal<number>(trafficInitial.spawnRate);
  const [trafficMaxVehicles, setTrafficMaxVehicles] = createSignal<number>(trafficInitial.maxVehicles);
  const [trafficSpeedLimitFactor, setTrafficSpeedLimitFactor] = createSignal<number>(trafficInitial.speedLimitFactor);

  createEffect(() => {
    try {
      const data: TrafficPersist = {
        spawnRate: trafficSpawnRate(),
        maxVehicles: trafficMaxVehicles(),
        speedLimitFactor: trafficSpeedLimitFactor(),
      };
      localStorage.setItem(LS_TRAFFIC_KEY, JSON.stringify(data));
    } catch {}
  });

  // 持久化图层状态
  createEffect(() => {
    try {
      const data = layers();
      localStorage.setItem(LS_LAYERS_KEY, JSON.stringify(data));
    } catch {}
  });

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
    editor: {
      get activeTool() {
        return activeTool();
      },
      setActiveTool(tool: "select" | "block") {
        setActiveTool(tool);
      },
      get blockPresetId() {
        return blockPresetId();
      },
      setBlockPreset(id: string | null) {
        setBlockPresetId(id);
      },
      setPrototype(p: { id: string; category: string; wCells: number; hCells: number; orientation: 0 | 90 | 180 | 270 } | null) {
        // 保存在 window 作用域，避免引入循环依赖；也可迁移到 signal
        (window as any).__urbanflow_currentProto = p;
      },
      getPrototype() {
        return (window as any).__urbanflow_currentProto as { id: string; category: string; wCells: number; hCells: number; orientation: 0 | 90 | 180 | 270 } | null;
      },
      getBlocks() {
        return placedBlocks();
      },
      addBlock(x: number, y: number, span: number) {
        const id = blockSeq() + 1;
        setBlockSeq(id);
        const size = span * 32;
        const next = placedBlocks().concat([{ id, x: Math.floor(x), y: Math.floor(y), w: size, h: size }]);
        commit(next);
      },
      addBlockRectWorld(x: number, y: number, w: number, h: number, orientation: 0 | 90 | 180 | 270, category?: string, protoId?: string) {
        const id = blockSeq() + 1;
        setBlockSeq(id);
        const next = placedBlocks().concat([{ id, x: Math.floor(x), y: Math.floor(y), w: Math.floor(w), h: Math.floor(h), orientation, category, protoId }]);
        commit(next);
      },
      removeBlocksInRect(x0: number, y0: number, x1: number, y1: number) {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);
        const next = placedBlocks().filter(b => {
          const bx0 = b.x, by0 = b.y, bx1 = b.x + b.w, by1 = b.y + b.h;
          const overlap = !(bx1 <= minX || bx0 >= maxX || by1 <= minY || by0 >= maxY);
          return !overlap;
        });
        commit(next);
      },
      clearBlocks() {
        commit([]);
      },
      undo() {
        if (history.length <= 1) return;
        const cur = history.pop()!;
        redoStack.push(cur);
        const prev = history[history.length - 1] ?? [];
        setPlacedBlocks(prev.map(b => ({ ...b })));
      },
      redo() {
        if (redoStack.length === 0) return;
        const next = redoStack.pop()!;
        pushHistory(next);
        setPlacedBlocks(next.map(b => ({ ...b })));
      },
    },
    traffic: {
      get spawnRate() {
        return trafficSpawnRate();
      },
      setSpawnRate(r: number) {
        const v = Math.max(0, Math.min(10, r));
        setTrafficSpawnRate(v);
      },
      get maxVehicles() {
        return trafficMaxVehicles();
      },
      setMaxVehicles(n: number) {
        const v = Math.max(0, Math.min(2000, Math.floor(n)));
        setTrafficMaxVehicles(v);
      },
      get speedLimitFactor() {
        return trafficSpeedLimitFactor();
      },
      setSpeedLimitFactor(f: number) {
        const v = Math.max(0.5, Math.min(1.5, f));
        setTrafficSpeedLimitFactor(v);
      },
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;


