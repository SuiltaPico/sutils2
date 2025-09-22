import { createEffect, onMount } from "solid-js";
import {
  evalExpression,
  evalTerm,
  registerDisplayNodeRenderer,
  registerFunction,
  type EvalContext,
} from "../../display/renderer";
import {
  concatSubBlocks,
  decodeGifLZW,
  deinterlacePixels,
  mapPaletteToRgba,
} from "./utils";

export function register_gif() {
  registerFunction(
    "gif::find_gce_prop",
    (blocks: any[], current_index: number, prop: string) => {
      if (!Array.isArray(blocks) || typeof current_index !== "number") {
        return undefined;
      }
      for (let i = current_index - 1; i >= 0; i--) {
        const block = blocks[i];
        if (
          block?.block_introducer === 0x21 &&
          block?.extension_label === 0xf9
        ) {
          // Found the preceding Graphic Control Extension
          return block[prop];
        }
      }
      return undefined; // No preceding GCE found
    }
  );

  // 注册 gif_image_map 节点渲染器（只注册一次）
  registerDisplayNodeRenderer(
    "gif_image_map",
    (node: any, ctx: EvalContext) => {
      const evalProv = (t: any) =>
        t?.type === "expr" ? evalExpression(ctx, t.expr) : evalTerm(ctx, t);
      const width = evalProv(node.width_provider) ?? 0;
      const height = evalProv(node.height_provider) ?? 0;
      const interlace = Boolean(evalProv(node.interlace_provider));
      const minCodeSize = evalProv(node.lzw_min_code_size_provider) ?? 0;
      const subBlocks = evalProv(node.sub_blocks_provider) as any[];
      const palette = evalProv(node.palette_provider) as
        | { r: number; g: number; b: number }[]
        | undefined;
      const transparentIndex = node.transparent_index_provider
        ? evalProv(node.transparent_index_provider)
        : undefined;

      const data = concatSubBlocks(subBlocks);
      let indexPixels: number[] = [];
      try {
        indexPixels = decodeGifLZW(
          Number(minCodeSize),
          data,
          Number(width) * Number(height)
        );
      } catch (e) {
        console.error(e);
        indexPixels = new Array(Number(width) * Number(height)).fill(0);
      }
      const ordered = interlace
        ? deinterlacePixels(indexPixels, Number(width), Number(height))
        : indexPixels;
      const rgba = mapPaletteToRgba(
        ordered,
        palette,
        Number.isFinite(Number(transparentIndex))
          ? Number(transparentIndex)
          : undefined
      );

      let canvasRef: HTMLCanvasElement | undefined;
      const draw = () => {
        if (!canvasRef) return;
        const ctx2d = canvasRef.getContext("2d");
        if (!ctx2d) return;
        const img = new ImageData(rgba, Number(width), Number(height));
        ctx2d.putImageData(img, 0, 0);
      };
      onMount(draw);
      createEffect(draw);
      return (
        <canvas
          class={node.class ?? "border border-gray-200"}
          width={Number(width)}
          height={Number(height)}
          ref={(el) => (canvasRef = el)}
        />
      );
    }
  );
}
