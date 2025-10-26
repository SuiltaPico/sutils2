export type Tool = "road" | "res" | "com" | "off" | "erase" | "select";
export type GraphTool =
  | "g_add_node"
  | "g_add_edge"
  | "g_select"
  | "g_signal"
  | null;

export const STORAGE_KEY = "urbanflow/grid/v1";
export const GRAPH_KEY = "urbanflow/graph/v1";
export const GRID_W = 256;
export const GRID_H = 256;
export const TILE = 8; // 每格基础像素（缩放前）

export enum CellKind {
  Empty = 0,
  Road = 1,
  Res = 2,
  Com = 3,
  Off = 4,
}

export const cellColor: Record<number, string> = {
  [CellKind.Empty]: "#ffffff",
  [CellKind.Road]: "#6b7280",
  [CellKind.Res]: "#86efac",
  [CellKind.Com]: "#fde68a",
  [CellKind.Off]: "#93c5fd",
};

// 路网：节点-边与信号
export type Node = { id: number; x: number; y: number; signal?: Signal };
export type Edge = { id: number; a: number; b: number; length: number };
export type Signal = {
  enabled: boolean;
  cycle: number; // s
  green: number; // s (phase0)
  offset: number; // s
};

// 车辆与寻路
export type Vehicle = {
  id: number;
  path: number[]; // 节点序列
  edgeIdx: number; // 正在行驶 path[edgeIdx] -> path[edgeIdx+1]
  s: number; // 沿当前边的距离
  speed: number; // px/s
  color: string;
  length: number; // px
  width: number; // px
};
