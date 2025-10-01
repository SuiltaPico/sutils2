import type { MaskConfig } from "./types";

class XorShift32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9; // avoid zero state
  }
  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    // Use unsigned uint32 normalized to [0,1)
    return this.state / 0x100000000;
  }
}

export type CellularAutomataParams = {
  width: number;
  height: number;
  seed: number;
  initialFill: number; // 0..1 chance to start as wall (1)
  iterations: number;
  birthLimit: number; // empty -> wall if neighbors >= birthLimit
  deathLimit: number; // wall survives if neighbors >= deathLimit
  wrap: boolean; // tileable edges by wrapping neighbor lookups
  smoothIterations?: number; // optional grayscale smoothing passes
  mask?: MaskConfig;
};

export function generateCellularMap(cfg: CellularAutomataParams): Float32Array {
  const w = Math.max(1, cfg.width | 0);
  const h = Math.max(1, cfg.height | 0);
  const wrap = !!cfg.wrap;
  const rand = new XorShift32(cfg.seed >>> 0);
  const birth = Math.min(8, Math.max(0, cfg.birthLimit | 0));
  const death = Math.min(8, Math.max(0, cfg.deathLimit | 0));
  const steps = Math.max(0, cfg.iterations | 0);
  const initP = Math.min(1, Math.max(0, cfg.initialFill));

  // Grid: 1 = wall/land, 0 = empty/water
  let grid = new Uint8Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = rand.next() < initP ? 1 : 0;

  const indexOf = (x: number, y: number): number => {
    if (wrap) {
      const xi = ((x % w) + w) % w;
      const yi = ((y % h) + h) % h;
      return yi * w + xi;
    }
    if (x < 0 || x >= w || y < 0 || y >= h) return -1;
    return y * w + x;
  };

  const countNeighbors = (x: number, y: number): number => {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ix = indexOf(x + dx, y + dy);
        if (ix >= 0) c += grid[ix];
        else c += 1; // treat OOB as wall to close edges when not wrapped
      }
    }
    return c;
  };

  // Iterate CA
  let next = new Uint8Array(w * h);
  for (let it = 0; it < steps; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const n = countNeighbors(x, y);
        if (grid[idx]) {
          // wall cell
          next[idx] = n >= death ? 1 : 0;
        } else {
          // empty cell
          next[idx] = n >= birth ? 1 : 0;
        }
      }
    }
    // swap
    const tmp = grid; grid = next; next = tmp;
  }

  // Convert to float values 0..1
  let data = new Float32Array(w * h);
  for (let i = 0; i < grid.length; i++) data[i] = grid[i];

  // Optional smoothing to make heightmap more graded
  const smoothPasses = Math.max(0, (cfg.smoothIterations ?? 0) | 0);
  if (smoothPasses > 0) {
    const tmp = new Float32Array(w * h);
    for (let p = 0; p < smoothPasses; p++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          let cnt = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ix = indexOf(x + dx, y + dy);
              if (ix >= 0) {
                sum += data[ix];
                cnt++;
              }
            }
          }
          tmp[y * w + x] = cnt > 0 ? sum / cnt : data[y * w + x];
        }
      }
      const t = data; data = tmp; for (let i = 0; i < t.length; i++) t[i] = 0; // reuse buffer
    }
  }

  // Apply mask if provided
  if (cfg.mask && (cfg.mask as any).enabled !== false && (cfg.mask as any).type !== "none") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const m = computeMask(x, y, w, h, cfg.mask as MaskConfig);
        const inv = (cfg.mask as any).invert ? 1 - m : m;
        data[idx] = data[idx] * saturate(inv);
      }
    }
  }

  return data;
}

function saturate(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function computeMask(x: number, y: number, w: number, h: number, cfg: MaskConfig): number {
  const fall = (cfg as any).falloff ?? 0.1;
  const fx = (x + 0.5) / w;
  const fy = (y + 0.5) / h;
  switch (cfg.type) {
    case "circle": {
      const c = cfg as any as { centerX: number; centerY: number; radius: number };
      const dx = fx - (c.centerX ?? 0.5);
      const dy = fy - (c.centerY ?? 0.5);
      const d = Math.hypot(dx, dy);
      const r = Math.max(1e-6, c.radius ?? 0.45);
      const t = (r - d) / Math.max(1e-6, r * Math.max(1e-3, fall));
      return saturate(t);
    }
    case "superellipse": {
      const c = cfg as any as { centerX: number; centerY: number; radiusX: number; radiusY: number; exponent: number; rotateDeg?: number };
      let px = fx - (c.centerX ?? 0.5);
      let py = fy - (c.centerY ?? 0.5);
      const ang = (((c.rotateDeg ?? 0) as number) * Math.PI) / 180;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rx = Math.max(1e-6, c.radiusX ?? 0.45);
      const ry = Math.max(1e-6, c.radiusY ?? 0.45);
      const ux = ca * px - sa * py;
      const uy = sa * px + ca * py;
      const n = Math.max(0.1, c.exponent ?? 2);
      const k = Math.pow(Math.pow(Math.abs(ux) / rx, n) + Math.pow(Math.abs(uy) / ry, n), 1 / n);
      const sdf = 1 - k;
      const t = sdf / Math.max(1e-6, Math.max(rx, ry) * Math.max(1e-3, fall));
      return saturate(t);
    }
    case "flower": {
      const c = cfg as any as { centerX: number; centerY: number; radius: number; amplitude: number; petals: number; rotateDeg?: number };
      const cx = c.centerX ?? 0.5; const cy = c.centerY ?? 0.5;
      const dx = fx - cx; const dy = fy - cy;
      const ang0 = Math.atan2(dy, dx);
      const ang = ang0 - (((c.rotateDeg ?? 0) as number) * Math.PI) / 180;
      const baseR = Math.max(1e-6, c.radius ?? 0.45);
      const amp = c.amplitude ?? 0.25; const k = Math.max(3, Math.floor(c.petals ?? 6));
      const rTheta = baseR * (1 + amp * Math.cos(k * ang));
      const d = Math.hypot(dx, dy);
      const t = (rTheta - d) / Math.max(1e-6, baseR * Math.max(1e-3, fall));
      return saturate(t);
    }
    case "polygon": {
      const c = cfg as any as { points: Array<{ x: number; y: number }> };
      const pts = (c.points ?? []).map(p => ({ x: saturate(p.x), y: saturate(p.y) }));
      if (pts.length < 3) return 1;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        const intersect = yi > fy !== yj > fy && fx < ((xj - xi) * (fy - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      let minD = Infinity;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const ax = pts[j].x, ay = pts[j].y;
        const bx = pts[i].x, by = pts[i].y;
        const vx = bx - ax, vy = by - ay;
        const wx = fx - ax, wy = fy - ay;
        const tproj = saturate((wx * vx + wy * vy) / (vx * vx + vy * vy + 1e-12));
        const cx = ax + tproj * vx, cy = ay + tproj * vy;
        const d = Math.hypot(fx - cx, fy - cy);
        if (d < minD) minD = d;
      }
      const fw = Math.max(1e-3, fall) * 0.2;
      const t = inside ? 1 - minD / fw : 0;
      return saturate(t);
    }
    case "voronoi": {
      // lightweight: just return full mask interior
      // Users can combine CA with Voronoi via noise mask if needed; keep this simple
      return 1;
    }
    default:
      return 1;
  }
}


