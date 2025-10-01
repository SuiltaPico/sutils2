import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { loadPyodide, PyodideInterface } from "pyodide";

type PyodideInstance = PyodideInterface;

const PYODIDE_VERSION = "0.28.3";
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const DEFAULT_SNIPPETS: { id: string; title: string; code: string }[] = [
  {
    id: "hello",
    title: "Hello, World",
    code: [
      "print('Hello from Pyodide!')",
      "import sys",
      "print('Python', sys.version)",
    ].join("\n"),
  },
  {
    id: "js-api",
    title: "访问 JS 全局 / Web API",
    code: [
      "import js",
      "# console / navigator",
      "js.console.log('Hello from Python via js.console.log')",
      "print('UA:', js.navigator.userAgent)",
      "",
      "# fetch（顶层 await 可直接用）",
      "resp = await js.fetch('https://jsonplaceholder.typicode.com/todos/1')",
      "text = await resp.text()",
      "print('fetch length:', len(text))",
      "",
      "# localStorage",
      "js.window.localStorage.setItem('pyodide_demo', 'ok')",
      "print('localStorage:', js.window.localStorage.getItem('pyodide_demo'))",
      "",
      "# crypto.getRandomValues",
      "arr = js.Uint8Array.new(8)",
      "js.crypto.getRandomValues(arr)",
      "print('random[0..3]:', int(arr[0]), int(arr[1]), int(arr[2]), int(arr[3]))",
    ].join("\n"),
  },
  {
    id: "math",
    title: "Fibonacci",
    code: [
      "def fib(n):",
      "  a, b = 0, 1",
      "  for _ in range(n):",
      "    a, b = b, a + b",
      "  return a",
      "print([fib(i) for i in range(12)])",
    ].join("\n"),
  },
  {
    id: "async",
    title: "Async / await 示例",
    code: [
      "import asyncio",
      "async def work():",
      "  await asyncio.sleep(0.1)",
      "  return 'done'",
      "print('start')",
      "result = await work()",
      "print(result)",
    ].join("\n"),
  },
  {
    id: "requests",
    title: "requests + pyodide-http",
    code: [
      "import micropip",
      "await micropip.install('pyodide-http')",
      "import pyodide_http; pyodide_http.patch_all()",
      "import requests",
      "resp = requests.get('https://httpbin.org/get')",
      "print('status', resp.status_code)",
      "print(resp.json()['url'])",
    ].join("\n"),
  },
  {
    id: "rich",
    title: "rich 终端渲染",
    code: [
      "import micropip",
      "await micropip.install('rich')",
      "from rich.console import Console",
      "from rich.table import Table",
      "table = Table(title='Demo Table')",
      "table.add_column('Name')",
      "table.add_column('Value')",
      "table.add_row('pi', str(3.14159))",
      "Console().print(table)",
    ].join("\n"),
  },
  {
    id: "jinja2",
    title: "jinja2 模板渲染",
    code: [
      "import micropip",
      "await micropip.install('jinja2')",
      "from jinja2 import Template",
      "tmpl = Template('Hello, {{ who }}!')",
      "print(tmpl.render(who='Pyodide'))",
    ].join("\n"),
  },
  {
    id: "networkx",
    title: "networkx 图",
    code: [
      "import micropip",
      "await micropip.install('networkx')",
      "import networkx as nx",
      "G = nx.path_graph(4)",
      "print(list(G.nodes()))",
      "print(list(G.edges()))",
    ].join("\n"),
  },
  {
    id: "markdown-it-py",
    title: "markdown-it-py 渲染",
    code: [
      "import micropip",
      "await micropip.install('markdown-it-py[linkify]')",
      "from markdown_it import MarkdownIt",
      "md = MarkdownIt()",
      "print(md.render('# Hello\\n\\nVisit https://example.com'))",
    ].join("\n"),
  },
  {
    id: "bs4",
    title: "beautifulsoup4 解析",
    code: [
      "import micropip",
      "await micropip.install('beautifulsoup4')",
      "from bs4 import BeautifulSoup",
      "html = '<div><p class=\"x\">hi</p></div>'",
      "soup = BeautifulSoup(html, 'html.parser')",
      "print(soup.select_one('p.x').text)",
    ].join("\n"),
  },
  {
    id: "matplotlib",
    title: "matplotlib 画图 (输出 data URL)",
    code: [
      "import matplotlib",
      "matplotlib.use('Agg')",
      "import matplotlib.pyplot as plt",
      "import numpy as np",
      "x = np.linspace(0, 2*np.pi, 200)",
      "y = np.sin(x)",
      "plt.figure(figsize=(4,2.2), dpi=150)",
      "plt.plot(x, y)",
      "plt.title('Sine wave')",
      "plt.grid(True)",
      "import io, base64",
      "buf = io.BytesIO()",
      "plt.gcf().savefig(buf, format='png', bbox_inches='tight')",
      "buf.seek(0)",
      "print('data:image/png;base64,' + base64.b64encode(buf.read()).decode())",
    ].join("\n"),
  },
];

