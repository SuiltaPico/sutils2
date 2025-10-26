import { Accessor, Setter } from "solid-js";
import { CellKind, cellColor, GraphTool, Node, Tool, Vehicle } from "./types";

function Legend(props: { color: string; label: string }) {
  return (
    <div class="flex items-center gap-2">
      <span
        class="inline-block w-4 h-4 rounded-sm"
        style={{ "background-color": props.color }}
      />
      <span>{props.label}</span>
    </div>
  );
}

type SidebarProps = {
  tool: Accessor<Tool>;
  setTool: Setter<Tool>;
  brush: Accessor<number>;
  setBrush: Setter<number>;
  graphTool: Accessor<GraphTool>;
  setGraphTool: Setter<GraphTool>;
  simRunning: Accessor<boolean>;
  setSimRunning: Setter<boolean>;
  generateSampleGrid: () => void;
  spawnVehicles: (count: number) => void;
  clearVehicles: () => void;
  hasGraph: Accessor<boolean>;
  graphCount: Accessor<{ nodes: number; edges: number }>;
  vehicleCount: Accessor<number>;
  showGrid: Accessor<boolean>;
  setShowGrid: Setter<boolean>;
  selectedNode: Accessor<Node | null>;
  saveGraph: () => void;
  loadGraph: () => void;
  saveGrid: () => void;
  loadGrid: () => void;
  clearGrid: () => void;
  undo: () => void;
  redo: () => void;
  clamp: (n: number, a: number, b: number) => number;
};

export function Sidebar(props: SidebarProps) {
  return (
    <div class="w-72 border-l p-3 space-y-3 bg-gray-50">
      <h2 class="text-lg font-semibold">工具</h2>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm">刷子大小</label>
          <input
            type="range"
            min="1"
            max="10"
            value={props.brush()}
            onInput={(e) =>
              props.setBrush(Number((e.target as HTMLInputElement).value))
            }
          />
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "road" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("road")}
          >
            道路
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "res" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("res")}
          >
            住宅
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "com" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("com")}
          >
            商业
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "off" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("off")}
          >
            办公
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "erase" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("erase")}
          >
            推土机
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.tool() === "select" ? "bg-gray-200" : ""
            }`}
            onClick={() => props.setTool("select")}
          >
            选择
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">路网/信号/AI</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.graphTool() === "g_add_node" ? "bg-gray-200" : ""
            }`}
            onClick={() =>
              props.setGraphTool(
                props.graphTool() === "g_add_node" ? null : "g_add_node"
              )
            }
          >
            加节点
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.graphTool() === "g_add_edge" ? "bg-gray-200" : ""
            }`}
            onClick={() =>
              props.setGraphTool(
                props.graphTool() === "g_add_edge" ? null : "g_add_edge"
              )
            }
          >
            连边
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.graphTool() === "g_select" ? "bg-gray-200" : ""
            }`}
            onClick={() =>
              props.setGraphTool(
                props.graphTool() === "g_select" ? null : "g_select"
              )
            }
          >
            选择点
          </button>
          <button
            class={`border rounded px-2 py-1 hover:bg-gray-100 ${
              props.graphTool() === "g_signal" ? "bg-gray-200" : ""
            }`}
            onClick={() =>
              props.setGraphTool(
                props.graphTool() === "g_signal" ? null : "g_signal"
              )
            }
          >
            切换信号
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => {
              props.generateSampleGrid();
            }}
          >
            示例路网
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => {
              props.spawnVehicles(10);
            }}
          >
            生成车辆×10
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.clearVehicles()}
          >
            清空车辆
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.setSimRunning(!props.simRunning())}
          >
            {props.simRunning() ? "暂停" : "继续"}
          </button>
        </div>
        <div class="text-xs text-gray-600">
          {props.hasGraph()
            ? `节点 ${props.graphCount().nodes} · 边 ${
                props.graphCount().edges
              } · 车 ${props.vehicleCount()}`
            : "未加载路网"}
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">图层</h3>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.showGrid()}
            onInput={(e) => {
              props.setShowGrid((e.target as HTMLInputElement).checked);
            }}
          />{" "}
          显示网格
        </label>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">信号编辑器</h3>
        <div class="text-sm">
          {props.selectedNode() == null ? (
            <div class="text-gray-500">未选择节点</div>
          ) : (
            (() => {
              const n = props.selectedNode()!;
              return (
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span>ID {n.id}</span>
                    <label class="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={n.signal!.enabled}
                        onInput={(e) => {
                          n.signal!.enabled = (
                            e.target as HTMLInputElement
                          ).checked;
                          props.saveGraph();
                        }}
                      />{" "}
                      启用
                    </label>
                  </div>
                  <label class="flex items-center justify-between gap-2">
                    <span>周期(s)</span>
                    <input
                      class="border rounded px-1 w-16"
                      type="number"
                      min="5"
                      max="180"
                      value={n.signal!.cycle}
                      onInput={(e) => {
                        n.signal!.cycle = props.clamp(
                          Number((e.target as HTMLInputElement).value),
                          5,
                          180
                        );
                        if (n.signal!.green >= n.signal!.cycle)
                          n.signal!.green = n.signal!.cycle - 1;
                        props.saveGraph();
                      }}
                    />
                  </label>
                  <label class="flex items-center justify-between gap-2">
                    <span>绿灯(s)</span>
                    <input
                      class="border rounded px-1 w-16"
                      type="number"
                      min="1"
                      max="179"
                      value={n.signal!.green}
                      onInput={(e) => {
                        n.signal!.green = props.clamp(
                          Number((e.target as HTMLInputElement).value),
                          1,
                          n.signal!.cycle - 1
                        );
                        props.saveGraph();
                      }}
                    />
                  </label>
                  <label class="flex items-center justify-between gap-2">
                    <span>相位偏移(s)</span>
                    <input
                      class="border rounded px-1 w-16"
                      type="number"
                      min="0"
                      max="1000"
                      value={n.signal!.offset}
                      onInput={(e) => {
                        n.signal!.offset = props.clamp(
                          Number((e.target as HTMLInputElement).value),
                          0,
                          1000
                        );
                        props.saveGraph();
                      }}
                    />
                  </label>
                  <div class="text-xs text-gray-600">
                    相位0: 纵向放行 · 相位1: 横向放行
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">编辑</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.undo()}
          >
            撤销 (Ctrl+Z)
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.redo()}
          >
            重做 (Ctrl+Y)
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">存储</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.clearGrid()}
          >
            清空地块
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.saveGrid()}
          >
            保存地块
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => props.loadGrid()}
          >
            载入地块
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => {
              props.saveGraph();
            }}
          >
            保存路网
          </button>
          <button
            class="border rounded px-2 py-1 hover:bg-gray-100"
            onClick={() => {
              props.loadGraph();
            }}
          >
            载入路网
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="font-medium">图例</h3>
        <div class="flex flex-col gap-1 text-sm">
          <Legend color={cellColor[CellKind.Road]} label="道路" />
          <Legend color={cellColor[CellKind.Res]} label="住宅" />
          <Legend color={cellColor[CellKind.Com]} label="商业" />
          <Legend color={cellColor[CellKind.Off]} label="办公" />
        </div>
      </div>
    </div>
  );
}
