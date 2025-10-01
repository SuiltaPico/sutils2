export type NoiseType =
  | "perlin"
  | "simplex"
  | "open_simplex2"
  | "open_simplex2s"
  | "value"
  | "worley"
  | "worley_f2"
  | "worley_f2_f1";
export type FractalMode = "none" | "fbm" | "ridged" | "billow";

// Worley distance metric
export type WorleyMetric = "euclidean" | "manhattan" | "chebyshev";

export type DomainWarpLayer = {
  enabled: boolean;
  type: NoiseType;
  fractal: FractalMode;
  scale: number;
  amplitudeX: number;
  amplitudeY: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  seed: number;
  offsetX: number;
  offsetY: number;
};

export type PaletteEntry = { threshold: number; color: string };

// Domain transform (applied before sampling base noise and warps)
export type DomainTransform = {
  rotateDeg: number; // rotation of sampling domain in degrees
  scaleX: number; // anisotropic scaling along X (1 = identity)
  scaleY: number; // anisotropic scaling along Y (1 = identity)
};

// Spectrum shaping and filtering
export type SpectrumFilterType = "none" | "lowpass" | "highpass" | "bandpass";
export type SpectrumConfig = {
  targetBeta: number; // power spectrum slope (1/f^beta)
  filter: SpectrumFilterType;
  cutoffLow?: number; // normalized [0,0.5]
  cutoffHigh?: number; // normalized [0,0.5]
  visualize?: boolean; // UI hint
};

// Shape masks for islands/continents
export type MaskType = "none" | "circle" | "superellipse" | "flower" | "polygon" | "voronoi";

export type MaskCommon = {
  enabled: boolean;
  invert?: boolean; // optional inversion of mask
  falloff: number; // 0..1 edge softness
};

export type CircleMask = MaskCommon & {
  type: "circle";
  radius: number; // 0..1 of min(width,height)
  centerX: number; // 0..1
  centerY: number; // 0..1
};

export type SuperEllipseMask = MaskCommon & {
  type: "superellipse";
  exponent: number; // n in |x|^n + |y|^n <= 1
  radiusX: number; // 0..1
  radiusY: number; // 0..1
  centerX: number; // 0..1
  centerY: number; // 0..1
  rotateDeg?: number;
};

export type FlowerMask = MaskCommon & {
  type: "flower";
  petals: number; // integer >= 3
  radius: number; // base radius 0..1
  amplitude: number; // 0..1 petal modulation
  centerX: number; // 0..1
  centerY: number; // 0..1
  rotateDeg?: number;
};

export type PolygonMask = MaskCommon & {
  type: "polygon";
  points: Array<{ x: number; y: number }>; // 0..1 normalized
};

export type VoronoiMask = MaskCommon & {
  type: "voronoi";
  seed: number;
  sites: number; // number of sites
  relaxIterations: number; // Lloyd iterations
  jitter: number; // 0..1 site jitter
};

export type MaskConfig =
  | ({ type: "none" } & MaskCommon)
  | CircleMask
  | SuperEllipseMask
  | FlowerMask
  | PolygonMask
  | VoronoiMask;

// Erosion configurations
export type ThermalErosionConfig = {
  enabled: boolean;
  iterations: number;
  talus: number; // threshold height diff to start sliding, in [0,1]
  rate: number; // fraction of (diff - talus) moved per iteration, in [0,1]
};

export type HydraulicErosionConfig = {
  enabled: boolean;
  iterations: number;
  rate: number; // total fraction of downhill height diff moved per iteration
  deposit: number; // fraction deposited to receivers [0,1]
};

export type ErosionConfig = {
  thermal: ThermalErosionConfig;
  hydraulic: HydraulicErosionConfig;
};

export type AlgorithmType = "noise" | "cellular";