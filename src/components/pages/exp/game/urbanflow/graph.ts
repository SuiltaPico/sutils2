import { UrbanFlowState } from "./state";
import { Edge, GRAPH_KEY, GRID_BH, GRID_BW, GRID_H, GRID_W, Node, ROAD_BLOCKS_KEY, TILE } from "./types";

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

// 根据矩形道路块，自动生成一个“中心十字”简易路网：
// 在矩形中心与四个边中点生成节点，并连通中心-四边。
export function autoBuildRoadGraphForRect(
  state: UrbanFlowState,
  gx0: number,
  gy0: number,
  gx1: number,
  gy1: number
) {
  const x0 = Math.max(0, Math.min(gx0, gx1));
  const x1 = Math.min(GRID_W - 1, Math.max(gx0, gx1));
  const y0 = Math.max(0, Math.min(gy0, gy1));
  const y1 = Math.min(GRID_H - 1, Math.max(gy0, gy1));

  const cx = ((x0 + x1 + 1) * 0.5) * TILE;
  const cy = ((y0 + y1 + 1) * 0.5) * TILE;
  const mxL = (x0 + 0.5) * TILE;
  const mxR = (x1 + 0.5) * TILE;
  const myT = (y0 + 0.5) * TILE;
  const myB = (y1 + 0.5) * TILE;

  // 创建 5 个节点：中心、左右中点、上下中点
  const beforeNodeId = state.nextNodeId;
  addNodeAt(state, cx, cy);
  addNodeAt(state, mxL, cy);
  addNodeAt(state, mxR, cy);
  addNodeAt(state, cx, myT);
  addNodeAt(state, cx, myB);

  // 获取这五个节点（按创建顺序）
  const created = state.nodes.filter((n) => n.id >= beforeNodeId);
  if (created.length < 5) return;
  const [C, L, R, T, B] = created;

  // 连接中心到四个方向
  addEdgeBetween(state, C, L);
  addEdgeBetween(state, C, R);
  addEdgeBetween(state, C, T);
  addEdgeBetween(state, C, B);

  saveGraph(state);
}

// 基于道路块重建整张路网：
// - 将道路块（粗网格坐标）映射为占用布尔格
// - 在度数!=2 或 转弯点处生成节点
// - 沿直线在节点间生成边
export function rebuildGraphFromRoadBlocks(state: UrbanFlowState) {
  const bw = GRID_BW | 0;
  const bh = GRID_BH | 0;
  const occ: boolean[] = new Array(bw * bh).fill(false);
  const at = (bx: number, by: number) => occ[by * bw + bx];
  const set = (bx: number, by: number) => {
    if (bx >= 0 && by >= 0 && bx < bw && by < bh) occ[by * bw + bx] = true;
  };
  for (const rb of state.roadBlocks) set(rb.bx, rb.by);

  const degMap = new Map<string, number>();
  const isNodeCell = new Map<string, boolean>();
  const key = (bx: number, by: number) => `${bx},${by}`;
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  // 统计度数并标记节点
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      if (!at(bx, by)) continue;
      let d = 0;
      const nb: [number, number][] = [];
      for (const { dx, dy } of dirs) {
        const nx = bx + dx,
          ny = by + dy;
        if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && at(nx, ny)) {
          d++;
          nb.push([nx, ny]);
        }
      }
      degMap.set(key(bx, by), d);
      let isNode = false;
      if (d !== 2) isNode = d > 0; // 度数 1/3/4 为节点
      else {
        // d==2，若不共线（拐弯）也应为节点
        const [a, b] = nb;
        if (a[0] !== b[0] && a[1] !== b[1]) isNode = true;
      }
      if (isNode) isNodeCell.set(key(bx, by), true);
    }

  // 新建节点列表
  const nodes: Node[] = [];
  const nodeIdAt = new Map<string, number>();
  const toWorld = (bx: number, by: number) => {
    const gx = bx * 4 + 2; // 中心格
    const gy = by * 4 + 2;
    return { x: gx * TILE, y: gy * TILE };
  };
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      if (!isNodeCell.get(key(bx, by))) continue;
      const { x, y } = toWorld(bx, by);
      nodes.push({ id: nodes.length + 1, x, y });
      nodeIdAt.set(key(bx, by), nodes.length);
    }

  // 构建边：从每个节点朝四个方向延伸，直到遇到下一个节点
  const edges: Edge[] = [];
  const visited = new Set<string>();
  const markSeg = (bx0: number, by0: number, bx1: number, by1: number) =>
    visited.add(`${bx0},${by0}->${bx1},${by1}`);
  const seen = (bx0: number, by0: number, bx1: number, by1: number) =>
    visited.has(`${bx0},${by0}->${bx1},${by1}`) ||
    visited.has(`${bx1},${by1}->${bx0},${by0}`);

  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      if (!isNodeCell.get(key(bx, by))) continue;
      const nidA = nodeIdAt.get(key(bx, by))!;
      for (const { dx, dy } of dirs) {
        const nx = bx + dx,
          ny = by + dy;
        if (!(nx >= 0 && ny >= 0 && nx < bw && ny < bh)) continue;
        if (!at(nx, ny)) continue;
        if (seen(bx, by, nx, ny)) continue;
        // 沿直线推进，直到遇到节点或尽头
        let cx = nx,
          cy = ny;
        while (cx >= 0 && cy >= 0 && cx < bw && cy < bh && at(cx, cy)) {
          if (isNodeCell.get(key(cx, cy))) break;
          cx += dx;
          cy += dy;
        }
        if (!(cx >= 0 && cy >= 0 && cx < bw && cy < bh)) continue;
        if (!isNodeCell.get(key(cx, cy))) continue;
        const nidB = nodeIdAt.get(key(cx, cy))!;
        const A = nodes[nidA - 1];
        const B = nodes[nidB - 1];
        const len = Math.hypot(A.x - B.x, A.y - B.y);
        edges.push({ id: edges.length + 1, a: nidA, b: nidB, length: len });
        // 标记经过的段，避免重复
        let tx = bx,
          ty = by;
        while (tx !== cx || ty !== cy) {
          const ux = tx + dx,
            uy = ty + dy;
          markSeg(tx, ty, ux, uy);
          tx = ux;
          ty = uy;
        }
      }
    }

  // 覆盖原有路网
  state.nodes = nodes;
  state.edges = edges;
  state.nextNodeId = nodes.length + 1;
  state.nextEdgeId = edges.length + 1;
  updateGraphCount(state);
  saveGraph(state);
}

