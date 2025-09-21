import { createSignal, onCleanup, onMount } from "solid-js";
import wabt from "wabt";

// 数据驱动配置，避免魔法数字
const AUDIO_CONFIG = {
  blockSize: 128,
  maxChannels: 2,
  defaultCutoffHz: 800,
} as const;

// 一阶低通：y[n] = (1 - k) * x[n] + k * y[n-1]
// k = exp(-2*pi*cutoff/sampleRate)
function cutoffToK(cutoffHz: number, sampleRate: number): number {
  const twoPi = Math.PI * 2;
  const k = Math.exp((-twoPi * Math.max(1, cutoffHz)) / Math.max(1, sampleRate));
  return Math.min(0.9999, Math.max(0, k));
}

// 直接书写 WAT，使 wasm 在 AudioWorklet 内完成块处理与状态维护
const FILTER_WAT = `(module
  (memory (export "memory") 1)
  (global $in (mut i32) (i32.const 0))
  (global $out (mut i32) (i32.const 0))
  (global $st (mut i32) (i32.const 0))

  (func (export "setup") (param $pin i32) (param $pout i32) (param $pst i32)
    (global.set $in (local.get $pin))
    (global.set $out (local.get $pout))
    (global.set $st (local.get $pst))
  )

  (func (export "process") (param $frames i32) (param $chans i32) (param $k f32)
    (local $i i32)
    (local $ch i32)
    (local $oneMinusK f32)
    (local $yprev f32)
    (local $x f32)
    (local $y f32)
    (local $off i32)

    (local.set $oneMinusK (f32.sub (f32.const 1) (local.get $k)))

    (local.set $ch (i32.const 0))
    (loop $ch_loop
      (local.set $i (i32.const 0))
      (local.set $yprev (f32.load (i32.add (global.get $st) (i32.mul (local.get $ch) (i32.const 4)))))

      (loop $frame_loop
        (local.set $off (i32.mul (i32.add (i32.mul (local.get $i) (local.get $chans)) (local.get $ch)) (i32.const 4)))
        (local.set $x (f32.load (i32.add (global.get $in) (local.get $off))))
        (local.set $y 
          (f32.add
            (f32.mul (local.get $oneMinusK) (local.get $x))
            (f32.mul (local.get $k) (local.get $yprev))
          )
        )
        (f32.store (i32.add (global.get $out) (local.get $off)) (local.get $y))
        (local.set $yprev (local.get $y))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $frame_loop (i32.lt_s (local.get $i) (local.get $frames)))
      )

      (f32.store (i32.add (global.get $st) (i32.mul (local.get $ch) (i32.const 4))) (local.get $yprev))
      (local.set $ch (i32.add (local.get $ch) (i32.const 1)))
      (br_if $ch_loop (i32.lt_s (local.get $ch) (local.get $chans)))
    )
  )
)`;

