import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

type MorphOp =
  | "dilation"
  | "erosion"
  | "opening"
  | "closing"
  | "gradient"
  | "tophat"
  | "blackhat"
  | "thinning";
type OutputMode = "binary" | "color";
type MorphDomain = "binary" | "grayscale";

type PresetKernel = {
  name: string;
  matrix: number[][];
  anchor: { x: number; y: number };
};

const UI = {
  title: "图像形态学演练场",
  desc: "支持膨胀 / 腐蚀操作，可自定义卷积核和参考点，并提供若干预设结构元素。",
  uploadHint: "点击此处或拖拽图片到这里上传",
  invalidFile: "请上传有效的图片文件！",
  original: "原始图片",
  result: "处理结果",
  download: "下载图片",
  processing: "正在处理中，请稍候...",
  operation: "操作类型",
  dilation: "膨胀 (Dilation)",
  erosion: "腐蚀 (Erosion)",
  opening: "开运算 (Opening = 腐蚀后膨胀)",
  closing: "闭运算 (Closing = 膨胀后腐蚀)",
  gradient: "形态梯度 (Gradient = 膨胀 - 腐蚀)",
  tophat: "礼帽 (Top-hat = 原图 - 开运算)",
  blackhat: "黑帽 (Black-hat = 闭运算 - 原图)",
  thinning: "细化 / 骨架 (Thinning)",
  morphDomain: "形态学域",
  domainBinary: "二值 (基于阈值)",
  domainGray: "灰度 (不二值化)",
  outputMode: "输出模式",
  outputBinary: "黑白二值",
  outputColor: "保留原图颜色",
  thresholdLabel: "灰度阈值（二值化）",
  grayScaleLabel: "灰度缩放",
  grayOffsetLabel: "灰度偏移",
  kernelSize: "卷积核大小",
  anchor: "参考点 (Anchor)",
  anchorX: "列 (x)",
  anchorY: "行 (y)",
  presetLabel: "结构元素预设",
  applyMorph: "应用形态学操作",
  resetKernel: "重置为全 1",
};

const PRESET_KERNELS: PresetKernel[] = [
  {
    name: "3×3 全 1",
    matrix: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    anchor: { x: 1, y: 1 },
  },
  {
    name: "3×3 十字形",
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    anchor: { x: 1, y: 1 },
  },
  {
    name: "5×5 十字形",
    matrix: [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ],
    anchor: { x: 2, y: 2 },
  },
  {
    name: "5×5 菱形",
    matrix: [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ],
    anchor: { x: 2, y: 2 },
  },
];

function createDefaultKernel(size: number) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 1));
}

