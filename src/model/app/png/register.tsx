import { registerFunction } from "../../display/renderer";

export function register_png() {
  // 解析 PNG tEXt 数据块：Latin-1 编码，keyword\0text
  registerFunction("png::parse_text_chunk", (raw: Uint8Array | number[]) => {
    let data: Uint8Array;
    if (raw instanceof Uint8Array) data = raw;
    else if (Array.isArray(raw)) data = Uint8Array.from(raw);
    else data = new Uint8Array(0);
    const zero = data.indexOf(0);
    const dec = new TextDecoder("latin1");
    if (zero < 0) {
      // 没有分隔符，整体当作文本
      return { keyword: "", text: dec.decode(data) };
    }
    const kw = data.slice(0, zero);
    const txt = data.slice(zero + 1);
    return { keyword: dec.decode(kw), text: dec.decode(txt) };
  });

  // 从 root.chunks 中找到第一个 IHDR，取其字段
  registerFunction(
    "png::get_ihdr_field",
    (root: any, field: "color_type" | "bit_depth") => {
      const chunks: any[] = root?.chunks || [];
      const ihdr = chunks.find((c) => c?.type === "IHDR");
      return ihdr ? ihdr[field] : undefined;
    }
  );

  // 解析 sBIT：根据 IHDR 的 color_type/bit_depth 决定通道个数与含义
  registerFunction("png::parse_sbit", (root: any, raw: Uint8Array | number[]) => {
    let data: Uint8Array;
    if (raw instanceof Uint8Array) data = raw;
    else if (Array.isArray(raw)) data = Uint8Array.from(raw);
    else data = new Uint8Array(0);
    const colorType = Number(
      (root && (root as any).chunks && (root as any))
        ? (root as any).chunks.find((c: any) => c?.type === "IHDR")?.color_type
        : undefined
    );
    // 通道顺序：
    // 0 灰度: G
    // 2 真彩: R,G,B
    // 3 索引: 调色板中 R,G,B（但 sBIT 给出调色板条目的有效位数）
    // 4 灰度+Alpha: G, A
    // 6 真彩+Alpha: R,G,B,A
    const view = Array.from(data);
    const pick = (n: number) => view.slice(0, n);
    if (colorType === 0) {
      const [g] = pick(1);
      return { gray: g };
    }
    if (colorType === 2) {
      const [r, g, b] = pick(3);
      return { r, g, b };
    }
    if (colorType === 3) {
      const [r, g, b] = pick(3);
      return { palette: { r, g, b } };
    }
    if (colorType === 4) {
      const [g, a] = pick(2);
      return { gray: g, a };
    }
    if (colorType === 6) {
      const [r, g, b, a] = pick(4);
      return { r, g, b, a };
    }
    return { raw: view };
  });
}


