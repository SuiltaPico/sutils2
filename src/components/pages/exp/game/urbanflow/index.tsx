import { createMemo, onCleanup, onMount } from "solid-js";
import { draw } from "./drawing";
import { paintAt, fillRectWithKind } from "./events";
import {
  autoBuildRoadGraphForRect,
  rebuildGraphFromRoadBlocks,
  generateSampleGrid,
  getNode,
  loadGraph,
  loadRoadBlocks,
  saveGraph,
  saveRoadBlocks,
} from "./graph";
import { loadGrid, redo, saveGrid, undo, recalcZoneIndex } from "./grid";
import { clearVehicles, spawnVehicles, updateSim } from "./simulation";
import { createUrbanFlowState } from "./state";
import { CellKind, Tool } from "./types";
import { Sidebar } from "./ui";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function UrbanFlow() {
  let canvas!: HTMLCanvasElement;
  let wrapper!: HTMLDivElement;
  let rafPending = false;
  let simRaf = 0;
  let lastFrameTime = 0;

  const state = createUrbanFlowState();
  const {
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
    undoStack,
    redoStack,
    hasGraph,
    graphCount,
    vehicleCount,
    zoneStats,
  } = state;

  const MAX_HISTORY = 100;

  const invalidate = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height, state);
    });
  };

  const resize = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = wrapper.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, width, height, state);
  };

  onMount(() => {
    loadGrid(state);
    loadGraph(state);
    loadRoadBlocks(state);
    rebuildGraphFromRoadBlocks(state);
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    window.addEventListener("resize", resize);
    resize();

    let dragging = false;
    let dragMode: "pan" | "paint" | null = null;
    let lastX = 0;
    let lastY = 0;

    const toWorldAndGrid = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const s = scale();
      const cx = camX();
      const cy = camY();
      const wx = (mx - cx) / s;
      const wy = (my - cy) / s;
      const gx = Math.floor(wx / 8);
      const gy = Math.floor(wy / 8);
      return { wx, wy, gx, gy };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      lastX = e.clientX;
      lastY = e.clientY;
      // 矩形放置模式：点击起点/终点
      if (placingRect()) {
        const { gx, gy } = toWorldAndGrid(e);
        if (!state.rectStart) {
          state.rectStart = { gx, gy } as any;
          state.rectHover = { gx, gy } as any;
          invalidate();
        } else {
          const rs = state.rectStart as any as { gx: number; gy: number };
          if (blockKind()) {
            // 道路块直线放置：按粗网格（4x4）对齐，选择水平或垂直方向
            const bs = 4;
            const bx0 = Math.floor(rs.gx / bs);
            const by0 = Math.floor(rs.gy / bs);
            const bx1 = Math.floor(gx / bs);
            const by1 = Math.floor(gy / bs);
            const horz = Math.abs(bx1 - bx0) >= Math.abs(by1 - by0);
            const bxa = Math.min(bx0, bx1);
            const bxb = Math.max(bx0, bx1);
            const bya = Math.min(by0, by1);
            const byb = Math.max(by0, by1);
            const fixBy = Math.floor((by0 + by1) / 2);
            const fixBx = Math.floor((bx0 + bx1) / 2);
            if (horz) {
              for (let bx = bxa; bx <= bxb; bx++) {
                // 写入 roadBlocks（避免重复），不再用分区像素涂抹
                const exists = state.roadBlocks.find((rb) => rb.bx === bx && rb.by === fixBy);
                if (!exists) {
                  state.roadBlocks.push({ id: state.nextRoadBlockId++, kind: blockKind()!, bx, by: fixBy });
                }
              }
            } else {
              for (let by = bya; by <= byb; by++) {
                const exists = state.roadBlocks.find((rb) => rb.bx === fixBx && rb.by === by);
                if (!exists) {
                  state.roadBlocks.push({ id: state.nextRoadBlockId++, kind: blockKind()!, bx: fixBx, by });
                }
              }
            }
            // 根据道路块重建路网
            rebuildGraphFromRoadBlocks(state);
            saveRoadBlocks(state);
            invalidate();
          } else {
            // 普通分区矩形填充
            state.currentStroke = new Map();
            const kind = toolToKind(state.tool());
            fillRectWithKind(state, rs.gx, rs.gy, gx, gy, kind);
            undoStack.push(Array.from(state.currentStroke.values()));
            while (undoStack.length > MAX_HISTORY) undoStack.shift();
            redoStack.length = 0;
            state.currentStroke = null;
            recalcZoneIndex(state);
            saveGrid(state);
          }
          // 复位
          state.rectStart = null;
          state.rectHover = null;
          invalidate();
        }
        dragging = false;
        dragMode = null;
        return;
      }
      if (
        e.button === 1 ||
        e.button === 2 ||
        e.shiftKey ||
        tool() === "select"
      ) {
        dragMode = "pan";
      } else {
        dragMode = "paint";
        state.currentStroke = new Map();
        paintAt(state, e, true, invalidate);
      }
      dragging = true;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      if (dragMode === "pan") {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        setCamX(camX() + dx);
        setCamY(camY() + dy);
        lastX = e.clientX;
        lastY = e.clientY;
        invalidate();
      } else if (dragMode === "paint") {
        paintAt(state, e, false, invalidate);
      }
    };
    const end = (e: PointerEvent) => {
      dragging = false;
      dragMode = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
      if (placingRect()) {
        return; // 矩形模式不在 pointerup 中处理撤销栈
      }
      if (state.currentStroke && state.currentStroke.size > 0) {
        undoStack.push(Array.from(state.currentStroke.values()));
        while (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        state.currentStroke = null;
        saveGrid(state);
      } else {
        state.currentStroke = null;
      }
    };
    const onMoveHover = (e: PointerEvent) => {
      if (!placingRect()) return;
      const { gx, gy } = toWorldAndGrid(e);
      if (state.rectStart) {
        state.rectHover = { gx, gy } as any;
        invalidate();
      }
    };
    const onWheel = (e: WheelEvent) => {
      const oldS = scale();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newS = clamp(oldS * factor, 0.25, 8);
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = camX();
      const cy = camY();
      const wx = (mx - cx) / oldS;
      const wy = (my - cy) / oldS;
      const nx = mx - wx * newS;
      const ny = my - wy * newS;
      setScale(newS);
      setCamX(nx);
      setCamY(ny);
      invalidate();
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", (ev) => {
      onMove(ev);
      onMoveHover(ev);
    });
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerout", end);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      const z = e.key === "z" || e.key === "Z";
      const y = e.key === "y" || e.key === "Y";
      if (e.key === "Escape") {
        if (state.rectStart || placingRect()) {
          state.rectStart = null;
          state.rectHover = null;
          setPlacingRect(false);
          invalidate();
          e.preventDefault();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && z && !e.shiftKey) {
        // 撤销
        if (undo(state)) {
          invalidate();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && (y || (z && e.shiftKey))) {
        // 重做
        if (redo(state)) {
          invalidate();
        }
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);

    // 模拟循环
    const frame = (t: number) => {
      const now = t * 0.001; // ms -> s
      const dt = lastFrameTime ? Math.min(0.05, now - lastFrameTime) : 0;
      lastFrameTime = now;
      if (dt > 0) updateSim(state, dt);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, width, height, state);
      }
      simRaf = requestAnimationFrame(frame);
    };
    simRaf = requestAnimationFrame(frame);

    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("pointerout", end);
      canvas.removeEventListener("wheel", onWheel as any);
      cancelAnimationFrame(simRaf);
    });
  });

  return (
    <div class="w-full h-full flex">
      <div ref={wrapper} class="flex-1 relative bg-white">
        <canvas
          ref={canvas}
          class="absolute inset-0"
          onContextMenu={(e) => e.preventDefault()}
        />
        <div class="absolute left-2 top-2 z-10 bg-white/80 backdrop-blur rounded-md shadow px-2 py-1 text-sm select-none">
          UrbanFlow · 网格编辑器（原型）
        </div>
      </div>
      <Sidebar
        tool={tool}
        setTool={setTool}
        brush={brush}
        setBrush={setBrush}
        placingRect={placingRect}
        setPlacingRect={(v) => {
          setPlacingRect(v);
          if (!v) {
            state.rectStart = null;
            state.rectHover = null;
          }
          invalidate();
        }}
        blockKind={blockKind}
        setBlockKind={setBlockKind}
        graphTool={graphTool}
        setGraphTool={setGraphTool}
        simRunning={simRunning}
        setSimRunning={setSimRunning}
        autoCommute={autoCommute}
        setAutoCommute={setAutoCommute}
        commuteRate={commuteRate}
        setCommuteRate={setCommuteRate}
        generateSampleGrid={() => {
          generateSampleGrid(state, wrapper, (c: number) => {
            spawnVehicles(state, c);
            invalidate();
          });
          invalidate();
        }}
        spawnVehicles={(c: number) => {
          spawnVehicles(state, c);
          invalidate();
        }}
        clearVehicles={() => {
          clearVehicles(state);
          invalidate();
        }}
        hasGraph={hasGraph}
        graphCount={graphCount}
        vehicleCount={vehicleCount}
        zoneStats={zoneStats}
        showGrid={showGrid}
        setShowGrid={(v) => {
          setShowGrid(v);
          invalidate();
        }}
        selectedNode={createMemo(() =>
          state.selectedNodeId()
            ? getNode(state, state.selectedNodeId()!)
            : null
        )}
        saveGraph={() => saveGraph(state)}
        loadGraph={() => {
          loadGraph(state);
          invalidate();
        }}
        saveGrid={() => saveGrid(state)}
        loadGrid={() => {
          state.cells.fill(0);
          loadGrid(state);
          invalidate();
        }}
        clearGrid={() => {
          state.cells.fill(0);
          recalcZoneIndex(state);
          invalidate();
          saveGrid(state);
        }}
        undo={() => {
          if (undo(state)) {
            invalidate();
          }
        }}
        redo={() => {
          if (redo(state)) {
            invalidate();
          }
        }}
        clamp={clamp}
        cancelRectStart={() => {
          state.rectStart = null;
          state.rectHover = null;
          invalidate();
        }}
      />
    </div>
  );
}

export function toolToKind(t: Tool): CellKind {
  switch (t) {
    case "road":
      return CellKind.Road;
    case "res":
      return CellKind.Res;
    case "com":
      return CellKind.Com;
    case "off":
      return CellKind.Off;
    case "erase":
      return CellKind.Empty;
    default:
      return CellKind.Empty;
  }
}
