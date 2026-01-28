import * as d3 from "d3";
import { Component, createEffect, onMount } from "solid-js";
import { Snapshot, StepAction } from "./core/types";

export const Visualizer: Component<{
  snapshot: Snapshot;
  width: number;
  height: number;
  currentAction: StepAction | null;
}> = (props) => {
  let svgRef: SVGSVGElement | undefined;

  // 使用 D3 力导向仿真
  const simulation = d3
    .forceSimulation<any>()
    .force(
      "link",
      d3
        .forceLink<any, any>()
        .id((d) => d.id)
        .distance((d) => (d.label === "left" || d.label === "right" ? 80 : 100))
    )
    .force("charge", d3.forceManyBody().strength(-500).distanceMax(300))
    .force("center", d3.forceCenter(props.width / 2, props.height / 2))
    .force("x", d3.forceX(props.width / 2).strength(0.05))
    .force("y", d3.forceY(props.height / 2).strength(0.05))
    .force("tree", () => {
      // 这是一个自定义力，稍后在 createEffect 中根据 edges 更新逻辑
    });

  onMount(() => {
    const svg = d3.select(svgRef!);
    const container = svg.select("g.main-content");

    // --- 引入 d3-zoom ---
    const zoom = d3
      .zoom<SVGSVGElement, any>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // 定义箭头
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 26) // 贴近圆圈边缘
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#64748b");

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead-next")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 26)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#3b82f6");

    createEffect(() => {
      const {
        nodes: newNodes,
        edges: newEdges,
        pointers: newPointers,
      } = props.snapshot;

      // 1. 坐标保持：将旧仿真节点的坐标同步到新节点上，防止跳变
      const oldNodes = simulation.nodes();
      const nodeMap = new Map(oldNodes.map((d) => [d.id, d]));

      let arrayBufferCount = 0;
      newNodes.forEach((node: any) => {
        // 如果是 ArrayBuffer，固定在顶部区域，防止重叠
        if (node.data?.type === "array_buffer") {
          node.fx = props.width / 2;
          node.fy = 80 + arrayBufferCount * 120; // 如果有多个（如扩容时），纵向排列
          arrayBufferCount++;
        } else {
          const old = nodeMap.get(node.id);
          if (old) {
            node.x = old.x;
            node.y = old.y;
            node.vx = old.vx;
            node.vy = old.vy;
          }
        }
      });

      // 2. 更新仿真数据
      simulation.nodes(newNodes);

      // 转换边数据为 D3 要求的 source/target 格式
      // 注意：必须确保 source/target 引用的节点都在 newNodes 中
      const d3Edges = newEdges
        .map((e) => ({
          ...e,
          source: newNodes.find((n) => n.id === e.from),
          target: newNodes.find((n) => n.id === e.to),
        }))
        .filter((e) => e.source && e.target); // 过滤掉无效的连接

      (simulation.force("link") as d3.ForceLink<any, any>).links(d3Edges);

      // 3. 增强：树形布局辅助力
      // 为不同类型的边添加方向性偏好
      simulation.force("tree", (alpha: number) => {
        for (const edge of d3Edges) {
          const s = edge.source as any;
          const t = edge.target as any;
          if (!s || !t) continue;

          if (edge.label === "left") {
            // 左孩子：向左下偏好
            t.vx += (s.x - 60 - t.x) * alpha * 0.2;
            t.vy += (s.y + 80 - t.y) * alpha * 0.2;
          } else if (edge.label === "right") {
            // 右孩子：向右下偏好
            t.vx += (s.x + 60 - t.x) * alpha * 0.2;
            t.vy += (s.y + 80 - t.y) * alpha * 0.2;
          } else if (edge.label === "next") {
            // 链表：水平向右偏好
            t.vx += (s.x + 110 - t.x) * alpha * 0.1;
            t.vy += (s.y - t.y) * alpha * 0.1;
          }
        }
      });

      // 只有在节点数量变化时才大幅度重启仿真，否则只稍微晃动
      const shouldFullRestart = oldNodes.length !== newNodes.length;
      simulation.alpha(shouldFullRestart ? 1 : 0.3).restart();

      const g = svg.select("g.main-content");
      if (g.empty()) return;

      // 3. 绘制连线
      // 注意：这里也要用 d3Edges，因为仿真器会更新这些对象上的坐标
      const link = g
        .selectAll<SVGPathElement, any>(".link")
        .data(d3Edges, (d: any) => `${d.from}-${d.to}`);

      link.exit().remove();
      const linkEnter = link
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", (d) => {
          if (d.label === "prev") return "#94a3b8";
          if (d.label === "next") return "#3b82f6";
          return "#cbd5e1";
        })
        .attr("stroke-width", (d) => (d.label === "next" ? 2.5 : 2))
        .attr("stroke-dasharray", (d) => (d.label === "prev" ? "4 2" : "none"))
        .attr("marker-end", (d) =>
          d.label === "next" ? "url(#arrowhead-next)" : "url(#arrowhead)"
        );

      const linkMerge = linkEnter.merge(link);

      // 3.1 绘制连线文字
      const linkLabel = g
        .selectAll<SVGTextElement, any>(".link-label")
        .data(d3Edges, (d: any) => `${d.from}-${d.to}`);

      linkLabel.exit().remove();
      const linkLabelEnter = linkLabel
        .enter()
        .append("text")
        .attr("class", "link-label")
        .attr("font-size", "9px")
        .attr("font-weight", "bold")
        .attr("fill", "#64748b")
        .attr("text-anchor", "middle")
        .attr("paint-order", "stroke")
        .attr("stroke", "white")
        .attr("stroke-width", "2px");

      const linkLabelMerge = linkLabelEnter.merge(linkLabel);
      linkLabelMerge.text((d) => {
        const labels: Record<string, string> = {
          next: "后继",
          prev: "前驱",
          left: "左",
          right: "右",
        };
        return (
          labels[(d.label ?? "") as keyof typeof labels] || (d.label ?? "")
        );
      });

      // 4. 绘制节点组
      const node = g
        .selectAll<SVGGElement, any>(".node-group")
        .data(newNodes, (d: any) => d.id);

      node.exit().transition().duration(300).attr("opacity", 0).remove();

      const nodeEnter = node
        .enter()
        .append("g")
        .attr("class", "node-group")
        .call(
          d3
            .drag<any, any>()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
        );

      nodeEnter
        .append("circle")
        .attr("r", 25)
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("filter", "drop-shadow(0 4px 3px rgb(0 0 0 / 0.07))");

      nodeEnter
        .append("text")
        .attr("dy", ".35em")
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("font-weight", "bold");

      // --- 关键：在 Merge（Update）中处理可能变化的状态 ---
      const nodeMerge = nodeEnter.merge(node);

      nodeMerge
        .select("circle")
        .transition()
        .duration(200)
        .attr("fill", (d) => {
          const isTarget = props.currentAction?.target === d.id;
          if (isTarget) {
            const type = props.currentAction?.type;
            if (type === "move_ptr") return "#3b82f6"; // 游走蓝
            if (type === "read") return "#8b5cf6"; // 读取紫
            if (type === "write") return "#f59e0b"; // 写入橙
          }

          // 支持红黑树等自定义颜色
          if (d.data?.color === "RED") return "#ef4444";
          if (d.data?.color === "BLACK") return "#1e293b";

          return d.highlight ? "#f59e0b" : "#10b981";
        })
        .attr("stroke", (d) =>
          props.currentAction?.target === d.id ? "#fff" : "white"
        )
        .attr("stroke-width", (d) =>
          props.currentAction?.target === d.id ? 6 : 2
        );

      nodeMerge.select("text").text((d) => d.label);

      // 5. 渲染具名指针
      const pointer = g
        .selectAll<SVGGElement, any>(".pointer-group")
        .data(newPointers || [], (d: any) => d.id);

      pointer.exit().remove();
      const pointerEnter = pointer
        .enter()
        .append("g")
        .attr("class", "pointer-group");

      pointerEnter
        .append("path")
        .attr("d", "M-8,-16 L0,0 L8,-16 Q0,-12 -8,-16")
        .attr("fill", "#f43f5e")
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("filter", "drop-shadow(0 2px 2px rgb(0 0 0 / 0.2))");

      pointerEnter
        .append("text")
        .attr("dy", -22)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "800")
        .attr("fill", "#e11d48")
        .attr("paint-order", "stroke")
        .attr("stroke", "white")
        .attr("stroke-width", "3px")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round");

      const pointerMerge = pointerEnter.merge(pointer);
      pointerMerge.select("text").text((d) => {
        const labels: Record<string, string> = {
          head: "头指针",
          tail: "尾指针",
          current: "当前",
          ptr: "游标",
          src: "源",
          dst: "目的",
          buffer: "内存块",
          new_buffer: "新空间",
          root: "根指针",
          parent: "父节点",
          successor: "后继",
        };
        return labels[d.label] || d.label;
      });

      // 特殊处理 ArrayBuffer (渲染为矩形表格样式)
      nodeMerge.each(function (d) {
        if (d.data?.type === "array_buffer") {
          const group = d3.select(this);
          group.select("circle").attr("opacity", 0); // 隐藏圆

          const capacity = d.data.capacity;
          const slotWidth = 40;
          const slotHeight = 40;
          const totalWidth = capacity * slotWidth;

          // 1. 绘制数组格子
          let slots = group
            .selectAll<SVGRectElement, any>(".array-slot")
            .data(d.data.elements, (_, i) => i);

          slots
            .enter()
            .append("rect")
            .attr("class", "array-slot")
            .attr("width", slotWidth)
            .attr("height", slotHeight)
            .attr("y", -slotHeight / 2)
            .merge(slots)
            .attr("x", (_, i) => -totalWidth / 2 + i * slotWidth)
            .attr("stroke", "#cbd5e1")
            .transition()
            .duration(300)
            .attr("fill", (v, i) => {
              // 只有在当前操作针对这个格子时显示红绿反馈
              if (
                props.currentAction?.target === d.id &&
                (props.currentAction.payload?.index === i ||
                  props.currentAction.payload?.to === i)
              ) {
                return v !== null ? "#10b981" : "#ef4444"; // 新增绿，删除红
              }
              return v !== null ? "#3b82f6" : "#f1f5f9";
            });

          slots.exit().remove();

          // 2. 绘制数值文字
          let texts = group
            .selectAll<SVGTextElement, any>(".slot-text")
            .data(d.data.elements, (_, i) => i);

          texts
            .enter()
            .append("text")
            .attr("class", "slot-text")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .attr("fill", "white")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .merge(texts)
            .attr(
              "x",
              (_, i) => -totalWidth / 2 + i * slotWidth + slotWidth / 2
            )
            .text((v) => (v !== null ? String(v) : ""));

          texts.exit().remove();

          // 3. 绘制标签
          let label = group.select<SVGTextElement>("text.array-label");
          if (label.empty()) {
            label = group
              .append("text")
              .attr("class", "array-label")
              .attr("text-anchor", "middle")
              .attr("dy", -30)
              .attr("font-size", "12px")
              .attr("font-weight", "bold")
              .attr("fill", "#64748b");
          }
          label.text(d.data.label || "定长数组");

          // 4. 容器整体高亮 (alloc/free 时的轻微反馈)
          if (props.currentAction?.target === d.id) {
            const type = props.currentAction.type;
            if (type === "alloc" || type === "free") {
              group
                .selectAll("rect.array-slot")
                .attr("stroke", type === "alloc" ? "#10b981" : "#ef4444")
                .attr("stroke-width", 2);
            }
          } else {
            group
              .selectAll("rect.array-slot")
              .attr("stroke", "#cbd5e1")
              .attr("stroke-width", 1);
          }
        }
      });

      // 更新位置
      simulation.on("tick", () => {
        linkMerge.attr("d", (d: any) => {
          const x1 = d.source?.x ?? 0;
          const y1 = d.source?.y ?? 0;
          const x2 = d.target?.x ?? 0;
          const y2 = d.target?.y ?? 0;

          // 检查是否有反向边
          const hasReverse = d3Edges.some(
            (e) => e.source!.id === d.target.id && e.target!.id === d.source.id
          );

          if (hasReverse) {
            // 如果有反向边，使用二次贝塞尔曲线偏移
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dr = Math.sqrt(dx * dx + dy * dy);
            // 这里的 offset 可以根据需要调整
            const offset = 20;
            const nx = -dy * (offset / dr);
            const ny = dx * (offset / dr);
            const cx = (x1 + x2) / 2 + nx;
            const cy = (y1 + y2) / 2 + ny;
            return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
          }

          return `M${x1},${y1} L${x2},${y2}`;
        });

        linkLabelMerge
          .attr("x", (d: any) => {
            const x1 = d.source?.x ?? 0;
            const x2 = d.target?.x ?? 0;
            const hasReverse = d3Edges.some(
              (e) =>
                e.source!.id === d.target.id && e.target!.id === d.source.id
            );
            if (hasReverse) {
              const y1 = d.source?.y ?? 0;
              const y2 = d.target?.y ?? 0;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const dr = Math.sqrt(dx * dx + dy * dy);
              const offset = 30; // 标签稍微偏离一点
              const nx = -dy * (offset / dr);
              return (x1 + x2) / 2 + nx;
            }
            return (x1 + x2) / 2;
          })
          .attr("y", (d: any) => {
            const y1 = d.source?.y ?? 0;
            const y2 = d.target?.y ?? 0;
            const hasReverse = d3Edges.some(
              (e) =>
                e.source!.id === d.target.id && e.target!.id === d.source.id
            );
            if (hasReverse) {
              const x1 = d.source?.x ?? 0;
              const x2 = d.target?.x ?? 0;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const dr = Math.sqrt(dx * dx + dy * dy);
              const offset = 30;
              const ny = dx * (offset / dr);
              return (y1 + y2) / 2 + ny;
            }
            return (y1 + y2) / 2;
          });

        nodeMerge.attr(
          "transform",
          (d) => `translate(${(d as any).x ?? 0},${(d as any).y ?? 0})`
        );

        pointerMerge.attr("transform", (d) => {
          const targetNode = newNodes.find((n) => n.id === d.target);
          if (!targetNode) return "translate(0,0)";

          let tx = targetNode.x ?? 0;
          let ty = targetNode.y ?? 0;

          // 如果指向数组且有 offset
          if (
            targetNode.data?.type === "array_buffer" &&
            d.offset !== undefined
          ) {
            const capacity = targetNode.data.capacity;
            const slotWidth = 40;
            const totalWidth = capacity * slotWidth;
            tx = tx - totalWidth / 2 + d.offset * slotWidth + 20;
            ty = ty - 25; // 放在格子上方
          } else {
            ty = ty - 35; // 放在圆圈上方
          }
          return `translate(${tx},${ty})`;
        });
      });
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  });

  return (
    <div class="w-full h-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${props.width} ${props.height}`}
      >
        <g class="main-content" />
      </svg>
    </div>
  );
};
