import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";

type FileSystemFileHandleWithKinds = FileSystemFileHandle & { kind: "file" };
type FileSystemDirectoryHandleWithKinds = FileSystemDirectoryHandle & { kind: "directory" };

type EntryNode = {
  name: string;
  kind: "file" | "directory";
  handle: FileSystemFileHandleWithKinds | FileSystemDirectoryHandleWithKinds;
  children?: EntryNode[];
  expanded?: boolean;
  loaded?: boolean;
  parent?: EntryNode | null;
};

async function* iterateDirectory(handle: FileSystemDirectoryHandleWithKinds) {
  // @ts-ignore: iterator types not in lib yet in some TS targets
  for await (const entry of handle.values()) {
    yield entry as FileSystemFileHandleWithKinds | FileSystemDirectoryHandleWithKinds;
  }
}

async function readTextFile(handle: FileSystemFileHandleWithKinds): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

async function readArrayBuffer(handle: FileSystemFileHandleWithKinds): Promise<ArrayBuffer> {
  const file = await handle.getFile();
  return await file.arrayBuffer();
}

function isProbablyText(name: string, mime: string | undefined): boolean {
  const lower = name.toLowerCase();
  if (mime && mime.startsWith("text/")) return true;
  return (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".js") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".css") ||
    lower.endsWith(".html") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml")
  );
}

function isImage(name: string, mime: string | undefined): boolean {
  const lower = name.toLowerCase();
  return (
    (mime && mime.startsWith("image/")) ||
    lower.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/) !== null
  );
}

function bufferToHexPreview(buffer: ArrayBuffer, max = 4096): string {
  const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, max)));
  let out = "";
  const width = 16;
  for (let i = 0; i < bytes.length; i += width) {
    const chunk = bytes.slice(i, i + width);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const ascii = Array.from(chunk)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    out += `${i.toString(16).padStart(8, "0")}  ${hex.padEnd(width * 3 - 1, " ")}  |${ascii}|\n`;
  }
  return out;
}

async function ensurePermission(handle: FileSystemHandle, mode: "read" | "readwrite" = "read") {
  // @ts-ignore: types optional in TS lib
  if ((await (handle as any).queryPermission?.({ mode })) === "granted") return true;
  // @ts-ignore
  const status = await (handle as any).requestPermission?.({ mode });
  return status === "granted";
}

