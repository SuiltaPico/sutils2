import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { getLocation, parse, printParseErrorCode } from "jsonc-parser";

function toIndentString(kind: "2" | "4" | "tab"): string | number {
  if (kind === "tab") return "\t";
  if (kind === "4") return 4;
  return 2;
}

function humanErrorMessage(code: number): string {
  const name = printParseErrorCode(code);
  switch (name) {
    case "InvalidSymbol":
      return "无效的符号";
    case "InvalidNumberFormat":
      return "数字格式无效";
    case "PropertyNameExpected":
      return "预期为属性名";
    case "ValueExpected":
      return "预期为值";
    case "ColonExpected":
      return "缺少冒号 :";
    case "CommaExpected":
      return "缺少逗号 ,";
    case "CloseBraceExpected":
      return "缺少右花括号 }";
    case "CloseBracketExpected":
      return "缺少右方括号 ]";
    case "EndOfFileExpected":
      return "意外的多余内容";
    case "InvalidCommentToken":
      return "不支持注释 (严格 JSON)";
    case "UnexpectedEndOfComment":
      return "注释未正确结束";
    case "UnexpectedEndOfString":
      return "字符串未正确结束";
    case "UnexpectedEndOfNumber":
      return "数字未正确结束";
    case "InvalidUnicode":
      return "无效的 Unicode 转义";
    case "InvalidEscapeCharacter":
      return "无效的转义字符";
    case "InvalidCharacter":
      return "无效字符";
    default:
      return name || "解析错误";
  }
}

export default function JsonToolPage() {
  const [input, setInput] = createSignal<string>("{\n  \"hello\": \"world\"\n}");
  const [indentKind, setIndentKind] = createSignal<"2" | "4" | "tab">("2");
  const [minify, setMinify] = createSignal<boolean>(false);
  const [errorText, setErrorText] = createSignal<string>("");
  const [ok, setOk] = createSignal<boolean>(true);

  let fileInputRef: HTMLInputElement | undefined;

  const result = createMemo(() => {
    const text = input();
    const errors: { error: number; offset: number; length: number }[] = [];
    const options = { allowTrailingComma: false, disallowComments: true } as const;
    const value = parse(text, errors, options);

    if (errors.length > 0) {
      const e = errors[0];
      const loc = getLocation(text, e.offset);
      const msg = humanErrorMessage(e.error);
      setOk(false);
      setErrorText(`${msg}，位于 第${loc?.line + 1 ?? 0}行:${loc?.column + 1 ?? 0}`);
      return "";
    }

    setOk(true);
    setErrorText("");

    try {
      const indent = minify() ? 0 : toIndentString(indentKind());
      return JSON.stringify(value, null as any, indent as any);
    } catch (err) {
      setOk(false);
      setErrorText("格式化失败");
      return "";
    }
  });

  const handlePasteSample = () => {
    setInput("{\n  \"user\": {\n    \"id\": 123,\n    \"name\": \"Alice\",\n    \"tags\": [\"admin\", \"beta\"],\n    \"active\": true,\n    \"joinedAt\": \"2024-07-30T12:34:56Z\"\n  }\n}");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result());
    } catch {}
  };

  const handleClear = () => {
    setInput("");
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const text = await f.text();
    setInput(text);
  };

  return (
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 1200px; margin: 0 auto;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div>
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">DataMaster · JSON 工具</h2>
          <div style="opacity: 0.7; font-size: 12px;">纯前端 · 实时格式化 / 校验 / 错误定位</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; display: inline-flex; gap: 6px; align-items: center;">
            <span>缩进</span>
            <select
              value={indentKind()}
              onChange={(e) => setIndentKind(e.currentTarget.value as any)}
              disabled={minify()}
              style="padding: 4px 6px; font-size: 12px; border: 1px solid #ddd; border-radius: 6px; background: #fff;"
            >
              <option value="2">2 空格</option>
              <option value="4">4 空格</option>
              <option value="tab">Tab</option>
            </select>
          </label>
          <label style="font-size: 12px; display: inline-flex; gap: 6px; align-items: center;">
            <input type="checkbox" checked={minify()} onChange={(e) => setMinify(e.currentTarget.checked)} />
            <span>压缩输出</span>
          </label>
          <button type="button" onClick={handleCopy} style="padding: 6px 10px; font-size: 12px; border: 1px solid #ddd; background: #fafafa; border-radius: 6px; cursor: pointer;">复制输出</button>
          <button type="button" onClick={handleClear} style="padding: 6px 10px; font-size: 12px; border: 1px solid #ddd; background: #fafafa; border-radius: 6px; cursor: pointer;">清空输入</button>
          <input
            ref={(el: HTMLInputElement) => (fileInputRef = el)}
            type="file"
            accept=".json,application/json"
            style="display:none;"
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              const text = await f.text();
              setInput(text);
              e.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={() => fileInputRef?.click()} style="padding: 6px 10px; font-size: 12px; border: 1px solid #307cff; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer;">打开文件</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: stretch;">
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={onDrop}
          style="display: flex; flex-direction: column; gap: 6px;"
        >
          <div style={`font-size: 12px; ${ok() ? "color:#2e7d32" : "color:#b71c1c"}`}>
            {ok() ? "JSON 有效" : `JSON 无效：${errorText()}`}
          </div>
          <textarea
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="在此粘贴或输入 JSON；可直接拖拽 .json 文件"
            style="flex: 1 1 auto; min-height: 420px; padding: 10px; border: 1px solid #e5e5e5; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; line-height: 1.6;"
          />
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 12px; opacity: 0.7;">输出</div>
          <textarea
            readOnly
            value={result()}
            placeholder="格式化结果将在此显示"
            style="flex: 1 1 auto; min-height: 420px; padding: 10px; border: 1px solid #e5e5e5; border-radius: 8px; background: #fbfbfb; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; line-height: 1.6;"
          />
        </div>
      </div>

      <div style="display:flex; gap:8px;">
        <button type="button" onClick={handlePasteSample} style="padding: 6px 10px; font-size: 12px; border: 1px solid #ddd; background: #fafafa; border-radius: 6px; cursor: pointer;">填充示例</button>
      </div>
    </div>
  );
}
