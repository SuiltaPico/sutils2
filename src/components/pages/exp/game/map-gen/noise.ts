class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  next(): number {
    // xorshift32
    let x = (this.seed ^= this.seed << 13);
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return (this.seed & 0xffffffff) / 0x100000000;
  }
}

export function buildPermutation(seed: number): Uint8Array {
  const rand = new SeededRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

function imod(n: number, m: number): number {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function wrapIndex(i: number, repeat?: number): number {
  if (repeat && repeat > 0) return imod(i, repeat);
  return i & 255;
}

const grad3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function dot2(gx: number, gy: number, x: number, y: number): number {
  return gx * x + gy * y;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export function createPerlin2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number
) {
  return (x: number, y: number): number => {
    const X = wrapIndex(Math.floor(x), repeatX);
    const Y = wrapIndex(Math.floor(y), repeatY);
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const X1 = wrapIndex(X + 1, repeatX);
    const Y1 = wrapIndex(Y + 1, repeatY);

    const aa = perm[X + perm[Y]] % 12;
    const ab = perm[X + perm[Y1]] % 12;
    const ba = perm[X1 + perm[Y]] % 12;
    const bb = perm[X1 + perm[Y1]] % 12;

    const gAAx = grad3[aa * 3],
      gAAy = grad3[aa * 3 + 1];
    const gBAx = grad3[ba * 3],
      gBAy = grad3[ba * 3 + 1];
    const gABx = grad3[ab * 3],
      gABy = grad3[ab * 3 + 1];
    const gBBx = grad3[bb * 3],
      gBBy = grad3[bb * 3 + 1];

    const x1 = lerp(dot2(gAAx, gAAy, xf, yf), dot2(gBAx, gBAy, xf - 1, yf), u);
    const x2 = lerp(
      dot2(gABx, gABy, xf, yf - 1),
      dot2(gBBx, gBBy, xf - 1, yf - 1),
      u
    );
    const n = lerp(x1, x2, v);
    return (n + 1) * 0.5; // normalize to [0,1]
  };
}

export function createValue2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number
) {
  const valueAt = (i: number, j: number): number => {
    const ii = wrapIndex(i, repeatX);
    const jj = wrapIndex(j, repeatY);
    const h = perm[ii + perm[jj]];
    return h / 255; // [0,1]
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const xf = x - X;
    const yf = y - Y;
    const u = fade(xf);
    const v = fade(yf);
    const v00 = valueAt(X, Y);
    const v10 = valueAt(X + 1, Y);
    const v01 = valueAt(X, Y + 1);
    const v11 = valueAt(X + 1, Y + 1);
    const x1 = lerp(v00, v10, u);
    const x2 = lerp(v01, v11, u);
    return lerp(x1, x2, v);
  };
}

export function createWorley2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number,
  metric: "euclidean" | "manhattan" | "chebyshev" = "euclidean"
) {
  const dist = (dx: number, dy: number): number => {
    if (metric === "manhattan") return Math.abs(dx) + Math.abs(dy);
    if (metric === "chebyshev") return Math.max(Math.abs(dx), Math.abs(dy));
    return Math.hypot(dx, dy);
  };
  const rnd2 = (i: number, j: number): [number, number] => {
    const ii = wrapIndex(i, repeatX);
    const jj = wrapIndex(j, repeatY);
    const h1 = perm[ii + perm[jj]];
    const h2 = perm[(ii + 73) & 255] ^ perm[(jj + 157) & 255];
    return [h1 / 255, h2 / 255];
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    let minDist2 = Infinity;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = repeatX ? imod(X + i, repeatX) : X + i;
        const cy = repeatY ? imod(Y + j, repeatY) : Y + j;
        const [rx, ry] = rnd2(cx, cy);
        const fx = cx + rx;
        const fy = cy + ry;
        const dx = x - fx;
        const dy = y - fy;
        const d = dist(dx, dy);
        if (d < minDist2) minDist2 = d;
      }
    }
    const d = minDist2;
    // Normalize roughly to [0,1] depending on metric
    let norm = 1;
    if (metric === "euclidean") norm = Math.SQRT2;
    else if (metric === "manhattan") norm = 2;
    else if (metric === "chebyshev") norm = 1;
    const v = Math.min(1, d / norm);
    return v;
  };
}

