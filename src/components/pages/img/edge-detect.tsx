import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

const UI = {
  title: "图像变换",
  desc: "对图片进行灰度化、直方图均衡化、拉普拉斯 / Canny 边缘检测等操作，可调节参数实时预览，并可选择保留原图颜色。",
  uploadHint: "点击此处或拖拽图片到这里上传",
  invalidFile: "请上传有效的图片文件！",
  original: "原始图片",
  result: "处理结果",
  download: "下载图片",
  processing: "正在处理中，请稍候...",
  opOriginal: "仅灰度化",
  opHistEq: "直方图均衡化",
  opBackProj: "直方图反向投影",
  opLaplacian: "拉普拉斯 (Laplacian)",
  opCanny: "Canny 边缘检测",
  laplacianLabel: "拉普拉斯增强系数",
  cannyLow: "Canny 低阈值",
  cannyHigh: "Canny 高阈值",
  outputMode: "输出模式",
  outputGray: "灰度输出",
  outputColor: "保留原图颜色",
};

type EdgeOp = "none" | "histeq" | "backproj" | "laplacian" | "canny";
type OutputMode = "gray" | "color";

function revokeObjectUrlSafely(url: string) {
  try {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  } catch {
    // noop
  }
}

async function refreshDownloadLinkFromCanvas(
  canvas: HTMLCanvasElement,
  getPrevUrl: () => string,
  setDownloadUrl: (url: string) => void
) {
  return new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve();
      const url = URL.createObjectURL(blob);
      revokeObjectUrlSafely(getPrevUrl());
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

function toGrayscale(
  data: Uint8ClampedArray,
  w: number,
  h: number
): Uint8Array {
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[p] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return gray;
}

function buildEqualizationLut(hist: Uint32Array, total: number): Uint8Array {
  const cdf = new Uint32Array(256);
  let cumsum = 0;
  for (let i = 0; i < 256; i++) {
    cumsum += hist[i];
    cdf[i] = cumsum;
  }

  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    if (cdf[i] > 0) {
      cdfMin = cdf[i];
      break;
    }
  }

  const lut = new Uint8Array(256);
  const denom = total - cdfMin || 1;
  for (let i = 0; i < 256; i++) {
    const mapped = ((cdf[i] - cdfMin) * 255) / denom;
    let vv = mapped;
    if (vv < 0) vv = 0;
    else if (vv > 255) vv = 255;
    lut[i] = vv | 0;
  }
  return lut;
}

function histogramEqualizeGray(
  gray: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  const total = w * h;
  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) {
    hist[gray[i]]++;
  }
  const lut = buildEqualizationLut(hist, total);
  const out = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    out[i] = lut[gray[i]];
  }
  return out;
}

function histogramEqualizeRgb(
  data: Uint8ClampedArray,
  w: number,
  h: number
): Uint8ClampedArray {
  const total = w * h;
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    histR[data[i]]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
  }

  const lutR = buildEqualizationLut(histR, total);
  const lutG = buildEqualizationLut(histG, total);
  const lutB = buildEqualizationLut(histB, total);

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    out[i] = lutR[r];
    out[i + 1] = lutG[g];
    out[i + 2] = lutB[b];
    out[i + 3] = 255;
  }
  return out;
}

function histogramBackProjectMaskRgb(
  data: Uint8ClampedArray,
  w: number,
  h: number
): Uint8Array {
  const total = w * h;
  const bins = 16;
  const histSize = bins * bins * bins; // 4096
  const hist = new Float32Array(histSize);

  // 构建 3D 颜色直方图（RGB 各量化到 16 档）
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 4; // 0-15
    const g = data[i + 1] >> 4;
    const b = data[i + 2] >> 4;
    const idx = (r << 8) | (g << 4) | b;
    hist[idx]++;
  }

  if (total === 0) return new Uint8Array(w * h);

  // 归一化并找到最大概率，用来缩放到 0-255
  let maxP = 0;
  for (let i = 0; i < hist.length; i++) {
    hist[i] = hist[i] / total;
    if (hist[i] > maxP) maxP = hist[i];
  }
  if (maxP <= 0) maxP = 1;

  const out = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = data[i] >> 4;
    const g = data[i + 1] >> 4;
    const b = data[i + 2] >> 4;
    const idx = (r << 8) | (g << 4) | b;
    const factor = hist[idx] / maxP; // 0-1
    let vv = factor * 255;
    if (vv < 0) vv = 0;
    else if (vv > 255) vv = 255;
    out[p] = vv | 0;
  }
  return out;
}

