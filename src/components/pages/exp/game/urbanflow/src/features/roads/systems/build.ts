// TODO: 将来替换为项目中共享的向量类型
/** 2D 向量 */
export type Vec2 = { x: number; y: number };

/** 唯一标识一个路网节点 */
export type NodeId = string | number;
/** 唯一标识一条路网边 */
export type EdgeId = string | number;

/** 锚点：引用一个已存在的节点 */
export type NodeRef = {
  type: "node";
  nodeId: NodeId;
};

/** 锚点：引用在某条边上的一个投影点 */
export type EdgeProjectionRef = {
  type: "edge";
  edgeId: EdgeId;
  /** 归一化位置 (0.0 -> 边的起点, 1.0 -> 边的终点) */
  s: number;
  /** 投影点的世界坐标 (缓存) */
  pos: Vec2;
};

/** 自由点锚点：世界坐标系中的一个点 */
export type PointRef = {
  type: "point";
  pos: Vec2;
};

/**
 * 道路建造的锚点，可以是节点、边的投影或自由点。
 * 这是实现 Cities: Skylines 风格建路工具的关键。
 */
export type AnchorRef = NodeRef | EdgeProjectionRef | PointRef;

/** placeRoadBetweenAnchors 命令的选项 */
export type PlaceRoadOptions = {
  sectionTemplateId: string;
  laneCount?: [number, number];
  vMaxKmh?: number;
  /** 是否在与现有路段相交时自动拆分并插入节点 */
  autoSplit?: boolean;
  /** 是否平滑生成的道路曲线 */
  smooth?: boolean;
};

/**
 * 在两个锚点之间建造一条道路。
 * 这是 ROAD-2 任务的核心实现，对标 Cities: Skylines 的核心建路逻辑。
 * @param a 起始锚点
 * @param b 结束锚点
 * @param options 道路选项
 */
export function placeRoadBetweenAnchors(a: AnchorRef, b: AnchorRef, options: PlaceRoadOptions) {
  // TODO: 实现建造逻辑
  // 1. 解析锚点 a 和 b：
  //    - 如果是 NodeRef，直接使用该节点。
  //    - 如果是 EdgeProjectionRef，需要在 edgeId 的 s 位置拆分路段，创建一个新节点。
  //    - 如果是 PointRef，直接创建一个新节点。
  // 2. 获得起始节点 na 和结束节点 nb。
  // 3. 在 na 和 nb 之间创建一条新的 RoadEdge。
  // 4. 将新边和（可能创建的）新节点添加到路网图中。
  // 5. 触发路网拓扑变更事件，以便寻路和其他系统更新。
  // 6. 返回一个包含变更的事务对象，以便实现撤销/重做。
  console.log("Placing road between", a, "and", b, "with options", options);

  // 临时返回，后续将替换为真正的事务对象
  return {
    success: true,
    createdNodeIds: [],
    createdEdgeIds: [],
    modifiedEdgeIds: [],
  };
}
