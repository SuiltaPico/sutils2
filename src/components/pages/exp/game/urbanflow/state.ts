import { createMemo, createSignal } from "solid-js";
import { Edge, GraphTool, Node, RoadBlock, RoadBlockKind, Tool, Vehicle } from "./types";

export function createUrbanFlowState() {
  // 视图/工具
  const [scale, setScale] = createSignal(1);
  const [camX, setCamX] = createSignal(0);
  const [camY, setCamY] = createSignal(0);
  const [tool, setTool] = createSignal<Tool>("road");
  const [brush, setBrush] = createSignal(2);
  const [showGrid, setShowGrid] = createSignal(true);
  const [graphTool, setGraphTool] = createSignal<GraphTool>(null);
  const [placingRect, setPlacingRect] = createSignal(false);
  const [blockKind, setBlockKind] = createSignal<RoadBlockKind | null>(null);
  const [simRunning, setSimRunning] = createSignal(true);
  const [autoCommute, setAutoCommute] = createSignal(true);
  const [commuteRate, setCommuteRate] = createSignal(1); // base trips/sec

  // 网格数据
  const cells = new Uint8Array(256 * 256);
  type CellChange = { index: number; before: number; after: number };
  let currentStroke: Map<number, CellChange> | null = null;
  const undoStack: CellChange[][] = [];
  const redoStack: CellChange[][] = [];
  const MAX_HISTORY = 100;

  // 矩形放置（建筑块）
  type GridPoint = { gx: number; gy: number };
  let rectStart: GridPoint | null = null;
  let rectHover: GridPoint | null = null;

  // 路网：节点-边与信号
  let nodes: Node[] = [];
  let edges: Edge[] = [];
  let nextNodeId = 1;
  let nextEdgeId = 1;
  const [selectedNodeId, setSelectedNodeId] = createSignal<number | null>(null);
  let pendingEdgeStart: number | null = null;

  // 道路块
  let roadBlocks: RoadBlock[] = [];
  let nextRoadBlockId = 1;

  // 计数信号（用于侧栏实时显示）
  const [vehicleCount, setVehicleCount] = createSignal(0);
  const [graphCount, setGraphCount] = createSignal({ nodes: 0, edges: 0 });
  const [zoneStats, setZoneStats] = createSignal({ res: 0, com: 0, off: 0 });
  // zone cell indices (linear indices into cells array)
  let resCellIndices: number[] = [];
  let comCellIndices: number[] = [];
  let offCellIndices: number[] = [];

  const simTime = (() => {
    let t = 0;
    return {
      get: () => t,
      add: (dt: number) => (t += dt),
      set: (v: number) => (t = v),
    };
  })();
  let commuteAccumulator = 0;

  const hasGraph = createMemo(
    () => graphCount().nodes > 0 && graphCount().edges > 0
  );

  // 车辆
  let vehicles: Vehicle[] = [];
  let nextVehicleId = 1;

  const state = {
    // 视图/工具
    scale,
    setScale,
    camX,
    setCamX,
    camY,
    setCamY,
    tool,
    setTool,
    brush,
    setBrush,
    showGrid,
    setShowGrid,
    graphTool,
    setGraphTool,
    placingRect,
    setPlacingRect,
    blockKind,
    setBlockKind,
    simRunning,
    setSimRunning,
    autoCommute,
    setAutoCommute,
    commuteRate,
    setCommuteRate,

    // 网格数据
    cells,
    get currentStroke() {
      return currentStroke;
    },
    set currentStroke(v: Map<number, CellChange> | null) {
      currentStroke = v;
    },
    undoStack,
    redoStack,
    MAX_HISTORY,

    // 路网
    get nodes() {
      return nodes;
    },
    set nodes(v: Node[]) {
      nodes = v;
    },
    get edges() {
      return edges;
    },
    set edges(v: Edge[]) {
      edges = v;
    },
    get roadBlocks() {
      return roadBlocks;
    },
    set roadBlocks(v: RoadBlock[]) {
      roadBlocks = v;
    },
    get nextNodeId() {
      return nextNodeId;
    },
    set nextNodeId(v: number) {
      nextNodeId = v;
    },
    get nextEdgeId() {
      return nextEdgeId;
    },
    set nextEdgeId(v: number) {
      nextEdgeId = v;
    },
    get nextRoadBlockId() {
      return nextRoadBlockId;
    },
    set nextRoadBlockId(v: number) {
      nextRoadBlockId = v;
    },
    selectedNodeId,
    setSelectedNodeId,
    get pendingEdgeStart() {
      return pendingEdgeStart;
    },
    set pendingEdgeStart(v: number | null) {
      pendingEdgeStart = v;
    },

    // 计数
    vehicleCount,
    setVehicleCount,
    graphCount,
    setGraphCount,
    hasGraph,
    zoneStats,
    setZoneStats,

    // 模拟
    simTime,
    get commuteAccumulator() {
      return commuteAccumulator;
    },
    set commuteAccumulator(v: number) {
      commuteAccumulator = v;
    },
    get vehicles() {
      return vehicles;
    },
    set vehicles(v: Vehicle[]) {
      vehicles = v;
    },
    get nextVehicleId() {
      return nextVehicleId;
    },
    set nextVehicleId(v: number) {
      nextVehicleId = v;
    },

    // 区域索引
    get resCellIndices() {
      return resCellIndices;
    },
    set resCellIndices(v: number[]) {
      resCellIndices = v;
    },
    get comCellIndices() {
      return comCellIndices;
    },
    set comCellIndices(v: number[]) {
      comCellIndices = v;
    },
    get offCellIndices() {
      return offCellIndices;
    },
    set offCellIndices(v: number[]) {
      offCellIndices = v;
    },

    // 矩形放置
    get rectStart() {
      return rectStart;
    },
    set rectStart(v: GridPoint | null) {
      rectStart = v;
    },
    get rectHover() {
      return rectHover;
    },
    set rectHover(v: GridPoint | null) {
      rectHover = v;
    },
  };

  return state;
}

export type UrbanFlowState = ReturnType<typeof createUrbanFlowState>;
