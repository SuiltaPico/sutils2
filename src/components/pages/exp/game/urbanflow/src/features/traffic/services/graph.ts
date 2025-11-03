export type NodeId = string;
export type EdgeId = string;

export type GraphNode = {
  id: NodeId;
  x: number;
  y: number;
};

export type GraphEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  length: number;
  speedLimit?: number;
  capacity?: number;
};

export type Graph = {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<EdgeId, GraphEdge>;
  adjacency: Map<NodeId, EdgeId[]>; // 出边表
  reverseAdjacency: Map<NodeId, EdgeId[]>; // 入边表
  entrances: Set<NodeId>; // 入口节点（可生成车辆）
};

export type Polyline = { id: string; points: { x: number; y: number }[]; speedLimit?: number };

export function createEmptyGraph(): Graph {
  return {
    nodes: new Map(),
    edges: new Map(),
    adjacency: new Map(),
    reverseAdjacency: new Map(),
    entrances: new Set(),
  };
}

export function buildGraphFromPolylines(polylines: Polyline[]): Graph {
  const graph = createEmptyGraph();
  let edgeSeq = 0;

  const getOrAddNode = (x: number, y: number): NodeId => {
    const id = `${Math.round(x)}:${Math.round(y)}`;
    if (!graph.nodes.has(id)) {
      graph.nodes.set(id, { id, x, y });
      graph.adjacency.set(id, []);
      graph.reverseAdjacency.set(id, []);
    }
    return id;
  };

  for (const pl of polylines) {
    for (let i = 1; i < pl.points.length; i += 1) {
      const a = pl.points[i - 1]!;
      const b = pl.points[i]!;
      const from = getOrAddNode(a.x, a.y);
      const to = getOrAddNode(b.x, b.y);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const id = `e${edgeSeq += 1}` as EdgeId;
      const edge: GraphEdge = { id, from, to, length, speedLimit: pl.speedLimit };
      graph.edges.set(id, edge);
      graph.adjacency.get(from)!.push(id);
      graph.reverseAdjacency.get(to)!.push(id);
    }
  }

  // 简单入口定义：入边为空且出边非空的节点视为入口
  for (const [nid] of graph.nodes) {
    const out = graph.adjacency.get(nid) ?? [];
    const incoming = graph.reverseAdjacency.get(nid) ?? [];
    if (out.length > 0 && incoming.length === 0) {
      graph.entrances.add(nid);
    }
  }

  return graph;
}

export function listEntrances(graph: Graph): GraphNode[] {
  const result: GraphNode[] = [];
  for (const id of graph.entrances) {
    const node = graph.nodes.get(id);
    if (node) result.push(node);
  }
  return result;
}

export function shortestPathBfs(graph: Graph, source: NodeId, target: NodeId, blockedEdges?: Set<EdgeId>): NodeId[] | null {
  if (!graph.nodes.has(source) || !graph.nodes.has(target)) return null;
  const queue: NodeId[] = [source];
  const visited = new Set<NodeId>([source]);
  const parent = new Map<NodeId, NodeId | null>([[source, null]]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) break;
    const outEdges = graph.adjacency.get(cur) ?? [];
    for (const eid of outEdges) {
      if (blockedEdges && blockedEdges.has(eid)) continue; // 跳过封闭边
      const e = graph.edges.get(eid)!;
      if (!visited.has(e.to)) {
        visited.add(e.to);
        parent.set(e.to, cur);
        queue.push(e.to);
      }
    }
  }
  if (!visited.has(target)) return null;
  const path: NodeId[] = [];
  let cur: NodeId | null = target;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}


