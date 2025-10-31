import {
  addEdgeBetween,
  addNodeAt,
  ensureSignal,
  findNodeAt,
  getNode,
  saveGraph,
} from "./graph";
import { debounceSave, throttleSave, recalcZoneIndex } from "./grid";
import { toolToKind } from "./index";
import { UrbanFlowState } from "./state";
import { CellKind, TILE } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
export function paintAt(
  state: UrbanFlowState,
  e: PointerEvent,
  first: boolean,
  invalidate: () => void
) {
  const target = e.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const s = state.scale();
  const cx = state.camX();
  const cy = state.camY();
  const wx = (mx - cx) / s;
  const wy = (my - cy) / s;
  // 若启用路网工具，则走路网编辑分支
  const gt = state.graphTool();
  if (gt) {
    if (gt === "g_add_node") {
      addNodeAt(state, wx, wy);
      invalidate();
      saveGraph(state);
    } else if (gt === "g_add_edge") {
      const picked = findNodeAt(state, wx, wy);
      if (picked) {
        if (state.pendingEdgeStart == null) {
          state.pendingEdgeStart = picked.id;
          state.setSelectedNodeId(picked.id);
        } else if (state.pendingEdgeStart !== picked.id) {
          addEdgeBetween(state, getNode(state, state.pendingEdgeStart), picked);
          state.pendingEdgeStart = null;
          invalidate();
          saveGraph(state);
        }
      }
    } else if (gt === "g_select") {
      const picked = findNodeAt(state, wx, wy);
      state.setSelectedNodeId(picked ? picked.id : null);
      invalidate();
    } else if (gt === "g_signal") {
      const picked = findNodeAt(state, wx, wy);
      if (picked) {
        ensureSignal(picked);
        picked.signal!.enabled = !picked.signal!.enabled;
        state.setSelectedNodeId(picked.id);
        invalidate();
        saveGraph(state);
      }
    }
    return;
  }
  const gx = Math.floor(wx / TILE);
  const gy = Math.floor(wy / TILE);
  const b = clamp(state.brush(), 1, 20);
  const kind = toolToKind(state.tool());
  for (let y = gy - b + 1; y <= gy + b - 1; y++) {
    for (let x = gx - b + 1; x <= gx + b - 1; x++) {
      if ((x - gx) ** 2 + (y - gy) ** 2 <= (b - 0.5) ** 2) {
        setCell(state, x, y, kind);
      }
    }
  }
  // 重绘与保存
  invalidate();
  recalcZoneIndex(state);
  if (first) debounceSave(state);
  else throttleSave(state);
}

const idx = (x: number, y: number) => y * 256 + x;
const getCell = (state: UrbanFlowState, x: number, y: number): CellKind => {
  if (x < 0 || y < 0 || x >= 256 || y >= 256) return CellKind.Empty;
  return state.cells[idx(x, y)] as CellKind;
};
export const setCell = (
  state: UrbanFlowState,
  x: number,
  y: number,
  v: CellKind
) => {
  if (x < 0 || y < 0 || x >= 256 || y >= 256) return;
  const i = idx(x, y);
  const before = state.cells[i];
  if (before === v) return;
  state.cells[i] = v;
  if (state.currentStroke) {
    if (!state.currentStroke.has(i)) {
      state.currentStroke.set(i, { index: i, before, after: v });
    } else {
      // 更新最后 after，保留最初 before
      const c = state.currentStroke.get(i)!;
      c.after = v;
    }
  }
};

export function fillRectWithKind(
  state: UrbanFlowState,
  gx0: number,
  gy0: number,
  gx1: number,
  gy1: number,
  kind: CellKind
) {
  const x0 = Math.max(0, Math.min(gx0, gx1));
  const x1 = Math.min(255, Math.max(gx0, gx1));
  const y0 = Math.max(0, Math.min(gy0, gy1));
  const y1 = Math.min(255, Math.max(gy0, gy1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setCell(state, x, y, kind);
    }
  }
}
