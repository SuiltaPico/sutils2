import { createSignal, onCleanup, onMount } from "solid-js";
import CanvasKitInit from "canvaskit-wasm/bin/profiling/canvaskit.js";
import CanvasKitWasmURL from "canvaskit-wasm/bin/profiling/canvaskit.wasm?url";

type CanvasKit = any;
type SkSurface = any;
type SkCanvas = any;
type SkPaint = any;
type SkFont = any;

const DEFAULT_FONT_SIZE = 16;
const LINE_HEIGHT = 22; // 渲染行高，留出行间距
const PADDING_LEFT = 12;
const PADDING_TOP = 12;
const CURSOR_WIDTH = 2;

export default function SkiaWasmTextEditor() {
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);

  // 编辑状态
  const [lines, setLines] = createSignal<string[]>([""]);
  const [caretRow, setCaretRow] = createSignal(0);
  const [caretCol, setCaretCol] = createSignal(0);
  // 选区：以 [anchor, focus) 半开区间表达
  const [selAnchorRow, setSelAnchorRow] = createSignal<number | null>(null);
  const [selAnchorCol, setSelAnchorCol] = createSignal<number | null>(null);
  const [selFocusRow, setSelFocusRow] = createSignal<number | null>(null);
  const [selFocusCol, setSelFocusCol] = createSignal<number | null>(null);
  const [dragging, setDragging] = createSignal(false);

  let canvasRef: HTMLCanvasElement | undefined;
  let ck: CanvasKit | null = null;
  let surface: SkSurface | null = null;
  let skCanvas: SkCanvas | null = null;
  let textPaint: SkPaint | null = null;
  let cursorPaint: SkPaint | null = null;
  let font: SkFont | null = null;

  function measureTextWidth(text: string): number {
    if (!ck || !font) return 0;
    if (!text) return 0;
    try {
      const glyphs = font.getGlyphIDs(text);
      if (!glyphs || glyphs.length === 0) return 0;
      const widths = font.getGlyphWidths(glyphs);
      let sum = 0;
      for (let i = 0; i < widths.length; i++) sum += widths[i];
      return sum;
    } catch {
      return 0;
    }
  }

  onMount(async () => {
    try {
      ck = await CanvasKitInit({ locateFile: () => CanvasKitWasmURL });
      if (!canvasRef) throw new Error("canvas 未找到");
      // 固定一个合理大小，可根据父容器自适应
      const dpi = window.devicePixelRatio || 1;
      const width = Math.floor(900 * dpi);
      const height = Math.floor(600 * dpi);
      canvasRef.width = width;
      canvasRef.height = height;
      canvasRef.style.width = `${Math.round(width / dpi)}px`;
      canvasRef.style.height = `${Math.round(height / dpi)}px`;

      surface = ck.MakeCanvasSurface(canvasRef);
      if (!surface) throw new Error("无法创建 Skia Surface");
      skCanvas = surface.getCanvas();

      textPaint = new ck.Paint();
      textPaint.setAntiAlias(true);
      textPaint.setColor(ck.Color(20, 20, 20, 1));

      cursorPaint = new ck.Paint();
      cursorPaint.setAntiAlias(true);
      cursorPaint.setColor(ck.Color(33, 150, 243, 1));

      font = new ck.Font(
        null,
        DEFAULT_FONT_SIZE * (window.devicePixelRatio || 1)
      );

      setReady(true);
      redraw();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
    }
  });

  onCleanup(() => {
    try {
      textPaint?.delete?.();
      cursorPaint?.delete?.();
      font?.delete?.();
      surface?.dispose?.();
    } catch {}
    skCanvas = null;
    surface = null;
    ck = null;
  });

  function clampCaret(row: number, col: number) {
    const ls = lines();
    const r = Math.max(0, Math.min(row, ls.length - 1));
    const c = Math.max(0, Math.min(col, (ls[r] ?? "").length));
    setCaretRow(r);
    setCaretCol(c);
  }

  function clearSelection() {
    setSelAnchorRow(null);
    setSelAnchorCol(null);
    setSelFocusRow(null);
    setSelFocusCol(null);
  }

  function hasSelection(): boolean {
    return (
      selAnchorRow() !== null &&
      selAnchorCol() !== null &&
      selFocusRow() !== null &&
      selFocusCol() !== null &&
      !(selAnchorRow() === selFocusRow() && selAnchorCol() === selFocusCol())
    );
  }

  function getOrderedSelection() {
    if (!hasSelection()) return null;
    const a = { row: selAnchorRow()!, col: selAnchorCol()! };
    const b = { row: selFocusRow()!, col: selFocusCol()! };
    if (a.row < b.row) return { start: a, end: b };
    if (a.row > b.row) return { start: b, end: a };
    if (a.col <= b.col) return { start: a, end: b };
    return { start: b, end: a };
  }

  function insertText(text: string) {
    if (!text) return;
    const ls = lines().slice();
    let r = caretRow();
    let c = caretCol();
    // 选区替换
    const ordered = getOrderedSelection();
    if (ordered) {
      const { start, end } = ordered;
      if (start.row === end.row) {
        const line = ls[start.row] ?? "";
        ls[start.row] = line.slice(0, start.col) + line.slice(end.col);
      } else {
        const first = (ls[start.row] ?? "").slice(0, start.col);
        const last = (ls[end.row] ?? "").slice(end.col);
        ls.splice(start.row, end.row - start.row + 1, first + last);
      }
      r = start.row;
      c = start.col;
    }
    const curr = ls[r] ?? "";
    const parts = text.split("\n");
    if (parts.length === 1) {
      ls[r] = curr.slice(0, c) + text + curr.slice(c);
      c += text.length;
    } else {
      const head = parts[0] ?? "";
      const tail = parts[parts.length - 1] ?? "";
      const mid = parts.slice(1, -1);
      const firstLine = curr.slice(0, c) + head;
      const lastLine = tail + curr.slice(c);
      const newLines = [firstLine, ...mid, lastLine];
      ls.splice(r, 1, ...newLines);
      r = r + parts.length - 1;
      c = tail.length;
    }
    setLines(ls);
    clampCaret(r, c);
    clearSelection();
    redraw();
  }

  function backspace() {
    const ls = lines().slice();
    let r = caretRow();
    let c = caretCol();
    // 选区删除
    const ordered = getOrderedSelection();
    if (ordered) {
      const { start, end } = ordered;
      if (start.row === end.row) {
        const line = ls[start.row] ?? "";
        ls[start.row] = line.slice(0, start.col) + line.slice(end.col);
      } else {
        const first = (ls[start.row] ?? "").slice(0, start.col);
        const last = (ls[end.row] ?? "").slice(end.col);
        ls.splice(start.row, end.row - start.row + 1, first + last);
      }
      r = start.row;
      c = start.col;
      setLines(ls);
      clampCaret(r, c);
      clearSelection();
      redraw();
      return;
    }
    if (r === 0 && c === 0) return;
    if (c > 0) {
      const curr = ls[r] ?? "";
      ls[r] = curr.slice(0, c - 1) + curr.slice(c);
      c -= 1;
    } else {
      const prev = ls[r - 1] ?? "";
      const curr = ls[r] ?? "";
      const newCol = prev.length;
      ls[r - 1] = prev + curr;
      ls.splice(r, 1);
      r -= 1;
      c = newCol;
    }
    setLines(ls);
    clampCaret(r, c);
    clearSelection();
    redraw();
  }

  function del() {
    const ls = lines().slice();
    let r = caretRow();
    let c = caretCol();
    // 选区删除
    const ordered = getOrderedSelection();
    if (ordered) {
      const { start, end } = ordered;
      if (start.row === end.row) {
        const line = ls[start.row] ?? "";
        ls[start.row] = line.slice(0, start.col) + line.slice(end.col);
      } else {
        const first = (ls[start.row] ?? "").slice(0, start.col);
        const last = (ls[end.row] ?? "").slice(end.col);
        ls.splice(start.row, end.row - start.row + 1, first + last);
      }
      r = start.row;
      c = start.col;
      setLines(ls);
      clampCaret(r, c);
      clearSelection();
      redraw();
      return;
    }
    const curr = ls[r] ?? "";
    if (c < curr.length) {
      ls[r] = curr.slice(0, c) + curr.slice(c + 1);
    } else if (r < ls.length - 1) {
      // 合并下一行
      ls[r] = curr + (ls[r + 1] ?? "");
      ls.splice(r + 1, 1);
    }
    setLines(ls);
    clearSelection();
    redraw();
  }

  function moveLeft() {
    let r = caretRow();
    let c = caretCol();
    if (c > 0) c -= 1;
    else if (r > 0) {
      r -= 1;
      c = (lines()[r] ?? "").length;
    }
    clampCaret(r, c);
    redraw();
  }

  function moveRight() {
    let r = caretRow();
    let c = caretCol();
    const len = (lines()[r] ?? "").length;
    if (c < len) c += 1;
    else if (r < lines().length - 1) {
      r += 1;
      c = 0;
    }
    clampCaret(r, c);
    redraw();
  }

  function moveUp() {
    let r = caretRow();
    let c = caretCol();
    if (r > 0) {
      r -= 1;
      c = Math.min(c, (lines()[r] ?? "").length);
    }
    clampCaret(r, c);
    redraw();
  }

  function moveDown() {
    let r = caretRow();
    let c = caretCol();
    if (r < lines().length - 1) {
      r += 1;
      c = Math.min(c, (lines()[r] ?? "").length);
    }
    clampCaret(r, c);
    redraw();
  }

  function redraw() {
    if (!ck || !surface || !skCanvas || !textPaint || !cursorPaint || !font)
      return;
    const dpi = window.devicePixelRatio || 1;
    // 背景
    skCanvas.clear(ck.Color(250, 250, 250, 1));

    // 绘制文本
    const ls = lines();
    for (let i = 0; i < ls.length; i++) {
      const y =
        PADDING_TOP * dpi +
        (i + 1) * LINE_HEIGHT * dpi -
        (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi;
      skCanvas.drawText(
        ls[i] || "\u200b",
        PADDING_LEFT * dpi,
        y,
        textPaint,
        font
      );
    }

    // 选区渲染
    if (hasSelection()) {
      const { start, end } = getOrderedSelection()!;
      const dpi2 = dpi;
      const bg = new ck.Paint();
      bg.setColor(ck.Color(180, 213, 255, 0.75));
      if (start.row === end.row) {
        const line = lines()[start.row] ?? "";
        const x1 = PADDING_LEFT * dpi2 + measureTextWidth(line.slice(0, start.col));
        const x2 = PADDING_LEFT * dpi2 + measureTextWidth(line.slice(0, end.col));
        const top =
          PADDING_TOP * dpi2 +
          start.row * LINE_HEIGHT * dpi2 -
          (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi2;
        const bottom = top + LINE_HEIGHT * dpi2;
        skCanvas.drawRect(ck.LTRBRect(x1, top, x2, bottom), bg);
      } else {
        // 首行
        const firstLine = lines()[start.row] ?? "";
        const x1 = PADDING_LEFT * dpi2 + measureTextWidth(firstLine.slice(0, start.col));
        const x2 = PADDING_LEFT * dpi2 + measureTextWidth(firstLine);
        let top =
          PADDING_TOP * dpi2 +
          start.row * LINE_HEIGHT * dpi2 -
          (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi2;
        let bottom = top + LINE_HEIGHT * dpi2;
        skCanvas.drawRect(ck.LTRBRect(x1, top, x2, bottom), bg);
        // 中间整行
        for (let r = start.row + 1; r <= end.row - 1; r++) {
          top =
            PADDING_TOP * dpi2 +
            r * LINE_HEIGHT * dpi2 -
            (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi2;
          bottom = top + LINE_HEIGHT * dpi2;
          const fullX2 = PADDING_LEFT * dpi2 + measureTextWidth(lines()[r] ?? "");
          skCanvas.drawRect(
            ck.LTRBRect(PADDING_LEFT * dpi2, top, fullX2, bottom),
            bg
          );
        }
        // 尾行
        const lastLine = lines()[end.row] ?? "";
        const tailX = PADDING_LEFT * dpi2 + measureTextWidth(lastLine.slice(0, end.col));
        top =
          PADDING_TOP * dpi2 +
          end.row * LINE_HEIGHT * dpi2 -
          (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi2;
        bottom = top + LINE_HEIGHT * dpi2;
        skCanvas.drawRect(
          ck.LTRBRect(PADDING_LEFT * dpi2, top, tailX, bottom),
          bg
        );
      }
      bg.delete?.();
    }

    // 光标闪烁
    const now = performance.now();
    const showCursor = Math.floor(now / 500) % 2 === 0;
    if (showCursor) {
      const r = caretRow();
      const c = caretCol();
      const line = ls[r] ?? "";
      const before = line.slice(0, c);
      const x = PADDING_LEFT * dpi + measureTextWidth(before);
      const topY =
        PADDING_TOP * dpi +
        r * LINE_HEIGHT * dpi -
        (LINE_HEIGHT - DEFAULT_FONT_SIZE) * 0.5 * dpi;
      const bottomY = topY + LINE_HEIGHT * dpi;
      skCanvas.drawRect(
        ck.LTRBRect(x, topY, x + CURSOR_WIDTH * dpi, bottomY),
        cursorPaint
      );
    }

    surface.flush();
    requestAnimationFrame(redraw);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.isComposing) return; // 基础 MVP 不处理 IME 合成
    if (e.key === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      del();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      insertText("\n");
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveLeft();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveRight();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveUp();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveDown();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insertText(e.key);
    }
  }

  function hitTestToCaret(xClient: number, yClient: number) {
    const dpi = window.devicePixelRatio || 1;
    const rect = canvasRef!.getBoundingClientRect();
    const x = (xClient - rect.left) * dpi;
    const y = (yClient - rect.top) * dpi;
    // 行
    const r = Math.max(
      0,
      Math.min(
        Math.floor((y - PADDING_TOP * dpi) / (LINE_HEIGHT * dpi)),
        lines().length - 1
      )
    );
    const line = lines()[r] ?? "";
    // 列：逐字宽度
    let acc = PADDING_LEFT * dpi;
    let col = 0;
    for (let i = 0; i < line.length; i++) {
      const w = measureTextWidth(line[i]);
      if (x < acc + w / 2) {
        col = i;
        break;
      }
      acc += w;
      col = i + 1;
    }
    return { row: r, col };
  }

  function onCanvasPointerDown(e: PointerEvent) {
    canvasRef?.focus();
    if (!canvasRef) return;
    const { row, col } = hitTestToCaret(e.clientX, e.clientY);
    clampCaret(row, col);
    setSelAnchorRow(row);
    setSelAnchorCol(col);
    setSelFocusRow(row);
    setSelFocusCol(col);
    setDragging(true);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    redraw();
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!dragging()) return;
    const { row, col } = hitTestToCaret(e.clientX, e.clientY);
    setSelFocusRow(row);
    setSelFocusCol(col);
    clampCaret(row, col);
  }

  function onCanvasPointerUp(e: PointerEvent) {
    if (!dragging()) return;
    setDragging(false);
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  return (
    <div class="font-sans max-w-[1000px] mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">Skia WASM 文本编辑器（实验）</h1>
      <p class="text-gray-600 mb-4">
        使用 CanvasKit（Skia
        WASM）进行文本渲染与光标绘制，当前为最小可用版本（不支持
        IME/选区/滚动）。
      </p>

      {error() && (
        <div class="mb-3 text-red-700 bg-red-100 p-2 rounded">{error()}</div>
      )}

      <div class="mb-2 text-sm text-gray-700">
        状态：{ready() ? "就绪" : "加载中..."}｜行数：{lines().length}｜位置：
        {caretRow() + 1}:{caretCol() + 1}
      </div>

      <div class="border rounded shadow overflow-hidden inline-block">
        <canvas
          ref={canvasRef}
          class="block outline-none"
          tabindex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
        />
      </div>

      <div class="mt-3 text-sm text-gray-500">
        提示：直接在画布上键入，Enter 换行，方向键移动，Backspace/Delete 删除。
      </div>
    </div>
  );
}
