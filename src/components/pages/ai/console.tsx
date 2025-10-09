import { For, Show, createSignal, onMount } from "solid-js";
import { DEFAULT_MODEL, type ChatMessage, type ChatSession } from "../../../model/ai/console/types";
import { loadSettings, saveSettings, loadSessions, upsertSession, deleteSession } from "../../../model/ai/console/storage";
import { createGoogleClient, generateGoogleText } from "../../../model/ai/console/google";

function uuid(): string {
  return (crypto && "randomUUID" in crypto)
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function AIConsolePage() {
  const [apiKey, setApiKey] = createSignal("");
  const [model, setModel] = createSignal(DEFAULT_MODEL);
  const [sessions, setSessions] = createSignal<ChatSession[]>([]);
  const [currentId, setCurrentId] = createSignal<string | null>(null);
  const [input, setInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  let aiClient: ReturnType<typeof createGoogleClient> | null = null;

  function loadInit() {
    const s = loadSettings();
    setApiKey(s.googleApiKey);
    setModel(s.defaultModel || DEFAULT_MODEL);
    setSessions(loadSessions());
    if (s.googleApiKey) {
      aiClient = createGoogleClient({ apiKey: s.googleApiKey });
    }
  }

  onMount(loadInit);

  function ensureSession(): ChatSession {
    const sid = currentId();
    if (sid) {
      const found = sessions().find((x) => x.id === sid);
      if (found) return found;
    }
    const created: ChatSession = {
      id: uuid(),
      title: "新对话",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provider: "google",
      model: model(),
      messages: [],
    };
    const next = upsertSession(created);
    setSessions(next);
    setCurrentId(created.id);
    return created;
  }

  function saveClientAndSettings() {
    saveSettings({ googleApiKey: apiKey().trim(), defaultModel: model().trim() });
    aiClient = apiKey().trim() ? createGoogleClient({ apiKey: apiKey().trim() }) : null;
  }

  async function send() {
    setError("");
    const text = input().trim();
    if (!text) return;
    if (!apiKey().trim()) {
      setError("请先填写 Google API Key");
      return;
    }
    if (!aiClient) saveClientAndSettings();
    if (!aiClient) {
      setError("API 客户端初始化失败");
      return;
    }

    const s = ensureSession();
    const userMsg: ChatMessage = {
      id: uuid(), role: "user", text, timestamp: Date.now(),
    };
    const updated: ChatSession = {
      ...s,
      updatedAt: Date.now(),
      messages: [...s.messages, userMsg],
    };
    setInput("");
    setBusy(true);
    try {
      const replyText = await generateGoogleText(aiClient, model(), updated.messages, text);
      const aiMsg: ChatMessage = {
        id: uuid(), role: "assistant", text: replyText, timestamp: Date.now(),
      };
      const finalSession: ChatSession = {
        ...updated,
        updatedAt: Date.now(),
        title: updated.title === "新对话" ? text.slice(0, 20) || "新对话" : updated.title,
        messages: [...updated.messages, aiMsg],
      };
      const next = upsertSession(finalSession);
      setSessions(next);
      setCurrentId(finalSession.id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function switchSession(id: string) {
    setCurrentId(id);
  }

  function removeSession(id: string) {
    const next = deleteSession(id);
    setSessions(next);
    if (currentId() === id) setCurrentId(next[0]?.id ?? null);
  }

  const current = () => sessions().find((x) => x.id === currentId()) ?? null;

  return (
    <div class="p-4 max-w-6xl mx-auto">
      <h1 class="text-2xl font-bold mb-4">AI Console（Google）</h1>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="md:col-span-2 border rounded p-3">
          <div class="flex gap-2 items-end mb-3">
            <div class="flex-1">
              <label class="block text-sm text-gray-600 mb-1">Google API Key</label>
              <input
                class="w-full border rounded px-2 py-1"
                type="password"
                value={apiKey()}
                onInput={(e) => setApiKey((e.currentTarget as HTMLInputElement).value)}
                placeholder="在此填入 API Key，仅保存在浏览器本地"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-1">Model</label>
              <input
                class="w-56 border rounded px-2 py-1"
                value={model()}
                onInput={(e) => setModel((e.currentTarget as HTMLInputElement).value)}
              />
            </div>
            <button class="bg-blue-600 text-white px-3 py-1 rounded" onClick={saveClientAndSettings}>保存</button>
          </div>

          <Show when={error()}>
            <div class="text-red-600 text-sm mb-2">{error()}</div>
          </Show>

          <div class="h-96 overflow-y-auto border rounded p-3 mb-3 bg-gray-50 flex flex-col gap-2">
            <For each={current()?.messages ?? []}>
              {(m) => (
                <div class={m.role === "user" ? "text-right" : "text-left"}>
                  <div class={`inline-block px-3 py-2 rounded ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}`}>
                    {m.text}
                  </div>
                </div>
              )}
            </For>
            <Show when={(current()?.messages?.length ?? 0) === 0}>
              <div class="text-gray-400 text-sm">开始新的对话吧～</div>
            </Show>
          </div>

          <div class="flex gap-2">
            <input
              class="flex-1 border rounded px-2 py-2"
              value={input()}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              onInput={(e) => setInput((e.currentTarget as HTMLInputElement).value)}
              placeholder="输入内容，回车发送"
            />
            <button disabled={busy()} class="bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded" onClick={send}>发送</button>
          </div>
        </div>

        <div class="border rounded p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold">对话记录</div>
            <button class="text-sm text-blue-600" onClick={() => { const s = ensureSession(); setCurrentId(s.id); }}>新建</button>
          </div>
          <div class="space-y-2 max-h-[28rem] overflow-y-auto">
            <For each={sessions()}>
              {(s) => (
                <div class={`border rounded px-2 py-2 cursor-pointer ${currentId() === s.id ? "bg-blue-50 border-blue-300" : "bg-white"}`} onClick={() => switchSession(s.id)}>
                  <div class="flex items-center justify-between gap-2">
                    <div class="truncate mr-2">{s.title || "对话"}</div>
                    <button class="text-xs text-red-600" onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}>删除</button>
                  </div>
                  <div class="text-xs text-gray-500">{new Date(s.updatedAt).toLocaleString()}</div>
                </div>
              )}
            </For>
            <Show when={sessions().length === 0}>
              <div class="text-gray-400 text-sm">暂无历史</div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}


