import {
  buildPermutation,
  createPerlin2D,
  createSimplex2D,
  createOpenSimplex2D,
  createOpenSimplex2S_2D,
  createValue2D,
  createWorley2D,
  createWorley2D_F2,
  createWorley2D_F2F1,
} from "./noise";
import type { DomainWarpLayer, FractalMode, NoiseType, ErosionConfig, WorleyMetric, DomainTransform, SpectrumConfig, MaskConfig } from "./types";

export function generateNoiseMap(params: {
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  seed: number;
  type: NoiseType;
  offsetX: number;
  offsetY: number;
  fractal: FractalMode;
  warpEnabled: boolean;
  warpLayers: DomainWarpLayer[];
  tileable?: boolean;
  erosion?: ErosionConfig;
  worleyMetric?: WorleyMetric;
  domain?: DomainTransform; // anisotropy + rotation
  spectrum?: SpectrumConfig; // spectral shaping and filtering
  mask?: MaskConfig; // island/continent masks
}): Float32Array {
  const {
    width,
    height,
    scale,
    octaves,
    persistence,
    lacunarity,
    seed,
    type,
    offsetX,
    offsetY,
    fractal,
    warpEnabled,
    warpLayers,
    tileable,
    erosion,
    worleyMetric = "euclidean",
    domain,
    spectrum,
    mask,
  } = params;
  const perm = buildPermutation(seed);
  let base: (x: number, y: number) => number;
  // Compute repeat periods for tileable sampling in lattice units
  const frequencyStart = 1 / Math.max(0.0001, scale);
  const maxFractalRatio = fractal === "none" ? 1 : Math.pow(lacunarity, Math.max(0, octaves - 1));
  const repeatX = tileable ? Math.max(1, Math.round(width * frequencyStart * maxFractalRatio)) : undefined;
  const repeatY = tileable ? Math.max(1, Math.round(height * frequencyStart * maxFractalRatio)) : undefined;
  switch (type) {
    case "perlin":
      base = createPerlin2D(perm, repeatX, repeatY);
      break;
    case "simplex":
      base = createSimplex2D(perm, repeatX, repeatY);
      break;
    case "open_simplex2":
      base = createOpenSimplex2D(perm, repeatX, repeatY);
      break;
    case "open_simplex2s":
      base = createOpenSimplex2S_2D(perm, repeatX, repeatY);
      break;
    case "value":
      base = createValue2D(perm, repeatX, repeatY);
      break;
    case "worley":
      base = createWorley2D(perm, repeatX, repeatY, worleyMetric);
      break;
    case "worley_f2":
      base = createWorley2D_F2(perm, repeatX, repeatY, worleyMetric);
      break;
    case "worley_f2_f1":
      base = createWorley2D_F2F1(perm, repeatX, repeatY, worleyMetric);
      break;
  }

  const data = new Float32Array(width * height);

  // Prepare domain warp layers
  type Warper = (u: number, v: number) => { dx: number; dy: number };
  const warpers: Warper[] = [];
  if (warpEnabled) {
    for (const layer of warpLayers) {
      if (!layer.enabled) continue;
      const lperm = buildPermutation(layer.seed);
      let lbase: (x: number, y: number) => number;
      const lwf = 1 / Math.max(0.0001, layer.scale);
      const lMaxRatio = layer.fractal === "none" ? 1 : Math.pow(layer.lacunarity, Math.max(0, layer.octaves - 1));
      const lRepeatX = tileable ? Math.max(1, Math.round(width * lwf * lMaxRatio)) : undefined;
      const lRepeatY = tileable ? Math.max(1, Math.round(height * lwf * lMaxRatio)) : undefined;
      switch (layer.type) {
        case "perlin":
          lbase = createPerlin2D(lperm, lRepeatX, lRepeatY);
          break;
        case "simplex":
          lbase = createSimplex2D(lperm, lRepeatX, lRepeatY);
          break;
        case "value":
          lbase = createValue2D(lperm, lRepeatX, lRepeatY);
          break;
        case "worley":
          lbase = createWorley2D(lperm, lRepeatX, lRepeatY, worleyMetric);
          break;
        case "worley_f2":
          lbase = createWorley2D_F2(lperm, lRepeatX, lRepeatY, worleyMetric);
          break;
        case "worley_f2_f1":
          lbase = createWorley2D_F2F1(lperm, lRepeatX, lRepeatY, worleyMetric);
          break;
      }
      const wf = lwf;
      const offx = layer.offsetX * wf;
      const offy = layer.offsetY * wf;
      const sample = (u: number, v: number): number =>
        lbase(u * wf + offx, v * wf + offy);
      const warper: Warper = (u: number, v: number) => {
        if (layer.fractal === "none") {
          const nx = sample(u, v);
          const ny = sample(u + 19.19, v + 19.19);
          const dx = (nx * 2 - 1) * layer.amplitudeX;
          const dy = (ny * 2 - 1) * layer.amplitudeY;
          return { dx, dy };
        }
        let amplitude = 1;
        let frequencyRatio = 1;
        let totalAmplitude = 0;
        let sumX = 0;
        let sumY = 0;
        for (let o = 0; o < layer.octaves; o++) {
          const nx = sample(u * frequencyRatio, v * frequencyRatio);
          const ny = sample(
            (u + 19.19) * frequencyRatio,
            (v + 19.19) * frequencyRatio
          );
          sumX += (nx * 2 - 1) * amplitude;
          sumY += (ny * 2 - 1) * amplitude;
          totalAmplitude += amplitude;
          amplitude *= layer.persistence;
          frequencyRatio *= layer.lacunarity;
        }
        const dx =
          (totalAmplitude > 0 ? sumX / totalAmplitude : 0) * layer.amplitudeX;
        const dy =
          (totalAmplitude > 0 ? sumY / totalAmplitude : 0) * layer.amplitudeY;
        return { dx, dy };
      };
      warpers.push(warper);
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u0 = (x + offsetX) * frequencyStart;
      const v0 = (y + offsetY) * frequencyStart;

      // Apply domain transform (anisotropy + rotation) before warping and sampling
      let tu = u0;
      let tv = v0;
      if (domain) {
        const sx = domain.scaleX ?? 1;
        const sy = domain.scaleY ?? 1;
        const ang = ((domain.rotateDeg ?? 0) * Math.PI) / 180;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const ux = u0 * sx;
        const vy = v0 * sy;
        tu = ca * ux - sa * vy;
        tv = sa * ux + ca * vy;
      }

      let warpX = 0,
        warpY = 0;
      if (warpers.length) {
        for (const w of warpers) {
          const { dx, dy } = w(tu, tv);
          warpX += dx;
          warpY += dy;
        }
      }

      if (fractal === "none") {
        const value = base(tu + warpX, tv + warpY); // already [0,1]
        const masked = applyMaskIfAny(value, x, y, width, height, mask);
        data[y * width + x] = masked;
        continue;
      }

      // Fractal accumulation
      let amplitude = 1;
      let frequencyRatio = 1; // relative to frequencyStart
      let totalAmplitude = 0;
      let accum = 0;
      for (let o = 0; o < octaves; o++) {
        const sampleX = (tu + warpX) * frequencyRatio;
        const sampleY = (tv + warpY) * frequencyRatio;
        // Spectrum shaping and filtering
        let octaveWeight = 1;
        if (spectrum) {
          const fAbs = frequencyStart * frequencyRatio; // cycles per pixel
          const beta = spectrum.targetBeta ?? 0;
          const wBeta = Math.pow(frequencyRatio, -beta);
          let pass = true;
          if (spectrum.filter && spectrum.filter !== "none") {
            const lo = spectrum.cutoffLow ?? 0;
            const hi = spectrum.cutoffHigh ?? 0.5;
            if (spectrum.filter === "lowpass") pass = fAbs <= hi;
            else if (spectrum.filter === "highpass") pass = fAbs >= lo;
            else if (spectrum.filter === "bandpass") pass = fAbs >= lo && fAbs <= hi;
          }
          octaveWeight = pass ? wBeta : 0;
        }
        const base01 = base(sampleX, sampleY); // [0,1]
        let n = base01 * 2 - 1; // [-1,1]
        if (fractal === "ridged") {
          // Ridged multifractal: 1 - |n| emphasises ridges; square to sharpen
          const ridged = 1 - Math.abs(n);
          accum += ridged * ridged * amplitude * octaveWeight;
        } else if (fractal === "billow") {
          // Billow: |n| then remap to [-1,1]
          const b = Math.abs(n);
          const bCentered = b * 2 - 1;
          accum += bCentered * amplitude * octaveWeight;
        } else {
          // FBM
          accum += n * amplitude * octaveWeight;
        }
        totalAmplitude += amplitude * octaveWeight;
        amplitude *= persistence;
        frequencyRatio *= lacunarity;
      }
      let normalized = totalAmplitude > 0 ? accum / totalAmplitude : 0;
      const v = Math.min(1, Math.max(0, (normalized + 1) * 0.5));
      const masked = applyMaskIfAny(v, x, y, width, height, mask);
      data[y * width + x] = masked;
    }
  }
  // Apply erosion if configured
  if (erosion) {
    applyErosionInPlace(data, width, height, erosion, !!tileable);
  }
  return data;
}

