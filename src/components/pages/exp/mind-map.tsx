import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";

type MindMapNode = {
  id: string;
  title: string;
  children: MindMapNode[];
  collapsed?: boolean;
};

type PositionedNode = {
  id: string;
  x: number; // top-left x
  y: number; // center y
};

type FoundNode = {
  node: MindMapNode;
  parent: MindMapNode | null;
  parentIndex: number;
};

const NODE_WIDTH = 140;
const NODE_HEIGHT = 36;
const H_GAP = 96; // horizontal gap between levels
const V_GAP = 14; // vertical gap between siblings
const POST_LEN = 18; // "后接线" length after node

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function traverse(
  root: MindMapNode,
  cb: (n: MindMapNode, parent: MindMapNode | null, index: number) => void
) {
  function walk(n: MindMapNode, parent: MindMapNode | null) {
    cb(n, parent, parent ? parent.children.indexOf(n) : -1);
    if (!n.collapsed) {
      for (const child of n.children) walk(child, n);
    }
  }
  walk(root, null);
}

function findNode(root: MindMapNode, id: string): FoundNode | null {
  let out: FoundNode | null = null;
  function rec(n: MindMapNode, parent: MindMapNode | null) {
    if (n.id === id) {
      out = {
        node: n,
        parent,
        parentIndex: parent ? parent.children.indexOf(n) : -1,
      };
      return;
    }
    for (const c of n.children) {
      rec(c, n);
      if (out) return;
    }
  }
  rec(root, null);
  return out;
}

// Layout: top-down. Parent is horizontally centered above its (visible) children.
function computeLayout(root: MindMapNode) {
  const positions = new Map<string, PositionedNode>();

  function layout(node: MindMapNode, depth: number, startY: number): number {
    // Returns total vertical space consumed starting at startY; positions[node.id] assigned
    if (node.collapsed || node.children.length === 0) {
      const centerY = startY + NODE_HEIGHT / 2;
      positions.set(node.id, {
        id: node.id,
        x: depth * (NODE_WIDTH + H_GAP),
        y: centerY,
      });
      return NODE_HEIGHT + V_GAP;
    }
    let cursorY = startY;
    const childCenters: number[] = [];
    for (const child of node.children) {
      const used = layout(child, depth + 1, cursorY);
      // child position already set; collect its center
      const p = positions.get(child.id)!;
      childCenters.push(p.y);
      cursorY += used;
    }
    const minY = Math.min(...childCenters);
    const maxY = Math.max(...childCenters);
    const centerY = (minY + maxY) / 2;
    positions.set(node.id, {
      id: node.id,
      x: depth * (NODE_WIDTH + H_GAP),
      y: centerY,
    });
    return cursorY - startY;
  }

  layout(root, 0, 0);
  return positions;
}

function createInitialTree(): MindMapNode {
  return {
    id: generateId(),
    title: "Root",
    collapsed: false,
    children: [
      { id: generateId(), title: "Topic A", collapsed: false, children: [] },
      {
        id: generateId(),
        title: "Topic B",
        collapsed: false,
        children: [
          { id: generateId(), title: "B-1", collapsed: false, children: [] },
          { id: generateId(), title: "B-2", collapsed: false, children: [] },
        ],
      },
      { id: generateId(), title: "Topic C", collapsed: false, children: [] },
    ],
  };
}

