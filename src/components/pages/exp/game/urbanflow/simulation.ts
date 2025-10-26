import { dijkstra, edgeOrientationAtNode, getNode } from "./graph";
import { UrbanFlowState } from "./state";
import { Edge, Vehicle } from "./types";

function currentPhaseAllows(
  state: UrbanFlowState,
  at: any,
  incoming: Edge | null,
  outgoing: Edge
): boolean {
  if (!at.signal || !at.signal.enabled) return true;
  const cyc = at.signal.cycle;
  const g = Math.max(1, Math.min(cyc - 1, at.signal.green));
  const t = (((state.simTime.get() + at.signal.offset) % cyc) + cyc) % cyc;
  const phase0 = t < g; // 0相位: 纵向；1相位: 横向
  const ori = edgeOrientationAtNode(state, outgoing, at.id);
  return (ori === "v" && phase0) || (ori === "h" && !phase0);
}

function spawnVehicleRandom(state: UrbanFlowState) {
  if (state.nodes.length < 2) {
    return;
  }
  let a = state.nodes[Math.floor(Math.random() * state.nodes.length)].id;
  let b = state.nodes[Math.floor(Math.random() * state.nodes.length)].id;
  let tries = 0;
  while (b === a && tries++ < 10)
    b = state.nodes[Math.floor(Math.random() * state.nodes.length)].id;

  const path = dijkstra(state, a, b);

  if (!path || path.length < 2) {
    return;
  }
  const v: Vehicle = {
    id: state.nextVehicleId++,
    path,
    edgeIdx: 0,
    s: 0,
    speed: 80,
    color: "#ef4444",
    length: 10,
    width: 6,
  };
  state.vehicles.push(v);
}

export function spawnVehicles(state: UrbanFlowState, count: number) {
  for (let i = 0; i < count; i++) spawnVehicleRandom(state);
  state.setVehicleCount(state.vehicles.length);
}
export function clearVehicles(state: UrbanFlowState) {
  state.vehicles = [];
  state.setVehicleCount(0);
}

export function updateSim(state: UrbanFlowState, dt: number) {
  if (!state.simRunning()) return;
  state.simTime.add(dt);
  for (const v of state.vehicles) {
    // 当前边
    const a = getNode(state, v.path[v.edgeIdx]);
    const b = getNode(state, v.path[v.edgeIdx + 1]);
    const curEdge: Edge | undefined = state.edges.find(
      (e: Edge) =>
        (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id)
    );
    const length = curEdge?.length ?? Math.hypot(b.x - a.x, b.y - a.y);
    // 目标节点是 b
    const atNode = b;
    const nextEdge: Edge | null =
      v.edgeIdx + 2 < v.path.length
        ? state.edges.find(
            (e: Edge) =>
              (e.a === b.id && e.b === v.path[v.edgeIdx + 2]) ||
              (e.b === b.id && e.a === v.path[v.edgeIdx + 2])
          ) || null
        : null;
    // 简化：到末端 4px 内判定是否需要红灯等待
    const remaining = length - v.s;
    let canAdvance = true;
    if (remaining <= Math.max(6, v.length) && nextEdge) {
      // 信号判定
      const ok = currentPhaseAllows(state, atNode, curEdge || null, nextEdge);
      if (!ok) canAdvance = false;
    }
    if (canAdvance) {
      v.s += v.speed * dt;
    }
    if (v.s >= length) {
      v.edgeIdx++;
      v.s = 0;
    }
  }
  // 回收到达终点的车辆
  state.vehicles = state.vehicles.filter((v) => v.edgeIdx < v.path.length - 1);
  // 同步车辆计数（HUD/侧栏依赖）
  if (state.vehicleCount() !== state.vehicles.length)
    state.setVehicleCount(state.vehicles.length);
}
