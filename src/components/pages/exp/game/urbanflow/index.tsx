import { createMemo, onCleanup, onMount } from "solid-js";
import { draw } from "./drawing";
import { paintAt } from "./events";
import { generateSampleGrid, getNode, loadGraph, saveGraph } from "./graph";
import { loadGrid, redo, saveGrid, undo } from "./grid";
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
    simRunning,
    setSimRunning,
    undoStack,
    redoStack,
    hasGraph,
    graphCount,
    vehicleCount,
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
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    window.addEventListener("resize", resize);
    resize();

    let dragging = false;
    let dragMode: "pan" | "paint" | null = null;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      lastX = e.clientX;
      lastY = e.clientY;
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
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerout", end);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      const z = e.key === "z" || e.key === "Z";
      const y = e.key === "y" || e.key === "Y";
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
        graphTool={graphTool}
        setGraphTool={setGraphTool}
        simRunning={simRunning}
        setSimRunning={setSimRunning}
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