export default function MorphologyPlayground() {
  // ---------- refs ----------
  let fileInputRef: HTMLInputElement | undefined;
  let uploadAreaRef: HTMLLabelElement | undefined;
  let originalImageRef: HTMLImageElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;

  // ---------- state ----------
  const [processing, setProcessing] = createSignal<boolean>(false);
  const [resultReady, setResultReady] = createSignal<boolean>(false);
  const [downloadUrl, setDownloadUrl] = createSignal<string>("");
  const [downloadName, setDownloadName] = createSignal<string>("morphology.png");
  const [originalSrc, setOriginalSrc] = createSignal<string>("");

  const [operation, setOperation] = createSignal<MorphOp>("dilation");
  const [morphDomain, setMorphDomain] = createSignal<MorphDomain>("binary");
  const [outputMode, setOutputMode] = createSignal<OutputMode>("binary");
  const [threshold, setThreshold] = createSignal<number>(128);
  const [grayScale, setGrayScale] = createSignal<number>(1);
  const [grayOffset, setGrayOffset] = createSignal<number>(0);
  const [kernelSize, setKernelSize] = createSignal<number>(3);
  const [kernel, setKernel] = createSignal<number[][]>(createDefaultKernel(3));
  const [anchorX, setAnchorX] = createSignal<number>(1);
  const [anchorY, setAnchorY] = createSignal<number>(1);
  const [isDraggingOver, setIsDraggingOver] = createSignal<boolean>(false);

  // 载入后的绘制源
  let loadedImage: CanvasImageSource | null = null;
  let loadedImageDims: { width: number; height: number } | null = null;
  let originalObjectUrl: string | null = null;

  function revokeObjectUrlSafely(url: string) {
    try {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    } catch {
      // noop
    }
  }

  async function refreshDownloadLinkFromCanvas(canvas: HTMLCanvasElement) {
    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        revokeObjectUrlSafely(downloadUrl());
        setDownloadUrl(url);
        resolve();
      }, "image/png");
    });
  }

  function getImageDims(src: CanvasImageSource): { width: number; height: number } {
    const anySrc = src as unknown as { width?: number; height?: number };
    const width = typeof anySrc.width === "number" ? anySrc.width : 0;
    const height = typeof anySrc.height === "number" ? anySrc.height : 0;
    return { width, height };
  }

  function drawOriginalToCanvas() {
    if (!loadedImage || !canvasRef) return;
    const canvas = canvasRef;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return;
    const dims = loadedImageDims ?? getImageDims(loadedImage);
    canvas.width = dims.width;
    canvas.height = dims.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loadedImage as CanvasImageSource, 0, 0);
    setResultReady(true);
  }

  function applyPreset(preset: PresetKernel) {
    setKernel(preset.matrix);
    setKernelSize(preset.matrix.length);
    setAnchorX(preset.anchor.x);
    setAnchorY(preset.anchor.y);
  }

  function handleKernelSizeChange(newSize: number) {
    const size = Math.max(1, Math.min(9, newSize | 0)); // 限制 1~9，避免太大
    setKernelSize(size);
    const current = kernel();
    const next = createDefaultKernel(size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (current[y] && typeof current[y][x] === "number") {
          next[y][x] = current[y][x] ? 1 : 0;
        }
      }
    }
    setKernel(next);
    const center = Math.floor(size / 2);
    setAnchorX(center);
    setAnchorY(center);
  }

  function toggleKernelCell(y: number, x: number) {
    const k = kernel().map((row) => row.slice());
    k[y][x] = k[y][x] ? 0 : 1;
    setKernel(k);
  }

  function resetKernel() {
    const size = kernelSize();
    setKernel(createDefaultKernel(size));
  }

  function applyGrayTone(v: number) {
    const s = grayScale();
    const o = grayOffset();
    let vv = v * s + o;
    if (vv < 0) vv = 0;
    else if (vv > 255) vv = 255;
    return vv | 0;
  }

  function applySingleMorph(
    src: Uint8Array,
    w: number,
    h: number,
    k: number[][],
    ks: number,
    ax: number,
    ay: number,
    op: "dilation" | "erosion"
  ) {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (op === "dilation") {
          let hit = 0;
          for (let j = 0; j < ks; j++) {
            for (let i = 0; i < ks; i++) {
              if (!k[j][i]) continue;
              const yy = y + (j - ay);
              const xx = x + (i - ax);
              if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
              if (src[yy * w + xx]) {
                hit = 1;
                break;
              }
            }
            if (hit) break;
          }
          dst[y * w + x] = hit;
        } else {
          let ok = 1;
          for (let j = 0; j < ks; j++) {
            for (let i = 0; i < ks; i++) {
              if (!k[j][i]) continue;
              const yy = y + (j - ay);
              const xx = x + (i - ax);
              if (yy < 0 || yy >= h || xx < 0 || xx >= w || !src[yy * w + xx]) {
                ok = 0;
                break;
              }
            }
            if (!ok) break;
          }
          dst[y * w + x] = ok;
        }
      }
    }
    return dst;
  }

  function applySingleMorphGray(
    src: Uint8Array,
    w: number,
    h: number,
    k: number[][],
    ks: number,
    ax: number,
    ay: number,
    op: "dilation" | "erosion"
  ) {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = op === "dilation" ? 0 : 255;
        let hasSample = false;
        for (let j = 0; j < ks; j++) {
          for (let i = 0; i < ks; i++) {
            if (!k[j][i]) continue;
            const yy = y + (j - ay);
            const xx = x + (i - ax);
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            const v = src[yy * w + xx];
            hasSample = true;
            if (op === "dilation") {
              if (v > acc) acc = v;
            } else {
              if (v < acc) acc = v;
            }
          }
        }
        if (!hasSample) {
          acc = src[y * w + x];
        }
        dst[y * w + x] = acc;
      }
    }
    return dst;
  }

  function thinningZhangSuen(src: Uint8Array, w: number, h: number) {
    const img = src.slice();
    let changed = true;
    const neighbors = (p: number) => {
      const y = (p / w) | 0;
      const x = p - y * w;
      const get = (xx: number, yy: number) => {
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) return 0;
        return img[yy * w + xx] ? 1 : 0;
      };
      const p2 = get(x, y - 1);
      const p3 = get(x + 1, y - 1);
      const p4 = get(x + 1, y);
      const p5 = get(x + 1, y + 1);
      const p6 = get(x, y + 1);
      const p7 = get(x - 1, y + 1);
      const p8 = get(x - 1, y);
      const p9 = get(x - 1, y - 1);
      return { p2, p3, p4, p5, p6, p7, p8, p9 };
    };

    const maxIter = 50;
    let iter = 0;
    while (changed && iter < maxIter) {
      changed = false;
      iter++;
      const toRemove: number[] = [];

      // 子迭代 1
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!img[p]) continue;
          const { p2, p3, p4, p5, p6, p7, p8, p9 } = neighbors(p);
          const bp = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bp < 2 || bp > 6) continue;
          const ap =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (ap !== 1) continue;
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
          toRemove.push(p);
        }
      }
      if (toRemove.length > 0) {
        changed = true;
        for (const p of toRemove) img[p] = 0;
      }

      const toRemove2: number[] = [];
      // 子迭代 2
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!img[p]) continue;
          const { p2, p3, p4, p5, p6, p7, p8, p9 } = neighbors(p);
          const bp = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bp < 2 || bp > 6) continue;
          const ap =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (ap !== 1) continue;
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
          toRemove2.push(p);
        }
      }
      if (toRemove2.length > 0) {
        changed = true;
        for (const p of toRemove2) img[p] = 0;
      }
    }
    return img;
  }

  function applyMorphology() {
    if (!loadedImage || !canvasRef) return;
    setProcessing(true);
    setResultReady(false);

    requestAnimationFrame(() => {
      const canvas = canvasRef!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) {
        setProcessing(false);
        return;
      }
      const dims = loadedImageDims ?? getImageDims(loadedImage!);
      const w = dims.width;
      const h = dims.height;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(loadedImage as CanvasImageSource, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const originalData = new Uint8ClampedArray(data); // 保留原始彩图数据，用于彩色输出

      const thr = Math.max(0, Math.min(255, threshold() | 0));
      const gray = new Uint8Array(w * h);
      const bin = new Uint8Array(w * h);

      // 灰度化，并根据阈值生成二值图（仅在二值形态学模式下使用）
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const v = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
        gray[p] = v;
        bin[p] = v >= thr ? 1 : 0;
      }

      const k = kernel();
      const ks = k.length;
      const ax = Math.max(0, Math.min(ks - 1, anchorX() | 0));
      const ay = Math.max(0, Math.min(ks - 1, anchorY() | 0));
      const op = operation();
      const domain = morphDomain();

      let outBin: Uint8Array | null = null;
      let outGray: Uint8Array | null = null;

      if (domain === "binary") {
        if (op === "dilation" || op === "erosion") {
          outBin = applySingleMorph(bin, w, h, k, ks, ax, ay, op);
        } else if (op === "thinning") {
          outBin = thinningZhangSuen(bin, w, h);
        } else if (op === "opening" || op === "tophat") {
          const eroded = applySingleMorph(bin, w, h, k, ks, ax, ay, "erosion");
          const opened = applySingleMorph(eroded, w, h, k, ks, ax, ay, "dilation");
          if (op === "opening") {
            outBin = opened;
          } else {
            // tophat (binary) = bin - opening
            const out = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
              out[i] = bin[i] && !opened[i] ? 1 : 0;
            }
            outBin = out;
          }
        } else if (op === "closing" || op === "blackhat") {
          const dilated = applySingleMorph(bin, w, h, k, ks, ax, ay, "dilation");
          const closed = applySingleMorph(dilated, w, h, k, ks, ax, ay, "erosion");
          if (op === "closing") {
            outBin = closed;
          } else {
            // blackhat (binary) = closing - bin
            const out = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
              out[i] = closed[i] && !bin[i] ? 1 : 0;
            }
            outBin = out;
          }
        } else {
          // gradient (binary) = dilation - erosion
          const dilated = applySingleMorph(bin, w, h, k, ks, ax, ay, "dilation");
          const eroded = applySingleMorph(bin, w, h, k, ks, ax, ay, "erosion");
          const out = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            out[i] = dilated[i] && !eroded[i] ? 1 : 0;
          }
          outBin = out;
        }
      } else {
        if (op === "dilation" || op === "erosion") {
          outGray = applySingleMorphGray(gray, w, h, k, ks, ax, ay, op);
        } else if (op === "thinning") {
          const skel = thinningZhangSuen(bin, w, h);
          const out = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            out[i] = skel[i] ? 255 : 0;
          }
          outGray = out;
        } else if (op === "opening" || op === "tophat") {
          const eroded = applySingleMorphGray(gray, w, h, k, ks, ax, ay, "erosion");
          const opened = applySingleMorphGray(eroded, w, h, k, ks, ax, ay, "dilation");
          if (op === "opening") {
            outGray = opened;
          } else {
            // tophat (grayscale) = gray - opening
            const out = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
              let diff = gray[i] - opened[i];
              if (diff < 0) diff = 0;
              else if (diff > 255) diff = 255;
              out[i] = diff;
            }
            outGray = out;
          }
        } else if (op === "closing" || op === "blackhat") {
          const dilated = applySingleMorphGray(gray, w, h, k, ks, ax, ay, "dilation");
          const closed = applySingleMorphGray(dilated, w, h, k, ks, ax, ay, "erosion");
          if (op === "closing") {
            outGray = closed;
          } else {
            // blackhat (grayscale) = closing - gray
            const out = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
              let diff = closed[i] - gray[i];
              if (diff < 0) diff = 0;
              else if (diff > 255) diff = 255;
              out[i] = diff;
            }
            outGray = out;
          }
        } else {
          // gradient (grayscale) = dilation - erosion
          const dilated = applySingleMorphGray(gray, w, h, k, ks, ax, ay, "dilation");
          const eroded = applySingleMorphGray(gray, w, h, k, ks, ax, ay, "erosion");
          const out = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            const diff = dilated[i] - eroded[i];
            out[i] = diff < 0 ? 0 : diff > 255 ? 255 : diff;
          }
          outGray = out;
        }
      }

      const mode = outputMode();
      if (domain === "binary") {
        const out = outBin ?? bin;
        if (mode === "binary") {
          // 黑白二值输出
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            const v = out[p] ? 255 : 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
          }
        } else {
          // 彩色输出：用形态学结果作为掩膜，保留原图颜色，背景设为黑色
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            if (out[p]) {
              data[i] = originalData[i];
              data[i + 1] = originalData[i + 1];
              data[i + 2] = originalData[i + 2];
              data[i + 3] = 255;
            } else {
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
              data[i + 3] = 255;
            }
          }
        }
      } else {
        const out = outGray ?? gray;
        if (mode === "binary") {
          // 灰度形态学输出：以灰度显示结果
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            const v = applyGrayTone(out[p]);
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
          }
        } else {
          // 彩色输出：用灰度结果作为强度因子，对原图颜色做缩放
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            const factor = applyGrayTone(out[p]) / 255;
            data[i] = (originalData[i] * factor) | 0;
            data[i + 1] = (originalData[i + 1] * factor) | 0;
            data[i + 2] = (originalData[i + 2] * factor) | 0;
            data[i + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      refreshDownloadLinkFromCanvas(canvas).then(() => {
        setDownloadName((prev) => {
          const base = prev.replace(/\.png$/i, "");
          let suffix = "";
          if (op === "dilation") suffix = "_dilation.png";
          else if (op === "erosion") suffix = "_erosion.png";
          else if (op === "opening") suffix = "_opening.png";
          else if (op === "closing") suffix = "_closing.png";
          else if (op === "gradient") suffix = "_gradient.png";
          else if (op === "tophat") suffix = "_tophat.png";
          else suffix = "_blackhat.png";
          return `${base}${suffix}`;
        });
        setProcessing(false);
        setResultReady(true);
      });
    });
  }

  async function handleFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/")) {
      alert(UI.invalidFile);
      return;
    }

    const baseName = (() => {
      const n = file.name;
      const dot = n.lastIndexOf(".");
      return dot > 0 ? n.slice(0, dot) : n;
    })();
    setDownloadName(`${baseName}.png`);

    revokeObjectUrlSafely(originalObjectUrl ?? "");
    originalObjectUrl = URL.createObjectURL(file);
    setOriginalSrc(originalObjectUrl);

    try {
      const bitmap = await createImageBitmap(file);
      loadedImage = bitmap as unknown as CanvasImageSource;
      loadedImageDims = { width: bitmap.width, height: bitmap.height };
      drawOriginalToCanvas();
      return;
    } catch {
      // fallback
    }

    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      loadedImageDims = { width: img.width, height: img.height };
      drawOriginalToCanvas();
    };
    img.src = originalObjectUrl;
  }

  // ---------- effects ----------
  onMount(() => {
    // 全页面拖拽交互
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // 只在真正离开窗口时重置，避免子元素抖动
      if (e.target === document || e.target === document.body) {
        setIsDraggingOver(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    onCleanup(() => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      revokeObjectUrlSafely(downloadUrl());
      if (originalObjectUrl) revokeObjectUrlSafely(originalObjectUrl);
    });
  });

  return (
    <div
      class="mx-auto max-w-6xl p-5 text-slate-900"
      classList={{
        "outline outline-2 outline-dashed outline-emerald-500 bg-emerald-50/40": isDraggingOver(),
      }}
    >
      <div class="rounded-lg bg-white p-4 shadow-md md:p-5">
        <h1 class="mb-1 text-center text-2xl font-bold">{UI.title}</h1>
        <p class="mb-4 text-center text-slate-600">{UI.desc}</p>

        <div class="mb-4 text-center text-xs text-slate-500">
          可点击下方按钮选择图片，或直接将图片拖拽到本页面任意位置。
        </div>

        <div class="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm text-slate-700">{UI.operation}:</span>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="dilation"
                  checked={operation() === "dilation"}
                  onChange={() => setOperation("dilation")}
                />
                {UI.dilation}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="erosion"
                  checked={operation() === "erosion"}
                  onChange={() => setOperation("erosion")}
                />
                {UI.erosion}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="opening"
                  checked={operation() === "opening"}
                  onChange={() => setOperation("opening")}
                />
                {UI.opening}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="closing"
                  checked={operation() === "closing"}
                  onChange={() => setOperation("closing")}
                />
                {UI.closing}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="gradient"
                  checked={operation() === "gradient"}
                  onChange={() => setOperation("gradient")}
                />
                {UI.gradient}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="tophat"
                  checked={operation() === "tophat"}
                  onChange={() => setOperation("tophat")}
                />
                {UI.tophat}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="blackhat"
                  checked={operation() === "blackhat"}
                  onChange={() => setOperation("blackhat")}
                />
                {UI.blackhat}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphOp"
                  value="thinning"
                  checked={operation() === "thinning"}
                  onChange={() => setOperation("thinning")}
                />
                {UI.thinning}
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm text-slate-700">{UI.morphDomain}:</span>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphDomain"
                  value="binary"
                  checked={morphDomain() === "binary"}
                  onChange={() => setMorphDomain("binary")}
                />
                {UI.domainBinary}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="morphDomain"
                  value="grayscale"
                  checked={morphDomain() === "grayscale"}
                  onChange={() => setMorphDomain("grayscale")}
                />
                {UI.domainGray}
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm text-slate-700">{UI.outputMode}:</span>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="outputMode"
                  value="binary"
                  checked={outputMode() === "binary"}
                  onChange={() => setOutputMode("binary")}
                />
                {UI.outputBinary}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="outputMode"
                  value="color"
                  checked={outputMode() === "color"}
                  onChange={() => setOutputMode("color")}
                />
                {UI.outputColor}
              </label>
            </div>

            <div class="flex items-center gap-2 text-sm">
              <span class="text-slate-700">{UI.thresholdLabel}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={threshold()}
                onInput={(e) => setThreshold(Number(e.currentTarget.value) | 0)}
                class="flex-1"
              />
              <input
                type="number"
                min={0}
                max={255}
                value={threshold()}
                onInput={(e) => setThreshold(Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0)))}
                class="w-20 rounded border border-slate-300 px-2 py-1"
              />
            </div>

            <Show when={morphDomain() === "grayscale"}>
              <div class="flex flex-col gap-2 rounded border border-dashed border-slate-300 bg-white/60 p-2">
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-slate-700">{UI.grayScaleLabel}</span>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    value={Math.round(grayScale() * 100)}
                    onInput={(e) => setGrayScale(Math.max(0, Number(e.currentTarget.value) / 100))}
                    class="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.1}
                    value={grayScale().toFixed(1)}
                    onInput={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (!Number.isNaN(v)) {
                        setGrayScale(Math.max(0, Math.min(3, v)));
                      }
                    }}
                    class="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-slate-700">{UI.grayOffsetLabel}</span>
                  <input
                    type="range"
                    min={-128}
                    max={128}
                    value={grayOffset()}
                    onInput={(e) =>
                      setGrayOffset(Math.max(-128, Math.min(128, Number(e.currentTarget.value) | 0)))
                    }
                    class="flex-1"
                  />
                  <input
                    type="number"
                    min={-128}
                    max={128}
                    value={grayOffset()}
                    onInput={(e) =>
                      setGrayOffset(Math.max(-128, Math.min(128, Number(e.currentTarget.value) | 0)))
                    }
                    class="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            </Show>

            <div class="flex flex-wrap items-center gap-3 text-sm">
              <span class="text-slate-700">{UI.kernelSize}</span>
              <select
                value={kernelSize()}
                onChange={(e) => handleKernelSizeChange(Number(e.currentTarget.value))}
                class="rounded border border-slate-300 px-2 py-1"
              >
                <option value={1}>1 × 1</option>
                <option value={3}>3 × 3</option>
                <option value={5}>5 × 5</option>
                <option value={7}>7 × 7</option>
                <option value={9}>9 × 9</option>
              </select>

              <span class="ml-2 text-slate-700">{UI.anchor}</span>
              <label class="flex items-center gap-1">
                {UI.anchorX}
                <input
                  type="number"
                  min={0}
                  max={kernelSize() - 1}
                  value={anchorX()}
                  onInput={(e) =>
                    setAnchorX(Math.max(0, Math.min(kernelSize() - 1, Number(e.currentTarget.value) | 0)))
                  }
                  class="w-16 rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label class="flex items-center gap-1">
                {UI.anchorY}
                <input
                  type="number"
                  min={0}
                  max={kernelSize() - 1}
                  value={anchorY()}
                  onInput={(e) =>
                    setAnchorY(Math.max(0, Math.min(kernelSize() - 1, Number(e.currentTarget.value) | 0)))
                  }
                  class="w-16 rounded border border-slate-300 px-2 py-1"
                />
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3 text-sm">
              <span class="text-slate-700">{UI.presetLabel}</span>
              <For each={PRESET_KERNELS}>
                {(preset) => (
                  <button
                    type="button"
                    class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                )}
              </For>
              <button
                type="button"
                class="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                onClick={resetKernel}
              >
                {UI.resetKernel}
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-sm text-slate-700">卷积核形状 (点击单元格切换 0/1)：</span>
            <div class="inline-block rounded border border-slate-300 bg-white p-2">
              <For each={kernel()}>
                {(row, y) => (
                  <div class="flex">
                    <For each={row}>
                      {(cell, x) => {
                        const isAnchor = () => anchorX() === x() && anchorY() === y();
                        return (
                          <button
                            type="button"
                            class="m-[1px] flex h-7 w-7 items-center justify-center rounded text-xs font-mono"
                            classList={{
                              "bg-emerald-500 text-white": cell === 1 && !isAnchor(),
                              "bg-emerald-700 text-white": cell === 1 && isAnchor(),
                              "bg-slate-200 text-slate-700": cell === 0 && !isAnchor(),
                              "bg-slate-400 text-white": cell === 0 && isAnchor(),
                            }}
                            onClick={() => toggleKernelCell(y(), x())}
                          >
                            {cell}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
            </div>
            <span class="text-xs text-slate-500">
              绿色为结构元素中值为 1 的位置；加深颜色表示当前参考点（Anchor）。
            </span>
          </div>
        </div>

        <div class="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef?.click()}
            class="rounded border border-dashed border-blue-500 bg-slate-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            {UI.uploadHint}
          </button>
        </div>
        <input
          ref={fileInputRef}
          id="morphology_file"
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />

        <div class="mt-4 flex justify-center">
          <button
            type="button"
            onClick={applyMorphology}
            class="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={!originalSrc()}
          >
            {UI.applyMorph}
          </button>
        </div>

        <Show when={processing()}>
          <p class="mt-3 text-center font-semibold text-blue-600">{UI.processing}</p>
        </Show>

        <Show when={originalSrc()}>
          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-4">
              <h3 class="mb-2 text-base font-semibold text-slate-700">{UI.original}</h3>
              <img ref={originalImageRef} src={originalSrc()} alt="原始图片" class="max-w-full rounded" />
            </div>
            <div class="rounded-lg border border-slate-200 p-4">
              <h3 class="mb-2 text-base font-semibold text-slate-700">{UI.result}</h3>
              <canvas ref={canvasRef} class="max-w-full rounded" />
              <div class="mt-3 text-center">
                <a
                  href={resultReady() ? downloadUrl() : undefined}
                  download={downloadName()}
                  class="inline-block rounded px-4 py-2 font-semibold text-white transition-colors"
                  classList={{
                    "cursor-pointer bg-blue-600 hover:bg-blue-700": resultReady(),
                    "cursor-not-allowed bg-slate-400": !resultReady(),
                  }}
                >
                  {UI.download}
                </a>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}


