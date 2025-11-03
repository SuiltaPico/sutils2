import type { IRenderer } from "../../platform/render/RendererRegistry";
import type { AppStore } from "../../core/state/createAppStore";
import type { SignalPlan } from "../intersections/systems/signals";
import type { Graph } from "./services/graph";
import { buildGraphFromPolylines, listEntrances } from "./services/graph";
import { startTrafficLoop, getVehiclesReadView, getSelectedVehicleId, pickVehicleAtWorld, setVehicleSpeedBias, getVehicleStats } from "./systems/loop";

// 交通模块（骨架）：
// - 监听信号计划变更（来自 IntersectionPanel 的浏览器事件）
// - 暂存当前计划供 pathfind/loop 等子系统查询
// - 预留后续接入 graph/pathfind/sim 的注册

let rendererRef: IRenderer | null = null;
let appRef: AppStore | null = null;
let currentSignalPlan: SignalPlan | null = null;
let currentGraph: Graph | null = null;

export function registerTrafficFeature(renderer: IRenderer, app: AppStore) {
  let disposed = false;
  rendererRef = renderer;
  appRef = app;
  const disposers: (() => void)[] = [];

  const onSignalChanged = (ev: Event) => {
    try {
      const detail = (ev as CustomEvent).detail as { id?: string; at?: string } | undefined;
      // 惰性读取本地存储中的最新计划
      const raw = localStorage.getItem("urbanflow:signalPlan:v0");
      if (raw) {
        currentSignalPlan = JSON.parse(raw) as SignalPlan;
        // 可在此处派发内部事件或触发再路由（后续接入）
        // console.info("Traffic: signal plan updated", { id: detail?.id, at: detail?.at });
      }
    } catch {}
  };

  window.addEventListener("signalChanged", onSignalChanged as EventListener);

  // 初始化读取一次
  try {
    const raw = localStorage.getItem("urbanflow:signalPlan:v0");
    if (raw) currentSignalPlan = JSON.parse(raw) as SignalPlan;
  } catch {}

  // 启动交通循环（SIM-2：生成/回收 + 简化路径跟随）
  disposers.push(startTrafficLoop(app, { getGraph: () => currentGraph }));

  // 注册调试图层：绘制图节点/入口
  renderer.registerLayer("traffic.debugGraph", ({ ctx, width, height }) => {
    if (!app.layers.isVisible("traffic.debugGraph")) return;
    const alpha = app.layers.getOpacity("traffic.debugGraph");
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    // 变换：screen = world * scale + offset
    const scale = app.view.scale;
    const offset = app.view.offset;
    const g = currentGraph;
    if (g) {
      // 所有节点（浅灰）
      ctx.fillStyle = "#94a3b8";
      for (const node of g.nodes.values()) {
        const sx = node.x * scale + offset.x;
        const sy = node.y * scale + offset.y;
        if (sx < -4 || sy < -4 || sx > width + 4 || sy > height + 4) continue;
        ctx.beginPath();
        ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 入口节点（绿色）
      ctx.fillStyle = "#22c55e";
      const entrances = listEntrances(g);
      for (const node of entrances) {
        const sx = node.x * scale + offset.x;
        const sy = node.y * scale + offset.y;
        if (sx < -6 || sy < -6 || sx > width + 6 || sy > height + 6) continue;
        ctx.beginPath();
        ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  // 交通车辆调试图层：绘制车辆为小点
  renderer.registerLayer("traffic.vehicles", ({ ctx, width, height }) => {
    if (!app.layers.isVisible("traffic.vehicles")) return;
    const alpha = app.layers.getOpacity("traffic.vehicles");
    const scale = app.view.scale;
    const offset = app.view.offset;
    const viewRadius = Math.max(1, Math.floor(2 * Math.sqrt(scale)));
    const v = getVehiclesReadView();
    if (!v || v.count === 0) return;
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#60a5fa";
    const selected = getSelectedVehicleId();
    for (let i = 0; i < v.count; i += 1) {
      const sx = v.x[i] * scale + offset.x;
      const sy = v.y[i] * scale + offset.y;
      if (sx < -6 || sy < -6 || sx > width + 6 || sy > height + 6) continue;
      ctx.beginPath();
      ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, viewRadius, 0, Math.PI * 2);
      ctx.fill();
      if (selected === i) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, viewRadius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  return () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("signalChanged", onSignalChanged as EventListener);
    for (const d of disposers.splice(0)) {
      try { d(); } catch {}
    }
  };
}

export function getCurrentSignalPlan(): SignalPlan | null {
  try {
    const raw = localStorage.getItem("urbanflow:signalPlan:v0");
    if (!raw) return null;
    return JSON.parse(raw) as SignalPlan;
  } catch {
    return null;
  }
}

export function getGraph(): Graph | null {
  return currentGraph;
}

export function setGraph(graph: Graph | null) {
  currentGraph = graph;
  try { rendererRef?.requestFrame(); } catch {}
}

export function ensureDemoGraph() {
  // 构建一个简单“十字路口”的 polyline 集合作为演示
  const span = 256;
  const h = { id: "h", points: [ { x: -span, y: 0 }, { x: span, y: 0 } ] };
  const v = { id: "v", points: [ { x: 0, y: -span }, { x: 0, y: span } ] };
  const g = buildGraphFromPolylines([h, v]);
  setGraph(g);
}

// 交互：车辆拾取与速度偏置
export function selectVehicleAtWorld(x: number, y: number): number | null {
  const id = pickVehicleAtWorld(x, y, 8);
  try { rendererRef?.requestFrame(); } catch {}
  return id;
}

export function setSelectedVehicleSpeedBias(bias: number) {
  const id = getSelectedVehicleId();
  if (id == null) return;
  setVehicleSpeedBias(id, bias);
}

export function getSelectedVehicleStats() {
  const id = getSelectedVehicleId();
  if (id == null) return null;
  return getVehicleStats(id);
}


