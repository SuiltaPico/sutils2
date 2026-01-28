import { createSignal, For, onMount, Show } from "solid-js";
import { IScenario, ScenarioResult } from "./core/scenario";
import {
  IDataStructure,
  IMemoryBackend,
  Snapshot,
  StepAction,
} from "./core/types";
import { AVLTree } from "./impl/AVLTree";
import { BTree } from "./impl/BTree";
import { BPlusTree } from "./impl/BPlusTree";
import { BinarySearchTree } from "./impl/BinarySearchTree";
import { DiskBackend } from "./impl/DiskBackend";
import { DoublyLinkedList } from "./impl/DoublyLinkedList";
import { FixedArray } from "./impl/FixedArray";
import { HashMap } from "./impl/HashMap";
import { PatriciaTrie } from "./impl/PatriciaTrie";
import { RedBlackTree } from "./impl/RedBlackTree";
import { ReferenceBackend } from "./impl/ReferenceBackend";
import { SinglyLinkedList } from "./impl/SinglyLinkedList";
import { SkipList } from "./impl/SkipList";
import { SplayTree } from "./impl/SplayTree";
import { Treap } from "./impl/Treap";
import { Trie } from "./impl/Trie";
import { AVLBalanceScenario } from "./scenarios/AVLBalanceScenario";
import { CacheSystemScenario } from "./scenarios/CacheSystemScenario";
import { DatabaseIndexScenario } from "./scenarios/DatabaseIndexScenario";
import { HotCacheScenario } from "./scenarios/HotCacheScenario";
import { IDESuggestionScenario } from "./scenarios/IDESuggestionScenario";
import { LogSystemScenario } from "./scenarios/LogSystemScenario";
import { RBTScenario } from "./scenarios/RBTScenario";
import { UserSearchScenario } from "./scenarios/UserSearchScenario";

// --- Visualizer Component (D3 + SVG Power) ---
import { Visualizer } from "./Visualizer";