export default function PythonWasm() {
  const [pyodide, setPyodide] = createSignal<PyodideInstance | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [isRunning, setIsRunning] = createSignal(false);
  const [stdout, setStdout] = createSignal<string[]>([]);
  const [stderr, setStderr] = createSignal<string[]>([]);
  const [code, setCode] = createSignal(DEFAULT_SNIPPETS[0].code);
  const [pkgName, setPkgName] = createSignal("");
  const [pyVersion, setPyVersion] = createSignal<string>("");
  const [sessionMode, setSessionMode] = createSignal(false);
  const [extraCode, setExtraCode] = createSignal("");

  type PyGlobalRow = {
    name: string;
    type: string;
    module: string | null;
    callable: boolean;
    isModule: boolean;
    isClass: boolean;
    isFunction: boolean;
    repr: string;
  };
  const [globalsRows, setGlobalsRows] = createSignal<PyGlobalRow[]>([]);
  const [hideDunder, setHideDunder] = createSignal(true);

  type WatchRow = {
    name: string;
    type: string | null;
    exists: boolean;
    repr: string;
  };
  const [watchKeys, setWatchKeys] = createSignal<string[]>([]);
  const [watchInput, setWatchInput] = createSignal("");
  const [watchRows, setWatchRows] = createSignal<WatchRow[]>([]);

  const PY_GLOBALS_PY_SCRIPT = [
    "import json, inspect",
    "def _build_globals_snapshot():",
    "  rows = []",
    "  for k, v in globals().items():",
    "    try:",
    "      typ = type(v).__name__",
    "      mod = getattr(v, '__module__', None)",
    "      is_callable = callable(v)",
    "      is_module = inspect.ismodule(v)",
    "      is_class = inspect.isclass(v)",
    "      is_function = inspect.isfunction(v) or inspect.isbuiltin(v) or inspect.ismethod(v)",
    "      try:",
    "        rp = repr(v)",
    "      except Exception:",
    "        rp = '<unreprable>'",
    "      rows.append({",
    "        'name': k,",
    "        'type': typ,",
    "        'module': mod,",
    "        'callable': is_callable,",
    "        'isModule': is_module,",
    "        'isClass': is_class,",
    "        'isFunction': is_function,",
    "        'repr': rp[:500],",
    "      })",
    "    except Exception:",
    "      pass",
    "  rows.sort(key=lambda x: x['name'])",
    "  return json.dumps(rows)",
  ].join("\n");

  async function refreshGlobals() {
    const inst = pyodide();
    if (!inst) return;
    try {
      const jsonStr = await inst.runPythonAsync(
        PY_GLOBALS_PY_SCRIPT + "\n_build_globals_snapshot()"
      );
      const rows = JSON.parse(String(jsonStr)) as PyGlobalRow[];
      setGlobalsRows(rows);
    } catch (e: any) {
      // 失败不影响主流程，仅记录到错误区
      const msg = String(e?.message ?? e);
      appendLines(setStderr, "获取 pyodide.globals 失败: " + msg);
    }
  }

  const isReady = createMemo(() => !!pyodide());
  const imageUrls = createMemo(() =>
    stdout()
      .map((l) => l.trim())
      .filter((l) => /^data:image\/(png|svg\+xml);base64,/.test(l))
  );

  function codeContainsMicropipUsage(text: string) {
    return /\bmicropip\b/.test(text);
  }

  function detectBuiltInPackages(text: string): string[] {
    const need = new Set<string>();
    if (/\bmatplotlib\b/.test(text)) {
      need.add("matplotlib");
      need.add("numpy");
    }
    if (/\bnumpy\b/.test(text)) need.add("numpy");
    if (/\bpandas\b/.test(text)) {
      need.add("pandas");
      need.add("numpy");
    }
    return Array.from(need);
  }

  function appendLines(
    setter: (updater: (prev: string[]) => string[]) => void,
    text: string
  ) {
    const lines = text.split(/\r?\n/);
    // 过滤最后一个空行，避免多余换行
    const normalized =
      lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
    if (normalized.length === 0) return;
    setter((prev) => [...prev, ...normalized]);
  }

  function clearOutput() {
    setStdout([]);
    setStderr([]);
  }

  async function runPythonWithDeps(src: string) {
    const inst = pyodide();
    if (!inst) return;
    setIsRunning(true);
    try {
      if (codeContainsMicropipUsage(src)) {
        try {
          await inst.loadPackage("micropip");
        } catch (e: any) {
          appendLines(
            setStderr,
            "加载 micropip 失败: " + String(e?.message ?? e)
          );
        }
      }
      const builtins = detectBuiltInPackages(src);
      if (builtins.length > 0) {
        try {
          await inst.loadPackage(builtins);
        } catch (e: any) {
          appendLines(setStderr, "加载内置包失败: " + String(e?.message ?? e));
        }
      }
      await inst.runPythonAsync(src);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      appendLines(setStderr, msg);
      if (/WebAssembly stack switching not supported/.test(msg)) {
        appendLines(
          setStderr,
          "提示：请避免使用 asyncio.run(...)，改为在顶层使用 await（本页面已支持顶层 await）。"
        );
      }
    } finally {
      setIsRunning(false);
      await Promise.all([refreshGlobals(), refreshWatches()]);
    }
  }

  async function runCurrentCode() {
    const inst = pyodide();
    if (!inst) return;
    const src = code();
    await runPythonWithDeps(src);
  }

  async function runExtraCode() {
    const inst = pyodide();
    if (!inst) return;
    const src = extraCode();
    if (!src.trim()) return;
    await runPythonWithDeps(src);
  }

  async function refreshWatches() {
    const inst = pyodide();
    if (!inst) return;
    const keys = watchKeys();
    if (keys.length === 0) {
      setWatchRows([]);
      return;
    }
    try {
      const py = [
        "import json, inspect",
        `names = json.loads(${JSON.stringify(JSON.stringify(keys))})`,
        "rows = []",
        "for k in names:",
        "  exists = k in globals()",
        "  v = globals().get(k, None)",
        "  try:",
        "    typ = type(v).__name__ if exists else None",
        "  except Exception:",
        "    typ = None",
        "  try:",
        "    rp = repr(v) if exists else '<not defined>'",
        "  except Exception:",
        "    rp = '<unreprable>'",
        "  rows.append({'name': k, 'type': typ, 'exists': exists, 'repr': str(rp)[:500]})",
        "json.dumps(rows)",
      ].join("\n");
      const jsonStr = await inst.runPythonAsync(py);
      const rows = JSON.parse(String(jsonStr)) as WatchRow[];
      setWatchRows(rows);
    } catch (e: any) {
      appendLines(setStderr, "刷新观察变量失败: " + String(e?.message ?? e));
    }
  }

  function addWatch() {
    const name = watchInput().trim();
    if (!name) return;
    setWatchKeys((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setWatchInput("");
    // 异步刷新
    refreshWatches();
  }

  function removeWatch(name: string) {
    setWatchKeys((prev) => prev.filter((n) => n !== name));
    // 异步刷新
    refreshWatches();
  }

  async function installPackage(name: string) {
    const inst = pyodide();
    if (!inst || !name) return;
    setIsRunning(true);
    try {
      await inst.loadPackage("micropip");
      await inst.runPythonAsync(
        [
          "import micropip",
          `await micropip.install(${JSON.stringify(name)})`,
          "print('installed', '" + name + "')",
        ].join("\n")
      );
    } catch (err: any) {
      appendLines(setStderr, String(err?.message ?? err));
    } finally {
      setIsRunning(false);
    }
  }

  onMount(() => {
    let disposed = false;
    (async () => {
      try {
        const instance: PyodideInstance = await loadPyodide({
          indexURL: PYODIDE_CDN_BASE,
        });
        if (disposed) return;

        instance.setStdout({
          batched: (s: string) => appendLines(setStdout, s),
        });
        instance.setStderr({
          batched: (s: string) => appendLines(setStderr, s),
        });
        console.log("instance", instance);
        setPyodide(() => instance as unknown as PyodideInstance);
        const ver = instance.runPython("import sys; sys.version");
        setPyVersion(String(ver));
        // 初次加载后获取一次全局变量
        await refreshGlobals();
      } catch (err: any) {
        appendLines(
          setStderr,
          "Pyodide 加载失败: " + String(err?.message ?? err)
        );
      } finally {
        if (!disposed) setIsLoading(false);
      }
    })();

    onCleanup(() => {
      disposed = true;
      // 目前 Pyodide 没有显式 dispose；依赖页面卸载回收。
    });
  });

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-600">Pyodide 在线 Python</h1>
        <Show
          when={isReady()}
          fallback={<span class="text-gray-500">加载中...</span>}
        >
          <span class="text-sm text-gray-600">Python {pyVersion()}</span>
        </Show>
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-700 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={sessionMode()}
            onInput={(e) =>
              setSessionMode((e.target as HTMLInputElement).checked)
            }
          />
          会话模式
        </label>
        <Show when={sessionMode()}>
          <span class="text-xs text-gray-500">
            同一会话内多次执行脚本，变量保持
          </span>
        </Show>
      </div>

      <div class="flex gap-2 flex-wrap">
        {DEFAULT_SNIPPETS.map((s) => (
          <button
            class="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            onClick={() => setCode(s.code)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <label class="text-sm text-gray-600">Python 代码</label>
          <textarea
            class="w-full h-64 p-2 rounded border border-gray-200 font-mono text-sm"
            value={code()}
            onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)}
          />
          <div class="flex gap-2">
            <button
              class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!isReady() || isRunning()}
              onClick={runCurrentCode}
            >
              运行
            </button>
            <button
              class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={clearOutput}
            >
              清空输出
            </button>
          </div>

          <Show when={sessionMode()}>
            <div class="space-y-2 mt-2">
              <label class="text-sm text-gray-600">
                附加脚本（在当前会话中执行）
              </label>
              <textarea
                class="w-full h-36 p-2 rounded border border-gray-200 font-mono text-sm"
                placeholder="# 可在此输入增量脚本，变量与上次执行共享"
                value={extraCode()}
                onInput={(e) =>
                  setExtraCode((e.target as HTMLTextAreaElement).value)
                }
              />
              <div class="flex gap-2">
                <button
                  class="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
                  disabled={!isReady() || isRunning() || !extraCode().trim()}
                  onClick={runExtraCode}
                >
                  运行附加脚本
                </button>
                <button
                  class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                  disabled={!isReady() || isRunning()}
                  onClick={() => {
                    setExtraCode("");
                  }}
                >
                  清空附加脚本
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-gray-600">输出</label>
          <div class="h-40 overflow-auto p-2 rounded border border-gray-200 bg-gray-50">
            <pre class="text-sm whitespace-pre-wrap leading-5">
              {stdout().join("\n")}
            </pre>
          </div>
          <Show when={imageUrls().length > 0}>
            <div class="space-y-1">
              <label class="text-sm text-gray-600">图像预览</label>
              <div class="flex flex-wrap gap-2">
                {imageUrls().map((u) => (
                  <img
                    src={u}
                    alt="plot"
                    class="max-h-40 rounded border border-gray-200"
                  />
                ))}
              </div>
            </div>
          </Show>
          <label class="text-sm text-gray-600">错误</label>
          <div class="h-28 overflow-auto p-2 rounded border border-rose-200 bg-rose-50">
            <pre class="text-sm text-rose-700 whitespace-pre-wrap leading-5">
              {stderr().join("\n")}
            </pre>
          </div>

          <Show when={sessionMode()}>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-sm text-gray-600">变量观察器</label>
                <div class="flex items-center gap-2">
                  <input
                    class="px-2 py-1 rounded border border-gray-200 text-sm"
                    placeholder="变量名，如: df 或 my_value"
                    value={watchInput()}
                    onInput={(e) =>
                      setWatchInput((e.target as HTMLInputElement).value)
                    }
                  />
                  <button
                    class="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                    disabled={!watchInput().trim() || !isReady() || isRunning()}
                    onClick={addWatch}
                  >
                    添加
                  </button>
                  <button
                    class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                    disabled={!isReady() || isRunning()}
                    onClick={refreshWatches}
                  >
                    刷新
                  </button>
                </div>
              </div>
              <div class="overflow-auto rounded border border-gray-200">
                <table class="min-w-full text-sm">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="text-left px-2 py-1 font-600">Name</th>
                      <th class="text-left px-2 py-1 font-600">Type</th>
                      <th class="text-left px-2 py-1 font-600">Exists</th>
                      <th class="text-left px-2 py-1 font-600">Repr</th>
                      <th class="text-left px-2 py-1 font-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchRows().map((r) => (
                      <tr class="odd:bg-white even:bg-gray-50 align-top">
                        <td class="px-2 py-1 whitespace-nowrap font-mono">
                          {r.name}
                        </td>
                        <td class="px-2 py-1 whitespace-nowrap text-gray-700">
                          {r.type ?? ""}
                        </td>
                        <td class="px-2 py-1 whitespace-nowrap">
                          {r.exists ? "yes" : "no"}
                        </td>
                        <td class="px-2 py-1">
                          <div
                            class="max-w-[60ch] overflow-hidden text-ellipsis whitespace-nowrap"
                            title={r.repr}
                          >
                            {r.repr}
                          </div>
                        </td>
                        <td class="px-2 py-1 whitespace-nowrap">
                          <button
                            class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                            onClick={() => removeWatch(r.name)}
                          >
                            移除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-sm text-gray-600">
          安装 PyPI 包（基于 micropip，尽量选择纯 Python 包）
        </div>
        <div class="flex gap-2">
          <input
            class="px-2 py-1 rounded border border-gray-200 text-sm"
            placeholder="如: requests"
            value={pkgName()}
            onInput={(e) => setPkgName((e.target as HTMLInputElement).value)}
          />
          <button
            class="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
            disabled={!isReady() || isRunning() || !pkgName()}
            onClick={() => installPackage(pkgName())}
          >
            安装
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm text-gray-600">
            Python 全局变量（pyodide.globals）
          </label>
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-600 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={hideDunder()}
                onInput={(e) =>
                  setHideDunder((e.target as HTMLInputElement).checked)
                }
              />
              隐藏 __dunder__
            </label>
            <button
              class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
              disabled={!isReady() || isRunning()}
              onClick={refreshGlobals}
            >
              刷新
            </button>
          </div>
        </div>
        <div class="overflow-auto rounded border border-gray-200">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="text-left px-2 py-1 font-600">Name</th>
                <th class="text-left px-2 py-1 font-600">Type</th>
                <th class="text-left px-2 py-1 font-600">Module</th>
                <th class="text-left px-2 py-1 font-600">Callable</th>
                <th class="text-left px-2 py-1 font-600">Repr</th>
              </tr>
            </thead>
            <tbody>
              {globalsRows()
                .filter((r) => (hideDunder() ? !/^__.*__$/.test(r.name) : true))
                .map((r) => (
                  <tr class="odd:bg-white even:bg-gray-50 align-top">
                    <td class="px-2 py-1 whitespace-nowrap font-mono">
                      {r.name}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap text-gray-700">
                      {r.type}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap text-gray-500">
                      {r.module ?? ""}
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      {r.callable ? "yes" : "no"}
                    </td>
                    <td class="px-2 py-1">
                      <div
                        class="max-w-[60ch] overflow-hidden text-ellipsis whitespace-nowrap"
                        title={r.repr}
                      >
                        {r.repr}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Show when={isLoading()}>
        <div class="text-sm text-gray-500">
          正在加载 Pyodide 与标准库，请稍候…
        </div>
      </Show>
    </div>
  );
}
