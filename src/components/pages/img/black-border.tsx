import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

type BorderInputs = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const UI = {
  title: "图片边界工具",
  desc: "",
  uploadHint: "点击此处或拖拽图片到这里上传",
  invalidFile: "请上传有效的图片文件！",
  original: "原始图片",
  result: "处理结果",
  download: "下载图片",
  processing: "正在处理中，请稍候...",
  addBorder: "加边界",
  removeBorder: "去边界",
  threshold: "颜色容差",
  pixels: "像素",
};

export default function BlackBorderTool() {
  // ---------- refs ----------
  let fileInputRef: HTMLInputElement | undefined;
  let uploadAreaRef: HTMLLabelElement | undefined;
  let originalImageRef: HTMLImageElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;

  // ---------- state ----------
  const [processing, setProcessing] = createSignal<boolean>(false);
  const [resultReady, setResultReady] = createSignal<boolean>(false);
  const [downloadUrl, setDownloadUrl] = createSignal<string>("");
  const [downloadName, setDownloadName] = createSignal<string>("image.png");
  const [originalSrc, setOriginalSrc] = createSignal<string>("");

  const [borders, setBorders] = createSignal<BorderInputs>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [threshold, setThreshold] = createSignal<number>(16); // 建议 0-32
  const [selectedBgOption, setSelectedBgOption] = createSignal<"auto" | "black" | "white" | "custom">("auto");
  const [customHex, setCustomHex] = createSignal<string>("#000000");
  const [addColorOption, setAddColorOption] = createSignal<"black" | "white" | "custom">("black");
  const [addCustomHex, setAddCustomHex] = createSignal<string>("#000000");

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

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const n = hex.startsWith("#") ? hex.slice(1) : hex;
    const r = parseInt(n.slice(0, 2), 16) | 0;
    const g = parseInt(n.slice(2, 4), 16) | 0;
    const b = parseInt(n.slice(4, 6), 16) | 0;
    return { r, g, b };
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

  // ---------- Add Black Border ----------
  function processAddBorder() {
    if (!loadedImage || !canvasRef) return;
    setProcessing(true);
    setResultReady(false);

    requestAnimationFrame(() => {
      const canvas = canvasRef!;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) {
        setProcessing(false);
        return;
      }
      const dims = loadedImageDims ?? getImageDims(loadedImage!);
      const b = borders();
      const newWidth = Math.max(1, dims.width + b.left + b.right);
      const newHeight = Math.max(1, dims.height + b.top + b.bottom);
      canvas.width = newWidth;
      canvas.height = newHeight;
      // 选择边界填充颜色
      let fillHex = "#000000";
      const mode = addColorOption();
      if (mode === "white") fillHex = "#ffffff";
      else if (mode === "custom") fillHex = addCustomHex();
      ctx.fillStyle = fillHex;
      ctx.fillRect(0, 0, newWidth, newHeight);
      ctx.drawImage(loadedImage as CanvasImageSource, b.left, b.top);
      refreshDownloadLinkFromCanvas(canvas).then(() => {
        setDownloadName((prev) => {
          const base = prev.replace(/\.png$/i, "");
          return `${base}_addborder.png`;
        });
        setProcessing(false);
        setResultReady(true);
      });
    });
  }

  // ---------- Remove Border (auto/black/white/custom) ----------
  function nearBlack(r: number, g: number, b: number, t: number) {
    return r <= t && g <= t && b <= t;
  }

  function nearWhite(r: number, g: number, b: number, t: number) {
    return r >= 255 - t && g >= 255 - t && b >= 255 - t;
  }

  function nearColor(r: number, g: number, b: number, color: { r: number; g: number; b: number }, t: number) {
    return Math.abs(r - color.r) <= t && Math.abs(g - color.g) <= t && Math.abs(b - color.b) <= t;
  }

  function autoDetectColorFromBorders(
    data: Uint8ClampedArray,
    w: number,
    h: number,
    t: number
  ): { r: number; g: number; b: number } | null {
    type Key = string;
    const colorCount = new Map<Key, { r: number; g: number; b: number; count: number }>();

    const considerLine = (getIndex: (i: number) => number, length: number) => {
      const firstIdx = getIndex(0) * 4;
      const base = { r: data[firstIdx], g: data[firstIdx + 1], b: data[firstIdx + 2] };
      for (let i = 1; i < length; i++) {
        const idx = getIndex(i) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (!nearColor(r, g, b, base, t)) {
          return; // 非纯色行/列，丢弃
        }
      }
      const key: Key = `${base.r},${base.g},${base.b}`;
      const curr = colorCount.get(key) ?? { ...base, count: 0 };
      curr.count += length;
      colorCount.set(key, curr);
    };

    // 上边 y=0，长度 w
    considerLine((x) => 0 * w + x, w);
    // 下边 y=h-1
    considerLine((x) => (h - 1) * w + x, w);
    // 左边 x=0，长度 h
    considerLine((y) => y * w + 0, h);
    // 右边 x=w-1
    considerLine((y) => y * w + (w - 1), h);

    let best: { r: number; g: number; b: number; count: number } | null = null;
    for (const v of colorCount.values()) {
      if (!best || v.count > best.count) best = v;
    }
    return best ? { r: best.r, g: best.g, b: best.b } : null;
  }

  function processRemoveBorder() {
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
      // 先把原图完整绘制到工作画布
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(loadedImage as CanvasImageSource, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const t = Math.max(0, Math.min(255, threshold() | 0));

      // 决定背景颜色判定器
      let chosenColor: { r: number; g: number; b: number } | null = null;
      const mode = selectedBgOption();
      if (mode === "custom") {
        chosenColor = hexToRgb(customHex());
      } else if (mode === "auto") {
        chosenColor = autoDetectColorFromBorders(data, w, h, t);
        // 如果自动失败，回退到黑色
        if (!chosenColor) chosenColor = { r: 0, g: 0, b: 0 };
      }

      const isBg = (r: number, g: number, b: number) => {
        if (mode === "black") return nearBlack(r, g, b, t);
        if (mode === "white") return nearWhite(r, g, b, t);
        // custom 或 auto
        return chosenColor ? nearColor(r, g, b, chosenColor, t) : nearBlack(r, g, b, t);
      };

      // 扫描上边
      let top = 0;
      for (let y = 0; y < h; y++) {
        let rowAllBlack = true;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!isBg(data[i], data[i + 1], data[i + 2])) {
            rowAllBlack = false;
            break;
          }
        }
        if (!rowAllBlack) {
          top = y;
          break;
        }
        // 若整行都是黑，则继续增大 top
        top = y + 1;
      }

      // 扫描下边
      let bottom = h - 1;
      for (let y = h - 1; y >= 0; y--) {
        let rowAllBlack = true;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!isBg(data[i], data[i + 1], data[i + 2])) {
            rowAllBlack = false;
            break;
          }
        }
        if (!rowAllBlack) {
          bottom = y;
          break;
        }
        bottom = y - 1;
      }

      // 扫描左边
      let left = 0;
      for (let x = 0; x < w; x++) {
        let colAllBlack = true;
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (!isBg(data[i], data[i + 1], data[i + 2])) {
            colAllBlack = false;
            break;
          }
        }
        if (!colAllBlack) {
          left = x;
          break;
        }
        left = x + 1;
      }

      // 扫描右边
      let right = w - 1;
      for (let x = w - 1; x >= 0; x--) {
        let colAllBlack = true;
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (!isBg(data[i], data[i + 1], data[i + 2])) {
            colAllBlack = false;
            break;
          }
        }
        if (!colAllBlack) {
          right = x;
          break;
        }
        right = x - 1;
      }

      // 防御：避免越界或空矩形
      left = Math.max(0, Math.min(left, w - 1));
      right = Math.max(0, Math.min(right, w - 1));
      top = Math.max(0, Math.min(top, h - 1));
      bottom = Math.max(0, Math.min(bottom, h - 1));

      const cropW = Math.max(0, right - left + 1);
      const cropH = Math.max(0, bottom - top + 1);

      if (cropW <= 0 || cropH <= 0) {
        // 全黑图或识别失败，直接返回原图
        drawOriginalToCanvas();
        setProcessing(false);
        setResultReady(true);
        return;
      }

      // 裁剪绘制到新画布
      const outW = cropW;
      const outH = cropH;
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = outW;
      tmpCanvas.height = outH;
      const tmpCtx = tmpCanvas.getContext("2d") as CanvasRenderingContext2D;
      tmpCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, outW, outH);

      canvas.width = outW;
      canvas.height = outH;
      const outImage = tmpCtx.getImageData(0, 0, outW, outH);
      const outCtx = canvas.getContext("2d") as CanvasRenderingContext2D;
      outCtx.putImageData(outImage, 0, 0);

      refreshDownloadLinkFromCanvas(canvas).then(() => {
        setDownloadName((prev) => {
          const base = prev.replace(/\.png$/i, "");
          return `${base}_crop.png`;
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
    // 拖拽交互
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
    // 值变动时不自动处理，避免误操作。用户点击按钮触发。
  });

  return (
    <div class="mx-auto max-w-5xl p-5 text-slate-900">
      <div class="rounded-lg bg-white p-5 shadow">
        <h1 class="mb-1 text-center text-2xl font-bold">{UI.title}</h1>
        <p class="mb-4 text-center text-slate-600">{UI.desc}</p>

        <div class="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-2">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-slate-700">{UI.addBorder}:</span>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="addColorOption"
                value="black"
                checked={addColorOption() === "black"}
                onChange={() => setAddColorOption("black")}
              />
              黑色
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="addColorOption"
                value="white"
                checked={addColorOption() === "white"}
                onChange={() => setAddColorOption("white")}
              />
              白色
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="addColorOption"
                value="custom"
                checked={addColorOption() === "custom"}
                onChange={() => setAddColorOption("custom")}
              />
              自定义
              <input
                type="color"
                value={addCustomHex()}
                onInput={(e) => setAddCustomHex(e.currentTarget.value)}
                class="h-[30px] w-[40px] cursor-pointer rounded border border-slate-300 p-[2px]"
              />
            </label>
            <label class="flex items-center gap-2 text-sm">
              上
              <input
                type="number"
                min={0}
                value={borders().top}
                onInput={(e) => setBorders({ ...borders(), top: Math.max(0, Number(e.currentTarget.value) | 0) })}
                class="w-20 rounded border border-slate-300 px-2 py-1"
              />
              {UI.pixels}
            </label>
            <label class="flex items-center gap-2 text-sm">
              右
              <input
                type="number"
                min={0}
                value={borders().right}
                onInput={(e) => setBorders({ ...borders(), right: Math.max(0, Number(e.currentTarget.value) | 0) })}
                class="w-20 rounded border border-slate-300 px-2 py-1"
              />
              {UI.pixels}
            </label>
            <label class="flex items-center gap-2 text-sm">
              下
              <input
                type="number"
                min={0}
                value={borders().bottom}
                onInput={(e) => setBorders({ ...borders(), bottom: Math.max(0, Number(e.currentTarget.value) | 0) })}
                class="w-20 rounded border border-slate-300 px-2 py-1"
              />
              {UI.pixels}
            </label>
            <label class="flex items-center gap-2 text-sm">
              左
              <input
                type="number"
                min={0}
                value={borders().left}
                onInput={(e) => setBorders({ ...borders(), left: Math.max(0, Number(e.currentTarget.value) | 0) })}
                class="w-20 rounded border border-slate-300 px-2 py-1"
              />
              {UI.pixels}
            </label>
            <button
              type="button"
              onClick={processAddBorder}
              class="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {UI.addBorder}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-slate-700">{UI.removeBorder}:</span>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="bgColorOption"
                value="auto"
                checked={selectedBgOption() === "auto"}
                onChange={() => setSelectedBgOption("auto")}
              />
              自动
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="bgColorOption"
                value="black"
                checked={selectedBgOption() === "black"}
                onChange={() => setSelectedBgOption("black")}
              />
              黑色
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="bgColorOption"
                value="white"
                checked={selectedBgOption() === "white"}
                onChange={() => setSelectedBgOption("white")}
              />
              白色
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="bgColorOption"
                value="custom"
                checked={selectedBgOption() === "custom"}
                onChange={() => setSelectedBgOption("custom")}
              />
              自定义
              <input
                type="color"
                value={customHex()}
                onInput={(e) => setCustomHex(e.currentTarget.value)}
                class="h-[30px] w-[40px] cursor-pointer rounded border border-slate-300 p-[2px]"
              />
            </label>
            <label class="flex items-center gap-2 text-sm">
              {UI.threshold}
              <input
                type="number"
                min={0}
                max={255}
                value={threshold()}
                onInput={(e) => setThreshold(Math.max(0, Math.min(255, Number(e.currentTarget.value) | 0)))}
                class="w-24 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={processRemoveBorder}
              class="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {UI.removeBorder}
            </button>
          </div>
        </div>

        <label
          ref={uploadAreaRef}
          for="black_border_file"
          onClick={() => fileInputRef?.click()}
          class="block cursor-pointer rounded-lg border-2 border-dashed border-blue-600 bg-slate-50 px-6 py-10 text-center transition-colors hover:bg-slate-100"
        >
          {UI.uploadHint}
        </label>
        <input
          ref={fileInputRef}
          id="black_border_file"
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


