import { parseGif } from "../../model/parser";
import { createSignal, Show, For } from "solid-js";

function isTypedArray(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

// 我们的 replacer 函数
function skipTypedArrayReplacer(_key: string, value: unknown) {
  if (isTypedArray(value)) {
    // 如果值是 TypedArray，返回 undefined，这个键值对就会被跳过
    return undefined;
  }
  // 否则，返回原始值
  return value as any;
}

const AnyViewPage = () => {
  const [result, setResult] = createSignal<any>(null);
  const [jsonText, setJsonText] = createSignal<string>("");
  const [fileName, setFileName] = createSignal<string>("");

  const onFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const result = parseGif(buf);
      console.log("[AnyView] GIF 解析结果:", result);
      const jsonString = JSON.stringify(result, skipTypedArrayReplacer, 2);
      setResult(result);
      setJsonText(jsonString ?? "");
      console.log(jsonString);
    } catch (err) {
      console.error("[AnyView] 解析失败:", err);
    }
  };

  const summarize = (res: any) => {
    if (!res) return null;
    const blocks = Array.isArray(res.blocks) ? res.blocks : [];
    const images = blocks.filter((b: any) => b.block_introducer === 0x2c);
    const extensions = blocks.filter((b: any) => b.block_introducer === 0x21);
    const appExt = extensions.filter((b: any) => b.extension_label === 0xff);
    const gceExt = extensions.filter((b: any) => b.extension_label === 0xf9);
    const loopExt = appExt.find((b: any) => typeof b.loop_count === "number");
    return {
      version: res.version,
      width: res.width,
      height: res.height,
      hasGlobalCT: !!res.global_color_table_flag,
      globalCTSize: Array.isArray(res.color_table) ? res.color_table.length : 0,
      blocksCount: blocks.length,
      framesCount: images.length,
      gceCount: gceExt.length,
      appExtCount: appExt.length,
      loopCount: loopExt?.loop_count as number | undefined,
    };
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText());
      console.log("JSON 已复制到剪贴板");
    } catch (e) {
      console.error("复制失败", e);
    }
  };

  return (
    <div style="padding: 12px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="file" accept=".gif,image/gif" onChange={onFileChange} />
        <Show when={fileName()}>
          <span style="opacity: 0.7;">{fileName()}</span>
        </Show>
      </div>

      <Show when={result()}>
        {(res) => {
          const sum = summarize(res);
          return (
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
              <div style="border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">
                <div style="font-weight: 600; margin-bottom: 8px;">摘要</div>
                <div>版本: {sum?.version}</div>
                <div>尺寸: {sum?.width} x {sum?.height}</div>
                <div>全局调色板: {sum?.hasGlobalCT ? "是" : "否"}</div>
                <div>全局调色板颜色数: {sum?.globalCTSize}</div>
                <div>块总数: {sum?.blocksCount}</div>
                <div>帧数(Image Blocks): {sum?.framesCount}</div>
                <div>GCE 数: {sum?.gceCount}</div>
                <div>AppExt 数: {sum?.appExtCount}</div>
                <div>动画循环: {sum?.loopCount === 0 ? "无限" : (sum?.loopCount ?? "-")}</div>
              </div>

              <div style="border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px; max-height: 320px; overflow: auto;">
                <div style="font-weight: 600; margin-bottom: 8px;">帧列表</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <For each={(res as any).blocks?.filter((b: any) => b.block_introducer === 0x2c) ?? []}>
                    {(img: any, i) => {
                      const subCount = Array.isArray(img.sub_blocks) ? img.sub_blocks.length : 0;
                      return (
                        <div style="border: 1px solid #f1f5f9; padding: 8px; border-radius: 6px;">
                          <div>帧 #{i() + 1} - {img.image_width}x{img.image_height}, LZW:{img.lzw_minimum_code_size}, 子块: {subCount}</div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>

              <div style="grid-column: 1 / -1; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <div style="font-weight: 600;">JSON 视图（已隐藏 TypedArray）</div>
                  <button onClick={copyJson} style="border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px; background: white; cursor: pointer;">复制</button>
                </div>
                <details open>
                  <summary style="cursor: pointer; user-select: none;">展开 / 折叠</summary>
                  <pre style="white-space: pre-wrap; word-break: break-all; font-size: 12px; margin-top: 8px;">{jsonText()}</pre>
                </details>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
};

export default AnyViewPage;
