import type { AppStore } from "../../../core/state/createAppStore";
import { getIncidentZones, getClosedEdges, getEdgeCapacityFactor } from "../../incidents/systems/lifecycle";
import type { Graph, EdgeId } from "../services/graph";
import { listEntrances, shortestPathBfs } from "../services/graph";

type CollisionIncident = {
  id: string;
  type: "collision";
  at: { x: number; y: number };
  vehicles: [number, number];
  edgeId?: EdgeId;
  ts: number;
};

const recentPairs = new Map<string, number>(); // key: i-j (i<j), value: last ts
const PAIR_COOLDOWN_MS = 2000;
const WORLD_COLLISION_DIST = 6; // world units (~0.1875 m)

// 车辆 SoA（最小）：仅纵向速度与位置，用于演示 IDM 子集
type VehiclesSoA = {
  x: Float32Array;
  y: Float32Array;
  v: Float32Array; // 速度 (m/s)
  desiredV: Float32Array; // 期望速度 (m/s)
  bias: Float32Array; // 速度偏置系数（0.5–1.3）
  targetX: Float32Array; // 当前段目标点 X（世界坐标）
  targetY: Float32Array; // 当前段目标点 Y（世界坐标）
  waypointIndex: Uint16Array; // 当前目标点在路径中的索引
  count: number;
};

const state: {
  vehicles: VehiclesSoA | null;
  selected: number | null;
  // 每辆车的路径：包含节点坐标与对应段的边/限速信息
  paths: Array<{ xs: number[]; ys: number[]; nodeIds?: string[]; edgeIds?: EdgeId[]; speedLimits?: number[] } | null>;
  spawnAccumulator: number;
} = { vehicles: null, selected: null, paths: [], spawnAccumulator: 0 };

function createVehicles(n: number): VehiclesSoA {
  const count = Math.max(0, Math.floor(n));
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const v = new Float32Array(count);
  const desiredV = new Float32Array(count);
  const bias = new Float32Array(count);
  const targetX = new Float32Array(count);
  const targetY = new Float32Array(count);
  const waypointIndex = new Uint16Array(count);
  for (let i = 0; i < count; i += 1) {
    // 沿 x 轴均匀分布，初速为 0，期望速度 ~ 10–15 m/s
    x[i] = -200 + i * 20;
    y[i] = 0;
    v[i] = 0;
    desiredV[i] = 10 + ((i * 9301 + 49297) % 5000) / 1000; // 10..15
    bias[i] = 1.0;
    targetX[i] = 300; // 直走演示
    targetY[i] = 0;
    waypointIndex[i] = 0;
    state.paths[i] = { xs: [300], ys: [0] };
  }
  return { x, y, v, desiredV, bias, targetX, targetY, waypointIndex, count };
}

// IDM 子集（无前车约束，仅目标速度控制）：dv/dt = a_max * (1 - (v/v0)^delta)
function idmStep(v: number, v0: number, dt: number): number {
  const aMax = 1.0; // m/s^2
  const delta = 4.0;
  const ratio = Math.max(0, Math.min(5, v0 > 1e-3 ? v / v0 : 0));
  const acc = aMax * (1 - Math.pow(ratio, delta));
  const next = Math.max(0, v + acc * dt);
  return next;
}

function ensureCapacity(v: VehiclesSoA, minCapacity: number): VehiclesSoA {
  const curCap = v.x.length;
  if (minCapacity <= curCap) return v;
  const nextCap = Math.max(minCapacity, curCap * 2, 64);
  const growF32 = (arr: Float32Array) => {
    const next = new Float32Array(nextCap);
    next.set(arr);
    return next;
  };
  const growU16 = (arr: Uint16Array) => {
    const next = new Uint16Array(nextCap);
    next.set(arr);
    return next;
  };
  return {
    x: growF32(v.x),
    y: growF32(v.y),
    v: growF32(v.v),
    desiredV: growF32(v.desiredV),
    bias: growF32(v.bias),
    targetX: growF32(v.targetX),
    targetY: growF32(v.targetY),
    waypointIndex: growU16(v.waypointIndex),
    count: v.count,
  };
}