export function createWorley2D_F2(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number,
  metric: "euclidean" | "manhattan" | "chebyshev" = "euclidean"
) {
  const dist = (dx: number, dy: number): number => {
    if (metric === "manhattan") return Math.abs(dx) + Math.abs(dy);
    if (metric === "chebyshev") return Math.max(Math.abs(dx), Math.abs(dy));
    return Math.hypot(dx, dy);
  };
  const rnd2 = (i: number, j: number): [number, number] => {
    const ii = wrapIndex(i, repeatX);
    const jj = wrapIndex(j, repeatY);
    const h1 = perm[ii + perm[jj]];
    const h2 = perm[(ii + 73) & 255] ^ perm[(jj + 157) & 255];
    return [h1 / 255, h2 / 255];
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    let min1 = Infinity;
    let min2 = Infinity;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = repeatX ? imod(X + i, repeatX) : X + i;
        const cy = repeatY ? imod(Y + j, repeatY) : Y + j;
        const [rx, ry] = rnd2(cx, cy);
        const fx = cx + rx;
        const fy = cy + ry;
        const dx = x - fx;
        const dy = y - fy;
        const d = dist(dx, dy);
        if (d < min1) {
          min2 = min1;
          min1 = d;
        } else if (d < min2) {
          min2 = d;
        }
      }
    }
    let norm = 1;
    if (metric === "euclidean") norm = Math.SQRT2;
    else if (metric === "manhattan") norm = 2;
    else if (metric === "chebyshev") norm = 1;
    const v = Math.min(1, min2 / norm); // normalize to [0,1]
    return v;
  };
}

export function createWorley2D_F2F1(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number,
  metric: "euclidean" | "manhattan" | "chebyshev" = "euclidean"
) {
  const dist = (dx: number, dy: number): number => {
    if (metric === "manhattan") return Math.abs(dx) + Math.abs(dy);
    if (metric === "chebyshev") return Math.max(Math.abs(dx), Math.abs(dy));
    return Math.hypot(dx, dy);
  };
  const rnd2 = (i: number, j: number): [number, number] => {
    const ii = wrapIndex(i, repeatX);
    const jj = wrapIndex(j, repeatY);
    const h1 = perm[ii + perm[jj]];
    const h2 = perm[(ii + 73) & 255] ^ perm[(jj + 157) & 255];
    return [h1 / 255, h2 / 255];
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    let min1 = Infinity;
    let min2 = Infinity;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = repeatX ? imod(X + i, repeatX) : X + i;
        const cy = repeatY ? imod(Y + j, repeatY) : Y + j;
        const [rx, ry] = rnd2(cx, cy);
        const fx = cx + rx;
        const fy = cy + ry;
        const dx = x - fx;
        const dy = y - fy;
        const d = dist(dx, dy);
        if (d < min1) {
          min2 = min1;
          min1 = d;
        } else if (d < min2) {
          min2 = d;
        }
      }
    }
    let norm = 1;
    if (metric === "euclidean") norm = Math.SQRT2;
    else if (metric === "manhattan") norm = 2;
    else if (metric === "chebyshev") norm = 1;
    const diff = Math.max(0, min2 - min1);
    const v = Math.min(1, Math.max(0, diff / norm));
    return v;
  };
}

// Simplex 2D based on Stefan Gustavson's implementation (simplified)
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
export function createSimplex2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number
) {
  return (xin: number, yin: number): number => {
    let n0 = 0,
      n1 = 0,
      n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1 = 0,
      j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = wrapIndex(i, repeatX);
    const jj = wrapIndex(j, repeatY);
    const i1ii = wrapIndex(i + i1, repeatX);
    const j1jj = wrapIndex(j + j1, repeatY);
    const ii1 = wrapIndex(i + 1, repeatX);
    const jj1 = wrapIndex(j + 1, repeatY);
    const gi0 = perm[ii + perm[jj]] % 12;
    const gi1 = perm[i1ii + perm[j1jj]] % 12;
    const gi2 = perm[ii1 + perm[jj1]] % 12;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * dot2(grad3[gi0 * 3], grad3[gi0 * 3 + 1], x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * dot2(grad3[gi1 * 3], grad3[gi1 * 3 + 1], x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * dot2(grad3[gi2 * 3], grad3[gi2 * 3 + 1], x2, y2);
    }

    // Scale to [0,1]
    const n = 70 * (n0 + n1 + n2);
    return Math.min(1, Math.max(0, (n + 1) * 0.5));
  };
}

// OpenSimplex2 approximation: reuse simplex with a gentle domain rotation to reduce axial artifacts
export function createOpenSimplex2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number
) {
  const base = createSimplex2D(perm, repeatX, repeatY);
  const ang = (2 * Math.PI) / 5; // golden-ish rotation
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return (x: number, y: number): number => {
    const xr = c * x - s * y;
    const yr = s * x + c * y;
    return base(xr, yr);
  };
}

// OpenSimplex2S approximation: sum of two rotated simplex samples (super/simplex)
export function createOpenSimplex2S_2D(
  perm: Uint8Array,
  repeatX?: number,
  repeatY?: number
) {
  const base = createSimplex2D(perm, repeatX, repeatY);
  const ang1 = (2 * Math.PI) / 9;
  const ang2 = (4 * Math.PI) / 9;
  const c1 = Math.cos(ang1), s1 = Math.sin(ang1);
  const c2 = Math.cos(ang2), s2 = Math.sin(ang2);
  return (x: number, y: number): number => {
    const x1 = c1 * x - s1 * y;
    const y1 = s1 * x + c1 * y;
    const x2 = c2 * x - s2 * y;
    const y2 = s2 * x + c2 * y;
    const a = base(x1, y1);
    const b = base(x2, y2);
    return Math.min(1, Math.max(0, (a + b) * 0.5));
  };
}