function applyErosionInPlace(
  heightMap: Float32Array,
  width: number,
  height: number,
  cfg: ErosionConfig,
  wrap: boolean
) {
  if (cfg.thermal?.enabled) {
    thermalErode(heightMap, width, height, cfg.thermal, wrap);
  }
  if (cfg.hydraulic?.enabled) {
    hydraulicErode(heightMap, width, height, cfg.hydraulic, wrap);
  }
}

function indexOf(x: number, y: number, w: number, h: number, wrap: boolean): number {
  if (wrap) {
    const xi = ((x % w) + w) % w;
    const yi = ((y % h) + h) % h;
    return yi * w + xi;
  }
  if (x < 0 || x >= w || y < 0 || y >= h) return -1;
  return y * w + x;
}

function thermalErode(
  map: Float32Array,
  w: number,
  h: number,
  cfg: { iterations: number; talus: number; rate: number },
  wrap: boolean
) {
  const { iterations, talus, rate } = cfg;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const deltas = new Float32Array(w * h);
  for (let it = 0; it < Math.max(0, iterations | 0); it++) {
    deltas.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const hi = map[idx];
        let total = 0;
        for (let k = 0; k < neighbors.length; k++) {
          const nx = x + (neighbors[k][0] as number);
          const ny = y + (neighbors[k][1] as number);
          const nidx = indexOf(nx, ny, w, h, wrap);
          if (nidx < 0) continue;
          const hj = map[nidx];
          const diff = hi - hj - talus;
          if (diff > 0) {
            const move = diff * rate;
            deltas[idx] -= move;
            deltas[nidx] += move;
            total += move;
          }
        }
      }
    }
    for (let i = 0; i < map.length; i++) map[i] += deltas[i];
  }
}

