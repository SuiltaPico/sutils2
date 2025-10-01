import type { IRenderer, LoadResult, ProgramSource } from "./types";

async function getDevice(canvas: HTMLCanvasElement) {
  if (!("gpu" in navigator)) throw new Error("当前浏览器不支持 WebGPU");
  const adapter = await (navigator as any).gpu.requestAdapter();
  if (!adapter) throw new Error("未找到 WebGPU 适配器");
  const device = await adapter.requestDevice();
  const context = (canvas.getContext("webgpu") as GPUCanvasContext) || null;
  if (!context) throw new Error("无法获取 WebGPU 上下文");
  const format = (navigator as any).gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });
  return { device, context, format } as const;
}

export class WebGpuRenderer implements IRenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private pipeline: GPURenderPipeline | null = null;
  private raf: number | null = null;
  private startMs = performance.now();
  private mouse = { x: 0, y: 0 };
  private bindGroup: GPUBindGroup | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private entries: { vertex: string; fragment: string } | null = null;
  private timeScale = 1;
  private frameCb: ((dtMs: number) => void) | null = null;
  private lastMs = performance.now();

  constructor(private canvas: HTMLCanvasElement) {}

  private async ensureContext(canvas: HTMLCanvasElement) {
    if (this.device) return;
    const { device, context, format } = await getDevice(canvas);
    this.device = device;
    this.context = context;
    this.format = format;
  }

  async loadProgram(src: ProgramSource): Promise<LoadResult> {
    try {
      if (src.kind !== "wgsl") return { ok: false, message: "需要 WGSL 程序" };
      const c = this.canvas;
      if (!c) throw new Error("Canvas 未就绪");
      await this.ensureContext(c);
      const code = src.source.code;
      const module = this.device.createShaderModule({ code });
      // 延迟 entry name 记录，管线创建时使用
      this.entries = { vertex: src.source.vertexEntry, fragment: src.source.fragmentEntry };
      // uniforms：时间/分辨率/鼠标
      this.uniformBuffer?.destroy?.();
      this.uniformBuffer = this.device.createBuffer({
        size: 4 * 4, // vec4<f32>
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
        ],
      });
      const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
      this.pipeline = this.device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: this.entries.vertex },
        fragment: { module, entryPoint: this.entries.fragment, targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list" },
      });
      this.bindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e) };
    }
  }

  start(): void {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!this.pipeline || !this.device || !this.context) return;
      const now = performance.now();
      const dt = now - this.lastMs;
      this.lastMs = now;
      if (this.frameCb) this.frameCb(dt);
      const canvas = this.context.canvas as HTMLCanvasElement;
      const w = canvas.width;
      const h = canvas.height;
      const t = ((now - this.startMs) * 0.001) * Math.max(0, this.timeScale);
      const u32 = new Float32Array([t, w, h, this.mouse.x]);
      this.device.queue.writeBuffer(this.uniformBuffer!, 0, u32.buffer);

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.98, g: 0.98, b: 1.0, a: 1 },
          },
        ],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    };
    this.stop();
    this.startMs = performance.now();
  this.lastMs = this.startMs;
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  setMouse(x: number, y: number): void {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  dispose(): void {
    try {
      this.uniformBuffer?.destroy?.();
      this.uniformBuffer = null;
      this.pipeline = null;
      this.bindGroup = null;
    } catch {}
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  setFrameCallback(cb: ((dtMs: number) => void) | null): void {
    this.frameCb = cb ?? null;
  }
}


