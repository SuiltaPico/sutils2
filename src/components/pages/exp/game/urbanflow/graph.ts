import { UrbanFlowState } from "./state";
import { Edge, GRAPH_KEY, GRID_H, GRID_W, Node, TILE } from "./types";

function updateGraphCount(state: UrbanFlowState) {
  state.setGraphCount({ nodes: state.nodes.length, edges: state.edges.length });
}

export function addNodeAt(state: UrbanFlowState, wx: number, wy: number) {
  const x = Math.round(wx / TILE) * TILE;
  const y = Math.round(wy / TILE) * TILE;
  const n: Node = { id: state.nextNodeId++, x, y };
  state.nodes.push(n);
  updateGraphCount(state);
}

export function findNodeAt(
  state: UrbanFlowState,
  wx: number,
  wy: number,
  radius = 10
): Node | null {
  let best: Node | null = null;
  let bestD = radius * radius;
  for (const n of state.nodes) {
    const dx = n.x - wx;
    const dy = n.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD) {
      best = n;
      bestD = d2;
    }
  }
  return best;
}

export function addEdgeBetween(state: UrbanFlowState, a: Node, b: Node) {
  if (a.id === b.id) return;
  // 去重
  for (const e of state.edges) {
    if ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))
      return;
  }
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  const e: Edge = { id: state.nextEdgeId++, a: a.id, b: b.id, length: len };
  state.edges.push(e);
  updateGraphCount(state);
}

export function getNode(state: UrbanFlowState, id: number) {
  return state.nodes.find((n) => n.id === id)!;
}

export function neighbors(
  state: UrbanFlowState,
  nid: number
): { nid: number; edge: Edge }[] {
  const out: { nid: number; edge: Edge }[] = [];
  for (const e of state.edges) {
    if (e.a === nid) out.push({ nid: e.b, edge: e });
    else if (e.b === nid) out.push({ nid: e.a, edge: e });
  }
  return out;
}

export function edgeOther(e: Edge, nid: number) {
  return e.a === nid ? e.b : e.a;
}

export function edgeOrientationAtNode(
  state: UrbanFlowState,
  e: Edge,
  atNodeId: number
): "h" | "v" {
  const a = getNode(state, e.a);
  const b = getNode(state, e.b);
  let dx: number, dy: number;
  if (atNodeId === a.id) {
    dx = b.x - a.x;
    dy = b.y - a.y;
  } else {
    dx = a.x - b.x;
    dy = a.y - b.y;
  }
  return Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
}

export function ensureSignal(n: Node) {
  if (!n.signal) n.signal = { enabled: true, cycle: 30, green: 15, offset: 0 };
}

export function saveGraph(state: UrbanFlowState) {
  try {
    localStorage.setItem(
      GRAPH_KEY,
      JSON.stringify({
        nodes: state.nodes,
        edges: state.edges,
        nextNodeId: state.nextNodeId,
        nextEdgeId: state.nextEdgeId,
      })
    );
  } catch {}
}

export function loadGraph(state: UrbanFlowState) {
  try {
    const txt = localStorage.getItem(GRAPH_KEY);
    if (!txt) return;
    const obj = JSON.parse(txt);
    if (obj && Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
      state.nodes = obj.nodes;
      state.edges = obj.edges;
      state.nextNodeId =
        obj.nextNodeId ||
        state.nodes.reduce((m: number, n: Node) => Math.max(m, n.id), 0) + 1;
      state.nextEdgeId =
        obj.nextEdgeId ||
        state.edges.reduce((m: number, e: Edge) => Math.max(m, e.id), 0) + 1;
      updateGraphCount(state);
    }
  } catch {}
}

export function generateSampleGrid(
  state: UrbanFlowState,
  wrapper: HTMLDivElement,
  spawnVehicles: (count: number) => void
) {
  state.nodes = [];
  state.edges = [];
  state.nextNodeId = 1;
  state.nextEdgeId = 1;
  // 简单十字路
  const cx = GRID_W * TILE * 0.5;
  const cy = GRID_H * TILE * 0.5;
  const span = 80;
  const pts = [
    { x: cx, y: cy }, // Center
    { x: cx - span, y: cy }, // Left
    { x: cx + span, y: cy }, // Right
    { x: cx, y: cy - span }, // Up
    { x: cx, y: cy + span }, // Down
  ];
  for (const p of pts) addNodeAt(state, p.x, p.y);
  const [C, L, R, U, D] = state.nodes;
  addEdgeBetween(state, L, C);
  addEdgeBetween(state, R, C);
  addEdgeBetween(state, U, C);
  addEdgeBetween(state, D, C);
  ensureSignal(getNode(state, C.id));

  // 移动镜头到中心
  const s = state.scale();
  const rect = wrapper.getBoundingClientRect();
  state.setCamX(rect.width / 2 - cx * s);
  state.setCamY(rect.height / 2 - cy * s);

  saveGraph(state);
  updateGraphCount(state);
  // 预置一些车辆，便于直接看到效果
  spawnVehicles(20);
}
export function dijkstra(
  state: UrbanFlowState,
  start: number,
  goal: number
): number[] | null {
  const dist = new Map<number, number>();
  const prev = new Map<number, number | null>();
  const visited = new Set<number>();
  const pq: Array<{ id: number; d: number }> = [];
  function push(id: number, d: number) {
    let i = 0;
    while (i < pq.length && pq[i].d < d) i++;
    pq.splice(i, 0, { id, d });
  }
  for (const n of state.nodes) {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
  }
  dist.set(start, 0);
  push(start, 0);
  while (pq.length) {
    const cur = pq.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.id === goal) break;
    for (const nb of neighbors(state, cur.id)) {
      if (visited.has(nb.nid)) continue; // do not relax finalized nodes
      const d = dist.get(cur.id)!;
      const alt = d + nb.edge.length;
      if (alt < (dist.get(nb.nid) || Infinity)) {
        dist.set(nb.nid, alt);
        prev.set(nb.nid, cur.id);
        push(nb.nid, alt);
      }
    }
  }
  if ((dist.get(goal) ?? Infinity) === Infinity) return null;
  const path: number[] = [];
  let u: number | null = goal;
  let guard = 0;
  while (u != null) {
    path.push(u);
    u = prev.get(u) ?? null;
    if (guard++ > state.nodes.length) {
      console.error("Path reconstruction loop seems infinite. Aborting.", {
        start,
        goal,
        path,
        prev,
      });
      return null; // Avoid RangeError
    }
  }
  path.reverse();
  if (path[0] !== start) return null;
  return path;
}