// --- Main Controller ---
export default function NodePointerLab() {
  const [structures] = createSignal<IDataStructure[]>([
    new FixedArray(),
    new SinglyLinkedList(),
    new DoublyLinkedList(),
    new BinarySearchTree(),
    new AVLTree(),
    new RedBlackTree(),
    new SplayTree(),
    new Treap(),
    new SkipList(),
    new BTree("2-3 树", 3),
    new BTree("2-3-4 树", 4),
    new BTree("B 树 (5阶)", 5),
    new BPlusTree(),
    new Trie(),
    new PatriciaTrie(),
    new HashMap(),
  ]);
  const [scenarios] = createSignal<IScenario[]>([
    new LogSystemScenario(),
    new UserSearchScenario(),
    new AVLBalanceScenario(),
    new RBTScenario(),
    new HotCacheScenario(),
    new DatabaseIndexScenario(),
    new IDESuggestionScenario(),
    new CacheSystemScenario(),
  ]);
  const [selectedStructureIdx, setSelectedStructureIdx] = createSignal(0);
  const [selectedScenarioIdx, setSelectedScenarioIdx] = createSignal(0);
  const [currentStageIdx, setCurrentStageIdx] = createSignal(0);

  const currentScenario = () => scenarios()[selectedScenarioIdx()];
  const currentStages = () => currentScenario().getStages();

  const [backends] = createSignal<IMemoryBackend[]>([
    new ReferenceBackend(),
    new DiskBackend(),
  ]);
  const [selectedBackendIdx, setSelectedBackendIdx] = createSignal(0);
  const backend = () => backends()[selectedBackendIdx()];

  const [logs, setLogs] = createSignal<string[]>([]);
  const [snapshot, setSnapshot] = createSignal<Snapshot>({
    nodes: [],
    edges: [],
    pointers: [],
  });
  const [accumulatedCosts, setAccumulatedCosts] = createSignal({
    cpu: 0,
    memory: 0,
    disk: 0,
  });
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [timeRatio, setTimeRatio] = createSignal(0.1); // 1ms real time = 100ns simulated time

  const [currentStepAction, setCurrentStepAction] =
    createSignal<StepAction | null>(null);
  let generator: Generator<StepAction, void, void> | null = null;
  let autoPlayTimer: any = null;

  const initScenario = () => {
    switchStage(0);
  };

  const switchStage = (idx: number) => {
    const struct = structures()[selectedStructureIdx()];
    const stages = currentStages();
    if (idx < 0 || idx >= stages.length) return;

    // 1. 重置环境到初始状态
    backend().reset();
    struct.init(backend());
    setAccumulatedCosts({ cpu: 0, memory: 0, disk: 0 });
    setLogs([`>>> 初始化 ${struct.name}，正在快进至阶段: ${stages[idx].title}`]);

    // 2. 静默执行（快进）当前阶段之前的所有阶段
    for (let i = 0; i < idx; i++) {
      const gen = stages[i].run(struct);
      let res = gen.next();
      while (!res.done) {
        // 只执行逻辑，不更新 UI 和日志
        res = gen.next();
      }
    }

    // 3. 准备当前阶段
    setCurrentStageIdx(idx);
    generator = stages[idx].run(struct);
    setIsPlaying(false);
    setCurrentStepAction(null);
    setSnapshot(backend().getSnapshot()); // 立即更新当前快照
    
    if (autoPlayTimer) clearTimeout(autoPlayTimer);
    setLogs((prev) => [...prev, `>>> 准备就绪，当前阶段: ${stages[idx].title}`]);
  };

  const step = (isAuto = false) => {
    if (!generator) return;

    const next = generator.next();

    if (next.done) {
      setIsPlaying(false);
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
      setLogs((prev) => [...prev, `✅ 阶段执行完毕`]);
      return;
    }

    const action = next.value as StepAction;

    // 如果 action 中没有 costs，从 backend 获取
    if (!action.costs) {
      action.costs = backend().getCost(action);
    }

    // 累加成本
    setAccumulatedCosts((prev) => ({
      cpu: prev.cpu + (action.costs?.cpu || 0),
      memory: prev.memory + (action.costs?.memory || 0),
      disk: prev.disk + (action.costs?.disk || 0),
    }));

    setCurrentStepAction(action);
    setLogs((prev) => [
      ...prev,
      `[${action.type.toUpperCase()}] ${action.message}`,
    ]);

    setSnapshot(backend().getSnapshot());

    const logContainer = document.getElementById("log-container");
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;

    // 自动播放逻辑：根据当前步骤的模拟耗时计算现实等待时间
    if (isAuto && isPlaying()) {
      const totalCost =
        (action.costs?.cpu || 0) +
        (action.costs?.memory || 0) +
        (action.costs?.disk || 0);
      // 现实等待时间 = 模拟耗时 / 比值。设置一个最小值(如 50ms)保证动画可见
      const delay = Math.max(50, totalCost / timeRatio());
      autoPlayTimer = setTimeout(() => step(true), delay);
    }
  };

  const togglePlay = () => {
    if (isPlaying()) {
      setIsPlaying(false);
      clearTimeout(autoPlayTimer);
    } else {
      setIsPlaying(true);
      step(true);
    }
  };

  onMount(() => {
    initScenario();
  });

  return (
    <div class="p-6 max-w-7xl mx-auto h-screen flex flex-col gap-6 font-sans text-slate-800 bg-white">
      <header class="flex justify-between items-end border-b border-slate-100 pb-6">
        <div>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              N
            </div>
            <h1 class="text-3xl font-black tracking-tight text-slate-900">
              节点与指针 <span class="text-blue-600">实验室</span>
            </h1>
          </div>
          <p class="text-slate-500 mt-2 font-medium">
            重演计算机科学的历史选择：直观感受数据结构的“自然生长”
          </p>
        </div>
        <div class="flex gap-3 items-center">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">
              存储模式
            </label>
            <select
              class="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={selectedBackendIdx()}
              onChange={(e) => {
                setSelectedBackendIdx(Number(e.currentTarget.value));
                initScenario();
              }}
            >
              <For each={backends()}>
                {(be, index) => <option value={index()}>{be.name}</option>}
              </For>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">
              选择场景
            </label>
            <select
              class="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={selectedScenarioIdx()}
              onChange={(e) => {
                setSelectedScenarioIdx(Number(e.currentTarget.value));
                initScenario();
              }}
            >
              <For each={scenarios()}>
                {(scen, index) => <option value={index()}>{scen.title}</option>}
              </For>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">
              选择结构
            </label>
            <select
              class="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={selectedStructureIdx()}
              onChange={(e) => {
                setSelectedStructureIdx(Number(e.currentTarget.value));
                initScenario();
              }}
            >
              <For each={structures()}>
                {(struct, index) => (
                  <option value={index()}>{struct.name}</option>
                )}
              </For>
            </select>
          </div>
          <button
            class="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all shadow-lg shadow-slate-200 mt-4"
            onClick={initScenario}
          >
            重置实验
          </button>
        </div>
      </header>

      <main class="flex-1 flex gap-6 min-h-0">
        {/* Left: Visualization */}
        <div class="flex-[3] flex flex-col gap-4 min-w-0">
          <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div class="flex items-center gap-3">
              <button
                onClick={togglePlay}
                class={`px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                  isPlaying()
                    ? "bg-amber-500 text-white"
                    : "bg-blue-600 text-white shadow-lg shadow-blue-100"
                }`}
              >
                {isPlaying() ? (
                  <>
                    <span>⏸</span> 暂停
                  </>
                ) : (
                  <>
                    <span>▶</span> 自动演示
                  </>
                )}
              </button>
              <button
                onClick={() => step(false)}
                class="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-bold text-sm transition-all text-slate-600"
                disabled={isPlaying()}
              >
                单步步进 ➔
              </button>

              <div class="h-6 w-px bg-slate-200 mx-2"></div>

              <div class="flex gap-1 bg-slate-200/50 p-1 rounded-lg">
                <For each={currentStages()}>
                  {(stage, index) => (
                    <button
                      onClick={() => switchStage(index())}
                      class={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        currentStageIdx() === index()
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                      }`}
                      disabled={isPlaying()}
                    >
                      {stage.title}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-slate-400 uppercase">
                  时间压缩比 (1ms : X ns)
                </span>
                <input
                  type="range"
                  min="1"
                  max="1000"
                  value={timeRatio()}
                  class="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  onInput={(e) => {
                    setTimeRatio(Number(e.currentTarget.value));
                  }}
                />
                <span class="text-xs font-mono font-bold text-slate-600 w-16 text-right">
                  {timeRatio()}ns
                </span>
              </div>
            </div>
          </div>

          <div class="flex-1 rounded-2xl overflow-hidden relative group">
            <Visualizer
              snapshot={snapshot()}
              width={900}
              height={600}
              currentAction={currentStepAction()}
            />

            <Show when={currentStepAction()}>
              <div class="absolute bottom-6 left-6 right-6 bg-slate-900/90 text-white p-5 rounded-xl backdrop-blur-md border border-white/10 shadow-2xl transition-all animate-in slide-in-from-bottom-4">
                <div class="flex items-start gap-4">
                  <div
                    class={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                      currentStepAction()?.type === "alloc"
                        ? "bg-blue-500"
                        : currentStepAction()?.type === "free"
                        ? "bg-rose-500"
                        : currentStepAction()?.type === "write"
                        ? "bg-amber-500"
                        : currentStepAction()?.type === "read"
                        ? "bg-purple-500"
                        : currentStepAction()?.type === "move_ptr"
                        ? "bg-indigo-500"
                        : "bg-slate-600"
                    }`}
                  >
                    {(() => {
                      const types: Record<string, string> = {
                        alloc: "分配内存",
                        free: "释放内存",
                        write: "写入数据",
                        read: "读取数据",
                        move_ptr: "移动指针",
                        highlight: "高亮",
                        log: "日志",
                      };
                      return (
                        types[currentStepAction()?.type || ""] ||
                        currentStepAction()?.type
                      );
                    })()}
                  </div>
                  <div class="text-lg font-medium leading-tight">
                    {currentStepAction()?.message}
                  </div>
                </div>
                <div class="mt-3 flex gap-4 border-t border-white/10 pt-3">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-slate-500 font-bold uppercase">
                      CPU
                    </span>
                    <span class="text-xs font-mono text-blue-400">
                      +{currentStepAction()?.costs?.cpu || 0}ns
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-slate-500 font-bold uppercase">
                      内存
                    </span>
                    <span class="text-xs font-mono text-emerald-400">
                      +{currentStepAction()?.costs?.memory || 0}ns
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-slate-500 font-bold uppercase">
                      磁盘
                    </span>
                    <span class="text-xs font-mono text-rose-400">
                      +{currentStepAction()?.costs?.disk || 0}ns
                    </span>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Right: Logs & Stats */}
        <div class="flex-1 flex flex-col gap-4 w-96">
          {/* Performance Dashboard */}
          <div class="bg-slate-900 rounded-2xl p-5 flex flex-col gap-4 shadow-xl border border-white/5">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                <h3 class="font-bold text-slate-200 text-sm tracking-wide">
                  硬件模拟监控
                </h3>
              </div>
              <span class="text-[10px] font-mono text-slate-500">实时指标</span>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <div class="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <div class="flex justify-between items-end mb-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase">
                    CPU 消耗
                  </span>
                  <span class="text-blue-400 font-mono font-bold">
                    {accumulatedCosts().cpu}{" "}
                    <span class="text-[9px] font-normal text-slate-500 ml-0.5">
                      ns
                    </span>
                  </span>
                </div>
                <div class="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                  <div
                    class="bg-blue-500 h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (accumulatedCosts().cpu / 1000) * 100
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div class="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <div class="flex justify-between items-end mb-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase">
                    内存延迟
                  </span>
                  <span class="text-emerald-400 font-mono font-bold">
                    {accumulatedCosts().memory}{" "}
                    <span class="text-[9px] font-normal text-slate-500 ml-0.5">
                      ns
                    </span>
                  </span>
                </div>
                <div class="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                  <div
                    class="bg-emerald-500 h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (accumulatedCosts().memory / 5000) * 100
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div class="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <div class="flex justify-between items-end mb-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase">
                    磁盘 I/O
                  </span>
                  <span class="text-rose-400 font-mono font-bold">
                    {accumulatedCosts().disk}{" "}
                    <span class="text-[9px] font-normal text-slate-500 ml-0.5">
                      ns
                    </span>
                  </span>
                </div>
                <div class="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                  <div
                    class="bg-rose-500 h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (accumulatedCosts().disk / 10000) * 100
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            <div class="pt-2 border-t border-white/10 mt-1 flex justify-between items-center">
              <span class="text-xs text-slate-400 font-medium">
                总计预估耗时
              </span>
              <span class="text-lg font-black text-white font-mono">
                {(
                  accumulatedCosts().cpu +
                  accumulatedCosts().memory +
                  accumulatedCosts().disk
                ).toLocaleString()}{" "}
                <span class="text-xs font-normal text-slate-400">ns</span>
              </span>
            </div>
          </div>

          <div class="bg-slate-900 rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <h3 class="font-bold text-slate-200 text-sm tracking-wide">
                实时监控日志
              </h3>
            </div>
            <div
              id="log-container"
              class="h-64 overflow-y-auto bg-slate-800/50 rounded-xl p-4 text-[11px] font-mono leading-relaxed text-slate-300 scroll-smooth border border-white/5"
            >
              <For each={logs()}>
                {(log) => (
                  <div class="py-1.5 border-b border-white/5 last:border-0 flex gap-2">
                    <span class="text-slate-500">›</span>
                    <span>{log}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="bg-blue-50/50 rounded-2xl p-6 border border-blue-100/50 shadow-sm flex-1">
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xl">💡</span>
              <h4 class="font-black text-blue-900 text-lg">场景解读</h4>
            </div>
            <div class="space-y-4">
              <div>
                <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
                  当前挑战
                </div>
                <div class="text-slate-800 font-bold leading-snug">
                  {scenarios()[selectedScenarioIdx()].title}
                </div>
              </div>
              <div>
                <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
                  实验目的
                </div>
                <div class="text-slate-600 text-sm leading-relaxed italic">
                  {scenarios()[selectedScenarioIdx()].description}
                </div>
              </div>
              <div class="p-3 bg-white/60 rounded-xl border border-blue-200/50">
                <div class="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 underline">
                  痛点描述
                </div>
                <div class="text-slate-700 text-xs font-medium leading-relaxed">
                  {scenarios()[selectedScenarioIdx()].painPoint}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
