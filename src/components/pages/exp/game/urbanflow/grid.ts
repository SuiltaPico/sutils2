import { UrbanFlowState } from "./state";
import { CellKind, GRID_H, GRID_W, STORAGE_KEY } from "./types";

export function loadGrid(state: UrbanFlowState) {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (!txt) return;
    const obj = JSON.parse(txt);
    if (
      obj &&
      obj.w === GRID_W &&
      obj.h === GRID_H &&
      Array.isArray(obj.data)
    ) {
      const buf = Uint8Array.from(obj.data as number[]);
      if (buf.length === state.cells.length) state.cells = buf;
    }
  } catch {}
  recalcZoneIndex(state);
}
export function saveGrid(state: UrbanFlowState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ w: GRID_W, h: GRID_H, data: Array.from(state.cells) })
    );
  } catch {}
}

let saveTimer: number | null = null;
let lastSave = 0;
export function debounceSave(state: UrbanFlowState) {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveGrid(state);
    saveTimer = null;
  }, 250);
}
export function throttleSave(state: UrbanFlowState) {
  const now = performance.now();
  if (now - lastSave > 1000) {
    saveGrid(state);
    lastSave = now;
  }
}

export function recalcZoneIndex(state: UrbanFlowState) {
  const res: number[] = [];
  const com: number[] = [];
  const off: number[] = [];
  const arr = state.cells;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === CellKind.Res) res.push(i);
    else if (v === CellKind.Com) com.push(i);
    else if (v === CellKind.Off) off.push(i);
  }
  state.resCellIndices = res;
  state.comCellIndices = com;
  state.offCellIndices = off;
  state.setZoneStats({ res: res.length, com: com.length, off: off.length });
}

export function undo(state: UrbanFlowState) {
  if (state.undoStack.length) {
    const diff = state.undoStack.pop()!;
    for (const c of diff) state.cells[c.index] = c.before;
    state.redoStack.push(diff);
    saveGrid(state);
    return true;
  }
  return false;
}
export function redo(state: UrbanFlowState) {
  if (state.redoStack.length) {
    const diff = state.redoStack.pop()!;
    for (const c of diff) state.cells[c.index] = c.after;
    state.undoStack.push(diff);
    saveGrid(state);
    return true;
  }
  return false;
}
