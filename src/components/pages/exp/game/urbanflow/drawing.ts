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

  // 车辆数 HUD
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = `${12 * Math.max(1, s)}px sans-serif`;
  ctx.fillText(`车辆: ${vehicles.length}`, 8, 16);
  ctx.restore();

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