function planPathForGraph(g: Graph, fromNodeId: string, toNodeId: string): { xs: number[]; ys: number[]; nodeIds: string[]; edgeIds: EdgeId[]; speedLimits: number[] } | null {
  const blocked = getClosedEdges();
  const path = shortestPathBfs(g, fromNodeId, toNodeId, blocked);
  if (!path || path.length === 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const nodeIds: string[] = [];
  const edgeIds: EdgeId[] = [];
  const speedLimits: number[] = [];
  for (const nid of path) {
    const node = g.nodes.get(nid);
    if (!node) continue;
    xs.push(node.x);
    ys.push(node.y);
    nodeIds.push(nid);
  }
  // 推导边与分段限速
  for (let i = 1; i < nodeIds.length; i += 1) {
    const from = nodeIds[i - 1]!;
    const to = nodeIds[i]!;
    const out = g.adjacency.get(from) ?? [];
    const eid = out.find((id) => g.edges.get(id)?.to === to);
    if (eid) {
      edgeIds.push(eid);
      const lim = g.edges.get(eid)?.speedLimit;
      speedLimits.push(lim ?? 15); // 默认 15 m/s ~ 54 km/h
    } else {
      edgeIds.push(("" as unknown) as EdgeId);
      speedLimits.push(15);
    }
  }
  return { xs, ys, nodeIds, edgeIds, speedLimits };
}

function pickTwoDistinct<T>(arr: T[]): [T, T] | null {
  if (arr.length < 2) return null;
  const a = Math.floor(Math.random() * arr.length);
  let b = Math.floor(Math.random() * arr.length);
  if (b === a) b = (b + 1) % arr.length;
  return [arr[a]!, arr[b]!];
}

function trySpawnOne(app: AppStore, getGraph: () => Graph | null, edgeOccupancy: Map<EdgeId, number>) {
  if (!state.vehicles) state.vehicles = createVehicles(0);
  let v = state.vehicles!;
  // 目标容量检查
  v = state.vehicles = ensureCapacity(v, v.count + 1);

  const g = getGraph();
  let startX = -300, startY = 0;
  let path: { xs: number[]; ys: number[]; nodeIds?: string[]; edgeIds?: EdgeId[]; speedLimits?: number[] } | null = null;
  if (g && g.entrances.size >= 1) {
    const entrances = listEntrances(g);
    const allNodes = Array.from(g.nodes.values());
    const pair = pickTwoDistinct(entrances.length >= 2 ? entrances : allNodes);
    if (pair) {
      const [src, dst] = pair;
      path = planPathForGraph(g, src.id, dst.id);
      startX = src.x;
      startY = src.y;
    }
  }
  if (!path) {
    // 回退：直线演示
    path = { xs: [300], ys: [0] };
  }
  // 容量/封闭采纳：若首段边封闭或容量已满，则放弃本次生成
  if (g && path?.edgeIds && path.edgeIds.length > 0) {
    const firstEdge = path.edgeIds[0]!;
    // 封闭直接拒绝
    if (getClosedEdges().has(firstEdge)) {
      return;
    }
    const baseCap = g.edges.get(firstEdge)?.capacity ?? 8; // 默认基础容量 8 辆
    const factor = getEdgeCapacityFactor(firstEdge);
    const cap = Math.max(0, Math.floor(baseCap * factor));
    const occ = edgeOccupancy.get(firstEdge) ?? 0;
    if (occ >= cap) {
      return; // 容量已满，不生成
    }
  }

  const i = v.count;
  v.count += 1;
  v.x[i] = startX;
  v.y[i] = startY;
  v.v[i] = 0;
  v.desiredV[i] = 10 + ((i * 48271) % 6000) / 1000; // 10..16
  v.bias[i] = 1.0;
  v.waypointIndex[i] = 0;
  v.targetX[i] = path.xs[0] ?? startX;
  v.targetY[i] = path.ys[0] ?? startY;
  state.paths[i] = path;
  app.stats.incEntities(1);
}

function advanceVehicle(i: number, dtSec: number, app: AppStore) {
  const v = state.vehicles!;
  // 基于车辆个体偏置和分段限速的期望速度
  const baseDesired = Math.max(0.1, v.desiredV[i] * Math.max(0.5, Math.min(1.3, v.bias[i])));
  let segLimit = Infinity;
  const p = state.paths[i];
  const wi = v.waypointIndex[i];
  // waypointIndex 指向当前目标点，当前段索引为 wi-1
  const segIdx = (wi > 0 ? wi - 1 : -1);
  if (p && p.speedLimits && segIdx >= 0 && segIdx < p.speedLimits.length) {
    const factor = app.traffic?.speedLimitFactor ?? 1;
    segLimit = Math.max(0.1, p.speedLimits[segIdx] * factor);
  }
  // 事故减速区采纳：在任何有效区内则按区系数下调
  let zoneFactor = 1;
  try {
    const zones = getIncidentZones();
    if (zones.length > 0) {
      const x = v.x[i], y = v.y[i];
      for (const z of zones) {
        const dx = x - z.x;
        const dy = y - z.y;
        if (dx * dx + dy * dy <= z.radius * z.radius) {
          zoneFactor = Math.min(zoneFactor, z.factor);
        }
      }
    }
  } catch {}
  const desired = Math.min(baseDesired, segLimit) * zoneFactor;
  const nextV = idmStep(v.v[i], desired, dtSec);
  v.v[i] = nextV;
  const dx = v.targetX[i] - v.x[i];
  const dy = v.targetY[i] - v.y[i];
  const dist = Math.hypot(dx, dy);
  const speedWorld = nextV * 32; // 1 m ~ 32 world 单位
  if (dist > 1e-3) {
    const step = Math.min(dist, speedWorld * dtSec);
    const ux = dx / dist;
    const uy = dy / dist;
    v.x[i] += ux * step;
    v.y[i] += uy * step;
  }
  // 抵达当前 waypoint → 切换到下一个
  if (dist < 2) {
    const p = state.paths[i];
    if (p) {
      const nextIdx = v.waypointIndex[i] + 1;
      if (nextIdx < p.xs.length) {
        v.waypointIndex[i] = nextIdx;
        v.targetX[i] = p.xs[nextIdx] ?? v.targetX[i];
        v.targetY[i] = p.ys[nextIdx] ?? v.targetY[i];
      } else {
        // 到达终点 → 标记为需回收（通过返回 true 指示）
        return true;
      }
    } else {
      // 无路径（直线演示）
      if (v.x[i] > 300) return true;
    }
  }
  return false;
}

function despawnBySwap(i: number) {
  const v = state.vehicles!;
  const last = v.count - 1;
  if (i < 0 || i >= v.count) return;
  if (state.selected === last) state.selected = i; // 选中落到被交换的位置
  if (i !== last) {
    v.x[i] = v.x[last];
    v.y[i] = v.y[last];
    v.v[i] = v.v[last];
    v.desiredV[i] = v.desiredV[last];
    v.bias[i] = v.bias[last];
    v.targetX[i] = v.targetX[last];
    v.targetY[i] = v.targetY[last];
    v.waypointIndex[i] = v.waypointIndex[last];
    state.paths[i] = state.paths[last] ?? null;
  }
  state.paths[last] = null;
  v.count = Math.max(0, last);
}

export function startTrafficLoop(app: AppStore, opts?: { getGraph?: () => Graph | null }): () => void {
  // 初始为空，由生成器逐步填充
  state.vehicles = createVehicles(0);
  app.stats.setEntities(0);

  const getGraph = opts?.getGraph ?? (() => null);

  const onTick = (ev: Event) => {
    const dtSec = (ev as CustomEvent).detail?.dtSec as number | undefined;
    if (!dtSec || !state.vehicles) return;

    // 统计当前各边占有量（用于首段容量判定）
    const occupancy = new Map<EdgeId, number>();
    {
      const v = state.vehicles;
      for (let i = 0; i < v.count; i += 1) {
        const p = state.paths[i];
        if (!p || !p.edgeIds || p.edgeIds.length === 0) continue;
        const wi = v.waypointIndex[i];
        const segIdx = (wi > 0 ? wi - 1 : 0);
        const eid = p.edgeIds[segIdx];
        if (!eid) continue;
        occupancy.set(eid, (occupancy.get(eid) ?? 0) + 1);
      }
    }

    // 生成：基于 spawnRate（辆/秒），最多 maxVehicles
    const spawnRate = app.traffic?.spawnRate ?? 1;
    const maxVehicles = app.traffic?.maxVehicles ?? 200;
    state.spawnAccumulator += dtSec * spawnRate;
    const v = state.vehicles;
    while (state.spawnAccumulator >= 1 && v.count < maxVehicles) {
      state.spawnAccumulator -= 1;
      trySpawnOne(app, getGraph, occupancy);
    }

    // 前进与回收
    let i = 0;
    while (i < v.count) {
      const shouldDespawn = advanceVehicle(i, dtSec, app);
      if (shouldDespawn) {
        if (state.selected === i) state.selected = null;
        despawnBySwap(i);
        continue; // 当前位置已换成最后一辆，继续检查 i
      }
      i += 1;
    }

    // 简易碰撞检测：同一段上的车辆，按距离阈值判定
    try {
      const groups = new Map<EdgeId, number[]>();
      for (let k = 0; k < v.count; k += 1) {
        const p = state.paths[k];
        if (!p || !p.edgeIds || p.edgeIds.length === 0) continue;
        const wi = v.waypointIndex[k];
        const segIdx = wi > 0 ? wi - 1 : 0;
        const eid = p.edgeIds[segIdx];
        if (!eid) continue;
        if (!groups.has(eid)) groups.set(eid, []);
        groups.get(eid)!.push(k);
      }
      const now = performance.now();
      for (const [eid, ids] of groups.entries()) {
        const n = ids.length;
        if (n <= 1) continue;
        for (let a = 0; a < n; a += 1) {
          const i0 = ids[a]!;
          for (let b = a + 1; b < n; b += 1) {
            const i1 = ids[b]!;
            const dx = v.x[i0] - v.x[i1];
            const dy = v.y[i0] - v.y[i1];
            const d2 = dx * dx + dy * dy;
            if (d2 > WORLD_COLLISION_DIST * WORLD_COLLISION_DIST) continue;
            const key = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`;
            const last = recentPairs.get(key) ?? 0;
            if (now - last < PAIR_COOLDOWN_MS) continue;
            recentPairs.set(key, now);
            const inc: CollisionIncident = {
              id: `${Math.floor(now)}-${key}`,
              type: "collision",
              at: { x: (v.x[i0] + v.x[i1]) * 0.5, y: (v.y[i0] + v.y[i1]) * 0.5 },
              vehicles: [i0, i1],
              edgeId: eid,
              ts: Date.now(),
            };
            try {
              window.dispatchEvent(new CustomEvent("urbanflow:incident", { detail: inc }));
            } catch {}
          }
        }
      }
      // 清理过期 pair
      for (const [k2, t] of Array.from(recentPairs.entries())) {
        if (now - t > PAIR_COOLDOWN_MS * 2) recentPairs.delete(k2);
      }
    } catch {}

    app.stats.setEntities(v.count);
  };

  window.addEventListener("urbanflow:simTick", onTick as EventListener);

  return () => {
    window.removeEventListener("urbanflow:simTick", onTick as EventListener);
    state.vehicles = null;
    state.paths = [];
    state.selected = null;
    state.spawnAccumulator = 0;
  };
}

export function getVehiclesReadView(): { x: Float32Array; y: Float32Array; count: number } | null {
  if (!state.vehicles) return null;
  return { x: state.vehicles.x, y: state.vehicles.y, count: state.vehicles.count };
}

export function pickVehicleAtWorld(x: number, y: number, radiusWorld = 6): number | null {
  const v = state.vehicles;
  if (!v || v.count === 0) return null;
  let bestI: number | null = null;
  let bestD = Infinity;
  const r2 = radiusWorld * radiusWorld;
  for (let i = 0; i < v.count; i += 1) {
    const dx = v.x[i] - x;
    const dy = v.y[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2 && d2 < bestD) {
      bestD = d2;
      bestI = i;
    }
  }
  state.selected = bestI;
  return bestI;
}

export function getSelectedVehicleId(): number | null {
  return state.selected;
}

export function getVehicleStats(i: number): { x: number; y: number; v: number; desiredV: number; bias: number } | null {
  const v = state.vehicles;
  if (!v || i < 0 || i >= v.count) return null;
  return { x: v.x[i], y: v.y[i], v: v.v[i], desiredV: v.desiredV[i], bias: v.bias[i] };
}

export function setVehicleSpeedBias(i: number, bias: number) {
  const v = state.vehicles;
  if (!v || i < 0 || i >= v.count) return;
  v.bias[i] = Math.max(0.5, Math.min(1.3, bias));
}