export default function MindMapPage() {
  const [root, setRoot] = createSignal<MindMapNode>(createInitialTree());
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  const [scale, setScale] = createSignal(1);
  const [translate, setTranslate] = createSignal({ x: 40, y: 40 });
  const [draftHtml, setDraftHtml] = createSignal("");

  const positions = createMemo(() => computeLayout(root()));

  let containerRef: HTMLDivElement | undefined;

  // Keep draft html in sync with focused node
  createEffect(() => {
    const id = focusedId();
    if (!id) return setDraftHtml("");
    const f = findNode(root(), id);
    setDraftHtml(f?.node.title ?? "");
  });

  function toggleCollapse(id: string) {
    setRoot((r) => {
      const clone = structuredClone(r) as MindMapNode;
      const found = findNode(clone, id);
      if (found) found.node.collapsed = !found.node.collapsed;
      return clone;
    });
  }

  function addChild(toId: string) {
    setRoot((r) => {
      const clone = structuredClone(r) as MindMapNode;
      const found = findNode(clone, toId);
      if (!found) return clone;
      const newNode: MindMapNode = {
        id: generateId(),
        title: "New",
        children: [],
        collapsed: false,
      };
      found.node.children.push(newNode);
      found.node.collapsed = false;
      return clone;
    });
  }

  function addSibling(ofId: string) {
    setRoot((r) => {
      const clone = structuredClone(r) as MindMapNode;
      const found = findNode(clone, ofId);
      if (!found) return clone;
      if (!found.parent) return clone; // root has no sibling
      const newNode: MindMapNode = {
        id: generateId(),
        title: "New",
        children: [],
        collapsed: false,
      };
      found.parent.children.splice(found.parentIndex + 1, 0, newNode);
      return clone;
    });
  }

  function handleKeyDown(e: KeyboardEvent) {
    const id = focusedId();
    if (!id) return;
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      const prev = focusedId();
      addSibling(id);
      // Focus the newly added sibling (next index)
      setTimeout(() => {
        const f = findNode(root(), id);
        if (f && f.parent) {
          const sibling = f.parent.children[f.parentIndex + 1];
          if (sibling) setFocusedId(sibling.id);
        }
      });
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      addChild(id);
      // Focus the newly added child (last)
      setTimeout(() => {
        const f = findNode(root(), id);
        if (f) {
          const last = f.node.children[f.node.children.length - 1];
          if (last) setFocusedId(last.id);
        }
      });
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const t = translate();
    const s = scale();
    const worldBefore = { x: (pointer.x - t.x) / s, y: (pointer.y - t.y) / s };
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = Math.max(0.3, Math.min(3, s * factor));
    const worldAfter = worldBefore; // unchanged in world space
    const nextTranslate = {
      x: pointer.x - worldAfter.x * nextScale,
      y: pointer.y - worldAfter.y * nextScale,
    };
    batch(() => {
      setScale(nextScale);
      setTranslate(nextTranslate);
    });
  }

  onMount(() => {
    // Focus container to receive keyboard events
    containerRef?.focus();
  });

  // Render helpers
  function NodeRect(props: { n: MindMapNode }) {
    const pos = createMemo(() => positions().get(props.n.id)!);
    const isFocused = createMemo(() => focusedId() === props.n.id);
    const top = createMemo(() => pos().y - NODE_HEIGHT / 2);
    const postX = createMemo(() => pos().x + NODE_WIDTH);
    const postY = createMemo(() => pos().y);
    const hasKids = createMemo(() => props.n.children.length > 0);
    const showKnob = createMemo(() => hasKids());
    // Place knob at the orthogonal cross point (midX, y1)
    const knobX = createMemo(() => postX() + POST_LEN + 16);
    const knobY = createMemo(() => postY());
    // -------- Minimal custom editor (paragraphs + text) --------
    type Caret = { pIndex: number; offset: number };
    const [docParas, setDocParas] = createSignal<string[]>([]);
    const [caret, setCaret] = createSignal<Caret>({ pIndex: 0, offset: 0 });
    const [undoStack, setUndoStack] = createSignal<
      { paras: string[]; caret: Caret }[]
    >([]);
    const [redoStack, setRedoStack] = createSignal<
      { paras: string[]; caret: Caret }[]
    >([]);
    let hiddenTa!: HTMLTextAreaElement;
    let editorBox!: HTMLDivElement;
    const paraTextNodes: Text[] = [];

    function pushUndo() {
      setUndoStack((s) => [
        ...s,
        { paras: [...docParas()], caret: { ...caret() } },
      ]);
      setRedoStack([]);
    }
    function applyDoc(paras: string[], c: Caret) {
      setDocParas(paras);
      setCaret(c);
    }
    function commit(save: boolean) {
      if (!isFocused()) return;
      if (save) {
        setRoot((r) => {
          const clone = structuredClone(r) as MindMapNode;
          const f = findNode(clone, props.n.id);
          if (f) f.node.title = docParas().join("\n");
          return clone;
        });
      }
    }
    createEffect(() => {
      if (isFocused()) {
        const initial = (findNode(root(), props.n.id)?.node.title ?? "")
          .replace(/\r\n?/g, "\n")
          .split("\n");
        if (initial.length === 0) initial.push("");
        applyDoc(initial, {
          pIndex: Math.min(0, initial.length - 1),
          offset: 0,
        });
        queueMicrotask(() => hiddenTa?.focus());
      }
    });

    function insertText(text: string) {
      if (!text) return;
      pushUndo();
      const { pIndex, offset } = caret();
      const paras = [...docParas()];
      const line = paras[pIndex] ?? "";
      const next = line.slice(0, offset) + text + line.slice(offset);
      paras[pIndex] = next;
      applyDoc(paras, { pIndex, offset: offset + text.length });
      hiddenTa.value = "";
    }
    function splitLine() {
      pushUndo();
      const { pIndex, offset } = caret();
      const paras = [...docParas()];
      const line = paras[pIndex] ?? "";
      const left = line.slice(0, offset);
      const right = line.slice(offset);
      paras.splice(pIndex, 1, left, right);
      applyDoc(paras, { pIndex: pIndex + 1, offset: 0 });
    }
    function backspace() {
      const { pIndex, offset } = caret();
      const paras = [...docParas()];
      if (offset > 0) {
        pushUndo();
        const line = paras[pIndex] ?? "";
        paras[pIndex] = line.slice(0, offset - 1) + line.slice(offset);
        applyDoc(paras, { pIndex, offset: offset - 1 });
        return;
      }
      if (pIndex > 0) {
        pushUndo();
        const prev = paras[pIndex - 1] ?? "";
        const cur = paras[pIndex] ?? "";
        const newOffset = prev.length;
        paras.splice(pIndex - 1, 2, prev + cur);
        applyDoc(paras, { pIndex: pIndex - 1, offset: newOffset });
      }
    }
    function delForward() {
      const { pIndex, offset } = caret();
      const paras = [...docParas()];
      const line = paras[pIndex] ?? "";
      if (offset < line.length) {
        pushUndo();
        paras[pIndex] = line.slice(0, offset) + line.slice(offset + 1);
        applyDoc(paras, { pIndex, offset });
        return;
      }
      if (pIndex < paras.length - 1) {
        pushUndo();
        const next = paras[pIndex + 1] ?? "";
        paras.splice(pIndex, 2, line + next);
        applyDoc(paras, { pIndex, offset });
      }
    }
    function moveLeft() {
      const { pIndex, offset } = caret();
      if (offset > 0) return setCaret({ pIndex, offset: offset - 1 });
      if (pIndex > 0) {
        const prevLen = (docParas()[pIndex - 1] ?? "").length;
        setCaret({ pIndex: pIndex - 1, offset: prevLen });
      }
    }
    function moveRight() {
      const { pIndex, offset } = caret();
      const lineLen = (docParas()[pIndex] ?? "").length;
      if (offset < lineLen) return setCaret({ pIndex, offset: offset + 1 });
      if (pIndex < docParas().length - 1)
        setCaret({ pIndex: pIndex + 1, offset: 0 });
    }
    function undo() {
      const s = undoStack();
      if (s.length === 0) return;
      const last = s[s.length - 1];
      setUndoStack(s.slice(0, -1));
      setRedoStack((r) => [
        ...r,
        { paras: [...docParas()], caret: { ...caret() } },
      ]);
      applyDoc([...last.paras], { ...last.caret });
    }
    function redo() {
      const r = redoStack();
      if (r.length === 0) return;
      const last = r[r.length - 1];
      setRedoStack(r.slice(0, -1));
      setUndoStack((s) => [
        ...s,
        { paras: [...docParas()], caret: { ...caret() } },
      ]);
      applyDoc([...last.paras], { ...last.caret });
    }
    function onKeyDownEditor(e: KeyboardEvent) {
      // Allow Ctrl+Enter / Shift+Enter to bubble for node ops
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey && (e.key === "Z" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        redo();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "Backspace") {
          e.preventDefault();
          backspace();
          return;
        }
        if (e.key === "Delete") {
          e.preventDefault();
          delForward();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          splitLine();
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
      }
    }
    function getLineElements(): HTMLElement[] {
      return Array.from(editorBox.children).filter(
        (el) =>
          (el as HTMLElement).dataset &&
          (el as HTMLElement).dataset.role === "line"
      ) as HTMLElement[];
    }
    function measureCaretPosition() {
      // Ensure DOM/layout settled
      requestAnimationFrame(() => {
        const { pIndex, offset } = caret();
        const lineNode = paraTextNodes[pIndex];
        const parentRect = editorBox.getBoundingClientRect();
        let left = 0,
          top = 0,
          height = 16;
        if (lineNode) {
          const range = document.createRange();
          const clamped = Math.max(0, Math.min(offset, lineNode.data.length));
          try {
            range.setStart(lineNode, clamped);
            range.setEnd(lineNode, clamped);
          } catch {}
          const rects = range.getClientRects();
          if (rects.length > 0) {
            const rect = rects[0];
            left = rect.left - parentRect.left;
            top = rect.top - parentRect.top;
            height = rect.height || 16;
          } else {
            const lineEls = getLineElements();
            const le = lineEls[pIndex]?.getBoundingClientRect();
            if (le) {
              const isEnd = clamped >= (lineNode.data?.length ?? 0);
              left = (isEnd ? le.right : le.left) - parentRect.left;
              top = le.top - parentRect.top;
              height = le.height || 16;
            }
          }
        }
        setCaretStyle({ left, top, height });
        hiddenTa.style.left = `${left}px`;
        hiddenTa.style.top = `${top}px`;
      });
    }
    function setCaretFromPoint(clientX: number, clientY: number) {
      const lines = getLineElements();
      if (lines.length === 0) return;
      const boxRect = editorBox.getBoundingClientRect();
      // pick nearest line by vertical center
      let targetIndex = 0;
      let minDy = Infinity;
      lines.forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        const cy = (r.top + r.bottom) / 2;
        const dy = Math.abs(clientY - cy);
        if (dy < minDy) {
          minDy = dy;
          targetIndex = idx;
        }
      });
      const lineElem = lines[targetIndex];
      const text = paraTextNodes[targetIndex];
      if (!text) {
        setCaret({ pIndex: targetIndex, offset: 0 });
        queueMicrotask(() => hiddenTa.focus());
        return;
      }
      // binary search offset by comparing x
      const range = document.createRange();
      let lo = 0,
        hi = text.data.length;
      const clamp = (n: number) => Math.max(0, Math.min(n, text.data.length));
      const toX = (pos: number) => {
        try {
          range.setStart(text, clamp(pos));
          range.setEnd(text, clamp(pos));
        } catch {}
        const rect = range.getClientRects()[0];
        if (rect) return rect.left;
        const le = lineElem.getBoundingClientRect();
        if (pos <= 0) return le.left;
        return le.right;
      };
      const targetX = clientX;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const x = toX(mid);
        if (x - targetX < 0) lo = mid + 1;
        else hi = mid;
      }
      setCaret({ pIndex: targetIndex, offset: lo });
      queueMicrotask(() => {
        hiddenTa.focus();
        measureCaretPosition();
      });
    }
    function onInputTa(e: InputEvent) {
      const v = e.data;
      if (v) insertText(v);
    }
    // Caret visualization
    const [caretStyle, setCaretStyle] = createSignal<{
      left: number;
      top: number;
      height: number;
    }>({ left: 0, top: 0, height: 16 });
    createEffect(() => {
      docParas();
      caret();
      measureCaretPosition();
    });
    return (
      <g>
        <rect
          x={pos().x}
          y={top()}
          rx={8}
          ry={8}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          fill="#fff"
          stroke={isFocused() ? "#1677ff" : "#999"}
          stroke-width={isFocused() ? 2 : 1}
          onClick={(ev) => {
            ev.stopPropagation();
            setFocusedId(props.n.id);
          }}
        />
        <Show when={!isFocused()}>
          <foreignObject
            x={pos().x + 6}
            y={top() + 6}
            width={NODE_WIDTH - 12}
            height={NODE_HEIGHT - 12}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                color: "#333",
                "font-size": "14px",
                overflow: "hidden",
                "word-break": "break-word",
                "white-space": "pre-wrap",
                padding: "4px 8px",
              }}
            >
              {props.n.title}
            </div>
          </foreignObject>
        </Show>
        <Show when={isFocused()}>
          <foreignObject
            x={pos().x + 6}
            y={top() + 6}
            width={NODE_WIDTH - 12}
            height={NODE_HEIGHT - 12}
          >
            <div
              ref={editorBox}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCaretFromPoint(e.clientX, e.clientY);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                hiddenTa?.focus();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                onKeyDownEditor(e as unknown as KeyboardEvent);
              }}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                border: "1px solid #1677ff",
                outline: "none",
                padding: "4px 8px",
                "border-radius": "6px",
                "font-size": "14px",
                color: "#333",
                overflow: "hidden",
                cursor: "text",
              }}
            >
              {/* caret blink style */}
              <style>
                {`@keyframes blink { 0%{opacity:1} 50%{opacity:0} 100%{opacity:1} }`}
              </style>
              <For each={docParas()}>
                {(line, i) => (
                  <div
                    data-role="line"
                    style={{
                      "white-space": "pre-wrap",
                      "word-break": "break-word",
                    }}
                  >
                    <span
                      ref={(el) => {
                        const tn = document.createTextNode(line);
                        el.textContent = "";
                        el.appendChild(tn);
                        paraTextNodes[i()] = tn;
                      }}
                    />
                  </div>
                )}
              </For>
              {/* Caret */}
              <div
                style={{
                  position: "absolute",
                  left: `${caretStyle().left}px`,
                  top: `${caretStyle().top}px`,
                  width: "2px",
                  height: `${caretStyle().height}px`,
                  background: "#1677ff",
                  animation: "blink 1s step-end infinite",
                  "pointer-events": "none",
                }}
              />
              {/* Hidden textarea for IME/input, positioned at caret */}
              <textarea
                ref={(el) => (hiddenTa = el)}
                value=""
                onInput={onInputTa}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  onKeyDownEditor(e as unknown as KeyboardEvent);
                }}
                style={{
                  position: "absolute",
                  left: `${caretStyle().left}px`,
                  top: `${caretStyle().top}px`,
                  width: "1px",
                  height: "1.2em",
                  opacity: 0,
                  padding: "0",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  overflow: "hidden",
                  color: "transparent",
                  background: "transparent",
                }}
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
              />
            </div>
          </foreignObject>
        </Show>

        {/* 后接线：仅在有子节点时显示 */}
        <Show when={hasKids()}>
          <line
            x1={postX()}
            y1={postY()}
            x2={postX() + POST_LEN}
            y2={postY()}
            stroke="#888"
          />
        </Show>

        {/* 折叠/展开控制：折叠时显示 '-'，展开时显示小点 */}
        <Show when={showKnob()}>
          <g
            onClick={(ev) => {
              ev.stopPropagation();
              toggleCollapse(props.n.id);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle cx={knobX()} cy={knobY()} r={8} fill="#fff" stroke="#bbb" />
            <line
              x1={knobX() - 5}
              y1={knobY()}
              x2={knobX() + 5}
              y2={knobY()}
              stroke="#666"
              stroke-width={"2"}
            />
            <Show when={!props.n.collapsed}>
              {/* expanded shows '+' like XMind knob; requirement emphasizes '-' when collapsed, so '+' optional */}
              <line
                x1={knobX()}
                y1={knobY() - 5}
                x2={knobX()}
                y2={knobY() + 5}
                stroke="#666"
                stroke-width={"2"}
              />
            </Show>
          </g>
        </Show>
      </g>
    );
  }

  function Connectors(props: { n: MindMapNode }) {
    // Reactive orthogonal connectors with rounded corners
    const pos = createMemo(() => positions().get(props.n.id)!);
    // Always fetch latest node from current tree to capture newly added children
    const latestNode = createMemo(() => findNode(root(), props.n.id)?.node);
    const children = createMemo(() => latestNode()?.children ?? []);
    const isCollapsed = createMemo(() => latestNode()?.collapsed ?? false);
    return (
      <Show when={!isCollapsed() && children().length > 0}>
        <g>
          <For each={children()}>
            {(c) => {
              const cp = createMemo(() => positions().get(c.id)!);
              const x1 = createMemo(() => pos().x + NODE_WIDTH + POST_LEN);
              const y1 = createMemo(() => pos().y);
              const x2 = createMemo(() => cp().x);
              const y2 = createMemo(() => cp().y);
              const midX = createMemo(() => x1() + 16);
              const dy = createMemo(() => y2() - y1());
              const dirY = createMemo(() => (dy() >= 0 ? 1 : -1));
              const dirX = createMemo(() => (x2() - midX() >= 0 ? 1 : -1));
              const r2 = createMemo(() =>
                Math.min(10, Math.abs(x2() - midX()), Math.abs(dy()) / 2)
              );
              const vEndY = createMemo(() => y2() - dirY() * r2());
              const a2endX = createMemo(() => midX() + dirX() * r2());
              const a2startX = createMemo(() => midX());
              const a2startY = createMemo(() => vEndY());
              const a2endY = createMemo(() => y2());
              // Sweep flag for child-side arc to ensure inner-corner rounding
              const s2 = () => (dirY() > 0 ? 0 : 1);
              const isFlat = createMemo(() => Math.abs(dy()) < 1 || r2() < 0.5);
              return (
                <path
                  d={
                    isFlat()
                      ? `M ${x1()} ${y1()} H ${midX()} H ${x2()}`
                      : `M ${x1()} ${y1()} H ${midX()} V ${vEndY()} A ${r2()} ${r2()} 0 0 ${s2()} ${a2endX()} ${a2endY()} H ${x2()}`
                  }
                  stroke="#bbb"
                  stroke-width={"1.5"}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              );
            }}
          </For>
        </g>
      </Show>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        outline: "none",
        background: "#fafafa",
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setFocusedId(null)}
      onWheel={handleWheel}
    >
      <svg width="100%" height="100%">
        <g
          transform={`translate(${translate().x}, ${
            translate().y
          }) scale(${scale()})`}
        >
          <g>
            {/* connectors under nodes: drive from current tree traversal to ensure completeness */}
            <For
              each={(() => {
                const ids: string[] = [];
                traverse(root(), (n) => ids.push(n.id));
                return ids;
              })()}
            >
              {(id) => {
                const found = findNode(root(), id);
                if (!found) return null;
                const n = found.node;
                return <Connectors n={n} />;
              }}
            </For>
          </g>

          <g>
            <For
              each={(() => {
                const ids: string[] = [];
                traverse(root(), (n) => ids.push(n.id));
                return ids;
              })()}
            >
              {(id) => {
                const found = findNode(root(), id);
                if (!found) return null;
                const n = found.node;
                return <NodeRect n={n} />;
              }}
            </For>
          </g>
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          left: "12px",
          top: "12px",
          color: "#666",
          "font-size": "12px",
        }}
      >
        Ctrl+Enter 添加同级兄弟节点，Shift+Enter
        添加子级节点。滚轮缩放；点击空白失焦。
      </div>
    </div>
  );
}
