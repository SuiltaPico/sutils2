
// 核心类型定义

// 节点指针抽象：在 JS 模式下是对象引用，在 Memory 模式下是内存地址(index)
export type Pointer = any; 

// 基础节点接口
export interface BaseNode {
    id: string; // 用于可视化的唯一标识
    [key: string]: any;
}

// 内存后端抽象接口
export interface IMemoryBackend {
    name: string;
    // 分配节点
    malloc(data: any): Pointer;
    // 释放节点
    free(ptr: Pointer): void;
    // 读取属性
    read(ptr: Pointer, field: string): any;
    // 写入属性
    write(ptr: Pointer, field: string, value: any): void;
    // 获取根节点（入口）
    getRoot(): Pointer | null;
    setRoot(ptr: Pointer | null): void;
    // 重置内存
    reset(): void;
    // 获取可视化快照（返回节点列表和边列表）
    getSnapshot(): Snapshot;
    // 指针管理
    setPointer(name: string, target: Pointer | null, offset?: number): void;
    getPointer(name: string): { target: Pointer, offset?: number } | null;
    // 获取特定操作的模拟成本
    getCost(action: StepAction): DeviceCosts;
}

// 可视化快照数据结构
export interface Snapshot {
    nodes: VisualNode[];
    edges: VisualEdge[];
    pointers: VisualPointer[]; // 新增：具名指针（如 head, tail, current）
}

export interface VisualPointer {
    id: string;
    label: string;
    target: string; // 目标节点 ID
    offset?: number; // 如果指向的是数组，记录索引偏移
    color?: string;
}

export interface VisualNode {
    id: string;
    label: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    data: any; // 原始数据
    highlight?: boolean;
}

export interface VisualEdge {
    from: string;
    to: string;
    label?: string;
    color?: string;
}

// 数据结构抽象接口
export interface IDataStructure {
    name: string;
    // 初始化
    init(backend: IMemoryBackend): void;
    // 插入数据
    insert(value: any): Generator<StepAction>;
    // 查找数据
    search(value: any): Generator<StepAction>;
    // 删除数据
    delete(value: any): Generator<StepAction>;
}

// 步骤动作（用于可视化回放）
export interface StepAction {
    type: 'highlight' | 'move_ptr' | 'read' | 'write' | 'alloc' | 'free' | 'log';
    target?: string | Pointer; // 目标节点 ID 或 指针
    message?: string; // 操作描述
    payload?: any;
    costs?: DeviceCosts; // 本步骤产生的模拟耗时
}

// 模拟耗时统计 (单位：ns 或 抽象单位)
export interface DeviceCosts {
    cpu: number;    // CPU 时钟周期或计算耗时
    memory: number; // 内存访问耗时
    disk: number;   // 磁盘 I/O 耗时
}