function applyLaplacian(
  gray: Uint8Array,
  w: number,
  h: number,
  alpha: number
): Uint8Array {
  // 3x3 拉普拉斯核（4 邻域）
  const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      let idx = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const yy = y + j;
          const xx = x + i;
          const v = gray[yy * w + xx];
          sum += v * kernel[idx++];
        }
      }
      // 增强对比并取绝对值
      let val = Math.abs(sum * alpha);
      if (val > 255) val = 255;
      out[y * w + x] = val | 0;
    }
  }
  return out;
}

function gaussianBlur(
  src: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  // 简单 5x5 高斯核，sigma≈1
  const kernel = [
    2, 4, 5, 4, 2,
    4, 9, 12, 9, 4,
    5, 12, 15, 12, 5,
    4, 9, 12, 9, 4,
    2, 4, 5, 4, 2,
  ];
  const kSum = 159;
  const out = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let sum = 0;
      let idx = 0;
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const yy = y + j;
          const xx = x + i;
          const v = src[yy * w + xx];
          sum += v * kernel[idx++];
        }
      }
      out[y * w + x] = (sum / kSum) | 0;
    }
  }
  return out;
}

function cannyEdge(
  gray: Uint8Array,
  w: number,
  h: number,
  lowThreshold: number,
  highThreshold: number
): Uint8Array {
  const blurred = gaussianBlur(gray, w, h);

  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);

  // Sobel 梯度
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0;
      let sy = 0;
      let idx = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const v = blurred[(y + j) * w + (x + i)];
          sx += v * sobelX[idx];
          sy += v * sobelY[idx];
          idx++;
        }
      }
      const p = y * w + x;
      gx[p] = sx;
      gy[p] = sy;
      const m = Math.hypot(sx, sy);
      mag[p] = m;
      dir[p] = Math.atan2(sy, sx);
    }
  }

  // 非极大值抑制
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const angle = (dir[p] * 180) / Math.PI;
      const m = mag[p];

      let q = 0;
      let r = 0;

      // 角度归一化到 [0,180)
      let a = angle;
      if (a < 0) a += 180;

      if ((a >= 0 && a < 22.5) || (a >= 157.5 && a < 180)) {
        q = mag[p + 1];
        r = mag[p - 1];
      } else if (a >= 22.5 && a < 67.5) {
        q = mag[p + w + 1];
        r = mag[p - w - 1];
      } else if (a >= 67.5 && a < 112.5) {
        q = mag[p + w];
        r = mag[p - w];
      } else {
        q = mag[p + w - 1];
        r = mag[p - w + 1];
      }

      if (m >= q && m >= r) {
        nms[p] = m;
      } else {
        nms[p] = 0;
      }
    }
  }

  // 双阈值 + 连接
  const res = new Uint8Array(w * h);
  const strong = 255;
  const weak = 75;

  for (let i = 0; i < nms.length; i++) {
    const v = nms[i];
    if (v >= highThreshold) res[i] = strong;
    else if (v >= lowThreshold) res[i] = weak;
    else res[i] = 0;
  }

  // 滞后阈值：保留与强边缘连接的弱边缘
  const inBounds = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h;
  const stack: number[] = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (res[p] === strong) stack.push(p);
    }
  }

  while (stack.length) {
    const p = stack.pop()!;
    const y = (p / w) | 0;
    const x = p - y * w;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        const xx = x + i;
        const yy = y + j;
        if (!inBounds(xx, yy)) continue;
        const idx = yy * w + xx;
        if (res[idx] === weak) {
          res[idx] = strong;
          stack.push(idx);
        }
      }
    }
  }

  for (let i = 0; i < res.length; i++) {
    if (res[i] !== strong) res[i] = 0;
  }

  return res;
}

