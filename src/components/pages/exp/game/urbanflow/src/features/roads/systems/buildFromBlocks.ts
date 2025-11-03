import type { Polyline } from "../../traffic/services/graph";

export type PlacedBlock = { x: number; y: number; w: number; h: number; category?: string };

export function buildPolylinesFromBlocks(blocks: PlacedBlock[]): Polyline[] {
  // 仅对道路类 block 生成折线：共享完整边→连中心
  const roads = blocks.filter(b => (b.category ?? "") === "road");
  const polylines: Polyline[] = [];
  const key = (x: number, y: number) => `${x}:${y}`;
  // 建立索引：按左上角坐标聚类
  const map = new Map<string, PlacedBlock>();
  for (const b of roads) map.set(key(b.x, b.y), b);
  for (const b of roads) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    // 查找右侧贴边邻居：b 的右边 = n 的左边，且在 y 方向完全对齐（允许短边完全贴合长边的一部分：要求重叠段≥min(两者边长)/2）
    for (const n of roads) {
      if (n === b) continue;
      const touchRight = Math.abs((b.x + b.w) - n.x) < 1e-6;
      if (touchRight) {
        const overlap = Math.max(0, Math.min(b.y + b.h, n.y + n.h) - Math.min(b.y, n.y));
        const minEdge = Math.min(b.h, n.h);
        if (overlap >= minEdge * 0.5) {
          const ncx = n.x + n.w / 2;
          const ncy = n.y + n.h / 2;
          polylines.push({ id: `h:${b.x},${b.y}->${n.x},${n.y}`, points: [{ x: cx, y: cy }, { x: ncx, y: ncy }] });
        }
      }
      const touchBottom = Math.abs((b.y + b.h) - n.y) < 1e-6;
      if (touchBottom) {
        const overlap = Math.max(0, Math.min(b.x + b.w, n.x + n.w) - Math.min(b.x, n.x));
        const minEdge = Math.min(b.w, n.w);
        if (overlap >= minEdge * 0.5) {
          const ncx = n.x + n.w / 2;
          const ncy = n.y + n.h / 2;
          polylines.push({ id: `v:${b.x},${b.y}->${n.x},${n.y}`, points: [{ x: cx, y: cy }, { x: ncx, y: ncy }] });
        }
      }
    }
  }
  return polylines;
}


