export type DrawContext2D = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpi: number;
};

export type LayerDrawFn = (dc: DrawContext2D) => void;

export interface IRenderer {
  mount(container: HTMLElement, opts: { dpi: number }): void;
  registerLayer(id: string, draw: LayerDrawFn): void;
  setLayerVisible(id: string, visible: boolean): void;
  setOrder(id: string, order: number): void;
  requestFrame(): void;
  onStats(listener: (stats: { rendererMs: number; layerCount: number }) => void): void;
  dispose(): void;
}


