import { parseGif } from "../../model/parse/parser";
import { createSignal, Show, For } from "solid-js";
import { renderDisplay } from "../../model/display/renderer";
import { gif_ds } from "../../model/app/gif/display";
import { register_gif } from "../../model/app/gif/register";

register_gif();

const AnyViewPage = () => {
  const [result, setResult] = createSignal<any>(null);
  const [fileName, setFileName] = createSignal<string>("");

  const onFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const parsed = parseGif(buf);
      console.log("[AnyView] GIF 解析结果:", parsed);
      setResult(parsed);
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
      <Show when={result()}>{renderDisplay(gif_ds, result())}</Show>
    </div>
  );
};

export default AnyViewPage;
