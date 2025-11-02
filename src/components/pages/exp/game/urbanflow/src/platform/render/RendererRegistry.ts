import { IRenderer } from "./IRenderer";
import { createCanvas2DRenderer } from "./adapters/canvas2d/renderer";

export type Backend = "canvas2d" | "webgpu";

export function createRenderer(backend: Backend): IRenderer {
  switch (backend) {
    case "canvas2d":
      return createCanvas2DRenderer();
    default:
      return createCanvas2DRenderer();
  }
}

export { type IRenderer } from "./IRenderer";


