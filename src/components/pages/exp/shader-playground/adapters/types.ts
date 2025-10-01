export type Backend = "webgl" | "webgl2" | "webgpu";

export type ProgramSource =
  | { kind: "gl"; source: { vertex: string; fragment: string } }
  | { kind: "wgsl"; source: { code: string; vertexEntry: string; fragmentEntry: string } };

export type LoadResult = { ok: true } | { ok: false; message?: string };

export interface IRenderer {
  loadProgram(src: ProgramSource): Promise<LoadResult>;
  start(): void;
  stop(): void;
  setMouse(x: number, y: number): void;
  dispose(): void;
  setTimeScale(scale: number): void;
  setFrameCallback(cb: ((dtMs: number) => void) | null): void;
}

export async function createRenderer(backend: Backend, canvas: HTMLCanvasElement): Promise<IRenderer> {
  if (backend === "webgpu") {
    const mod = await import("./webgpu.ts");
    return new mod.WebGpuRenderer(canvas);
    
  }
  const mod = await import("./webgl.ts");
  const gl2 = backend === "webgl2";
  return new mod.WebGlRenderer(canvas, gl2);
}


