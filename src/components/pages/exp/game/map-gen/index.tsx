import { createEffect, createSignal, onMount, For, Show } from "solid-js";
import { generateNoiseMap } from "./generator";
import { generateCellularMap } from "./ca";
import {
  colorize,
  defaultTerrainPalette,
  terrainPalettePresets,
  colorizeSmooth,
} from "./palette";
import type {
  DomainWarpLayer,
  FractalMode,
  NoiseType,
  PaletteEntry,
  ErosionConfig,
  WorleyMetric,
  DomainTransform,
  SpectrumConfig,
  MaskConfig,
  AlgorithmType,
} from "./types";

export default function MapGen() {
  const [algorithm, setAlgorithm] = createSignal<AlgorithmType>("noise");
  const [width, setWidth] = createSignal(256);
  const [height, setHeight] = createSignal(256);
  const [scale, setScale] = createSignal(64);
  const [octaves, setOctaves] = createSignal(4);
  const [persistence, setPersistence] = createSignal(0.5);
  const [lacunarity, setLacunarity] = createSignal(2.0);
  const [seed, setSeed] = createSignal(42);
  const [type, setType] = createSignal<NoiseType>("perlin");
  const [worleyMetric, setWorleyMetric] =
    createSignal<WorleyMetric>("euclidean");
  const [mode, setMode] = createSignal<"grayscale" | "terrain">("terrain");
  const [offsetX, setOffsetX] = createSignal(0);
  const [offsetY, setOffsetY] = createSignal(0);
  const [palette, setPalette] = createSignal<PaletteEntry[]>(
    defaultTerrainPalette()
  );
  const [fractal, setFractal] = createSignal<FractalMode>("fbm");
  const [warpEnabled, setWarpEnabled] = createSignal(false);
  const [warpLayers, setWarpLayers] = createSignal<DomainWarpLayer[]>([
    {
      enabled: true,
      type: "perlin",
      fractal: "fbm",
      scale: 128,
      amplitudeX: 0.6,
      amplitudeY: 0.6,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.0,
      seed: 12345,
      offsetX: 0,
      offsetY: 0,
    },
  ]);
  const [tileable, setTileable] = createSignal(false);
  const [domain, setDomain] = createSignal<DomainTransform>({
    rotateDeg: 0,
    scaleX: 1,
    scaleY: 1,
  });
  const [spectrum, setSpectrum] = createSignal<SpectrumConfig>({
    targetBeta: 0,
    filter: "none",
    cutoffLow: 0.02,
    cutoffHigh: 0.25,
    visualize: false,
  });
  const [mask, setMask] = createSignal<MaskConfig>({
    type: "none",
    enabled: false,
    invert: false,
    falloff: 0.1,
  } as any);
  // Cellular automata params
  const [caInitialFill, setCaInitialFill] = createSignal(0.47);
  const [caIterations, setCaIterations] = createSignal(6);
  const [caBirth, setCaBirth] = createSignal(4);
  const [caDeath, setCaDeath] = createSignal(3);
  const [caSmooth, setCaSmooth] = createSignal(1);
  const [view, setView] = createSignal<
    "height" | "slope" | "contours" | "normal" | "hillshade" | "composite"
  >("height");
  const [edgeThreshold, setEdgeThreshold] = createSignal(0.06);
  const [smoothPalette, setSmoothPalette] = createSignal(false);
  const [erosion, setErosion] = createSignal<ErosionConfig>({
    thermal: { enabled: false, iterations: 10, talus: 0.02, rate: 0.25 },
    hydraulic: { enabled: false, iterations: 20, rate: 0.1, deposit: 0.9 },
  });

  function setPaletteSorted(entries: PaletteEntry[]) {
    const clamped = entries.map((e) => ({
      threshold: Math.min(1, Math.max(0, e.threshold)),
      color: e.color,
    }));
    clamped.sort((a, b) => a.threshold - b.threshold);
    // ensure last threshold is 1.0
    if (clamped.length === 0 || clamped[clamped.length - 1].threshold < 1) {
      clamped.push({
        threshold: 1,
        color: clamped.length ? clamped[clamped.length - 1].color : "#ffffff",
      });
    }
    setPalette(clamped);
  }

  let canvas: HTMLCanvasElement | undefined;
  let overlayCanvas: HTMLCanvasElement | undefined;
  let minimapCanvas: HTMLCanvasElement | undefined;
  let magnifierCanvas: HTMLCanvasElement | undefined;
  const magnifierSize = 192;
  const cropSize = 48;

  // magnifier helpers implemented at bottom

  function render() {
    if (!canvas) return;
    const w = width();
    const h = height();
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = algorithm() === "cellular"
      ? generateCellularMap({
          width: w,
          height: h,
          seed: seed(),
          initialFill: caInitialFill(),
          iterations: caIterations(),
          birthLimit: caBirth(),
          deathLimit: caDeath(),
          wrap: tileable(),
          smoothIterations: caSmooth(),
          mask: mask(),
        })
      : generateNoiseMap({
          width: w,
          height: h,
          scale: scale(),
          octaves: octaves(),
          persistence: persistence(),
          lacunarity: lacunarity(),
          seed: seed(),
          type: type(),
          offsetX: offsetX(),
          offsetY: offsetY(),
          fractal: fractal(),
          warpEnabled: warpEnabled(),
          warpLayers: warpLayers(),
          tileable: tileable(),
          erosion: erosion(),
          worleyMetric: worleyMetric(),
          domain: domain(),
          spectrum: spectrum(),
          mask: mask(),
        });
    // Base height view image
    const baseImage = new ImageData(w, h);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      const [r, g, b] =
        mode() === "terrain" && smoothPalette()
          ? colorizeSmooth(v, palette())
          : colorize(v, mode(), palette());
      const idx = i * 4;
      baseImage.data[idx] = r;
      baseImage.data[idx + 1] = g;
      baseImage.data[idx + 2] = b;
      baseImage.data[idx + 3] = 255;
    }
    ctx.putImageData(baseImage, 0, 0);

    // Prepare overlay canvas for derived views
    if (overlayCanvas) {
      if (overlayCanvas.width !== w) overlayCanvas.width = w;
      if (overlayCanvas.height !== h) overlayCanvas.height = h;
      const octx = overlayCanvas.getContext("2d");
      if (octx) {
        // set blend mode for shading-style views
        const needsMultiply = view() === "hillshade" || view() === "composite";
        overlayCanvas.style.setProperty(
          "mix-blend-mode",
          needsMultiply ? "multiply" : "normal"
        );
        octx.clearRect(0, 0, w, h);
        if (view() !== "height") {
          if (view() === "slope") {
            drawSlope(octx, data, w, h);
          } else if (view() === "contours") {
            drawContours(octx, data, w, h);
          } else if (view() === "normal") {
            drawNormals(octx, data, w, h);
          } else if (view() === "hillshade") {
            drawHillshade(octx, data, w, h);
          } else if (view() === "composite") {
            drawComposite(octx, data, w, h, edgeThreshold());
          }
        }
      }
    }

    // Update minimap
    if (minimapCanvas) {
      const mctx = minimapCanvas.getContext("2d");
      if (mctx) {
        const mw = 128,
          mh = 128;
        if (minimapCanvas.width !== mw) minimapCanvas.width = mw;
        if (minimapCanvas.height !== mh) minimapCanvas.height = mh;
        mctx.clearRect(0, 0, mw, mh);
        mctx.imageSmoothingEnabled = true;
        mctx.drawImage(canvas, 0, 0, mw, mh);
      }
    }
  }

  function randomizeSeed() {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }

  onMount(render);
  createEffect(render);

  return (
    <div class="p-4 space-y-4">
      <h1 class="text-xl font-semibold">地图生成（2D）</h1>
      <div class="flex flex-wrap gap-4 items-end">
        <label class="flex flex-col">
          <span>算法</span>
          <select
            value={algorithm()}
            onInput={(e) => setAlgorithm(e.currentTarget.value as AlgorithmType)}
            class="border px-2 py-1"
          >
            <option value="noise">噪声/分形</option>
            <option value="cellular">元胞自动机</option>
          </select>
        </label>
        <label class="flex flex-col">
          <span>噪声类型</span>
          <select
            value={type()}
            onInput={(e) => setType(e.currentTarget.value as NoiseType)}
            class="border px-2 py-1"
          >
            <option value="perlin">Perlin</option>
            <option value="simplex">Simplex</option>
            <option value="open_simplex2">OpenSimplex2</option>
            <option value="open_simplex2s">OpenSimplex2S</option>
            <option value="value">Value</option>
            <option value="worley">Worley F1</option>
            <option value="worley_f2">Worley F2</option>
            <option value="worley_f2_f1">Worley F2-F1</option>
          </select>
        </label>
        <Show when={algorithm() === "noise" && ["worley", "worley_f2", "worley_f2_f1"].includes(type())}>
          <label class="flex flex-col">
            <span>Worley 距离</span>
            <select
              class="border px-2 py-1"
              value={worleyMetric()}
              onInput={(e) =>
                setWorleyMetric(e.currentTarget.value as WorleyMetric)
              }
            >
              <option value="euclidean">Euclidean</option>
              <option value="manhattan">Manhattan</option>
              <option value="chebyshev">Chebyshev</option>
            </select>
          </label>
        </Show>
        <label class="flex flex-col w-44">
          <span>边缘阈值 (Composite)</span>
          <input
            type="range"
            min="0.01"
            max="0.2"
            step="0.005"
            value={edgeThreshold()}
            onInput={(e) =>
              setEdgeThreshold(e.currentTarget.valueAsNumber || 0.06)
            }
          />
          <span class="text-xs text-gray-600">
            {edgeThreshold().toFixed(3)}
          </span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={smoothPalette()}
            onInput={(e) => setSmoothPalette(e.currentTarget.checked)}
          />
          <span>平滑调色过渡</span>
        </label>
        <label class="flex flex-col w-28">
          <span>宽度</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={width()}
            onInput={(e) => setWidth(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>高度</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={height()}
            onInput={(e) => setHeight(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-40">
          <span>缩放 Scale</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={scale()}
            onInput={(e) => setScale(e.currentTarget.valueAsNumber || 1)}
          />
        </label>
        <label class="flex flex-col w-32">
          <span>叠加层数 Octaves</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={octaves()}
            onInput={(e) => setOctaves(e.currentTarget.valueAsNumber || 1)}
          />
        </label>
        <label class="flex flex-col w-40">
          <span>持久度 Persistence</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={persistence()}
            onInput={(e) => setPersistence(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-40">
          <span>频率倍增 Lacunarity</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={lacunarity()}
            onInput={(e) => setLacunarity(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <Show when={algorithm() === "noise"}>
        <div class="border rounded p-2 flex flex-wrap gap-3 items-end">
          <span class="text-sm text-gray-700">域变换</span>
          <label class="flex flex-col w-28">
            <span>旋转(°)</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={domain().rotateDeg}
              onInput={(e) =>
                setDomain({
                  ...domain(),
                  rotateDeg: e.currentTarget.valueAsNumber || 0,
                })
              }
            />
          </label>
          <label class="flex flex-col w-28">
            <span>Scale X</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={domain().scaleX}
              onInput={(e) =>
                setDomain({
                  ...domain(),
                  scaleX: e.currentTarget.valueAsNumber || 1,
                })
              }
            />
          </label>
          <label class="flex flex-col w-28">
            <span>Scale Y</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={domain().scaleY}
              onInput={(e) =>
                setDomain({
                  ...domain(),
                  scaleY: e.currentTarget.valueAsNumber || 1,
                })
              }
            />
          </label>
        </div>
        </Show>

        <Show when={algorithm() === "noise"}>
        <div class="border rounded p-2 flex flex-wrap gap-3 items-end">
          <span class="text-sm text-gray-700">频谱控制</span>
          <label class="flex flex-col w-32">
            <span>β (1/f^β)</span>
            <input
              step="0.1"
              type="number"
              class="border px-2 py-1"
              value={spectrum().targetBeta}
              onInput={(e) =>
                setSpectrum({
                  ...spectrum(),
                  targetBeta: e.currentTarget.valueAsNumber || 0,
                })
              }
            />
          </label>
          <label class="flex flex-col">
            <span>滤波</span>
            <select
              class="border px-2 py-1"
              value={spectrum().filter}
              onInput={(e) =>
                setSpectrum({
                  ...spectrum(),
                  filter: e.currentTarget.value as SpectrumConfig["filter"],
                })
              }
            >
              <option value="none">None</option>
              <option value="lowpass">Lowpass</option>
              <option value="highpass">Highpass</option>
              <option value="bandpass">Bandpass</option>
            </select>
          </label>
          <label class="flex flex-col w-32">
            <span>Cutoff Low</span>
            <input
              step="0.001"
              type="number"
              class="border px-2 py-1"
              value={spectrum().cutoffLow}
              onInput={(e) =>
                setSpectrum({
                  ...spectrum(),
                  cutoffLow: e.currentTarget.valueAsNumber,
                })
              }
            />
          </label>
          <label class="flex flex-col w-32">
            <span>Cutoff High</span>
            <input
              step="0.001"
              type="number"
              class="border px-2 py-1"
              value={spectrum().cutoffHigh}
              onInput={(e) =>
                setSpectrum({
                  ...spectrum(),
                  cutoffHigh: e.currentTarget.valueAsNumber,
                })
              }
            />
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!spectrum().visualize}
              onInput={(e) =>
                setSpectrum({
                  ...spectrum(),
                  visualize: e.currentTarget.checked,
                })
              }
            />
            <span>显示频谱</span>
          </label>
        </div>
        </Show>

        <div class="border rounded p-2 flex flex-wrap gap-3 items-end">
          <span class="text-sm text-gray-700">形状遮罩</span>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(mask() as any).enabled}
              onInput={(e) =>
                setMask({
                  ...(mask() as any),
                  enabled: e.currentTarget.checked,
                })
              }
            />
            <span>启用</span>
          </label>
          <label class="flex flex-col">
            <span>类型</span>
            <select
              class="border px-2 py-1"
              value={(mask() as any).type}
              onInput={(e) =>
                setMask({
                  ...(mask() as any),
                  type: e.currentTarget.value as any,
                })
              }
            >
              <option value="none">None</option>
              <option value="circle">Circle</option>
              <option value="superellipse">Superellipse</option>
              <option value="flower">Flower</option>
              <option value="polygon">Polygon</option>
              <option value="voronoi">Voronoi</option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(mask() as any).invert}
              onInput={(e) =>
                setMask({ ...(mask() as any), invert: e.currentTarget.checked })
              }
            />
            <span>反转</span>
          </label>
          <label class="flex flex-col w-32">
            <span>Falloff</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={(mask() as any).falloff}
              onInput={(e) =>
                setMask({
                  ...(mask() as any),
                  falloff: e.currentTarget.valueAsNumber || 0,
                })
              }
            />
          </label>
        </div>
        <label class="flex flex-col w-36">
          <span>偏移 X</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={offsetX()}
            onInput={(e) => setOffsetX(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-36">
          <span>偏移 Y</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={offsetY()}
            onInput={(e) => setOffsetY(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col">
          <span>着色</span>
          <select
            value={mode()}
            onInput={(e) => setMode(e.currentTarget.value as any)}
            class="border px-2 py-1"
          >
            <option value="terrain">地形</option>
            <option value="grayscale">灰度</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tileable()}
            onInput={(e) => setTileable(e.currentTarget.checked)}
          />
          <span>Tileable</span>
        </label>
        <label class="flex flex-col">
          <span>视图</span>
          <select
            value={view()}
            onInput={(e) => setView(e.currentTarget.value as any)}
            class="border px-2 py-1"
          >
            <option value="height">高度图</option>
            <option value="slope">斜率</option>
            <option value="contours">等高线</option>
            <option value="normal">法线图</option>
            <option value="hillshade">坡度阴影</option>
            <option value="composite">合成视图</option>
          </select>
        </label>
        <label class="flex flex-col w-40">
          <span>Seed</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={seed()}
            onInput={(e) => setSeed(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <button class="border px-3 py-1" onClick={randomizeSeed}>
          随机种子
        </button>
        <button class="border px-3 py-1" onClick={render}>
          重新生成
        </button>
        <button
          class="border px-3 py-1"
          onClick={() => {
            if (!canvas) return;
            const link = document.createElement("a");
            link.download = `noise-${type()}-${seed()}.png`;
            link.href = canvas.toDataURL();
            link.click();
          }}
        >
          导出 PNG
        </button>
        <label class="flex flex-col">
          <span>分形</span>
          <select
            value={fractal()}
            onInput={(e) => setFractal(e.currentTarget.value as FractalMode)}
            class="border px-2 py-1"
          >
            <option value="none">None</option>
            <option value="fbm">FBM</option>
            <option value="ridged">Ridged</option>
            <option value="billow">Billow</option>
          </select>
        </label>
        <Show when={algorithm() === "cellular"}>
          <div class="border rounded p-2 flex flex-wrap gap-3 items-end">
            <span class="text-sm text-gray-700">元胞自动机参数</span>
            <label class="flex flex-col w-32">
              <span>初始填充</span>
              <input
                step="0.01"
                type="number"
                class="border px-2 py-1"
                value={caInitialFill()}
                onInput={(e) => setCaInitialFill(e.currentTarget.valueAsNumber || 0)}
              />
            </label>
            <label class="flex flex-col w-32">
              <span>迭代</span>
              <input
                type="number"
                class="border px-2 py-1"
                value={caIterations()}
                onInput={(e) => setCaIterations(e.currentTarget.valueAsNumber || 0)}
              />
            </label>
            <label class="flex flex-col w-32">
              <span>Birth ≥</span>
              <input
                type="number"
                class="border px-2 py-1"
                value={caBirth()}
                onInput={(e) => setCaBirth(e.currentTarget.valueAsNumber || 0)}
              />
            </label>
            <label class="flex flex-col w-32">
              <span>Death ≥</span>
              <input
                type="number"
                class="border px-2 py-1"
                value={caDeath()}
                onInput={(e) => setCaDeath(e.currentTarget.valueAsNumber || 0)}
              />
            </label>
            <label class="flex flex-col w-32">
              <span>平滑次数</span>
              <input
                type="number"
                class="border px-2 py-1"
                value={caSmooth()}
                onInput={(e) => setCaSmooth(e.currentTarget.valueAsNumber || 0)}
              />
            </label>
          </div>
        </Show>
      </div>
      <div class="overflow-auto relative inline-block">
        <canvas
          ref={canvas!}
          class="border block"
          style={{ width: `${width()}px`, height: `${height()}px` }}
          onMouseMove={(e) => {
            if (!canvas || !magnifierCanvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = Math.floor(e.clientX - rect.left);
            const my = Math.floor(e.clientY - rect.top);
            drawMagnifier(canvas, magnifierCanvas, mx, my, cropSize);
            drawMagnifierRect(
              overlayCanvas,
              mx,
              my,
              cropSize,
              width(),
              height(),
              () => {
                const w = width();
                const h = height();
                return generateNoiseMap({
                  width: w,
                  height: h,
                  scale: scale(),
                  octaves: octaves(),
                  persistence: persistence(),
                  lacunarity: lacunarity(),
                  seed: seed(),
                  type: type(),
                  offsetX: offsetX(),
                  offsetY: offsetY(),
                  fractal: fractal(),
                  warpEnabled: warpEnabled(),
                  warpLayers: warpLayers(),
                  tileable: tileable(),
                  erosion: erosion(),
                  worleyMetric: worleyMetric(),
                  domain: domain(),
                  spectrum: spectrum(),
                  mask: mask(),
                });
              },
              view(),
              edgeThreshold()
            );
          }}
          onMouseLeave={() => {
            if (!magnifierCanvas) return;
            const mctx = magnifierCanvas.getContext("2d");
            if (mctx)
              mctx.clearRect(
                0,
                0,
                magnifierCanvas.width,
                magnifierCanvas.height
              );
            if (overlayCanvas) {
              const octx = overlayCanvas.getContext("2d");
              if (octx) {
                // redraw overlay view without rect
                const w = width();
                const h = height();
                octx.clearRect(0, 0, w, h);
                if (view() !== "height") render();
              }
            }
          }}
        />
        <canvas
          ref={overlayCanvas!}
          class="border absolute top-0 left-0 pointer-events-none"
          style={{ width: `${width()}px`, height: `${height()}px` }}
        />
      </div>
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="font-medium">侵蚀（后处理）</span>
          <button
            class="border px-2 py-1"
            onClick={() =>
              setErosion({
                thermal: {
                  enabled: false,
                  iterations: 10,
                  talus: 0.02,
                  rate: 0.25,
                },
                hydraulic: {
                  enabled: false,
                  iterations: 20,
                  rate: 0.1,
                  deposit: 0.9,
                },
              })
            }
          >
            重置
          </button>
        </div>
        <div class="border p-2 rounded flex flex-wrap items-end gap-3">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={erosion().thermal.enabled}
              onInput={(e) => {
                const cfg = { ...erosion() };
                cfg.thermal = {
                  ...cfg.thermal,
                  enabled: e.currentTarget.checked,
                };
                setErosion(cfg);
              }}
            />
            <span>热侵蚀</span>
          </label>
          <label class="flex flex-col w-32">
            <span>迭代</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={erosion().thermal.iterations}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.thermal = {
                  ...cfg.thermal,
                  iterations: isNaN(v) ? cfg.thermal.iterations : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
          <label class="flex flex-col w-32">
            <span>Talus</span>
            <input
              step="0.001"
              type="number"
              class="border px-2 py-1"
              value={erosion().thermal.talus}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.thermal = {
                  ...cfg.thermal,
                  talus: isNaN(v) ? cfg.thermal.talus : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
          <label class="flex flex-col w-32">
            <span>Rate</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={erosion().thermal.rate}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.thermal = {
                  ...cfg.thermal,
                  rate: isNaN(v) ? cfg.thermal.rate : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
        </div>
        <div class="border p-2 rounded flex flex-wrap items-end gap-3">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={erosion().hydraulic.enabled}
              onInput={(e) => {
                const cfg = { ...erosion() };
                cfg.hydraulic = {
                  ...cfg.hydraulic,
                  enabled: e.currentTarget.checked,
                };
                setErosion(cfg);
              }}
            />
            <span>水力侵蚀（简化）</span>
          </label>
          <label class="flex flex-col w-32">
            <span>迭代</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={erosion().hydraulic.iterations}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.hydraulic = {
                  ...cfg.hydraulic,
                  iterations: isNaN(v) ? cfg.hydraulic.iterations : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
          <label class="flex flex-col w-32">
            <span>Rate</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={erosion().hydraulic.rate}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.hydraulic = {
                  ...cfg.hydraulic,
                  rate: isNaN(v) ? cfg.hydraulic.rate : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
          <label class="flex flex-col w-32">
            <span>Deposit</span>
            <input
              step="0.01"
              type="number"
              class="border px-2 py-1"
              value={erosion().hydraulic.deposit}
              onInput={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const cfg = { ...erosion() };
                cfg.hydraulic = {
                  ...cfg.hydraulic,
                  deposit: isNaN(v) ? cfg.hydraulic.deposit : v,
                };
                setErosion(cfg);
              }}
            />
          </label>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-gray-600">Minimap</span>
          <canvas ref={minimapCanvas!} class="border" />
        </div>
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-gray-600">Magnifier</span>
          <canvas
            ref={magnifierCanvas!}
            class="border"
            width={magnifierSize}
            height={magnifierSize}
          />
        </div>
      </div>
      <Show when={mode() === "terrain"}>
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="font-medium">地形调色板</span>
            <label class="flex items-center gap-1">
              <span>预设</span>
              <select
                class="border px-2 py-1"
                onInput={(e) => {
                  const key = e.currentTarget.value;
                  const preset = terrainPalettePresets[key];
                  if (preset)
                    setPaletteSorted([...preset.map((p) => ({ ...p }))]);
                }}
              >
                {Object.keys(terrainPalettePresets).map((k) => (
                  // Using a simple map here; Solid JSX in TS file
                  // eslint-disable-next-line solid/jsx-no-undef
                  <option value={k}>{k}</option>
                ))}
              </select>
            </label>
            <button
              class="border px-2 py-1"
              onClick={() =>
                setPaletteSorted([
                  ...palette(),
                  { threshold: 0.5, color: "#888888" },
                ])
              }
            >
              新增分层
            </button>
            <button
              class="border px-2 py-1"
              onClick={() => setPalette(defaultTerrainPalette())}
            >
              重置默认
            </button>
            <button
              class="border px-2 py-1"
              onClick={() => setPaletteSorted([...palette()])}
            >
              按阈值排序
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <For each={palette()}>
              {(entry, idx) => (
                <div class="flex items-center gap-3">
                  <span class="text-sm text-gray-600">v &lt;=</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    class="border px-2 py-1 w-24"
                    value={entry.threshold}
                    onInput={(e) => {
                      const value = e.currentTarget.valueAsNumber;
                      const arr = [...palette()];
                      arr[idx()].threshold = isNaN(value)
                        ? entry.threshold
                        : value;
                      setPaletteSorted(arr);
                    }}
                  />
                  <input
                    type="color"
                    value={entry.color}
                    onInput={(e) => {
                      const arr = [...palette()];
                      arr[idx()].color = e.currentTarget.value;
                      setPalette(arr);
                    }}
                  />
                  <div
                    class="w-8 h-5 border"
                    style={{ "background-color": entry.color }}
                  />
                  <button
                    class="border px-2 py-1"
                    onClick={() => {
                      const arr = [...palette()];
                      if (arr.length <= 1) return;
                      arr.splice(idx(), 1);
                      setPaletteSorted(arr);
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </For>
          </div>
          <div class="text-sm text-gray-600">
            按阈值从小到大匹配，最后一项应为 1.0 以兜底。
          </div>
        </div>
      </Show>
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="font-medium">Domain Warping</span>
          <label class="flex items-center gap-1">
            <input
              type="checkbox"
              checked={warpEnabled()}
              onInput={(e) => setWarpEnabled(e.currentTarget.checked)}
            />
            启用
          </label>
          <button
            class="border px-2 py-1"
            onClick={() =>
              setWarpLayers([
                ...warpLayers(),
                {
                  enabled: true,
                  type: "perlin",
                  fractal: "fbm",
                  scale: 128,
                  amplitudeX: 0.5,
                  amplitudeY: 0.5,
                  octaves: 2,
                  persistence: 0.5,
                  lacunarity: 2.0,
                  seed: Math.floor(Math.random() * 1_000_000),
                  offsetX: 0,
                  offsetY: 0,
                },
              ])
            }
          >
            新增层
          </button>
          <button class="border px-2 py-1" onClick={() => setWarpLayers([])}>
            清空
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <For each={warpLayers()}>
            {(layer, idx) => (
              <div class="border p-2 rounded flex flex-wrap items-end gap-2">
                <label class="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={layer.enabled}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].enabled = e.currentTarget.checked;
                      setWarpLayers(arr);
                    }}
                  />
                  启用
                </label>
                <label class="flex flex-col">
                  <span>类型</span>
                  <select
                    class="border px-2 py-1"
                    value={layer.type}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].type = e.currentTarget.value as NoiseType;
                      setWarpLayers(arr);
                    }}
                  >
                    <option value="perlin">Perlin</option>
                    <option value="simplex">Simplex</option>
                  </select>
                </label>
                <label class="flex flex-col">
                  <span>分形</span>
                  <select
                    class="border px-2 py-1"
                    value={layer.fractal}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].fractal = e.currentTarget.value as FractalMode;
                      setWarpLayers(arr);
                    }}
                  >
                    <option value="none">None</option>
                    <option value="fbm">FBM</option>
                    <option value="ridged">Ridged</option>
                    <option value="billow">Billow</option>
                  </select>
                </label>
                <label class="flex flex-col w-28">
                  <span>Scale</span>
                  <input
                    type="number"
                    class="border px-2 py-1"
                    value={layer.scale}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].scale = e.currentTarget.valueAsNumber || 1;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Amp X</span>
                  <input
                    step="0.01"
                    type="number"
                    class="border px-2 py-1"
                    value={layer.amplitudeX}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].amplitudeX =
                        e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Amp Y</span>
                  <input
                    step="0.01"
                    type="number"
                    class="border px-2 py-1"
                    value={layer.amplitudeY}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].amplitudeY =
                        e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Octaves</span>
                  <input
                    type="number"
                    class="border px-2 py-1"
                    value={layer.octaves}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].octaves = e.currentTarget.valueAsNumber || 1;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Persistence</span>
                  <input
                    step="0.01"
                    type="number"
                    class="border px-2 py-1"
                    value={layer.persistence}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].persistence =
                        e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Lacunarity</span>
                  <input
                    step="0.01"
                    type="number"
                    class="border px-2 py-1"
                    value={layer.lacunarity}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].lacunarity =
                        e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-32">
                  <span>Seed</span>
                  <input
                    type="number"
                    class="border px-2 py-1"
                    value={layer.seed}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].seed = e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Offset X</span>
                  <input
                    type="number"
                    class="border px-2 py-1"
                    value={layer.offsetX}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].offsetX = e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <label class="flex flex-col w-28">
                  <span>Offset Y</span>
                  <input
                    type="number"
                    class="border px-2 py-1"
                    value={layer.offsetY}
                    onInput={(e) => {
                      const arr = [...warpLayers()];
                      arr[idx()].offsetY = e.currentTarget.valueAsNumber || 0;
                      setWarpLayers(arr);
                    }}
                  />
                </label>
                <button
                  class="border px-2 py-1"
                  onClick={() => {
                    const arr = [...warpLayers()];
                    arr.splice(idx(), 1);
                    setWarpLayers(arr);
                  }}
                >
                  删除层
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function drawSlope(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number
) {
  const img = ctx.createImageData(w, h);
  const get = (x: number, y: number) => data[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = get(Math.max(0, x - 1), y);
      const xr = get(Math.min(w - 1, x + 1), y);
      const yt = get(x, Math.max(0, y - 1));
      const yb = get(x, Math.min(h - 1, y + 1));
      const dx = (xr - xl) * 0.5;
      const dy = (yb - yt) * 0.5;
      const s = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 4);
      const v = Math.floor(s * 255);
      const idx = (y * w + x) * 4;
      img.data[idx] = v;
      img.data[idx + 1] = v;
      img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawContours(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number
) {
  const img = ctx.createImageData(w, h);
  const step = 0.05;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const band = Math.abs(((v / step) % 1) - 0.5);
    const line = band < 0.03 ? 255 : 0;
    const idx = i * 4;
    img.data[idx] = line;
    img.data[idx + 1] = line;
    img.data[idx + 2] = line;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawNormals(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number
) {
  const img = ctx.createImageData(w, h);
  const get = (x: number, y: number) => data[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = get(Math.max(0, x - 1), y);
      const xr = get(Math.min(w - 1, x + 1), y);
      const yt = get(x, Math.max(0, y - 1));
      const yb = get(x, Math.min(h - 1, y + 1));
      const dx = xr - xl;
      const dy = yb - yt;
      let nx = -dx,
        ny = -dy,
        nz = 1;
      const invLen = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const r = Math.floor((nx * 0.5 + 0.5) * 255);
      const g = Math.floor((ny * 0.5 + 0.5) * 255);
      const b = Math.floor((nz * 0.5 + 0.5) * 255);
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawHillshade(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number
) {
  const img = ctx.createImageData(w, h);
  const get = (x: number, y: number) => data[y * w + x];
  const azimuth = Math.PI * 0.75; // from NW
  const altitude = Math.PI * 0.35; // sun height
  const lx = Math.cos(azimuth) * Math.cos(altitude);
  const ly = Math.sin(azimuth) * Math.cos(altitude);
  const lz = Math.sin(altitude);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = get(Math.max(0, x - 1), y);
      const xr = get(Math.min(w - 1, x + 1), y);
      const yt = get(x, Math.max(0, y - 1));
      const yb = get(x, Math.min(h - 1, y + 1));
      const dx = (xr - xl) * 1.5;
      const dy = (yb - yt) * 1.5;
      let nx = -dx,
        ny = -dy,
        nz = 1;
      const invLen = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const v = Math.floor(ndotl * 255);
      const idx = (y * w + x) * 4;
      img.data[idx] = v;
      img.data[idx + 1] = v;
      img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number,
  threshold = 0.08
) {
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  const img = tctx.createImageData(w, h);
  const get = (x: number, y: number) => data[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = get(x, y);
      const r = get(Math.min(w - 1, x + 1), y);
      const d = get(x, Math.min(h - 1, y + 1));
      const dv = Math.max(Math.abs(v - r), Math.abs(v - d));
      const isEdge = dv > threshold;
      const color = 0; // black outline
      const a = isEdge ? 220 : 0;
      const idx = (y * w + x) * 4;
      img.data[idx] = color;
      img.data[idx + 1] = color;
      img.data[idx + 2] = color;
      img.data[idx + 3] = a;
    }
  }
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

function drawComposite(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number,
  threshold = 0.06
) {
  // render hillshade first (grayscale), leveraging CSS mix-blend-mode on the overlay canvas
  drawHillshade(ctx, data, w, h);
  // then overlay subtle edge outlines without clearing hillshade
  drawEdges(ctx, data, w, h, threshold);
}

function drawMagnifier(
  baseCanvas: HTMLCanvasElement,
  magCanvas: HTMLCanvasElement,
  mx: number,
  my: number,
  crop: number
) {
  const mctx = magCanvas.getContext("2d");
  if (!mctx) return;
  const half = Math.floor(crop / 2);
  const sx = Math.max(0, Math.min(baseCanvas.width - crop, mx - half));
  const sy = Math.max(0, Math.min(baseCanvas.height - crop, my - half));
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, magCanvas.width, magCanvas.height);
  mctx.drawImage(
    baseCanvas,
    sx,
    sy,
    crop,
    crop,
    0,
    0,
    magCanvas.width,
    magCanvas.height
  );
}

function drawMagnifierRect(
  ocanvas: HTMLCanvasElement | undefined,
  mx: number,
  my: number,
  crop: number,
  w: number,
  h: number,
  getData: () => Float32Array,
  curView: string,
  edgeThresh?: number
) {
  if (!ocanvas) return;
  const octx = ocanvas.getContext("2d");
  if (!octx) return;
  octx.clearRect(0, 0, w, h);
  if (curView !== "height") {
    const data = getData();
    if (curView === "slope") drawSlope(octx, data, w, h);
    else if (curView === "contours") drawContours(octx, data, w, h);
    else if (curView === "normal") drawNormals(octx, data, w, h);
    else if (curView === "hillshade") drawHillshade(octx, data, w, h);
    else if (curView === "composite")
      drawComposite(octx, data, w, h, edgeThresh ?? 0.06);
  }
  octx.save();
  octx.strokeStyle = "rgba(255,0,0,0.8)";
  octx.lineWidth = 1;
  const half = Math.floor(crop / 2);
  const rx = Math.max(0, Math.min(w - crop, mx - half));
  const ry = Math.max(0, Math.min(h - crop, my - half));
  octx.strokeRect(rx + 0.5, ry + 0.5, crop, crop);
  octx.restore();
}
