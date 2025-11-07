import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import DuckDBEhWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import DuckDBEhWASMModuleUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import type * as sqlite3 from "@sqlite.org/sqlite-wasm";
import Sqlite3WASMModuleUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import type * as sqljs from "sql.js";
import SqljsWASMModuleUrl from "sql.js/dist/sql-wasm.wasm?url";
type EngineKind = "sqljs" | "sqlite-wasm" | "duckdb-wasm";

type QueryResult = {
  columns: string[];
  rows: any[];
};

export default function SqlLab() {
  const [engine, setEngine] = createSignal<EngineKind>("sqljs");
  const [isReady, setIsReady] = createSignal(false);
  const [isRunning, setIsRunning] = createSignal(false);
  const [message, setMessage] = createSignal<string>("");
  const [sql, setSql] = createSignal<string>(
    [
      "-- 选择引擎后点击运行，可修改 SQL 再次执行",
      "-- 建议从简单查询开始：",
      "SELECT 42 AS answer;",
    ].join("\n")
  );
  const [result, setResult] = createSignal<QueryResult>({
    columns: [],
    rows: [],
  });

  // engine instances
  let sqljsDb: sqljs.Database | null = null;
  let sqliteWasm: sqlite3.Sqlite3Static | null = null; // sqlite3 module
  let sqliteDb: sqlite3.Database | null = null; // sqlite3.oo1.DB
  let duckdb: typeof import("@duckdb/duckdb-wasm") | null = null;
  let duckDbInstance: AsyncDuckDB | null = null; // AsyncDuckDB
  let duckConn: AsyncDuckDBConnection | null = null; // Connection

  async function ensureEngineReady(kind: EngineKind) {
    setMessage("");
    if (kind === "sqljs") {
      if (!sqljsDb) {
        const initSqlJs = (await import("sql.js")).default;
        const SQL = await initSqlJs({
          locateFile: (file) => {
            console.log("locateFile", file);
            if (file === "sql-wasm.wasm") {
              return SqljsWASMModuleUrl;
            }
            return `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${file}`;
          },
        });
        sqljsDb = new SQL.Database();
      }
      setIsReady(true);
      return;
    }
    if (kind === "sqlite-wasm") {
      if (!sqliteDb) {
        const sqlite3InitModule = (await import("@sqlite.org/sqlite-wasm"))
          .default;
        sqliteWasm = await sqlite3InitModule({
          print: (s: string) => setMessage((m) => (m ? m + "\n" : "") + s),
          printErr: (s: string) => setMessage((m) => (m ? m + "\n" : "") + s),
          locateFile: (file: string) => {
            if (file === "sqlite3.wasm") {
              return Sqlite3WASMModuleUrl;
            }
            return `https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.50.4-build1/${file}`;
          },
        });
        sqliteDb = new sqliteWasm.oo1.DB();
      }
      setIsReady(true);
      return;
    }
    if (kind === "duckdb-wasm") {
      if (!duckConn) {
        duckdb = await import("@duckdb/duckdb-wasm");
        const bundle = await duckdb.selectBundle({
          eh: {
            mainModule: DuckDBEhWASMModuleUrl,
            mainWorker: DuckDBEhWorkerUrl,
          },
        } as any);
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();
        duckDbInstance = new duckdb.AsyncDuckDB(logger, worker);
        await duckDbInstance.instantiate(
          bundle.mainModule,
          bundle.pthreadWorker
        );
        duckConn = await duckDbInstance.connect();
      }
      setIsReady(true);
      return;
    }
  }

  async function run() {
    setIsRunning(true);
    setMessage("");
    setResult({ columns: [], rows: [] });
    try {
      await ensureEngineReady(engine());
      const q = sql();
      if (engine() === "sqljs") {
        if (!sqljsDb) throw new Error("sql.js 数据库未初始化");
        const res = sqljsDb.exec(q);
        if (!res || res.length === 0) {
          setMessage("(无结果)");
          return;
        }
        const first = res[0];
        const columns = first.columns ?? [];
        const rows = (first.values ?? []).map((arr: any[]) => {
          const obj: Record<string, any> = {};
          columns.forEach((c: string, i: number) => (obj[c] = arr[i]));
          return obj;
        });
        setResult({ columns, rows });
        return;
      }
      if (engine() === "sqlite-wasm") {
        if (!sqliteDb) throw new Error("SQLite Wasm 数据库未初始化");
        const rows: any[] = [];
        sqliteDb.exec({
          sql: q,
          rowMode: "object",
          callback: (r) => {
            rows.push(r);
          },
        });
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        setResult({ columns, rows });
        if (rows.length === 0) setMessage("(无结果)");
        return;
      }
      if (engine() === "duckdb-wasm") {
        if (!duckConn) throw new Error("DuckDB Wasm 连接未初始化");
        const table = await duckConn.query(q);
        const columns: string[] = table.schema.fields.map((f: any) => f.name);
        const vectors = columns.map((_, i) => table.getChildAt(i));
        const rows: any[] = [];
        for (let r = 0; r < table.numRows; r++) {
          const obj: Record<string, any> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = vectors[i]?.get(r);
          }
          rows.push(obj);
        }
        setResult({ columns, rows });
        if (!rows || rows.length === 0) setMessage("(无结果)");
        return;
      }
    } catch (err: any) {
      setMessage(String(err?.message ?? err));
    } finally {
      setIsRunning(false);
    }
  }

  onMount(async () => {
    // 延迟到首次运行时再加载引擎；这里仅清空状态
    setIsReady(false);
  });

  onCleanup(async () => {
    try {
      if (sqljsDb) {
        sqljsDb.close();
        sqljsDb = null;
      }
    } catch {}
    try {
      if (sqliteDb) {
        sqliteDb.close();
        sqliteDb = null;
      }
    } catch {}
    try {
      if (duckConn) {
        await duckConn.close();
        duckConn = null;
      }
      if (duckDbInstance) {
        await duckDbInstance.terminate?.();
        duckDbInstance = null;
      }
    } catch {}
  });

  const hasData = createMemo(
    () => result().columns.length > 0 && result().rows.length > 0
  );

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-600">在线 SQL 实验</h1>
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">引擎</label>
          <select
            class="px-2 py-1 rounded border border-gray-200 text-sm"
            value={engine()}
            onInput={async (e) => {
              const val = (e.target as HTMLSelectElement).value as EngineKind;
              setEngine(val);
              setIsReady(false);
              setMessage("");
            }}
          >
            <option value="sqljs">sql.js</option>
            <option value="sqlite-wasm">@sqlite.org/sqlite-wasm</option>
            <option value="duckdb-wasm">@duckdb/duckdb-wasm</option>
          </select>
          <Show
            when={isReady()}
            fallback={<span class="text-xs text-gray-500">未初始化</span>}
          >
            <span class="text-xs text-emerald-600">已就绪</span>
          </Show>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-sm text-gray-600">SQL</label>
        <textarea
          class="w-full h-40 p-2 rounded border border-gray-200 font-mono text-sm"
          value={sql()}
          onInput={(e) => setSql((e.target as HTMLTextAreaElement).value)}
        />
        <div class="flex gap-2">
          <button
            class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={isRunning()}
            onClick={run}
          >
            运行
          </button>
          <button
            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
            disabled={isRunning()}
            onClick={() => {
              setResult({ columns: [], rows: [] });
              setMessage("");
            }}
          >
            清空结果
          </button>
        </div>
      </div>

      <Show when={message()}>
        <div class="p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-sm whitespace-pre-wrap">
          {message()}
        </div>
      </Show>

      <div class="space-y-2">
        <label class="text-sm text-gray-600">结果</label>
        <Show
          when={hasData()}
          fallback={<div class="text-sm text-gray-500">无结果</div>}
        >
          <div class="overflow-auto rounded border border-gray-200">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  {result().columns.map((c) => (
                    <th class="text-left px-2 py-1 font-600 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result().rows.map((r) => (
                  <tr class="odd:bg-white even:bg-gray-50">
                    {result().columns.map((c) => (
                      <td class="px-2 py-1 whitespace-nowrap">
                        {String((r as any)[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  );
}
