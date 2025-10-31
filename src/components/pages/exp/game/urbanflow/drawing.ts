import { UrbanFlowState } from "./state";
import { cellColor, CellKind, GRID_H, GRID_W, TILE } from "./types";

export function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: UrbanFlowState
) {
  const {
    scale,
    camX,
    camY,
    cells,
    nodes,
    edges,
    selectedNodeId,
    simTime,
    vehicles,
    showGrid,
    placingRect,
    rectStart,
    rectHover,
    tool,
    blockKind,
    roadBlocks,
  } = state;

  // 背景
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 世界->屏幕参数
  const s = scale();
  const cx = camX();
  const cy = camY();

  // 可见瓦片范围
  const leftWorld = -cx / s;
  const topWorld = -cy / s;
  const rightWorld = leftWorld + width / s;
  const bottomWorld = topWorld + height / s;
  const gx0 = clamp(Math.floor(leftWorld / TILE), 0, GRID_W - 1);
  const gy0 = clamp(Math.floor(topWorld / TILE), 0, GRID_H - 1);
  const gx1 = clamp(Math.ceil(rightWorld / TILE), 0, GRID_W - 1);
  const gy1 = clamp(Math.ceil(bottomWorld / TILE), 0, GRID_H - 1);

  // 绘制单元格
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const kind = cells[gy * GRID_W + gx];
      if (kind === CellKind.Empty) continue;
      const x = gx * TILE * s + cx;
      const y = gy * TILE * s + cy;
      const w = TILE * s;
      const h = TILE * s;
      ctx.fillStyle = cellColor[kind] || "#fff";
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    }
  }
  const getNode = (id: number) => nodes.find((n) => n.id === id)!;
  // 绘制路网：边
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  for (const e of edges) {
    const a = getNode(e.a);
    const b = getNode(e.b);
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
  }
  ctx.stroke();

  // 绘制路网：节点与信号
  for (const n of nodes) {
    const x = n.x * s;
    const y = n.y * s;
    // 信号环
    if (n.signal?.enabled) {
      const cyc = n.signal.cycle;
      const g = Math.max(1, Math.min(cyc - 1, n.signal.green));
      const t = (((simTime.get() + n.signal.offset) % cyc) + cyc) % cyc;
      const phase0 = t < g;
      ctx.beginPath();
      ctx.strokeStyle = phase0 ? "#22c55e" : "#ef4444";
      ctx.lineWidth = Math.max(1, 3 * s);
      ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 节点点
    ctx.beginPath();
    ctx.fillStyle = selectedNodeId() === n.id ? "#0ea5e9" : "#111827";
    ctx.arc(x, y, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 绘制车辆
  ctx.save();
  for (const v of vehicles) {
    const a = getNode(v.path[v.edgeIdx]);
    const b = getNode(v.path[v.edgeIdx + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const px = (a.x + nx * v.s) * s + cx;
    const py = (a.y + ny * v.s) * s + cy;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = v.color;
    ctx.fillRect(
      -v.length * 0.5 * s,
      -v.width * 0.5 * s,
      v.length * s,
      v.width * s
    );
    ctx.restore();
  }
  ctx.restore();

  // 绘制道路块（4x4 粗网格）
  if (roadBlocks.length) {
    ctx.save();
    ctx.translate(cx, cy);
    for (const rb of roadBlocks) {
      const gx = rb.bx * 4;
      const gy = rb.by * 4;
      const x = gx * TILE * s;
      const y = gy * TILE * s;
      const w = 4 * TILE * s;
      const h = 4 * TILE * s;
      ctx.fillStyle = rb.kind === "cement_4x4" ? "#9ca3af" : "#6b7280";
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    }
    ctx.restore();
  }

  // 车辆数 HUD
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = `${12 * Math.max(1, s)}px sans-serif`;
  ctx.fillText(`车辆: ${vehicles.length}`, 8, 16);
  // 时间 HUD (游戏内)
  const T_DAY = 24 * 3600;
  const t = ((simTime.get() % T_DAY) + T_DAY) % T_DAY;
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  ctx.fillText(`时间: ${pad(hh)}:${pad(mm)}`, 8, 32);
  ctx.restore();

  // 矩形放置预览（最终区域）
  if (placingRect() && rectStart && rectHover) {
    const rs = rectStart as any as { gx: number; gy: number };
    const rh = rectHover as any as { gx: number; gy: number };
    let x0 = Math.max(0, Math.min(rs.gx, rh.gx));
    let x1 = Math.min(GRID_W - 1, Math.max(rs.gx, rh.gx));
    let y0 = Math.max(0, Math.min(rs.gy, rh.gy));
    let y1 = Math.min(GRID_H - 1, Math.max(rs.gy, rh.gy));
    // 道路块模式下：对齐至 4x4 且限制为水平或垂直一条直线
    if (blockKind()) {
      const bs = 4;
      const bx0 = Math.floor(x0 / bs);
      const by0 = Math.floor(y0 / bs);
      const bx1 = Math.floor(x1 / bs);
      const by1 = Math.floor(y1 / bs);
      const horz = Math.abs(bx1 - bx0) >= Math.abs(by1 - by0);
      if (horz) {
        const bya = Math.floor((by0 + by1) / 2);
        x0 = Math.min(bx0, bx1) * bs;
        x1 = (Math.max(bx0, bx1) + 1) * bs - 1;
        y0 = bya * bs;
        y1 = (bya + 1) * bs - 1;
      } else {
        const bxa = Math.floor((bx0 + bx1) / 2);
        x0 = bxa * bs;
        x1 = (bxa + 1) * bs - 1;
        y0 = Math.min(by0, by1) * bs;
        y1 = (Math.max(by0, by1) + 1) * bs - 1;
      }
    }
    const px = x0 * TILE * s + cx;
    const py = y0 * TILE * s + cy;
    const pw = (x1 - x0 + 1) * TILE * s;
    const ph = (y1 - y0 + 1) * TILE * s;

    // 颜色：优先道路块，其次当前工具
    let color: string;
    if (blockKind()) {
      color = blockKind() === "cement_4x4" ? "#9ca3af" : "#6b7280";
    } else {
      const kind = toolToKindLocal(tool());
      color = cellColor[kind] || "#000000";
    }
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(pw), Math.ceil(ph));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.strokeRect(Math.floor(px) + 0.5, Math.floor(py) + 0.5, Math.ceil(pw), Math.ceil(ph));
    ctx.restore();
  }

  // 网格线
  if (showGrid()) {
    const step = TILE * s;
    const majorEvery = 5;
    ctx.save();
    ctx.translate(cx, cy);
    // 次网格
    ctx.beginPath();
    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gx * step;
      ctx.moveTo(Math.floor(x) + 0.5, Math.floor(gy0 * step));
      ctx.lineTo(Math.floor(x) + 0.5, Math.ceil((gy1 + 1) * step));
    }
    for (let gy = gy0; gy <= gy1; gy++) {
      const y = gy * step;
      ctx.moveTo(Math.floor(gx0 * step), Math.floor(y) + 0.5);
      ctx.lineTo(Math.ceil((gx1 + 1) * step), Math.floor(y) + 0.5);
    }
    ctx.strokeStyle = "#eaeaea";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 主网格
    ctx.beginPath();
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx % majorEvery !== 0) continue;
      const x = gx * step;
      ctx.moveTo(Math.floor(x) + 0.5, Math.floor(gy0 * step));
      ctx.lineTo(Math.floor(x) + 0.5, Math.ceil((gy1 + 1) * step));
    }
    for (let gy = gy0; gy <= gy1; gy++) {
      if (gy % majorEvery !== 0) continue;
      const y = gy * step;
      ctx.moveTo(Math.floor(gx0 * step), Math.floor(y) + 0.5);
      ctx.lineTo(Math.ceil((gx1 + 1) * step), Math.floor(y) + 0.5);
    }
    ctx.strokeStyle = "#d5d5d5";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function toolToKindLocal(t: ReturnType<UrbanFlowState["tool"]>): CellKind {
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
