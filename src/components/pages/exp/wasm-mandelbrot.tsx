import { createSignal, onMount, onCleanup } from "solid-js";
import wabt from "wabt";
// 通过 Vite 原生的 ?raw 将 WAT 以文本方式引入
import watSource from "./mandelbrot.wat?raw";

// WABT 类型帮助
type WabtModule = Awaited<ReturnType<typeof wabt>>;

const WIDTH = 1200;
const HEIGHT = 800;
const NUM_PIXELS = WIDTH * HEIGHT; // 960000
const HEADER_BYTES = 4; // 前 4 字节用于原子计数器
const BYTES_PER_PIXEL = 4;
const MEMORY_PAGES = 80; // 与 .wat 中的 (memory 80 80 shared) 保持一致

export default function WasmMandelbrot() {
  // 交互参数
  const [cx, setCx] = createSignal(1);
  const [cy, setCy] = createSignal(1);
  const [diameter, setDiameter] = createSignal(3.0);
  const [workersCount, setWorkersCount] = createSignal(
    Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8))
  );

  // 状态
  const [error, setError] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [wabtInstance, setWabtInstance] = createSignal<WabtModule | null>(null);

  let canvasRef: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationFrameId: number | null = null;

  // Wasm/线程相关
  let sharedMemory: WebAssembly.Memory | null = null;
  let wasmModule: WebAssembly.Module | null = null;
  let workers: Worker[] = [];
  let imageData: ImageData | null = null;

  onMount(async () => {
    if (!crossOriginIsolated) {
      setError(
        "需要在 cross-origin isolated 环境下运行（COOP/COEP）以启用 SharedArrayBuffer。"
      );
    }
    try {
      const instance = await wabt();
      setWabtInstance(instance);
    } catch (e) {
      console.error(e);
      setError("WABT 加载失败");
    }

    if (canvasRef) {
      canvasRef.width = WIDTH;
      canvasRef.height = HEIGHT;
      ctx = canvasRef.getContext("2d");
    }
  });

  onCleanup(() => {
    stopAll();
  });

  function stopAll() {
    setRunning(false);
    // 停止渲染循环
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    // 终止所有 worker
    for (const w of workers) {
      try {
        w.terminate();
      } catch {}
    }
    workers = [];
    // 释放引用
    imageData = null;
    sharedMemory = null;
    wasmModule = null;
  }

  async function compileWasm(): Promise<Uint8Array> {
    if (!wabtInstance()) throw new Error("WABT 未就绪");
    const mod = wabtInstance()!.parseWat("mandelbrot.wat", watSource, {
      threads: true,
    });
    const { buffer } = mod.toBinary({
      log: true,
      write_debug_names: true,
    });
    return buffer;
  }

  function ensureMemory(): WebAssembly.Memory {
    if (sharedMemory) return sharedMemory;
    sharedMemory = new WebAssembly.Memory({
      initial: MEMORY_PAGES,
      maximum: MEMORY_PAGES,
      shared: true,
    });
    // 清零计数器
    new Int32Array(sharedMemory.buffer, 0, 1)[0] = 0;
    return sharedMemory;
  }

  function startRenderLoop() {
    if (!ctx || !sharedMemory) return;
    const sharedPixels = new Uint8ClampedArray(
      sharedMemory.buffer,
      HEADER_BYTES,
      NUM_PIXELS * BYTES_PER_PIXEL
    );
    // 使用非共享的 ImageData，避免浏览器限制
    imageData = ctx.createImageData(WIDTH, HEIGHT);

    const counter = new Int32Array(sharedMemory.buffer, 0, 1);

    const tick = () => {
      if (!ctx || !imageData) return;
      try {
        // 复制共享像素到本地缓冲
        imageData.data.set(sharedPixels);
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        // putImageData 失败也不中断渲染
      }
      const done = Atomics.load(counter, 0);
      setProgress(Math.min(done, NUM_PIXELS));
      if (done >= NUM_PIXELS || !running()) {
        setRunning(false);
        // 一帧尾声再停，最后一次绘制
        return;
      }
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
  }

  function makeWorkerUrl(): string {
    const workerCode = `
self.onmessage = async (e) => {
  const { wasmModule, memory, cx, cy, diameter, id } = e.data;
  try {
    const importObject = { env: { memory } };
    const result = await WebAssembly.instantiate(wasmModule, importObject);
    const instance = result.instance || result;
    const run = instance.exports.run;
    if (typeof run !== 'function') throw new Error('wasm 导出缺少 run');
    run(cx, cy, diameter, id);
    self.postMessage({ type: 'done', id });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
`;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  async function runMandelbrot() {
    setError("");
    if (running()) return;
    if (!wabtInstance()) {
      setError("WABT 未就绪");
      return;
    }
    if (!crossOriginIsolated) {
      setError(
        "当前环境未启用 COOP/COEP，无法使用 WebAssembly 线程。请在生产服务器或本地设置相应响应头后再试。"
      );
      return;
    }

    try {
      // 编译 WAT -> wasm buffer -> WebAssembly.Module
      const wasmBuffer = await compileWasm();
      const wasmArrayBuffer = wasmBuffer.buffer.slice(
        wasmBuffer.byteOffset,
        wasmBuffer.byteOffset + wasmBuffer.byteLength
      );
      wasmModule = await WebAssembly.compile(wasmArrayBuffer as ArrayBuffer);

      // 共享内存
      const memory = ensureMemory();
      // 重置进度
      new Int32Array(memory.buffer, 0, 1)[0] = 0;
      setProgress(0);

      // 渲染循环
      setRunning(true);
      startRenderLoop();

      // 启动 workers
      const url = makeWorkerUrl();
      const importPayload = {
        wasmModule: wasmModule!,
        memory,
        cx: cx(),
        cy: cy(),
        diameter: diameter(),
      };

      // 先清理旧 worker
      for (const w of workers)
        try {
          w.terminate();
        } catch {}
      workers = [];

      const count = workersCount();
      for (let i = 0; i < count; i++) {
        const w = new Worker(url, { type: "module" });
        w.onmessage = (ev) => {
          const msg = ev.data;
          if (msg?.type === "error") {
            setError(`Worker ${msg.id} 出错: ${msg.message}`);
          }
        };
        w.postMessage({ ...importPayload, id: i });
        workers.push(w);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      stopAll();
    }
  }

  function stopMandelbrot() {
    stopAll();
  }

  return (
    <div class="font-sans max-w-5xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">WASM 多线程 Mandelbrot</h1>
      <p class="text-gray-600 mb-4">
        使用 wabt.js 编译 WAT，并通过 SharedArrayBuffer + Web Workers 并行渲染。
      </p>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 mb-4">
        <label class="flex items-center gap-2">
          <span class="w-20 text-sm text-gray-600">cx</span>
          <input
            class="flex-1 p-2 border rounded"
            type="number"
            step="0.01"
            value={cx()}
            onInput={(e) => setCx(parseFloat(e.currentTarget.value))}
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="w-20 text-sm text-gray-600">cy</span>
          <input
            class="flex-1 p-2 border rounded"
            type="number"
            step="0.01"
            value={cy()}
            onInput={(e) => setCy(parseFloat(e.currentTarget.value))}
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="w-20 text-sm text-gray-600">直径</span>
          <input
            class="flex-1 p-2 border rounded"
            type="number"
            step="0.01"
            value={diameter()}
            onInput={(e) => setDiameter(parseFloat(e.currentTarget.value))}
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="w-20 text-sm text-gray-600">线程数</span>
          <input
            class="flex-1 p-2 border rounded"
            type="number"
            min="1"
            max="16"
            value={workersCount()}
            onInput={(e) =>
              setWorkersCount(parseInt(e.currentTarget.value || "1", 10))
            }
          />
        </label>
      </div>

      <div class="flex items-center gap-2 mb-3">
        <button
          onClick={runMandelbrot}
          disabled={running() || !wabtInstance()}
          class="px-4 py-2 text-base cursor-pointer bg-blue-500 hover:bg-blue-600 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {running() ? "运行中..." : wabtInstance() ? "开始渲染" : "加载中..."}
        </button>
        <button
          onClick={stopMandelbrot}
          disabled={!running()}
          class="px-4 py-2 text-base cursor-pointer bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >
          停止
        </button>
        <span class="text-sm text-gray-700">
          进度: {progress()} / {NUM_PIXELS}
        </span>
      </div>

      {error() && (
        <div class="mb-3 text-red-700 bg-red-100 p-2 rounded">{error()}</div>
      )}

      <div class="overflow-auto">
        <canvas ref={canvasRef} class="border rounded shadow inline-block" />
      </div>
    </div>
  );
}
