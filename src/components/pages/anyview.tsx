import { parseGif, parsePng, parseJpeg } from "../../model/parse/parser";
import { createSignal, Show, For } from "solid-js";
import { renderDisplay } from "../../model/display/renderer";
import { gif_ds } from "../../model/app/gif/display";
import { register_gif } from "../../model/app/gif/register";
import { png_ds } from "../../model/app/png/display";
import { register_png } from "../../model/app/png/register";
import { jpeg_ds } from "../../model/app/jpeg/display";
import { register_jpeg } from "../../model/app/jpeg/register";

register_gif();
register_png();
register_jpeg();

const AnyViewPage = () => {
  const [result, setResult] = createSignal<any>(null);
  const [schema, setSchema] = createSignal<any>(null);
  const [fileName, setFileName] = createSignal<string>("");

  const onFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // 简单魔数识别：PNG: 89 50 4E 47 0D 0A 1A 0A; GIF: 47 49 46 38; JPEG: FF D8
      const isPng =
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a;
      const isGif =
        bytes.length >= 4 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38;
      const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
      if (isPng) {
        const parsed = parsePng(buf);
        console.log("[AnyView] PNG 解析结果:", parsed);
        setSchema(png_ds);
        setResult(parsed);
      } else if (isGif) {
        const parsed = parseGif(buf);
        console.log("[AnyView] GIF 解析结果:", parsed);
        setSchema(gif_ds);
        setResult(parsed);
      } else if (isJpeg) {
        const parsed = parseJpeg(buf);
        console.log("[AnyView] JPEG 解析结果:", parsed);
        setSchema(jpeg_ds);
        setResult(parsed);
      } else {
        throw new Error("不支持的文件类型");
      }
    } catch (err) {
      console.error("[AnyView] 解析失败:", err);
    }
  };

  return (
    <div style="padding: 12px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="file" onChange={onFileChange} />
        <Show when={fileName()}>
          <span style="opacity: 0.7;">{fileName()}</span>
        </Show>
      </div>
      <Show when={result()}>{renderDisplay(schema() || gif_ds, result())}</Show>
    </div>
  );
};

export default AnyViewPage;