function hydraulicErode(
  map: Float32Array,
  w: number,
  h: number,
  cfg: { iterations: number; rate: number; deposit: number },
  wrap: boolean
) {
  const { iterations, rate, deposit } = cfg;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const deltas = new Float32Array(w * h);
  for (let it = 0; it < Math.max(0, iterations | 0); it++) {
    deltas.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const hi = map[idx];
        // Find downhill neighbors and distribute material
        let sumDown = 0;
        let receivers: number[] = [];
        for (let k = 0; k < neighbors.length; k++) {
          const nx = x + (neighbors[k][0] as number);
          const ny = y + (neighbors[k][1] as number);
          const nidx = indexOf(nx, ny, w, h, wrap);
          if (nidx < 0) continue;
          const hj = map[nidx];
          const dh = hi - hj;
          if (dh > 0) {
            sumDown += dh;
            receivers.push(nidx, dh);
          }
        }
        if (sumDown <= 0) continue;
        const erodeAmount = sumDown * rate;
        const out = Math.min(erodeAmount, hi);
        deltas[idx] -= out;
        // deposit to receivers proportional to drop
        const denom = receivers.reduce((acc, _, i) => (i % 2 ? acc + receivers[i] : acc), 0);
        if (denom > 0) {
          for (let i = 0; i < receivers.length; i += 2) {
            const rIdx = receivers[i] as number;
            const dh = receivers[i + 1] as number;
            deltas[rIdx] += (out * deposit * (dh / denom));
          }
          // carry-away portion simply removed (water transports out of domain)
        }
      }
    }
    for (let i = 0; i < map.length; i++) map[i] += deltas[i];
  }
}

// ----------------------
// Mask helpers
// ----------------------
function saturate(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function applyMaskIfAny(value01: number, x: number, y: number, w: number, h: number, mask?: MaskConfig): number {
  if (!mask || (mask as any).enabled === false || (mask as any).type === "none") return value01;
  const m = computeMask(x, y, w, h, mask);
  const inv = (mask as any).invert ? 1 - m : m;
  // Multiply height by mask; preserves [0,1]
  return value01 * saturate(inv);
}

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
      // rotate into shape frame
      const ux = ca * px - sa * py;
      const uy = sa * px + ca * py;
      const n = Math.max(0.1, c.exponent ?? 2);
      const k = Math.pow(Math.pow(Math.abs(ux) / rx, n) + Math.pow(Math.abs(uy) / ry, n), 1 / n);
      const sdf = 1 - k; // >0 inside
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
      if (pts.length < 3) return 1; // no polygon → no mask
      // point-in-polygon (winding)
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        const intersect = yi > fy !== yj > fy && fx < ((xj - xi) * (fy - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      // distance to edges for soft falloff
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
      const fw = Math.max(1e-3, fall) * 0.2; // soft width
      const t = inside ? 1 - minD / fw : 0;
      return saturate(t);
    }
    case "voronoi": {
      const c = cfg as any as { seed: number; sites: number; jitter: number };
      // approximate via Worley noise scale from site count
      const density = Math.max(1, Math.sqrt(Math.max(1, c.sites ?? 64)));
      const scale = density; // sites ≈ scale^2
      // reuse permutation via world seed hashed with local seed
      const vperm = buildPermutation(((c.seed ?? 0) ^ 0x9e3779b9) >>> 0);
      const worley = createWorley2D(vperm, undefined, undefined, "euclidean");
      const d = worley(fx * scale, fy * scale);
      // mask: cells interior high, edges low
      const m = 1 - d;
      const fw = Math.max(1e-3, fall);
      return saturate((m - (1 - fw)) / fw);
    }
    default:
      return 1;
  }
}
