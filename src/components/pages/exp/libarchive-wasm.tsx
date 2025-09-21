import { createSignal, Show, For } from "solid-js";
import { ArchiveReader, libarchiveWasm } from "libarchive-wasm";
import libarchiveWasmFileUrl from "libarchive-wasm/dist/libarchive.wasm?url";

type EntryResult = {
  pathname: string;
  size: number;
  data?: string;
};

export default function LibarchiveWasmDemo() {
  const [results, setResults] = createSignal<EntryResult[]>([]);
  const [error, setError] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [passphrase, setPassphrase] = createSignal<string>("");

  const handleUpload = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    setResults([]);
    setLoading(true);
    let reader: ArchiveReader | null = null;
    try {
      const data = new Int8Array(await file.arrayBuffer());
      const mod = await libarchiveWasm({
        locateFile: (file: string, prefix: string) => {
          return libarchiveWasmFileUrl;
        },
      });
      reader = new ArchiveReader(mod, data, passphrase() || undefined);
      const collected: EntryResult[] = [];
      for (const entry of reader.entries()) {
        const pathname = entry.getPathname();
        const size = entry.getSize();
        const result: EntryResult = { pathname, size };
        if (pathname.toLowerCase().endsWith(".md")) {
          const bytes = entry.readData();
          if (bytes) {
            result.data = new TextDecoder().decode(bytes);
          }
        }
        collected.push(result);
      }
      setResults(collected);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "解析归档失败");
    } finally {
      try {
        reader?.free();
      } catch {}
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setError("");
  };

  return (
    <div class="font-sans max-w-4xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">libarchive-wasm 归档浏览</h1>
      <p class="text-gray-600 mb-4">
        上传任意压缩包/归档，解析条目并在浏览器中查看 .md 内容。
      </p>

      <div class="flex flex-col gap-3 mb-5">
        <div class="flex items-center gap-3">
          <input
            id="upload"
            type="file"
            onChange={handleUpload}
            class="block"
          />
          <input
            type="password"
            placeholder="可选：口令（加密归档）"
            value={passphrase()}
            onInput={(e) => setPassphrase(e.currentTarget.value)}
            class="px-2 py-1 border rounded-md"
          />
          <button
            onClick={handleClear}
            class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer"
          >
            清空
          </button>
        </div>
        <Show when={loading()}>
          <div class="text-blue-600">解析中...</div>
        </Show>
        <Show when={error()}>
          <pre class="bg-red-100 text-red-800 p-2 rounded whitespace-pre-wrap">
            {error()}
          </pre>
        </Show>
      </div>

      <Show when={results().length > 0}>
        <div class="mt-2 space-y-3">
          <For each={results()}>
            {(item) => (
              <div class="border rounded-md p-3 bg-gray-50">
                <div class="font-mono text-sm break-all">
                  <span class="font-semibold">{item.pathname}</span>
                </div>
                <div class="text-gray-600 text-sm">大小：{item.size} B</div>
                <Show when={item.data}>
                  <div class="mt-2">
                    <div class="text-sm font-semibold mb-1">预览 (.md)</div>
                    <pre class="bg-white p-2 rounded border overflow-auto max-h-64 whitespace-pre-wrap">
                      {item.data}
                    </pre>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