export default function EdgeDetectPlayground() {
  // ---------- refs ----------
  let fileInputRef: HTMLInputElement | undefined;
  let uploadAreaRef: HTMLLabelElement | undefined;
  let originalImageRef: HTMLImageElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;

  // ---------- state ----------
  const [processing, setProcessing] = createSignal<boolean>(false);
  const [resultReady, setResultReady] = createSignal<boolean>(false);
  const [downloadUrl, setDownloadUrl] = createSignal<string>("");
  const [downloadName, setDownloadName] = createSignal<string>("edge.png");
  const [originalSrc, setOriginalSrc] = createSignal<string>("");

  const [op, setOp] = createSignal<EdgeOp>("laplacian");
  const [outputMode, setOutputMode] = createSignal<OutputMode>("gray");
  const [laplacianAlpha, setLaplacianAlpha] = createSignal<number>(1.0);
  const [cannyLow, setCannyLow] = createSignal<number>(30);
  const [cannyHigh, setCannyHigh] = createSignal<number>(90);

  let loadedImage: CanvasImageSource | null = null;
  let loadedImageDims: { width: number; height: number } | null = null;
  let originalObjectUrl: string | null = null;

  function process() {
    if (!loadedImage || !canvasRef) return;
    setProcessing(true);
    setResultReady(false);

    requestAnimationFrame(() => {
      const canvas = canvasRef!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | null;
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
      const originalData = new Uint8ClampedArray(data);

      const gray = toGrayscale(data, w, h);

      const currentOp = op();
      const mode = outputMode();

      // 统一的结果缓冲
      let outGray: Uint8Array | null = null;
      let outColor: Uint8ClampedArray | null = null;
      let outMask: Uint8Array | null = null; // 用于边缘/反向投影等作为遮罩
      let histeqGray: Uint8Array | null = null;

      if (currentOp === "none") {
        // 不做变换：灰度模式下显示灰度图，彩色模式下显示原图
        if (mode === "gray") {
          outGray = gray;
        } else {
          outColor = originalData;
        }
      } else if (currentOp === "histeq") {
        // 始终基于灰度做均衡化，灰度模式直接显示，彩色模式用作亮度因子
        histeqGray = histogramEqualizeGray(gray, w, h);
        if (mode === "gray") {
          outGray = histeqGray;
        }
      } else if (currentOp === "backproj") {
        // 使用 3D RGB 直方图做反向投影，得到 mask
        const mask = histogramBackProjectMaskRgb(originalData, w, h);
        if (mode === "gray") {
          outGray = mask;
        } else {
          outMask = mask;
        }
      } else if (currentOp === "laplacian") {
        const alpha = Math.max(0.1, Math.min(5, laplacianAlpha()));
        const edges = applyLaplacian(gray, w, h, alpha);
        if (mode === "gray") {
          outGray = edges;
        } else {
          outMask = edges;
        }
      } else if (currentOp === "canny") {
        const low = Math.max(0, Math.min(255, cannyLow() | 0));
        const high = Math.max(0, Math.min(255, cannyHigh() | 0));
        const lowFixed = Math.min(low, high);
        const highFixed = Math.max(low, high);
        const edges = cannyEdge(gray, w, h, lowFixed, highFixed);
        if (mode === "gray") {
          outGray = edges;
        } else {
          outMask = edges;
        }
      }

      if (mode === "gray") {
        const src = outGray ?? gray;
        for (let p = 0, i = 0; p < w * h; p++, i += 4) {
          const v = src[p];
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      } else {
        if (outColor) {
          // 直接使用彩色结果
          for (let i = 0; i < data.length; i += 4) {
            data[i] = outColor[i];
            data[i + 1] = outColor[i + 1];
            data[i + 2] = outColor[i + 2];
            data[i + 3] = 255;
          }
        } else if (outMask) {
          // 使用遮罩调制原图颜色
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            const baseR = originalData[i];
            const baseG = originalData[i + 1];
            const baseB = originalData[i + 2];
            const maskVal = outMask[p];

            if (currentOp === "backproj") {
              // 反向投影：按阈值保留/丢弃原图颜色，直观查看“高频颜色”分布
              const keep = maskVal >= 64;
              if (keep) {
                data[i] = baseR;
                data[i + 1] = baseG;
                data[i + 2] = baseB;
              } else {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
              }
              data[i + 3] = 255;
            } else {
              // 拉普拉斯 / Canny：使用边缘强度作为遮罩，突出边缘位置的原图颜色
              const factor = maskVal / 255;
              const r = (baseR * factor) | 0;
              const g = (baseG * factor) | 0;
              const b = (baseB * factor) | 0;
              data[i] = r;
              data[i + 1] = g;
              data[i + 2] = b;
              data[i + 3] = 255;
            }
          }
        } else if (currentOp === "histeq" && histeqGray) {
          // 直方图均衡（保留原图颜色）：按灰度前后比例调节亮度，尽量不改变色相
          for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            const baseR = originalData[i];
            const baseG = originalData[i + 1];
            const baseB = originalData[i + 2];
            const g0 = gray[p];
            const g1 = histeqGray[p];
            let factor = g0 > 0 ? g1 / g0 : 0;
            // 防止极端增强导致过曝
            if (factor > 4) factor = 4;
            if (factor < 0) factor = 0;
            const r = Math.max(0, Math.min(255, baseR * factor)) | 0;
            const g = Math.max(0, Math.min(255, baseG * factor)) | 0;
            const b = Math.max(0, Math.min(255, baseB * factor)) | 0;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
        } else {
          // 兜底：显示原图
          for (let i = 0; i < data.length; i += 4) {
            data[i] = originalData[i];
            data[i + 1] = originalData[i + 1];
            data[i + 2] = originalData[i + 2];
            data[i + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      refreshDownloadLinkFromCanvas(canvas, downloadUrl, setDownloadUrl).then(() => {
        setDownloadName((prev) => {
          const base = prev.replace(/\.png$/i, "");
          let suffix = "";
          if (currentOp === "laplacian") suffix = "_laplacian.png";
          else if (currentOp === "canny") suffix = "_canny.png";
          else suffix = "_gray.png";
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
      process();
      return;
    } catch {
      // fallback
    }

    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      loadedImageDims = { width: img.width, height: img.height };
      process();
    };
    img.src = originalObjectUrl;
  }

  // ---------- effects ----------
  onMount(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (uploadAreaRef) uploadAreaRef.style.backgroundColor = "#e9ecef";
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (uploadAreaRef) uploadAreaRef.style.backgroundColor = "#f8f9fa";
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (uploadAreaRef) uploadAreaRef.style.backgroundColor = "#f8f9fa";
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    };

    uploadAreaRef?.addEventListener("dragover", onDragOver);
    uploadAreaRef?.addEventListener("dragleave", onDragLeave);
    uploadAreaRef?.addEventListener("drop", onDrop);

    onCleanup(() => {
      uploadAreaRef?.removeEventListener("dragover", onDragOver);
      uploadAreaRef?.removeEventListener("dragleave", onDragLeave);
      uploadAreaRef?.removeEventListener("drop", onDrop);
      revokeObjectUrlSafely(downloadUrl());
      if (originalObjectUrl) revokeObjectUrlSafely(originalObjectUrl);
    });
  });

  createEffect(() => {
    // 读取这些 signal 以建立依赖关系，从而在参数变化时重新计算
    const _op = op();
    const _mode = outputMode();
    const _lap = laplacianAlpha();
    const _low = cannyLow();
    const _high = cannyHigh();
    void _op;
    void _mode;
    void _lap;
    void _low;
    void _high;
    if (loadedImage && originalSrc()) {
      process();
    }
  });

  return (
    <div class="mx-auto max-w-5xl p-5 text-slate-900">
      <div class="rounded-lg bg-white p-5 shadow">
        <h1 class="mb-1 text-center text-2xl font-bold">{UI.title}</h1>
        <p class="mb-4 text-center text-slate-600">{UI.desc}</p>

        <div class="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm text-slate-700">操作类型:</span>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOp"
                  value="none"
                  checked={op() === "none"}
                  onChange={() => setOp("none")}
                />
                {UI.opOriginal}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOp"
                  value="histeq"
                  checked={op() === "histeq"}
                  onChange={() => setOp("histeq")}
                />
                {UI.opHistEq}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOp"
                  value="backproj"
                  checked={op() === "backproj"}
                  onChange={() => setOp("backproj")}
                />
                {UI.opBackProj}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOp"
                  value="laplacian"
                  checked={op() === "laplacian"}
                  onChange={() => setOp("laplacian")}
                />
                {UI.opLaplacian}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOp"
                  value="canny"
                  checked={op() === "canny"}
                  onChange={() => setOp("canny")}
                />
                {UI.opCanny}
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <span class="text-sm text-slate-700">{UI.outputMode}:</span>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOutputMode"
                  value="gray"
                  checked={outputMode() === "gray"}
                  onChange={() => setOutputMode("gray")}
                />
                {UI.outputGray}
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="edgeOutputMode"
                  value="color"
                  checked={outputMode() === "color"}
                  onChange={() => setOutputMode("color")}
                />
                {UI.outputColor}
              </label>
            </div>

            <Show when={op() === "laplacian"}>
              <div class="flex items-center gap-2 text-sm">
                <span class="text-slate-700">{UI.laplacianLabel}</span>
                <input
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={laplacianAlpha()}
                  onInput={(e) =>
                    setLaplacianAlpha(
                      Math.max(0.1, Math.min(5, Number(e.currentTarget.value)))
                    )
                  }
                  class="flex-1"
                />
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={laplacianAlpha().toFixed(1)}
                  onInput={(e) => {
                    const v = Number(e.currentTarget.value);
                    if (!Number.isNaN(v)) {
                      setLaplacianAlpha(Math.max(0.1, Math.min(5, v)));
                    }
                  }}
                  class="w-20 rounded border border-slate-300 px-2 py-1"
                />
              </div>
            </Show>

            <Show when={op() === "canny"}>
              <div class="flex flex-col gap-2 rounded border border-dashed border-slate-300 bg-white/60 p-2 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-slate-700">{UI.cannyLow}</span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={cannyLow()}
                    onInput={(e) =>
                      setCannyLow(
                        Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0))
                      )
                    }
                    class="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={cannyLow()}
                    onInput={(e) =>
                      setCannyLow(
                        Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0))
                      )
                    }
                    class="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-700">{UI.cannyHigh}</span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={cannyHigh()}
                    onInput={(e) =>
                      setCannyHigh(
                        Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0))
                      )
                    }
                    class="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={cannyHigh()}
                    onInput={(e) =>
                      setCannyHigh(
                        Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0))
                      )
                    }
                    class="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            </Show>
          </div>

          <div class="flex flex-col justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef?.click()}
              class="rounded border border-dashed border-blue-500 bg-slate-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
            >
              {UI.uploadHint}
            </button>
            <p class="text-xs text-slate-500">
              建议上传中等分辨率的图片（例如 2K 以内），以获得更流畅的实时预览效果。
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          id="edge_detect_file"
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />

        <Show when={processing()}>
          <p class="mt-3 text-center font-semibold text-blue-600">{UI.processing}</p>
        </Show>

        <Show when={originalSrc()}>
          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-4">
              <h3 class="mb-2 text-base font-semibold text-slate-700">{UI.original}</h3>
              <img
                ref={originalImageRef}
                src={originalSrc()}
                alt="原始图片"
                class="max-w-full rounded"
              />
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

        <Show when={!originalSrc()}>
          <label
            ref={uploadAreaRef}
            for="edge_detect_file"
            onClick={() => fileInputRef?.click()}
            class="mt-4 block cursor-pointer rounded-lg border-2 border-dashed border-blue-600 bg-slate-50 px-6 py-10 text-center text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            {UI.uploadHint}
          </label>
        </Show>
      </div>
    </div>
  );
}


