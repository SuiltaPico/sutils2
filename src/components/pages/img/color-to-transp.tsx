import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const UI_TEXT = {
  title: "通用图片背景转透明工具",
  desc: "选择一个目标背景色，工具会将其从图片中“剥离”为透明通道。",
  chooseColor: "选择要移除的背景色:",
  white: "白色",
  black: "黑色",
  custom: "自定义",
  pick: "浏览器取色",
  eyedropperNotSupported: "当前浏览器不支持 EyeDropper 取色。",
  uploadHint: "点击此处或拖拽图片到这里上传",
  processing: "正在处理中，请稍候...",
  original: "原始图片",
  result: "处理结果 (透明)",
  download: "下载图片",
  invalidFile: "请上传有效的图片文件！",
};

const DEFAULT_CUSTOM_HEX = "#808080";

function hexToRgbFloats(hex: string): RgbColor {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export default function BgToTransparent() {
  // ---------- refs ----------
  let fileInputRef: HTMLInputElement | undefined;
  let uploadAreaRef: HTMLLabelElement | undefined;
  let originalImageRef: HTMLImageElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let resultContainerRef: HTMLDivElement | undefined;

  // ---------- state ----------
  const [selectedBgOption, setSelectedBgOption] = createSignal<"white" | "black" | "custom">("white");
  const [customHex, setCustomHex] = createSignal<string>(DEFAULT_CUSTOM_HEX);
  const [resultBgHex, setResultBgHex] = createSignal<string>("#FFFFFF");
  const [processing, setProcessing] = createSignal<boolean>(false);
  const [resultReady, setResultReady] = createSignal<boolean>(false);
  const [downloadUrl, setDownloadUrl] = createSignal<string>("");
  const [downloadName, setDownloadName] = createSignal<string>("transparent_image.png");
  const [originalSrc, setOriginalSrc] = createSignal<string>("");

  // 使用独立的 Image 作为绘制源，避免未加载完成尺寸不确定
  let loadedImage: CanvasImageSource | null = null;
  let loadedImageDims: { width: number; height: number } | null = null;
  let worker: Worker | null = null;
  let originalObjectUrl: string | null = null;

  function getTargetColor(): { color: RgbColor; bgHex: string } {
    const option = selectedBgOption();
    if (option === "white") {
      return { color: { r: 1, g: 1, b: 1 }, bgHex: "#FFFFFF" };
    }
    if (option === "black") {
      return { color: { r: 0, g: 0, b: 0 }, bgHex: "#000000" };
    }
    const hex = customHex();
    return { color: hexToRgbFloats(hex), bgHex: hex };
  }

  function revokeObjectUrlSafely(url: string) {
    try {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    } catch {
      // noop
    }
  }

  function updateResultContainerBg() {
    const { bgHex } = getTargetColor();
    setResultBgHex(bgHex);
  }

  function computeAlphaAndUnpremultiply(
    input: { r: number; g: number; b: number },
    bg: RgbColor
  ) {
    let alphaR = 0;
    let alphaG = 0;
    let alphaB = 0;

    if (bg.r < 1) alphaR = Math.max(0, (input.r - bg.r) / (1 - bg.r));
    if (bg.r > 0) alphaR = Math.max(alphaR, (bg.r - input.r) / bg.r);

    if (bg.g < 1) alphaG = Math.max(0, (input.g - bg.g) / (1 - bg.g));
    if (bg.g > 0) alphaG = Math.max(alphaG, (bg.g - input.g) / bg.g);

    if (bg.b < 1) alphaB = Math.max(0, (input.b - bg.b) / (1 - bg.b));
    if (bg.b > 0) alphaB = Math.max(alphaB, (bg.b - input.b) / bg.b);

    const alpha = Math.max(alphaR, alphaG, alphaB);
    const finalAlpha = Math.max(0, Math.min(1, alpha));

    if (finalAlpha < 1e-6) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    const rOut = (input.r - bg.r * (1 - finalAlpha)) / finalAlpha;
    const gOut = (input.g - bg.g * (1 - finalAlpha)) / finalAlpha;
    const bOut = (input.b - bg.b * (1 - finalAlpha)) / finalAlpha;
    return { r: rOut, g: gOut, b: bOut, a: finalAlpha };
  }

  async function refreshDownloadLinkFromCanvas(canvas: HTMLCanvasElement) {
    // 使用 toBlob + ObjectURL，避免大数据 DataURL 占用内存
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
    // HTMLImageElement, HTMLCanvasElement, ImageBitmap 均有 width/height
    const anySrc = src as unknown as { width?: number; height?: number };
    const width = typeof anySrc.width === "number" ? anySrc.width : 0;
    const height = typeof anySrc.height === "number" ? anySrc.height : 0;
    return { width, height };
  }

  function ensureWorker() {
    if (worker) return worker;
    try {
      worker = new Worker(new URL("./bg-to-transp.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      worker = null;
    }
    return worker;
  }

  function processImage() {
    if (!loadedImage || !canvasRef) return;

    setProcessing(true);
    setResultReady(false);

    const { color: targetColor, bgHex } = getTargetColor();

    // 避免阻塞 UI
    requestAnimationFrame(() => {
      const canvas = canvasRef!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) {
        setProcessing(false);
        return;
      }

      const dims = loadedImageDims ?? getImageDims(loadedImage!);
      canvas.width = dims.width;
      canvas.height = dims.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 预处理：先以用户选择的背景色铺底，再绘制原图（确保输入是“已叠加到该背景色”的结果）
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(loadedImage as CanvasImageSource, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const pixels = canvas.width * canvas.height;
      const shouldUseWorker = pixels >= 1024 * 1024; // 1MP 以上使用 Worker

      if (shouldUseWorker && ensureWorker()) {
        const w = worker!;
        const handler = (e: MessageEvent) => {
          const msg = e.data as { type: string; width: number; height: number; buffer: ArrayBuffer };
          if (!msg || msg.type !== "done") return;
          w.removeEventListener("message", handler);
          const out = new Uint8ClampedArray(msg.buffer);
          const outData = new ImageData(out, msg.width, msg.height);
          ctx.putImageData(outData, 0, 0);
          refreshDownloadLinkFromCanvas(canvas).then(() => {
            setProcessing(false);
            setResultReady(true);
          });
        };
        w.addEventListener("message", handler);
        const transferable = imageData.data.buffer as ArrayBuffer;
        const payload = {
          type: "process",
          width: canvas.width,
          height: canvas.height,
          buffer: transferable,
          target: targetColor,
        } as const;
        w.postMessage(payload, [transferable]);
      } else {
        for (let i = 0; i < data.length; i += 4) {
          const rIn = data[i] / 255;
          const gIn = data[i + 1] / 255;
          const bIn = data[i + 2] / 255;

          const result = computeAlphaAndUnpremultiply(
            { r: rIn, g: gIn, b: bIn },
            targetColor
          );

          data[i] = Math.max(0, Math.min(255, result.r * 255)) | 0;
          data[i + 1] = Math.max(0, Math.min(255, result.g * 255)) | 0;
          data[i + 2] = Math.max(0, Math.min(255, result.b * 255)) | 0;
          data[i + 3] = Math.max(0, Math.min(255, result.a * 255)) | 0;
        }
        ctx.putImageData(imageData, 0, 0);
        // 刷新下载链接（异步生成 blob）
        refreshDownloadLinkFromCanvas(canvas).then(() => {
          setProcessing(false);
          setResultReady(true);
        });
      }
    });
  }

  async function handlePickWithEyeDropper() {
    try {
      const anyWindow = window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };
      if (!anyWindow.EyeDropper) {
        alert(UI_TEXT.eyedropperNotSupported);
        return;
      }
      const eyeDropper = new anyWindow.EyeDropper();
      const result = await eyeDropper.open();
      if (result && typeof result.sRGBHex === "string") {
        setSelectedBgOption("custom");
        setCustomHex(result.sRGBHex);
      }
    } catch (e) {
      // 用户取消取色会抛出 AbortError，忽略即可
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/")) {
      alert(UI_TEXT.invalidFile);
      return;
    }

    const baseName = (() => {
      const n = file.name;
      const dot = n.lastIndexOf(".");
      return dot > 0 ? n.slice(0, dot) : n;
    })();
    setDownloadName(`${baseName}_transparent.png`);

    // 使用 Blob URL 显示原图，避免 base64 DataURL 的内存开销
    revokeObjectUrlSafely(originalObjectUrl ?? "");
    originalObjectUrl = URL.createObjectURL(file);
    setOriginalSrc(originalObjectUrl);

    // 使用 createImageBitmap 加速解码和绘制；不支持时回退到 HTMLImageElement
    try {
      const bitmap = await createImageBitmap(file);
      loadedImage = bitmap as unknown as CanvasImageSource;
      loadedImageDims = { width: bitmap.width, height: bitmap.height };
      updateResultContainerBg();
      processImage();
      return;
    } catch {
      // fallback
    }

    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      loadedImageDims = { width: img.width, height: img.height };
      updateResultContainerBg();
      processImage();
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
      if (worker) {
        worker.terminate();
        worker = null;
      }
      revokeObjectUrlSafely(downloadUrl());
      if (originalObjectUrl) revokeObjectUrlSafely(originalObjectUrl);
    });
  });

  // 当颜色选项或自定义颜色变化时，若已有图片则重新处理
  createEffect(() => {
    // 更新结果容器背景色
    updateResultContainerBg();
    if (loadedImage) {
      processImage();
    }
  });

  return (
    <div class="mx-auto max-w-5xl p-5 text-slate-900">
      <div class="rounded-lg bg-white p-5 shadow">
        <h1 class="mb-1 text-center text-2xl font-bold">{UI_TEXT.title}</h1>
        <p class="mb-4 text-center text-slate-600">{UI_TEXT.desc}</p>

        <div class="mb-6 flex flex-wrap items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="text-sm text-slate-700">{UI_TEXT.chooseColor}</span>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="bgColorOption"
              value="white"
              checked={selectedBgOption() === "white"}
              onChange={() => setSelectedBgOption("white")}
            />
            {UI_TEXT.white}
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="bgColorOption"
              value="black"
              checked={selectedBgOption() === "black"}
              onChange={() => setSelectedBgOption("black")}
            />
            {UI_TEXT.black}
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="bgColorOption"
              value="custom"
              checked={selectedBgOption() === "custom"}
              onChange={() => setSelectedBgOption("custom")}
            />
            {UI_TEXT.custom}
            <input
              type="color"
              value={customHex()}
              onInput={(e) => setCustomHex(e.currentTarget.value)}
              class="h-[30px] w-[40px] cursor-pointer rounded border border-slate-300 p-[2px]"
            />
          </label>
          <button
            type="button"
            onClick={handlePickWithEyeDropper}
            class="rounded bg-gray-200 px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-gray-300"
          >
            {UI_TEXT.pick}
          </button>
        </div>

        <label
          ref={uploadAreaRef}
          for="bg_to_transp_file"
          onClick={() => fileInputRef?.click()}
          class="block cursor-pointer rounded-lg border-2 border-dashed border-blue-600 bg-slate-50 px-6 py-10 text-center transition-colors hover:bg-slate-100"
        >
          {UI_TEXT.uploadHint}
        </label>
        <input
          ref={fileInputRef}
          id="bg_to_transp_file"
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />

        <Show when={processing()}>
          <p class="mt-3 text-center font-semibold text-blue-600">{UI_TEXT.processing}</p>
        </Show>

        <Show when={originalSrc()}>
          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-4">
              <h3 class="mb-2 text-base font-semibold text-slate-700">{UI_TEXT.original}</h3>
              <img ref={originalImageRef} src={originalSrc()} alt="原始图片" class="max-w-full rounded" />
            </div>
            <div
              ref={resultContainerRef}
              class="rounded-lg border border-slate-200 p-4 transition-colors"
              style={{ "background-color": resultBgHex() }}
            >
              <h3 class="mb-2 text-base font-semibold text-slate-700">{UI_TEXT.result}</h3>
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
                  {UI_TEXT.download}
                </a>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}


