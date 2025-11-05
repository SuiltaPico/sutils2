import type { IRenderer } from "../../platform/render/RendererRegistry";
import type { AppStore } from "../../core/state/createAppStore";
import { attachPointer } from "../../platform/input/pointer";
import { attachKeyboard } from "../../platform/input/keyboard";
import { BLOCK_PRESET_MAP, DEFAULT_BLOCK_PRESET_ID, GRID_UNIT } from "./presets";
import { buildPolylinesFromBlocks } from "../roads/systems/buildFromBlocks";
import { buildGraphFromPolylines } from "../traffic/services/graph";
import { setGraph } from "../traffic";

export function registerEditorFeature(renderer: IRenderer, app: AppStore, container: HTMLDivElement) {
  // 注册图层元数据
  app.layers.setVisible("ui.selection", true);
  app.layers.setOpacity("ui.selection", 1);
  app.layers.setOrder("ui.selection", 9);
  app.layers.setVisible("ui.blockPreview", true);
  app.layers.setOpacity("ui.blockPreview", 0.65);
  app.layers.setOrder("ui.blockPreview", 8);
  app.layers.setVisible("world.blocks", true);
  app.layers.setOpacity("world.blocks", 0.6);
  app.layers.setOrder("world.blocks", 1);

  let selection: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let dragging = false;
  let blockPreview: { worldX: number; worldY: number; w: number; h: number } | null = null;
  let roadAnchorA: { worldX: number; worldY: number } | null = null;
  let roadPreviewB: { worldX: number; worldY: number } | null = null;
  let snapMode: "fine" | "normal" | "coarse" = "normal";

  const snapFactor = () => (snapMode === "fine" ? 0.5 : snapMode === "coarse" ? 2 : 1);
  const snapTo = (v: number, step: number) => Math.floor(v / step) * step;
  const isLegal = (x: number, y: number) => x >= 0 && y >= 0;
  const snapToExistingNode = (x: number, y: number, eps = 6) => {
    let best = { x, y };
    let bestD2 = eps * eps + 1;
    const segs = app.roads.segments;
    for (const r of segs) {
      const cands = [ { x: r.ax, y: r.ay }, { x: r.bx, y: r.by } ];
      for (const p of cands) {
        const dx = p.x - x; const dy = p.y - y; const d2 = dx*dx + dy*dy;
        if (d2 < bestD2) { bestD2 = d2; best = { x: p.x, y: p.y }; }
      }
    }
    return best;
  };

  function drawSelection(dc: { ctx: CanvasRenderingContext2D; width: number; height: number }) {
    if (!app.layers.isVisible("ui.selection")) return;
    if (!selection) return;
    const { ctx } = dc;
    const x = Math.min(selection.x0, selection.x1);
    const y = Math.min(selection.y0, selection.y1);
    const w = Math.abs(selection.x1 - selection.x0);
    const h = Math.abs(selection.y1 - selection.y0);
    if (w < 1 || h < 1) return;
    const alpha = app.layers.getOpacity("ui.selection");
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#66ccff";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w), Math.floor(h));
    ctx.fillStyle = "#66ccff22";
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  }

  renderer.registerLayer("ui.selection", (dc) => drawSelection(dc));

  // Block 预览图层
  renderer.registerLayer("ui.blockPreview", ({ ctx }) => {
    if (!app.layers.isVisible("ui.blockPreview")) return;
    if (app.editor.activeTool !== "block") return;
    if (!blockPreview) return;
    const presetId = app.editor.blockPresetId ?? DEFAULT_BLOCK_PRESET_ID;
    const preset = BLOCK_PRESET_MAP.get(presetId);
    const scale = app.view.scale;
    const off = app.view.offset;
    const w = (blockPreview?.w ?? (preset ? GRID_UNIT * preset.span : GRID_UNIT)) * scale;
    const h = (blockPreview?.h ?? (preset ? GRID_UNIT * preset.span : GRID_UNIT)) * scale;
    const sx = blockPreview.worldX * scale + off.x;
    const sy = blockPreview.worldY * scale + off.y;
    const legal = isLegal(blockPreview.worldX, blockPreview.worldY);
    const alpha = app.layers.getOpacity("ui.blockPreview");
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = legal ? (preset?.fill ?? "#22c55e33") : "#ef444433";
    ctx.strokeStyle = legal ? (preset?.stroke ?? "#16a34a") : "#ef4444";
    ctx.lineWidth = 1;
    // 非法落点使用虚线边框增强提示
    if (!legal) ctx.setLineDash([6, 4]);
    ctx.fillRect(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, Math.floor(w), Math.floor(h));
    ctx.strokeRect(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, Math.floor(w), Math.floor(h));
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  // Road 预览图层（两点建路）
  renderer.registerLayer("ui.roadPreview", ({ ctx }) => {
    if (!app.layers.isVisible("ui.roadPreview")) return;
    if (app.editor.activeTool !== "road") return;
    if (!roadAnchorA || !roadPreviewB) return;
    const s = app.view.scale;
    const off = app.view.offset;
    const ax = roadAnchorA.worldX * s + off.x;
    const ay = roadAnchorA.worldY * s + off.y;
    const bx = roadPreviewB.worldX * s + off.x;
    const by = roadPreviewB.worldY * s + off.y;
    const alpha = app.layers.getOpacity("ui.roadPreview");
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#10b981"; // 预览为绿色
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.floor(ax) + 0.5, Math.floor(ay) + 0.5);
    ctx.lineTo(Math.floor(bx) + 0.5, Math.floor(by) + 0.5);
    ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(Math.floor(ax) + 0.5, Math.floor(ay) + 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(Math.floor(bx) + 0.5, Math.floor(by) + 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  // HUD 叠加：显示当前工具与吸附档位
  renderer.registerLayer("ui.hud", ({ ctx, width, height }) => {
    const alpha = 1;
    ctx.save();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas";
    ctx.fillStyle = "#cfe9ff";
    const tool = app.editor.activeTool;
    const snapLabel = snapMode === "fine" ? "细" : snapMode === "coarse" ? "粗" : "中";
    const blocksCount = app.editor.getBlocks().length;
    const text = `TOOL: ${tool}  •  SNAP: ${snapLabel}  •  Blocks: ${blocksCount}`;
    const pad = 6;
    const tw = ctx.measureText(text).width;
    const th = 14;
    const bx = 8;
    const by = height - (th + pad * 2) - 8;
    ctx.fillStyle = "#0b1020aa";
    ctx.fillRect(bx, by, tw + pad * 2, th + pad * 2);
    ctx.fillStyle = "#cfe9ff";
    ctx.fillText(text, bx + pad, by + pad + th - 4);
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  // 已放置 Blocks 图层
  renderer.registerLayer("world.blocks", ({ ctx }) => {
    if (!app.layers.isVisible("world.blocks")) return;
    const blocks = app.editor.getBlocks();
    if (!blocks || blocks.length === 0) return;
    const s = app.view.scale;
    const off = app.view.offset;
    ctx.save();
    const alpha = app.layers.getOpacity("world.blocks");
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#0ea5e9";
    ctx.fillStyle = "#0ea5e922";
    for (const b of blocks) {
      const sx = b.x * s + off.x;
      const sy = b.y * s + off.y;
      const w = b.w * s;
      const h = b.h * s;
      ctx.fillRect(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, Math.floor(w), Math.floor(h));
      ctx.strokeRect(Math.floor(sx) + 0.5, Math.floor(sy) + 0.5, Math.floor(w), Math.floor(h));
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  // 已放置 Roads 图层（线段）
  renderer.registerLayer("world.roads", ({ ctx }) => {
    if (!app.layers.isVisible("world.roads")) return;
    const segs = app.roads.segments;
    if (!segs || segs.length === 0) return;
    const s = app.view.scale;
    const off = app.view.offset;
    ctx.save();
    const alpha = app.layers.getOpacity("world.roads");
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    for (const r of segs) {
      const ax = r.ax * s + off.x;
      const ay = r.ay * s + off.y;
      const bx = r.bx * s + off.x;
      const by = r.by * s + off.y;
      ctx.beginPath();
      ctx.moveTo(Math.floor(ax) + 0.5, Math.floor(ay) + 0.5);
      ctx.lineTo(Math.floor(bx) + 0.5, Math.floor(by) + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  });

  const toWorld = (sx: number, sy: number) => {
    const s = app.view.scale;
    const off = app.view.offset;
    return { worldX: (sx - off.x) / s, worldY: (sy - off.y) / s };
  };

  const detachPointer = attachPointer(container, toWorld, {
    onDown: ({ button, screenX, screenY, worldX, worldY }) => {
      if (button !== 0) return; // 左键
      if (app.editor.activeTool === "select") {
        dragging = true;
        selection = { x0: screenX, y0: screenY, x1: screenX, y1: screenY };
        renderer.requestFrame();
      } else if (app.editor.activeTool === "block") {
        const proto = app.editor.getPrototype();
        if (proto) {
          const step = GRID_UNIT * snapFactor();
          const gx = snapTo(worldX, step);
          const gy = snapTo(worldY, step);
          const wWorld = GRID_UNIT * proto.wCells;
          const hWorld = GRID_UNIT * proto.hCells;
          blockPreview = { worldX: gx, worldY: gy, w: wWorld, h: hWorld };
          // 左键落定（使用库原型固定尺寸与类别）
          app.editor.addBlockRectWorld(gx, gy, wWorld, hWorld, proto.orientation, proto.category, proto.id);
        } else {
          const presetId = app.editor.blockPresetId ?? DEFAULT_BLOCK_PRESET_ID;
          const preset = BLOCK_PRESET_MAP.get(presetId);
          if (preset) {
            const step = GRID_UNIT * preset.span * snapFactor();
            const gx = snapTo(worldX, step);
            const gy = snapTo(worldY, step);
            const size = GRID_UNIT * preset.span;
            blockPreview = { worldX: gx, worldY: gy, w: size, h: size };
            app.editor.addBlockRectWorld(gx, gy, size, size, 0, "road");
          }
        }
        // 重建图
        const blocks = app.editor.getBlocks().map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, category: b.category }));
        const polylines = buildPolylinesFromBlocks(blocks);
        const graph = buildGraphFromPolylines(polylines);
        setGraph(graph);
        renderer.requestFrame();
      } else if (app.editor.activeTool === "road") {
        const step = GRID_UNIT * snapFactor();
        const snapped = snapToExistingNode(worldX, worldY, 6);
        const gx = snapTo(snapped.x, step);
        const gy = snapTo(snapped.y, step);
        if (!roadAnchorA) {
          roadAnchorA = { worldX: gx, worldY: gy };
          roadPreviewB = { worldX: gx, worldY: gy };
        } else {
          const a = roadAnchorA;
          const b = { worldX: gx, worldY: gy };
          app.roads.addSegment(a.worldX, a.worldY, b.worldX, b.worldY, app.editor.roadTemplateId ?? undefined);
          // 重建图：将道路线段映射为折线
          const polylines = app.roads.segments.map((r, i) => ({ id: `r${i + 1}`, points: [{ x: r.ax, y: r.ay }, { x: r.bx, y: r.by }] }));
          const graph = buildGraphFromPolylines(polylines);
          setGraph(graph);
          roadAnchorA = null;
          roadPreviewB = null;
        }
        renderer.requestFrame();
      }
    },
    onMove: ({ screenX, screenY, worldX, worldY }) => {
      if (app.editor.activeTool === "select") {
        if (!dragging || !selection) return;
        selection.x1 = screenX;
        selection.y1 = screenY;
        renderer.requestFrame();
      } else if (app.editor.activeTool === "block") {
        const proto = app.editor.getPrototype();
        if (proto) {
          const step = GRID_UNIT * snapFactor();
          const gx = snapTo(worldX, step);
          const gy = snapTo(worldY, step);
          blockPreview = { worldX: gx, worldY: gy, w: GRID_UNIT * proto.wCells, h: GRID_UNIT * proto.hCells };
          renderer.requestFrame();
        } else {
          const presetId = app.editor.blockPresetId ?? DEFAULT_BLOCK_PRESET_ID;
          const preset = BLOCK_PRESET_MAP.get(presetId);
          if (!preset) return;
          const step = GRID_UNIT * preset.span * snapFactor();
          const gx = snapTo(worldX, step);
          const gy = snapTo(worldY, step);
          blockPreview = { worldX: gx, worldY: gy, w: GRID_UNIT * preset.span, h: GRID_UNIT * preset.span };
          renderer.requestFrame();
        }
      } else if (app.editor.activeTool === "road") {
        const step = GRID_UNIT * snapFactor();
        const snapped = snapToExistingNode(worldX, worldY, 6);
        const gx = snapTo(snapped.x, step);
        const gy = snapTo(snapped.y, step);
        if (roadAnchorA) {
          roadPreviewB = { worldX: gx, worldY: gy };
          renderer.requestFrame();
        }
      }
    },
    onUp: ({ button, screenX, screenY }) => {
      if (button !== 0) return;
      if (app.editor.activeTool === "select") {
        if (!selection) return;
        selection.x1 = screenX;
        selection.y1 = screenY;
        dragging = false;
        renderer.requestFrame();
      }
    },
    onLeave: () => {
      if (app.editor.activeTool === "select") {
        if (!dragging) return;
        dragging = false;
        renderer.requestFrame();
      } else if (app.editor.activeTool === "road") {
        // 保持预览不变
      }
    },
  });

  const detachKeyboard = attachKeyboard(window, {
    onKey: (ev) => {
      if (ev.key === "Escape") {
        if (app.editor.activeTool === "select") {
          if (selection) {
            selection = null;
            renderer.requestFrame();
          }
        } else if (app.editor.activeTool === "block") {
          blockPreview = null;
          renderer.requestFrame();
        } else if (app.editor.activeTool === "road") {
          roadAnchorA = null;
          roadPreviewB = null;
          renderer.requestFrame();
        }
      } else if (ev.key === "1") {
        snapMode = "fine";
        renderer.requestFrame();
      } else if (ev.key === "2") {
        snapMode = "normal";
        renderer.requestFrame();
      } else if (ev.key === "3") {
        snapMode = "coarse";
        renderer.requestFrame();
      } else if (ev.key === "Tab") {
        // 循环切换吸附档位
        ev.preventDefault();
        snapMode = snapMode === "fine" ? "normal" : snapMode === "normal" ? "coarse" : "fine";
        renderer.requestFrame();
      } else if (ev.key === "r" || ev.key === "R") {
        // 旋转当前 Block 原型（若存在）
        const proto = app.editor.getPrototype();
        if (proto) {
          const nextOri = ((proto.orientation + 90) % 360) as 0 | 90 | 180 | 270;
          app.editor.setPrototype({ ...proto, orientation: nextOri });
          renderer.requestFrame();
        }
      } else if (ev.key === "Delete") {
        if (selection) {
          // 将屏幕矩形转换为世界矩形
          const s = app.view.scale;
          const off = app.view.offset;
          const wx0 = (Math.min(selection.x0, selection.x1) - off.x) / s;
          const wy0 = (Math.min(selection.y0, selection.y1) - off.y) / s;
          const wx1 = (Math.max(selection.x0, selection.x1) - off.x) / s;
          const wy1 = (Math.max(selection.y0, selection.y1) - off.y) / s;
          app.editor.removeBlocksInRect(wx0, wy0, wx1, wy1);
          selection = null;
          // 重建图
          const blocks = app.editor.getBlocks().map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, category: b.category }));
          const polylines = buildPolylinesFromBlocks(blocks);
          const graph = buildGraphFromPolylines(polylines);
          setGraph(graph);
          renderer.requestFrame();
        }
      } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === "z" || ev.key === "Z")) {
        app.editor.undo();
        const blocks = app.editor.getBlocks().map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, category: b.category }));
        const polylines = buildPolylinesFromBlocks(blocks);
        const graph = buildGraphFromPolylines(polylines);
        setGraph(graph);
        renderer.requestFrame();
      } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === "y" || ev.key === "Y")) {
        app.editor.redo();
        const blocks = app.editor.getBlocks().map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, category: b.category }));
        const polylines = buildPolylinesFromBlocks(blocks);
        const graph = buildGraphFromPolylines(polylines);
        setGraph(graph);
        renderer.requestFrame();
      } else if (ev.key === "b" || ev.key === "B") {
        if (!app.editor.blockPresetId) app.editor.setBlockPreset(DEFAULT_BLOCK_PRESET_ID);
        app.editor.setActiveTool("block");
        renderer.requestFrame();
      } else if (ev.key === "v" || ev.key === "V") {
        app.editor.setActiveTool("select");
        renderer.requestFrame();
      }
    },
  });

  return () => {
    detachPointer();
    detachKeyboard();
  };
}