export default function WasmAudioWorkletLowpass() {
  const [error, setError] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [sourceType, setSourceType] = createSignal<"osc" | "mic">("osc");
  const [cutoff, setCutoff] = createSignal<number>(AUDIO_CONFIG.defaultCutoffHz);
  const [wabtReady, setWabtReady] = createSignal(false);

  let audioCtx: AudioContext | null = null;
  let workletUrl: string | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let srcOsc: OscillatorNode | null = null;
  let srcGain: GainNode | null = null;
  let micStream: MediaStream | null = null;
  let micNode: MediaStreamAudioSourceNode | null = null;

  onMount(async () => {
    try {
      await wabt();
      setWabtReady(true);
    } catch (e) {
      console.error(e);
      setError("WABT 加载失败");
    }
  });

  onCleanup(() => {
    stop();
  });

  async function buildWasmBytes(): Promise<Uint8Array> {
    const compiler = await wabt();
    const mod = compiler.parseWat("filter.wat", FILTER_WAT);
    const { buffer } = mod.toBinary({ write_debug_names: false });
    return buffer;
  }

  function makeWorkletBlobUrl(): string {
    const code = `
class WasmFilterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._instance = null;
    this._memory = null;
    this._inputPtr = 0;
    this._outputPtr = 0;
    this._statePtr = 0;
    this._frames = (options && options.processorOptions && options.processorOptions.blockSize) || 128;
    this._channels = 2;
    this._k = 0.95;
    const wasmBytes = options && options.processorOptions && options.processorOptions.wasmBytes;
    WebAssembly.instantiate(wasmBytes, {}).then(({ instance }) => {
      this._instance = instance;
      this._memory = instance.exports.memory;
      const bytesForBlock = this._frames * this._channels * 4;
      this._inputPtr = 0;
      this._outputPtr = this._inputPtr + bytesForBlock;
      this._statePtr = this._outputPtr + bytesForBlock;
      instance.exports.setup(this._inputPtr, this._outputPtr, this._statePtr);
    });
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'setK' && typeof m.k === 'number') {
        this._k = Math.max(0, Math.min(0.9999, m.k));
      }
    };
  }

  _ensureMemory(minBytes) {
    const page = 65536;
    const mem = this._memory;
    if (!mem) return;
    const need = Math.ceil((this._statePtr + minBytes) / page);
    if (need > mem.grow(0)) {
      const cur = mem.buffer.byteLength / page;
      const delta = Math.max(0, need - cur);
      if (delta > 0) mem.grow(delta);
    }
  }

  process(inputs, outputs) {
    if (!this._instance || !this._memory) return true;
    const input = inputs[0];
    const output = outputs[0];
    const chans = Math.min(this._channels, (input && input.length) || 1);
    const frames = (input && input[0] && input[0].length) || this._frames;
    const bytesForBlock = frames * chans * 4;
    this._ensureMemory(bytesForBlock * 2 + chans * 4);
    const f32In = new Float32Array(this._memory.buffer, this._inputPtr, frames * chans);
    for (let ch = 0; ch < chans; ch++) {
      const src = input[ch] || new Float32Array(frames);
      for (let i = 0; i < frames; i++) f32In[i * chans + ch] = src[i] || 0;
    }
    this._instance.exports.process(frames, chans, this._k);
    const f32Out = new Float32Array(this._memory.buffer, this._outputPtr, frames * chans);
    for (let ch = 0; ch < chans; ch++) {
      const dst = output[ch];
      if (!dst) continue;
      for (let i = 0; i < frames; i++) dst[i] = f32Out[i * chans + ch];
    }
    return true;
  }
}
registerProcessor('wasm-filter', WasmFilterProcessor);
`;
    return URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  }

  async function start() {
    if (running()) return;
    setError("");
    try {
      const wasmBytes = await buildWasmBytes();
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      workletUrl = makeWorkletBlobUrl();
      await audioCtx.audioWorklet.addModule(workletUrl);
      workletNode = new AudioWorkletNode(audioCtx, "wasm-filter", {
        processorOptions: {
          wasmBytes,
          blockSize: AUDIO_CONFIG.blockSize,
        },
      });

      // 初始化系数
      workletNode.port.postMessage({ type: "setK", k: cutoffToK(cutoff(), audioCtx.sampleRate) });

      if (sourceType() === "osc") {
        srcOsc = audioCtx.createOscillator();
        srcOsc.type = "sawtooth";
        srcOsc.frequency.value = 440;
        srcGain = audioCtx.createGain();
        srcGain.gain.value = 0.2;
        srcOsc.connect(srcGain).connect(workletNode).connect(audioCtx.destination);
        srcOsc.start();
      } else {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micNode = audioCtx.createMediaStreamSource(micStream);
        micNode.connect(workletNode).connect(audioCtx.destination);
      }

      setRunning(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "启动失败");
      stop();
    }
  }

  function stop() {
    setRunning(false);
    try { srcOsc?.stop(); } catch {}
    try { srcOsc?.disconnect(); } catch {}
    try { srcGain?.disconnect(); } catch {}
    try { micNode?.disconnect(); } catch {}
    try { workletNode?.disconnect(); } catch {}
    srcOsc = null;
    srcGain = null;
    workletNode = null;
    if (micStream) {
      for (const t of micStream.getTracks()) try { t.stop(); } catch {}
      micStream = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }
    if (workletUrl) {
      URL.revokeObjectURL(workletUrl);
      workletUrl = null;
    }
  }

  function handleCutoffChange(value: number) {
    setCutoff(value);
    if (audioCtx && workletNode) {
      const k = cutoffToK(value, audioCtx.sampleRate);
      workletNode.port.postMessage({ type: "setK", k });
    }
  }

  return (
    <div class="font-sans max-w-3xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">WASM + WebAudio 实时低通</h1>
      <p class="text-gray-600 mb-4">AudioWorklet 中实例化 Wasm，在音频线程执行一阶低通滤波；主线程用 wabt 即时编译 WAT。</p>

      <div class="flex items-center gap-3 mb-4">
        <label class="flex items-center gap-1 text-sm">
          <input
            type="radio"
            name="src"
            checked={sourceType() === "osc"}
            onChange={() => setSourceType("osc")}
          />
          合成器
        </label>
        <label class="flex items-center gap-1 text-sm">
          <input
            type="radio"
            name="src"
            checked={sourceType() === "mic"}
            onChange={() => setSourceType("mic")}
          />
          麦克风
        </label>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm w-28">截止频率 (Hz)</label>
        <input
          type="range"
          min="50"
          max="8000"
          step="1"
          value={cutoff()}
          onInput={(e) => handleCutoffChange(parseInt(e.currentTarget.value, 10))}
          class="flex-1"
        />
        <span class="w-16 text-right text-sm">{cutoff()}</span>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <button
          onClick={start}
          disabled={running() || !wabtReady()}
          class="px-4 py-2 text-base cursor-pointer bg-blue-500 hover:bg-blue-600 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {running() ? "运行中..." : wabtReady() ? "开始" : "编译器加载中..."}
        </button>
        <button
          onClick={stop}
          disabled={!running()}
          class="px-4 py-2 text-base cursor-pointer bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
        >
          停止
        </button>
      </div>

      {error() && (
        <div class="text-red-700 bg-red-100 p-2 rounded">{error()}</div>
      )}
    </div>
  );
}


