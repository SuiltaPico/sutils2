import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { type Backend, type ProgramSource, createRenderer } from "./shader-playground/adapters/types.ts";
import { DEFAULT_DEMOS, type DemoItem } from "./shader-playground/demos.ts";
import { WEBGL_REF_ITEMS } from "./shader-playground/gl-reference.ts";
import { SCENE_FUNC_ITEMS } from "./shader-playground/scene-funcs.ts";

export default function ShaderPlayground() {
  const [backend, setBackend] = createSignal<Backend>("webgl");
  const [autoCompile, setAutoCompile] = createSignal(true);
  const [isRunning, setIsRunning] = createSignal(false);
  const [error, setError] = createSignal("");
  const [selectedDemo, setSelectedDemo] = createSignal<DemoItem | null>(null);

  // 源码：GL（顶点/片元）与 WGSL（合并）
  const [glVertex, setGlVertex] = createSignal("");
  const [glFragment, setGlFragment] = createSignal("");
  const [wgslCode, setWgslCode] = createSignal("");
  const [timeScale, setTimeScale] = createSignal(1);
  const [fps, setFps] = createSignal(0);

  let canvasRef: HTMLCanvasElement | undefined;
  let canvasContainerRef: HTMLDivElement | undefined;
  let renderer: Awaited<ReturnType<typeof createRenderer>> | null = null;
  let compileTimer: number | null = null;
  let fpsEwma = 0;

  function onFrame(dtMs: number) {
    if (dtMs > 0 && isFinite(dtMs)) {
      const inst = 1000 / dtMs;
      fpsEwma = fpsEwma ? fpsEwma * 0.9 + inst * 0.1 : inst;
      setFps(Math.round(fpsEwma));
    }
  }

  function dprSize(canvas: HTMLCanvasElement) {
    const dpi = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpi));
    const h = Math.max(1, Math.floor(rect.height * dpi));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function currentProgram(): ProgramSource | null {
    if (backend() === "webgpu") {
      return { kind: "wgsl", source: { code: wgslCode(), vertexEntry: "vs", fragmentEntry: "fs" } };
    }
    return { kind: "gl", source: { vertex: glVertex(), fragment: glFragment() } };
  }

  async function ensureRenderer() {
    if (!canvasRef) return;
    if (renderer) return;
    try {
      renderer = await createRenderer(backend(), canvasRef);
      renderer.setFrameCallback(onFrame);
      renderer.setTimeScale(timeScale());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  function createFreshCanvas(): HTMLCanvasElement | null {
    if (!canvasContainerRef) return null;
    // 清空容器并创建新的 canvas，避免重复上下文
    while (canvasContainerRef.firstChild) {
      canvasContainerRef.removeChild(canvasContainerRef.firstChild);
    }
    const c = document.createElement("canvas");
    c.style.width = "100%";
    c.style.height = "420px";
    canvasContainerRef.appendChild(c);
    // 尺寸与鼠标
    dprSize(c);
    c.addEventListener("pointermove", (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.height - (e.clientY - rect.top);
      renderer?.setMouse(x, y);
    });
    return c;
  }

  async function compileAndRun() {
    setError("");
    if (!canvasRef) return;
    dprSize(canvasRef);
    await ensureRenderer();
    if (!renderer) return;
    const prog = currentProgram();
    if (!prog) return;
    const res = await renderer.loadProgram(prog);
    if (!res.ok) {
      setError(res.message || "编译失败");
      setIsRunning(false);
      renderer.stop();
      return;
    }
    if (isRunning()) renderer.stop();
    renderer.start();
    setIsRunning(true);
  }

  function scheduleCompile() {
    if (!autoCompile()) return;
    if (compileTimer) cancelAnimationFrame(compileTimer);
    compileTimer = requestAnimationFrame(() => {
      compileTimer = null;
      compileAndRun();
    });
  }

  function onPickDemo(d: DemoItem) {
    setSelectedDemo(d);
    setBackend(d.backend);
    if (d.backend === "webgpu") setWgslCode(d.sourceWGSL ?? "");
    else {
      setGlVertex(d.sourceGL?.vertex ?? "");
      setGlFragment(d.sourceGL?.fragment ?? "");
    }
    // 手动触发一次编译
    scheduleCompile();
  }

  async function reinitForBackend() {
    // 释放旧渲染器并替换 canvas
    try {
      renderer?.stop();
      renderer?.dispose();
    } catch {}
    renderer = null;
    canvasRef = createFreshCanvas() || undefined;
    await ensureRenderer();
    scheduleCompile();
  }

  onMount(() => {
    // 初始化一个 canvas
    canvasRef = createFreshCanvas() || undefined;
    // 默认加载第一个 demo
    const first = DEFAULT_DEMOS[0];
    if (first) onPickDemo(first);

    const onResize = () => canvasRef && dprSize(canvasRef);
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  onCleanup(() => {
    if (compileTimer) cancelAnimationFrame(compileTimer);
    renderer?.stop();
    renderer?.dispose();
  });

  createEffect(() => {
    // 切换后端
    backend();
    reinitForBackend();
  });

  createEffect(() => {
    renderer?.setTimeScale(timeScale());
  });

  function capturePng() {
    if (!canvasRef) return;
    try {
      const url = canvasRef.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `shader-${Date.now()}.png`;
      a.click();
    } catch (e) {
      setError("截图失败: " + String((e as any)?.message ?? e));
    }
  }

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-600">Shader Playground</h1>
        <div class="flex items-center gap-3">
          <label class="text-sm text-gray-700 inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoCompile()}
              onInput={(e) => setAutoCompile((e.target as HTMLInputElement).checked)}
            />
            自动编译
          </label>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-700">速度</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={timeScale()}
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                setTimeScale(isFinite(v) ? v : 1);
              }}
            />
            <span class="w-10 text-right tabular-nums">{timeScale().toFixed(1)}x</span>
          </div>
          <div class="text-sm text-gray-700 tabular-nums">FPS: {fps()}</div>
          <button
            class="px-3 py-1 rounded bg-blue-600 text-white"
            onClick={compileAndRun}
          >
            运行
          </button>
          <button
            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => {
              setIsRunning(false);
              renderer?.stop();
            }}
          >
            停止
          </button>
          <button
            class="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={capturePng}
          >
            截图
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <select
          class="px-2 py-1 rounded border border-gray-200 text-sm"
          value={backend()}
          onInput={(e) => setBackend((e.target as HTMLSelectElement).value as Backend)}
        >
          <option value="webgl">WebGL (GLSL ES 1.0)</option>
          <option value="webgl2">WebGL2 (GLSL ES 3.0)</option>
          <option value="webgpu">WebGPU (WGSL)</option>
        </select>

        <div class="flex items-center gap-2">
          {DEFAULT_DEMOS.map((d: DemoItem) => (
            <button
              class="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
              onClick={() => onPickDemo(d)}
            >
              {d.title}
            </button>
          ))}
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <Show when={backend() !== "webgpu"} fallback={
            <>
              <label class="text-sm text-gray-600">WGSL</label>
              <textarea
                class="w-full h-80 p-2 rounded border border-gray-200 font-mono text-sm"
                value={wgslCode()}
                onInput={(e) => {
                  setWgslCode((e.target as HTMLTextAreaElement).value);
                  scheduleCompile();
                }}
              />
            </>
          }>
            <label class="text-sm text-gray-600">GLSL 顶点着色器</label>
            <textarea
              class="w-full h-36 p-2 rounded border border-gray-200 font-mono text-sm"
              value={glVertex()}
              onInput={(e) => {
                setGlVertex((e.target as HTMLTextAreaElement).value);
                scheduleCompile();
              }}
            />
            <label class="text-sm text-gray-600">GLSL 片元着色器</label>
            <textarea
              class="w-full h-44 p-2 rounded border border-gray-200 font-mono text-sm"
              value={glFragment()}
              onInput={(e) => {
                setGlFragment((e.target as HTMLTextAreaElement).value);
                scheduleCompile();
              }}
            />
          </Show>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-gray-600">画布</label>
          <div class="border rounded bg-white overflow-hidden">
            <div ref={canvasContainerRef} class="w-full" style={{ height: "420px" }} />
          </div>

          <Show when={!!error()}>
            <div class="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-sm whitespace-pre-wrap">
              {error()}
            </div>
          </Show>
          <Show when={backend() !== "webgpu"}>
            <div class="mt-2">
              <label class="text-sm text-gray-600">WebGL 常用内建/Uniform 参考</label>
              <div class="overflow-auto border rounded">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="text-left px-2 py-1">名称</th>
                      <th class="text-left px-2 py-1">类型</th>
                      <th class="text-left px-2 py-1">阶段</th>
                      <th class="text-left px-2 py-1">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEBGL_REF_ITEMS.filter((it) => {
                      const ver = it.version;
                      if (ver === "自定义" || ver === "两者") return true;
                      if (backend() === "webgl" && ver === "WebGL1") return true;
                      if (backend() === "webgl2" && ver === "WebGL2") return true;
                      return false;
                    }).map((it) => (
                      <tr class="border-t">
                        <td class="px-2 py-1 font-mono">
                          <span class={it.deprecated ? "line-through text-gray-500" : ""}>{it.name}</span>
                        </td>
                        <td class="px-2 py-1 font-mono text-gray-700">{it.type}</td>
                        <td class="px-2 py-1 text-gray-700">{it.stage}</td>
                        <td class="px-2 py-1 whitespace-pre-wrap">
                          {it.description}
                          <Show when={!!it.note}>
                            <div class="text-xs text-gray-500 mt-1 whitespace-pre">{it.note}</div>
                          </Show>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
          <div class="mt-2">
            <label class="text-sm text-gray-600">场景内置函数参考（按后端）</label>
            <div class="overflow-auto border rounded">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left px-2 py-1">名称</th>
                    <th class="text-left px-2 py-1">类别</th>
                    <th class="text-left px-2 py-1">签名</th>
                    <th class="text-left px-2 py-1">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {SCENE_FUNC_ITEMS.map((it) => {
                    const sig = backend() === "webgpu" ? it.signatureWGSL : it.signatureGL;
                    if (!sig) return null;
                    return (
                      <tr class="border-t">
                        <td class="px-2 py-1 font-mono">{it.name}</td>
                        <td class="px-2 py-1 text-gray-700">{it.category}</td>
                        <td class="px-2 py-1 font-mono whitespace-pre">{sig}</td>
                        <td class="px-2 py-1 whitespace-pre-wrap">{it.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


