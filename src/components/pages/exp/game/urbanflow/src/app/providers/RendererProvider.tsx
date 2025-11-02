import { JSX, onCleanup, onMount } from "solid-js";
import { createSignal } from "solid-js";
import { createRenderer, IRenderer } from "../../platform/render/RendererRegistry";

type Props = {
  graphics: { backend: "canvas2d" | "webgpu" };
  onReady?: (renderer: IRenderer) => void;
  onContainerReady?: (container: HTMLDivElement) => void;
};

export function RendererProvider(props: Props): JSX.Element {
  let container!: HTMLDivElement;
  const [renderer, setRenderer] = createSignal<IRenderer | null>(null);

  onMount(() => {
    const r = createRenderer(props.graphics.backend);
    setRenderer(r);
    // 允许手势缩放/拖拽
    container.style.touchAction = "none";
    r.mount(container, { dpi: devicePixelRatio || 1 });
    props.onReady?.(r);
    props.onContainerReady?.(container);
  });

  onCleanup(() => {
    renderer()?.dispose();
  });

  return (
    <div ref={container} class="w-full h-full" />
  );
}