export default function FileBrowser() {
  const [root, setRoot] = createSignal<EntryNode | null>(null);
  const [selected, setSelected] = createSignal<EntryNode | null>(null);
  const [error, setError] = createSignal<string>("");
  const [filter, setFilter] = createSignal<string>("");
  const [textPreview, setTextPreview] = createSignal<string>("");
  const [imageUrl, setImageUrl] = createSignal<string>("");
  const [hexPreview, setHexPreview] = createSignal<string>("");

  let revokeTimer: number | undefined;

  onCleanup(() => {
    if (revokeTimer) clearTimeout(revokeTimer);
    const url = imageUrl();
    if (url) URL.revokeObjectURL(url);
  });

  const breadcrumb = createMemo(() => {
    const node = selected() || root();
    const parts: EntryNode[] = [];
    let cur = node;
    while (cur) {
      parts.unshift(cur);
      cur = cur.parent || null;
    }
    return parts;
  });

  async function pickDirectory() {
    try {
      // @ts-ignore: showDirectoryPicker in modern browsers
      const dir = (await window.showDirectoryPicker?.()) as FileSystemDirectoryHandleWithKinds | undefined;
      if (!dir) return;
      const ok = await ensurePermission(dir, "read");
      if (!ok) {
        setError("未获得读取权限");
        return;
      }
      const node: EntryNode = {
        name: dir.name || "root",
        kind: "directory",
        handle: dir,
        expanded: true,
        loaded: false,
        parent: null,
        children: [],
      };
      setRoot(node);
      await loadChildren(node);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function loadChildren(node: EntryNode) {
    if (node.kind !== "directory") return;
    const dir = node.handle as FileSystemDirectoryHandleWithKinds;
    const children: EntryNode[] = [];
    try {
      for await (const entry of iterateDirectory(dir)) {
        children.push({
          name: entry.name,
          kind: entry.kind,
          handle: entry as any,
          loaded: false,
          expanded: false,
          parent: node,
        });
      }
      // 目录在前，名称排序
      children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children = children;
      node.loaded = true;
      setRoot((r) => ({ ...(r as EntryNode) }));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function toggle(node: EntryNode) {
    if (node.kind === "directory") {
      node.expanded = !node.expanded;
      if (node.expanded && !node.loaded) {
        await loadChildren(node);
      } else {
        setRoot((r) => ({ ...(r as EntryNode) }));
      }
    } else {
      await previewFile(node);
    }
  }

  async function previewFile(node: EntryNode) {
    if (node.kind !== "file") return;
    setSelected(node);
    setTextPreview("");
    setImageUrl("");
    setHexPreview("");

    try {
      const file = await (node.handle as FileSystemFileHandleWithKinds).getFile();
      const mime = file.type || undefined;
      if (isImage(node.name, mime)) {
        const url = URL.createObjectURL(file);
        const old = imageUrl();
        setImageUrl(url);
        if (old && old !== url) URL.revokeObjectURL(old);
        revokeTimer = window.setTimeout(() => {
          URL.revokeObjectURL(url);
          setImageUrl("");
        }, 5 * 60 * 1000);
      } else if (isProbablyText(node.name, mime)) {
        const text = await file.text();
        setTextPreview(text.slice(0, 200_000));
      } else {
        const buf = await file.arrayBuffer();
        setHexPreview(bufferToHexPreview(buf));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  const filteredChildren = (node: EntryNode | null) => {
    if (!node) return [] as EntryNode[];
    const q = filter().trim().toLowerCase();
    if (!q) return node.children || [];
    const matchNode = (n: EntryNode): boolean => n.name.toLowerCase().includes(q);
    return (node.children || []).filter((c) => matchNode(c));
  };

  const renderNode = (node: EntryNode) => {
    return (
      <div class="ml-2">
        <div class="flex items-center gap-1 cursor-pointer select-none" onClick={() => toggle(node)}>
          <span class="w-4 text-center">
            {node.kind === "directory" ? (node.expanded ? "▾" : "▸") : "·"}
          </span>
          <span class={node.kind === "directory" ? "text-yellow-700" : "text-gray-800"}>{node.name}</span>
        </div>
        <Show when={node.kind === "directory" && node.expanded}>
          <div class="ml-4">
            <Show when={node.loaded} fallback={<div class="text-gray-500 text-sm">加载中...</div>}>
              <For each={filteredChildren(node)}>{(child) => renderNode(child)}</For>
            </Show>
          </div>
        </Show>
      </div>
    );
  };

  return (
    <div class="p-4 max-w-[1400px] mx-auto">
      <h1 class="text-2xl font-bold mb-2">本地文件浏览器（实验）</h1>
      <p class="text-gray-600 mb-3">基于 File System Access API，仅在受支持的浏览器使用。数据仅在本地读取，不会上传。</p>

      <div class="flex items-center gap-2 mb-3">
        <button class="px-3 py-2 bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600" onClick={pickDirectory}>
          选择文件夹
        </button>
        <input
          class="px-2 py-1 border rounded flex-1"
          placeholder="过滤文件名（当前层级）"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
      </div>

      <Show when={error()}>
        <div class="mb-3 text-red-700 bg-red-100 p-2 rounded">{error()}</div>
      </Show>

      <div class="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-4">
        <div class="border rounded p-2 overflow-auto max-h-[70vh]">
          <Show when={root()} fallback={<div class="text-gray-500">请先选择一个文件夹</div>}>
            {(r) => (
              <div>
                <div class="font-semibold mb-2">{r().name}</div>
                {renderNode(r())}
              </div>
            )}
          </Show>
        </div>
        <div class="border rounded p-2 overflow-auto max-h-[70vh]">
          <div class="mb-2 text-sm text-gray-600">
            <Show when={breadcrumb().length > 0}>
              <span>路径：</span>
              <For each={breadcrumb()}>
                {(n, i) => (
                  <>
                    <span class={n.kind === "directory" ? "text-yellow-700" : "text-gray-800"}>{n.name}</span>
                    <Show when={i() < breadcrumb().length - 1}> <span>/</span> </Show>
                  </>
                )}
              </For>
            </Show>
          </div>

          <Show when={imageUrl()}>
            <div class="overflow-auto">
              <img src={imageUrl()} alt="预览" class="max-w-full max-h-[65vh] object-contain" />
            </div>
          </Show>
          <Show when={!imageUrl() && textPreview()}>
            <pre class="text-sm whitespace-pre-wrap break-words">{textPreview()}</pre>
          </Show>
          <Show when={!imageUrl() && !textPreview() && hexPreview()}>
            <pre class="text-xs whitespace-pre">{hexPreview()}</pre>
          </Show>
          <Show when={!imageUrl() && !textPreview() && !hexPreview()}>
            <div class="text-gray-500">选择一个文件以预览内容</div>
          </Show>
        </div>
      </div>
    </div>
  );
}


