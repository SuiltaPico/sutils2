import { createMemo, createSignal, For, Show } from "solid-js";
import {
  buildTreeFromCodes,
  bytesToBase64,
  bytesToHex,
  Codebook,
  decodeBits,
  encode,
  EncodeResult,
  unpackBytesToBits
} from "./huffman";
import {
  arithEncode,
  arithDecode,
  makeArithCodebook,
  ArithEncodeResult,
  ArithCodebook,
} from "./arithmetic";
import {
  ansEncode,
  ansDecode,
  makeAnsCodebook,
  AnsEncodeResult,
  AnsCodebook,
} from "./ans";

// UI 组件
export default function HuffmanCodingPage() {
  const [inputText, setInputText] = createSignal("");
  const [error, setError] = createSignal("");
  const [importError, setImportError] = createSignal("");
  const [importedBytes, setImportedBytes] = createSignal<Uint8Array | null>(
    null
  );
  const [importedCodebook, setImportedCodebook] = createSignal<Codebook | null>(
    null
  );
  const [algo, setAlgo] = createSignal<"huffman" | "arith" | "ans">("huffman");
  const [arithImportedBytes, setArithImportedBytes] = createSignal<Uint8Array | null>(null);
  const [arithImportedBook, setArithImportedBook] = createSignal<ArithCodebook | null>(null);
  const [ansImportedBytes, setAnsImportedBytes] = createSignal<Uint8Array | null>(null);
  const [ansImportedBook, setAnsImportedBook] = createSignal<AnsCodebook | null>(null);

  const result = createMemo(() => {
    try {
      setError("");
      return encode(inputText());
    } catch (e: any) {
      setError(e?.message || String(e));
      return null;
    }
  });

  const codeTable = createMemo(() => {
    const r = result();
    if (!r) return [] as { character: string; code: string }[];
    const rows: { character: string; code: string }[] = [];
    for (const [ch, code] of r.codeMap.entries())
      rows.push({ character: ch, code });
    rows.sort((a, b) => a.character.localeCompare(b.character));
    return rows;
  });

  const resultArith = createMemo<ArithEncodeResult | null>(() => {
    try {
      return arithEncode(inputText());
    } catch (e: any) {
      setError(e?.message || String(e));
      return null;
    }
  });

  const resultAns = createMemo<AnsEncodeResult | null>(() => {
    try {
      return ansEncode(inputText());
    } catch (e: any) {
      setError(e?.message || String(e));
      return null;
    }
  });

  function makeCodebook(r: EncodeResult): Codebook {
    const codes: { character: string; code: string }[] = [];
    for (const [ch, code] of r.codeMap.entries())
      codes.push({ character: ch, code });
    codes.sort((a, b) => a.character.localeCompare(b.character));
    return {
      version: 1,
      type: "huffman-codebook",
      encoding: "utf-8",
      codes,
      validBitsInLastByte: r.validBitsInLastByte,
    };
  }

  function downloadBlob(filename: string, data: Blob) {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadEncoded() {
    if (algo() === "huffman") {
      const r = result();
      if (!r) return;
      const ab = new ArrayBuffer(r.packedBytes.byteLength);
      new Uint8Array(ab).set(r.packedBytes);
      downloadBlob("huffman.bin", new Blob([ab]));
    } else if (algo() === "arith") {
      const r = resultArith();
      if (!r) return;
      const ab = new ArrayBuffer(r.packedBytes.byteLength);
      new Uint8Array(ab).set(r.packedBytes);
      downloadBlob("arith.bin", new Blob([ab]));
    } else {
      const r = resultAns();
      if (!r) return;
      const ab = new ArrayBuffer(r.packedBytes.byteLength);
      new Uint8Array(ab).set(r.packedBytes);
      downloadBlob("ans.bin", new Blob([ab]));
    }
  }

  function handleDownloadCodebook() {
    if (algo() === "huffman") {
      const r = result();
      if (!r) return;
      const codebook = makeCodebook(r);
      downloadBlob(
        "huffman-codebook.json",
        new Blob([JSON.stringify(codebook, null, 2)], {
          type: "application/json",
        })
      );
    } else if (algo() === "arith") {
      const r = resultArith();
      if (!r) return;
      const book = makeArithCodebook(r);
      downloadBlob(
        "arith-codebook.json",
        new Blob([JSON.stringify(book, null, 2)], { type: "application/json" })
      );
    } else {
      const r = resultAns();
      if (!r) return;
      const book = makeAnsCodebook(r);
      downloadBlob(
        "ans-codebook.json",
        new Blob([JSON.stringify(book, null, 2)], { type: "application/json" })
      );
    }
  }

  async function handleImportEncodedFile(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const buf = new Uint8Array(await file.arrayBuffer());
      setImportedBytes(buf);
    } catch (err: any) {
      setImportError(err?.message || "导入编码文件失败");
    }
  }

  async function handleImportCodebook(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if (
        !obj ||
        obj.type !== "huffman-codebook" ||
        !Array.isArray(obj.codes)
      ) {
        throw new Error("无效的编码表 JSON");
      }
      if (typeof obj.validBitsInLastByte !== "number") {
        throw new Error("编码表缺少 validBitsInLastByte");
      }
      setImportedCodebook(obj as Codebook);
    } catch (err: any) {
      setImportError(err?.message || "导入编码表失败");
    }
  }

  async function handleImportEncodedFileArith(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const buf = new Uint8Array(await file.arrayBuffer());
      setArithImportedBytes(buf);
    } catch (err: any) {
      setImportError(err?.message || "导入编码文件失败");
    }
  }

  async function handleImportCodebookArith(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if (!obj || obj.type !== "arith-codebook" || !Array.isArray(obj.frequencyTable)) {
        throw new Error("无效的算术编码表 JSON");
      }
      if (typeof obj.messageLength !== "number") {
        throw new Error("编码表缺少 messageLength");
      }
      setArithImportedBook(obj as ArithCodebook);
    } catch (err: any) {
      setImportError(err?.message || "导入编码表失败");
    }
  }

  async function handleImportEncodedFileAns(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const buf = new Uint8Array(await file.arrayBuffer());
      setAnsImportedBytes(buf);
    } catch (err: any) {
      setImportError(err?.message || "导入编码文件失败");
    }
  }

  async function handleImportCodebookAns(e: Event) {
    try {
      setImportError("");
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if (!obj || obj.type !== "ans-codebook" || !Array.isArray(obj.frequencyTable)) {
        throw new Error("无效的 ANS 编码表 JSON");
      }
      if (typeof obj.messageLength !== "number") {
        throw new Error("编码表缺少 messageLength");
      }
      setAnsImportedBook(obj as AnsCodebook);
    } catch (err: any) {
      setImportError(err?.message || "导入编码表失败");
    }
  }

  const decodedFromImport = createMemo(() => {
    const bytes = importedBytes();
    const book = importedCodebook();
    if (!bytes || !book) return { ok: false as const, text: "", error: "" };
    try {
      const root = buildTreeFromCodes(book.codes);
      const bits = unpackBytesToBits(bytes, book.validBitsInLastByte);
      const text = decodeBits(root, bits);
      return { ok: true as const, text, error: "" };
    } catch (err: any) {
      return {
        ok: false as const,
        text: "",
        error: err?.message || String(err),
      };
    }
  });

  const decodedFromImportArith = createMemo(() => {
    const bytes = arithImportedBytes();
    const book = arithImportedBook();
    if (!bytes || !book) return { ok: false as const, text: "", error: "" };
    try {
      const text = arithDecode(bytes, book);
      return { ok: true as const, text, error: "" };
    } catch (err: any) {
      return {
        ok: false as const,
        text: "",
        error: err?.message || String(err),
      };
    }
  });

  const decodedFromImportAns = createMemo(() => {
    const bytes = ansImportedBytes();
    const book = ansImportedBook();
    if (!bytes || !book) return { ok: false as const, text: "", error: "" };
    try {
      const text = ansDecode(bytes, book);
      return { ok: true as const, text, error: "" };
    } catch (err: any) {
      return {
        ok: false as const,
        text: "",
        error: err?.message || String(err),
      };
    }
  });

  function handleDownloadDecodedText() {
    if (algo() === "huffman") {
      const r = decodedFromImport();
      if (!r.ok) return;
      downloadBlob(
        "decoded.txt",
        new Blob([r.text], { type: "text/plain;charset=utf-8" })
      );
    } else if (algo() === "arith") {
      const r = decodedFromImportArith();
      if (!r.ok) return;
      downloadBlob(
        "decoded.txt",
        new Blob([r.text], { type: "text/plain;charset=utf-8" })
      );
    } else {
      const r = decodedFromImportAns();
      if (!r.ok) return;
      downloadBlob(
        "decoded.txt",
        new Blob([r.text], { type: "text/plain;charset=utf-8" })
      );
    }
  }

  const compressionStats = createMemo(() => {
    const r = result();
    if (!r) return { inputBytes: 0, bitLen: 0, packedBytes: 0, ratio: 1 };
    const inputBytes = new TextEncoder().encode(inputText()).length;
    const bitLen = r.encodedBits.length;
    const packedBytes = r.packedBytes.length;
    const ratio = inputBytes === 0 ? 1 : packedBytes / inputBytes;
    return { inputBytes, bitLen, packedBytes, ratio };
  });

  return (
    <div class="font-sans max-w-4xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">熵编码试验场（Huffman / Arithmetic / ANS）</h1>
      <p class="text-gray-600 mb-4">
        输入任意文本，选择编码算法并实时查看结果（编码与解码、导入与下载）。
      </p>

      <div class="flex items-center gap-2 mb-4">
        <span class="text-sm text-gray-700">算法：</span>
        <button
          class={`px-3 py-1 rounded cursor-pointer ${algo() === "huffman" ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          onClick={() => setAlgo("huffman")}
        >
          Huffman
        </button>
        <button
          class={`px-3 py-1 rounded cursor-pointer ${algo() === "arith" ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          onClick={() => setAlgo("arith")}
        >
          Arithmetic
        </button>
        <button
          class={`px-3 py-1 rounded cursor-pointer ${algo() === "ans" ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          onClick={() => setAlgo("ans")}
        >
          ANS
        </button>
      </div>

      <div class="flex flex-col gap-2 mb-4">
        <textarea
          class="w-full h-40 p-2 border rounded font-mono"
          placeholder="在此输入文本..."
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
        />
        <Show when={error()}>
          <div class="text-red-700 bg-red-100 p-2 rounded">{error()}</div>
        </Show>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div class="border rounded p-3 bg-gray-50">
          <div class="font-semibold mb-2">频次统计</div>
          <div class="max-h-64 overflow-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-600">
                  <th class="px-1 py-1">字符</th>
                  <th class="px-1 py-1">频次</th>
                </tr>
              </thead>
              <tbody>
                <For each={(algo() === "huffman" ? result()?.frequencyTable : resultArith()?.frequencyTable) || []}>
                  {(row) => (
                    <tr>
                      <td class="px-1 py-0.5 font-mono break-all">
                        {visualizeChar(row.character)}
                      </td>
                      <td class="px-1 py-0.5">{row.frequency}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
        <Show when={algo() === "huffman"}>
          <div class="border rounded p-3 bg-gray-50">
          <div class="font-semibold mb-2">编码表</div>
          <div class="max-h-64 overflow-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-600">
                  <th class="px-1 py-1">字符</th>
                  <th class="px-1 py-1">编码</th>
                </tr>
              </thead>
              <tbody>
                <For each={codeTable()}>
                  {(row) => (
                    <tr>
                      <td class="px-1 py-0.5 font-mono break-all">
                        {visualizeChar(row.character)}
                      </td>
                      <td class="px-1 py-0.5 font-mono">{row.code}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          </div>
        </Show>
      </div>

      <div class="border rounded p-3 bg-gray-50 mb-4">
        <div class="font-semibold mb-2">编码结果</div>
        <div class="text-sm text-gray-700 mb-2">
          <div>输入字节：{compressionStats().inputBytes} B</div>
          <div>
            位长：
            {algo() === "huffman"
              ? (result()?.encodedBits.length || 0)
              : algo() === "arith"
              ? (resultArith()?.bitLength || 0)
              : (resultAns()?.bitLength || 0)}
            
            bit
          </div>
          <div>
            压缩后：
            {algo() === "huffman"
              ? (result()?.packedBytes.length || 0)
              : algo() === "arith"
              ? (resultArith()?.packedBytes.length || 0)
              : (resultAns()?.packedBytes.length || 0)}
            
            B
          </div>
          <div>压缩率：{compressionStats().ratio.toFixed(3)}</div>
        </div>
        <div class="flex items-center gap-2 mb-3">
          <button
            class="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded cursor-pointer"
            onClick={handleDownloadEncoded}
          >
            下载编码文件 (.bin)
          </button>
          <button
            class="px-3 py-1 bg-gray-800 hover:bg-black text-white rounded cursor-pointer"
            onClick={handleDownloadCodebook}
          >
            下载编码表 (.json)
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div class="text-sm text-gray-600">字节流（HEX）</div>
            <pre class="whitespace-pre-wrap break-all bg-white border rounded p-2 text-sm font-mono max-h-40 overflow-auto">
              {bytesToHex((algo() === "huffman" ? result()?.packedBytes : algo() === "arith" ? resultArith()?.packedBytes : resultAns()?.packedBytes) || new Uint8Array())}
            </pre>
          </div>
          <div>
            <div class="text-sm text-gray-600">字节流（Base64）</div>
            <pre class="whitespace-pre-wrap break-all bg-white border rounded p-2 text-sm font-mono max-h-40 overflow-auto">
              {bytesToBase64((algo() === "huffman" ? result()?.packedBytes : algo() === "arith" ? resultArith()?.packedBytes : resultAns()?.packedBytes) || new Uint8Array())}
            </pre>
          </div>
          <Show when={algo() === "huffman"}>
            <div>
              <div class="text-sm text-gray-600">最后 1 字节有效位数</div>
              <div class="font-mono">{result()?.validBitsInLastByte ?? 0}</div>
            </div>
          </Show>
        </div>
      </div>

      <div class="border rounded p-3 bg-gray-50">
        <div class="font-semibold mb-2">解码</div>
        <div class="flex flex-col md:flex-row gap-3 mb-3">
          <Show when={algo() === "huffman"} fallback={<></>}>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-24">编码文件</span>
              <input type="file" onChange={handleImportEncodedFile} />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-24">编码表 JSON</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportCodebook}
              />
            </div>
          </Show>
          <Show when={algo() === "arith"}>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-24">编码文件</span>
              <input type="file" onChange={handleImportEncodedFileArith} />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-28">编码表 JSON</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportCodebookArith}
              />
            </div>
          </Show>
          <Show when={algo() === "ans"}>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-24">编码文件</span>
              <input type="file" onChange={handleImportEncodedFileAns} />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-700 w-28">编码表 JSON</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportCodebookAns}
              />
            </div>
          </Show>
        </div>
        <Show when={importError()}>
          <div class="text-red-700 bg-red-100 p-2 rounded mb-2">
            {importError()}
          </div>
        </Show>
        <Show when={(algo() === "huffman" ? decodedFromImport().ok : algo() === "arith" ? decodedFromImportArith().ok : decodedFromImportAns().ok)}>
          <div class="flex items-center gap-2 mb-2">
            <button
              class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded cursor-pointer"
              onClick={handleDownloadDecodedText}
            >
              下载解码文本 (.txt)
            </button>
          </div>
          <div class="text-sm text-gray-600 mb-1">解码结果：</div>
          <pre class="whitespace-pre-wrap break-all bg-white border rounded p-2 text-sm font-mono max-h-64 overflow-auto">
            {algo() === "huffman" ? decodedFromImport().text : algo() === "arith" ? decodedFromImportArith().text : decodedFromImportAns().text}
          </pre>
        </Show>
      </div>
    </div>
  );
}

function visualizeChar(ch: string): string {
  if (ch === " ") return "<space>";
  if (ch === "\n") return "<LF>\\n";
  if (ch === "\r") return "<CR>\\r";
  if (ch === "\t") return "<TAB>";
  if (ch === "\u0000") return "<NUL>";
  return ch;
}
