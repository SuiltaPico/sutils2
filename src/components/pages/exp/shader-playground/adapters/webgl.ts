import type { IRenderer, LoadResult, ProgramSource } from "./types";

function createContext(canvas: HTMLCanvasElement, useWebGL2: boolean) {
  const attribs: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  };
  if (useWebGL2) {
    return canvas.getContext(
      "webgl2",
      attribs
    ) as WebGL2RenderingContext | null;
  }
  return (canvas.getContext("webgl", attribs) ||
    canvas.getContext(
      "experimental-webgl",
      attribs
    )) as WebGLRenderingContext | null;
}

function compileShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!ok) {
    const info = gl.getShaderInfoLog(shader) || "";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function linkProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram 失败");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (!ok) {
    const info = gl.getProgramInfoLog(prog) || "";
    gl.deleteProgram(prog);
    throw new Error(info);
  }
  return prog;
}

export class WebGlRenderer implements IRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private raf: number | null = null;
  private startTimeMs = performance.now();
  private mouseX = 0;
  private mouseY = 0;
  private isWebGL2: boolean;
  private timeScale = 1;
  private lastMs = performance.now();
  private frameCb: ((dtMs: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, useWebGL2: boolean) {
    const ctx = createContext(canvas, useWebGL2);
    if (!ctx) throw new Error(useWebGL2 ? "WebGL2 不可用" : "WebGL 不可用");
    this.gl = ctx;
    this.isWebGL2 = !!(ctx as WebGL2RenderingContext).createVertexArray;
    this.initBuffers();
  }

  private initBuffers() {
    const gl = this.gl as WebGL2RenderingContext;
    // 全屏三角形
    const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
    if (this.isWebGL2) {
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
    }
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  async loadProgram(src: ProgramSource): Promise<LoadResult> {
    try {
      if (src.kind !== "gl") return { ok: false, message: "需要 GLSL 程序" };
      const gl = this.gl as WebGL2RenderingContext;
      const vs = compileShader(gl, gl.VERTEX_SHADER, src.source.vertex)!;
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, src.source.fragment)!;
      const prog = linkProgram(gl, vs, fs);
      // 删除旧
      if (this.program) gl.deleteProgram(this.program);
      this.program = prog;
      const loc = gl.getAttribLocation(prog, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(loc);
      if (this.isWebGL2 && this.vao) gl.bindVertexArray(this.vao);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e) };
    }
  }

  start(): void {
    const gl = this.gl as WebGL2RenderingContext;
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      if (!this.program) return;
      const now = performance.now();
      const dt = now - this.lastMs;
      this.lastMs = now;
      if (this.frameCb) this.frameCb(dt);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.useProgram(this.program);
      // 常用 uniforms：时间/分辨率/鼠标
      const uTime = gl.getUniformLocation(this.program, "u_time");
      const uRes = gl.getUniformLocation(this.program, "u_resolution");
      const uMouse = gl.getUniformLocation(this.program, "u_mouse");
      const t = (now - this.startTimeMs) * 0.001 * Math.max(0, this.timeScale);
      if (uTime) gl.uniform1f(uTime, t);
      if (uRes) gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height);
      if (uMouse) gl.uniform2f(uMouse, this.mouseX, this.mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    this.stop();
    this.startTimeMs = performance.now();
    this.lastMs = this.startTimeMs;
    this.raf = requestAnimationFrame(draw);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  setMouse(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  dispose(): void {
    const gl = this.gl as WebGL2RenderingContext;
    try {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.isWebGL2 && this.vao) gl.deleteVertexArray(this.vao);
    } catch {}
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  setFrameCallback(cb: ((dtMs: number) => void) | null): void {
    this.frameCb = cb ?? null;
  }
}
