import type { PaletteEntry } from "./types";

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return [r, g, b];
}

function colorizeWithPalette(
  v: number,
  palette: PaletteEntry[]
): [number, number, number] {
  for (let i = 0; i < palette.length; i++) {
    if (v < palette[i].threshold) return hexToRgb(palette[i].color);
  }
  return hexToRgb(palette[palette.length - 1].color);
}

export function colorize(
  v: number,
  mode: "grayscale" | "terrain",
  palette?: PaletteEntry[]
): [number, number, number] {
  if (mode === "grayscale") {
    const c = Math.round(v * 255);
    return [c, c, c];
  }
  if (palette && palette.length > 0) {
    return colorizeWithPalette(v, palette);
  }
  // fallback palette
  return colorizeWithPalette(v, defaultTerrainPalette());
}

export function defaultTerrainPalette(): PaletteEntry[] {
  return [
    { threshold: 0.3, color: "#006994" },
    { threshold: 0.4, color: "#009DC4" },
    { threshold: 0.45, color: "#F0F0B4" },
    { threshold: 0.7, color: "#228B22" },
    { threshold: 0.85, color: "#5A3C1E" },
    { threshold: 1.0, color: "#FFFFFF" },
  ];
}

export const terrainPalettePresets: Record<string, PaletteEntry[]> = {
  Default: defaultTerrainPalette(),
  Clouds: [
    { threshold: 0.55, color: "#b0c4de" },
    { threshold: 0.7, color: "#d3dbe6" },
    { threshold: 0.8, color: "#e6eef5" },
    { threshold: 0.9, color: "#f4f8fb" },
    { threshold: 0.97, color: "#ffffff" },
    { threshold: 1.0, color: "#ffffff" },
  ],
  Desert: [
    { threshold: 0.3, color: "#c2b280" },
    { threshold: 0.5, color: "#d2b48c" },
    { threshold: 0.65, color: "#deb887" },
    { threshold: 0.8, color: "#f0d9a7" },
    { threshold: 0.92, color: "#f6e6c4" },
    { threshold: 1.0, color: "#ffffff" },
  ],
  Islands: [
    { threshold: 0.35, color: "#1b7fb8" },
    { threshold: 0.42, color: "#39a8d9" },
    { threshold: 0.48, color: "#ffe7a3" },
    { threshold: 0.65, color: "#5fb06e" },
    { threshold: 0.82, color: "#8b6f47" },
    { threshold: 1.0, color: "#ffffff" },
  ],
  Volcano: [
    { threshold: 0.3, color: "#1a1a1a" },
    { threshold: 0.5, color: "#2d2d2d" },
    { threshold: 0.7, color: "#4d2b1b" },
    { threshold: 0.85, color: "#b22222" },
    { threshold: 0.93, color: "#ff8c00" },
    { threshold: 1.0, color: "#ffffe0" },
  ],
  Tundra: [
    { threshold: 0.35, color: "#6e7f80" },
    { threshold: 0.5, color: "#8da1a3" },
    { threshold: 0.7, color: "#b7c7c9" },
    { threshold: 0.85, color: "#dfe8ea" },
    { threshold: 0.95, color: "#f3f7f8" },
    { threshold: 1.0, color: "#ffffff" },
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function colorizeSmooth(
  v: number,
  palette: PaletteEntry[]
): [number, number, number] {
  if (!palette || palette.length === 0) return colorizeWithPalette(v, defaultTerrainPalette());
  let prevIdx = -1;
  for (let i = 0; i < palette.length; i++) {
    if (v < palette[i].threshold) {
      prevIdx = i - 1;
      const cur = palette[i];
      if (prevIdx < 0) return hexToRgb(cur.color);
      const prev = palette[prevIdx];
      const span = Math.max(1e-6, cur.threshold - prev.threshold);
      const t = (v - prev.threshold) / span;
      const [r1, g1, b1] = hexToRgb(prev.color);
      const [r2, g2, b2] = hexToRgb(cur.color);
      return [
        Math.round(lerp(r1, r2, t)),
        Math.round(lerp(g1, g2, t)),
        Math.round(lerp(b1, b2, t)),
      ];
    }
  }
  return hexToRgb(palette[palette.length - 1].color);
}