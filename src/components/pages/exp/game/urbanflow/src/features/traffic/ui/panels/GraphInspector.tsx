import { createMemo } from "solid-js";
import { ensureDemoGraph, getGraph, setGraph } from "../../index";

export default function GraphInspector() {
  const stats = createMemo(() => {
    const g = getGraph();
    if (!g) return { nodes: 0, edges: 0, entrances: 0 };
    return {
      nodes: g.nodes.size,
      edges: g.edges.size,
      entrances: g.entrances.size,
    };
  });

  return (
    <div class="text-sm space-y-2">
      <div class="font-semibold">Graph Inspector</div>
      <div class="grid grid-cols-2 gap-x-2">
        <div class="opacity-70">Nodes</div>
        <div>{stats().nodes}</div>
        <div class="opacity-70">Edges</div>
        <div>{stats().edges}</div>
        <div class="opacity-70">Entrances</div>
        <div>{stats().entrances}</div>
      </div>
      <div class="flex gap-2">
        <button
          class="px-2 py-1 border rounded"
          onClick={() => ensureDemoGraph()}
          title="构建一个十字路口的演示图，并显示调试图层"
        >构建 Demo 图</button>
        <button
          class="px-2 py-1 border rounded"
          onClick={() => setGraph(null)}
        >清空图</button>
      </div>
      <div class="text-xs opacity-70">说明：当前为演示数据；后续将接入道路编辑器产出的折线生成路网。</div>
    </div>
  );
}


