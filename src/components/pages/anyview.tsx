import { createSignal, Show } from "solid-js";
import { renderDisplay } from "../../model/display/renderer";
import { gif_ds } from "../../model/app/gif/display";
import { register_gif } from "../../model/app/gif/register";
import { png_ds } from "../../model/app/png/display";
import { register_png } from "../../model/app/png/register";
import { jpeg_ds } from "../../model/app/jpeg/display";
import { register_jpeg } from "../../model/app/jpeg/register";
import { wav_ds } from "../../model/app/wav/display";
import { register_wav } from "../../model/app/wav/register";
import { mp4_ds } from "../../model/app/mp4/display";
import { register_mp4 } from "../../model/app/mp4/register";
import { mkv_ds } from "../../model/app/mkv/display";
import { register_mkv } from "../../model/app/mkv/register";
import { mkv_ps } from "../../model/app/mkv/parse";
import { parseWithSchema } from "../../model/parse/parser";
import { gif_ps } from "../../model/app/gif/parse";
import { png_ps } from "../../model/app/png/parse";
import { jpeg_ps } from "../../model/app/jpeg/parse";
import { wav_ps } from "../../model/app/wav/parse";
import { mp4_ps } from "../../model/app/mp4/parse";
import { pdf_ds } from "../../model/app/pdf/display";
import { register_pdf } from "../../model/app/pdf/register";
import { pdf_ps } from "../../model/app/pdf/parse";
import { buildPdfModel } from "../../model/app/pdf/syntax";

register_gif();
register_png();
register_jpeg();
register_wav();
register_mp4();
register_mkv();
register_pdf();

export function parseGif(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, gif_ps);
}

export function parsePng(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, png_ps);
}

export function parseJpeg(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, jpeg_ps);
}

export function parseWav(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, wav_ps);
}

export function parseMp4(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, mp4_ps);
}

const AnyViewPage = () => {
  const [result, setResult] = createSignal<any>(null);
  const [schema, setSchema] = createSignal<any>(null);
  const [fileName, setFileName] = createSignal<string>("");
  const [isDragging, setIsDragging] = createSignal<boolean>(false);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<string | null>(null);

  let fileInputRef: HTMLInputElement | undefined;

  const parseBufferByMagic = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    const isPdf =
      bytes.length >= 5 &&
      bytes[0] === 0x25 && // '%'
      bytes[1] === 0x50 && // 'P'
      bytes[2] === 0x44 && // 'D'
      bytes[3] === 0x46 && // 'F'
      bytes[4] === 0x2d; // '-'
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
    const isWav =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45;
    const isMp4 =
      bytes.length >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70;
    const isEbml =
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3;

    if (isPdf) {
      const lexicalResult = parseWithSchema(buf, pdf_ps);
      console.log("[AnyView] PDF Lexical Analysis:", lexicalResult);
      const syntaxModel = buildPdfModel(lexicalResult, buf);
      console.log("[AnyView] PDF Syntax Model:", syntaxModel);
      setSchema(pdf_ds);
      setResult(syntaxModel);
      return;
    }
    if (isPng) {
      const parsed = parsePng(buf);
      console.log("[AnyView] PNG 解析结果:", parsed);
      setSchema(png_ds);
      setResult(parsed);
      return;
    }
    if (isGif) {
      const parsed = parseGif(buf);
      console.log("[AnyView] GIF 解析结果:", parsed);
      setSchema(gif_ds);
      setResult(parsed);
      return;
    }
    if (isJpeg) {
      const parsed = parseJpeg(buf);
      console.log("[AnyView] JPEG 解析结果:", parsed);
      setSchema(jpeg_ds);
      setResult(parsed);
      return;
    }
    if (isWav) {
      const parsed = parseWav(buf);
      console.log("[AnyView] WAV 解析结果:", parsed);
      setSchema(wav_ds);
      setResult(parsed);
      return;
    }
    if (isMp4) {
      const parsed = parseMp4(buf);
      console.log("[AnyView] MP4 解析结果:", parsed);
      setSchema(mp4_ds);
      setResult(parsed);
      return;
    }
    if (isEbml) {
      const parsed = parseWithSchema(buf, mkv_ps);
      console.log("[AnyView] WebM 解析结果:", parsed);
      setSchema(mkv_ds);
      setResult(parsed);
      return;
    }
    throw new Error("不支持的文件类型");
  };

  const loadAndParse = async (file: File) => {
    try {
      setError(null);
      setIsLoading(true);
      setResult(null);
      setSchema(null);
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      parseBufferByMagic(buf);
    } catch (err: any) {
      console.error("[AnyView] 解析失败:", err);
      setError(err?.message || "解析失败");
    } finally {
      setIsLoading(false);
    }
  };

  const onFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    await loadAndParse(file);
  };

  return (
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: 1080px; margin: 0 auto;">
      <div style="display: flex; align-items: baseline; justify-content: space-between;">
        <div>
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">AnyView 文件查看器</h2>
          <div style="opacity: 0.7; font-size: 12px;">支持 PDF / PNG / GIF / JPEG / WAV / MP4 / WebM / MKV</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSchema(null);
            setFileName("");
            setError(null);
          }}
          style="padding: 6px 10px; font-size: 12px; border: 1px solid #ddd; background: #fafafa; border-radius: 6px; cursor: pointer;"
        >重置</button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) {
            void loadAndParse(file);
          }
        }}
        style={`${
          isDragging()
            ? "background: #f4f8ff; border: 2px dashed #74a2ff;"
            : "background: #fbfbfb; border: 2px dashed #dcdcdc;"
        } padding: 16px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px;`}
      >
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 14px; font-weight: 600;">拖拽文件到此处，或点击右侧按钮选择</div>
          <div style="opacity: 0.7; font-size: 12px;">本地解析，文件不会上传服务器</div>
          <Show when={fileName()}>
            <div style="font-size: 12px; opacity: 0.9;">已选择：{fileName()}</div>
          </Show>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input
            ref={(el: HTMLInputElement) => (fileInputRef = el)}
            type="file"
            onChange={onFileChange}
            accept=".pdf,.png,.gif,.jpg,.jpeg,.wav,.mp4,.m4a,.webm,.mkv"
            style="display: none;"
          />
          <button
            type="button"
            onClick={() => fileInputRef?.click()}
            style="padding: 8px 12px; font-size: 12px; border: 1px solid #307cff; background: #3b82f6; color: white; border-radius: 8px; cursor: pointer;"
          >选择文件</button>
        </div>
      </div>

      <Show when={isLoading()}>
        <div style="padding: 10px 12px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; font-size: 12px;">解析中，请稍候...</div>
      </Show>
      <Show when={error()}>
        <div style="padding: 10px 12px; background: #fff1f0; border: 1px solid #ffa39e; border-radius: 8px; font-size: 12px; color: #cf1322;">{error()}</div>
      </Show>

      <Show when={result()}>
        <div style="border: 1px solid #eee; border-radius: 10px; padding: 12px; background: white;">
          {renderDisplay(schema() || gif_ds, result())}
        </div>
      </Show>
    </div>
  );
};

export default AnyViewPage;