export function saveRoadBlocks(state: UrbanFlowState) {
  try {
    localStorage.setItem(
      ROAD_BLOCKS_KEY,
      JSON.stringify({ blocks: state.roadBlocks, nextId: state.nextRoadBlockId })
    );
  } catch {}
}

export function loadRoadBlocks(state: UrbanFlowState) {
  try {
    const txt = localStorage.getItem(ROAD_BLOCKS_KEY);
    if (!txt) return;
    const obj = JSON.parse(txt);
    if (obj && Array.isArray(obj.blocks)) {
      state.roadBlocks = obj.blocks;
      state.nextRoadBlockId = obj.nextId || (state.roadBlocks.reduce((m: number, b: any) => Math.max(m, b.id), 0) + 1);
    }
  } catch {}
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

export function astar(
  state: UrbanFlowState,
  start: number,
  goal: number
): number[] | null {
  if (start === goal) return [start];
  const getNodeLocal = (id: number) => getNode(state, id);
  const goalNode = getNodeLocal(goal);
  const h = (nid: number) => {
    const n = getNodeLocal(nid);
    const dx = n.x - goalNode.x;
    const dy = n.y - goalNode.y;
    return Math.hypot(dx, dy);
  };
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const prev = new Map<number, number | null>();
  const closed = new Set<number>();
  const open: Array<{ id: number; f: number }> = [];
  function pushOpen(id: number, f: number) {
    let i = 0;
    while (i < open.length && open[i].f < f) i++;
    open.splice(i, 0, { id, f });
  }
  for (const n of state.nodes) {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
    prev.set(n.id, null);
  }
  gScore.set(start, 0);
  fScore.set(start, h(start));
  pushOpen(start, fScore.get(start)!);
  while (open.length) {
    const current = open.shift()!; // lowest f
    if (closed.has(current.id)) continue;
    if (current.id === goal) break;
    closed.add(current.id);
    const gCur = gScore.get(current.id)!;
    for (const nb of neighbors(state, current.id)) {
      if (closed.has(nb.nid)) continue;
      const tentativeG = gCur + nb.edge.length;
      if (tentativeG < (gScore.get(nb.nid) ?? Infinity)) {
        gScore.set(nb.nid, tentativeG);
        prev.set(nb.nid, current.id);
        const f = tentativeG + h(nb.nid);
        fScore.set(nb.nid, f);
        pushOpen(nb.nid, f);
      }
    }
  }
  if ((gScore.get(goal) ?? Infinity) === Infinity) return null;
  const path: number[] = [];
  let u: number | null = goal;
  let guard = 0;
  while (u != null) {
    path.push(u);
    u = prev.get(u) ?? null;
    if (guard++ > state.nodes.length) return null;
  }
  path.reverse();
  if (path[0] !== start) return null;
  return path;
}