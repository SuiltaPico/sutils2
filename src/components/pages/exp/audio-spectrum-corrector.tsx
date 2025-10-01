import { createSignal, onCleanup, Show, For } from "solid-js";
import { A } from "@solidjs/router";

type Complex = { re: number; im: number };

function hannWindow(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (length - 1)));
  }
  return w;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

async function decodeAudioFile(
  file: File
): Promise<{ audioBuffer: AudioBuffer; context: AudioContext }> {
  const arrayBuffer = await file.arrayBuffer();
  const context = new AudioContext();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  return { audioBuffer, context };
}

function makeOLAWindowCompensation(win: Float32Array, hopSize: number) {
  // 计算窗口叠加校正（OLA-得分），避免重建增益偏差
  const len = win.length;
  const comp = new Float32Array(len);
  for (let n = 0; n < len; n++) {
    let denom = 0;
    for (let k = -4; k <= 4; k++) {
      const idx = n + k * hopSize;
      if (idx >= 0 && idx < len) denom += win[idx] * win[idx];
    }
    comp[n] = denom > 1e-9 ? 1 / denom : 1;
  }
  return comp;
}

// 简易FFT: 使用 fft.js
import FFT from "fft.js";

function rfftForwardReal(fft: any, time: Float32Array): Complex[] {
  const out = new Float32Array(fft.size * 2);
  fft.realTransform(out, time);
  fft.completeSpectrum(out);
  const N = fft.size;
  const spec: Complex[] = new Array(N);
  for (let k = 0; k < N; k++) spec[k] = { re: out[2 * k], im: out[2 * k + 1] };
  return spec;
}

function rfftInverseReal(fft: any, spectrum: Complex[]): Float32Array {
  const N = fft.size;
  const specArr = new Float32Array(N * 2);
  for (let k = 0; k < N; k++) {
    specArr[2 * k] = spectrum[k].re;
    specArr[2 * k + 1] = spectrum[k].im;
  }
  const outComplex = new Float32Array(N * 2);
  fft.inverseTransform(outComplex, specArr);
  const time = new Float32Array(N);
  // 提取实部并做 1/N 归一化（fft.js 不自动归一化）
  for (let n = 0; n < N; n++) time[n] = outComplex[2 * n] / N;
  return time;
}

// 频谱纠正规则
type EnforceOptions = {
  strength: number;
  maxBoostDb: number;
  maxCutDb: number;
  noiseFloorFactor: number; // 相对中位幅度
  smoothBins: number; // 移动平均窗口半径
};

function enforceToTargetSpectrumPreserveEnergy(
  spectrum: Complex[],
  targetShape: Float32Array,
  options: EnforceOptions
) {
  const mags = spectrum.map((c) => Math.hypot(c.re, c.im));
  const eps = 1e-9;
  const { strength, maxBoostDb, maxCutDb, noiseFloorFactor, smoothBins } = options;

  // 噪声门：以中位数为参考
  const sorted = [...mags].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || eps;
  const noiseFloor = median * Math.max(0, Math.min(1, noiseFloorFactor));

  // 先计算未限制的目标 newMags
  const gains = new Array(mags.length); // 线性增益
  const newMags = new Array(mags.length);
  for (let k = 0; k < mags.length; k++) {
    const target = targetShape[k] || 1;
    const ratio = mags[k] / Math.max(eps, target);
    const corr = Math.pow(ratio, 1 - strength);
    let proposed = target * corr;
    // 噪声门：如果当前幅度低于噪声门，则不允许提升，只允许衰减
    if (mags[k] < noiseFloor && proposed > mags[k]) proposed = mags[k];
    // 限制最大boost/cut（以dB限制）
    const g0 = proposed / Math.max(eps, mags[k]);
    const g0Db = 20 * Math.log10(Math.max(eps, g0));
    const gDb = clamp(g0Db, -Math.abs(maxCutDb), Math.abs(maxBoostDb));
    const g = Math.pow(10, gDb / 20);
    gains[k] = g;
    newMags[k] = mags[k] * g;
  }

  // 频域平滑：对增益做移动平均，减少锯齿/白噪放大
  if (smoothBins > 0) {
    const radius = Math.floor(smoothBins);
    const smoothed = new Array(gains.length).fill(0);
    for (let k = 0; k < gains.length; k++) {
      let acc = 0;
      let cnt = 0;
      for (let r = -radius; r <= radius; r++) {
        const idx = k + r;
        if (idx >= 0 && idx < gains.length) {
          acc += gains[idx];
          cnt++;
        }
      }
      const g = acc / Math.max(1, cnt);
      smoothed[k] = g;
    }
    for (let k = 0; k < gains.length; k++) newMags[k] = mags[k] * smoothed[k];
  }

  // 能量守恒
  let energyOrig = 0;
  let energyNew = 0;
  for (let k = 0; k < mags.length; k++) {
    energyOrig += mags[k] * mags[k];
    energyNew += newMags[k] * newMags[k];
  }
  const scale = Math.sqrt((energyOrig + eps) / (energyNew + eps));
  for (let k = 0; k < spectrum.length; k++) {
    const oldM = Math.max(eps, mags[k]);
    const m = newMags[k] * scale;
    const g = m / oldM;
    spectrum[k].re *= g;
    spectrum[k].im *= g;
  }
}

function buildTargetMagnitudes(
  fftSize: number,
  sampleRate: number,
  centers: number[],
  gainsDb: number[]
): Float32Array {
  // 将10段中心频率和dB增益，插值映射到每个频点的线性幅度（相对形状）
  const mags = new Float32Array(fftSize);
  const eps = 1e-9;
  // 构造锚点（加入最小/最大频率边界）
  const points: { f: number; a: number }[] = [];
  points.push({ f: 20, a: dbToAmp(gainsDb[0] ?? 0) });
  for (let i = 0; i < centers.length; i++)
    points.push({ f: centers[i], a: dbToAmp(gainsDb[i] ?? 0) });
  points.push({
    f: sampleRate / 2,
    a: dbToAmp(gainsDb[gainsDb.length - 1] ?? 0),
  });
  // 对数频率线性插值
  for (let k = 0; k < fftSize; k++) {
    const f = (k * sampleRate) / fftSize;
    const fa = Math.max(20, Math.min(sampleRate / 2, f));
    const lf = Math.log10(fa);
    let a = points[0].a;
    for (let i = 0; i < points.length - 1; i++) {
      const f1 = Math.log10(points[i].f);
      const f2 = Math.log10(points[i + 1].f);
      if (lf >= f1 && lf <= f2) {
        const t = (lf - f1) / Math.max(eps, f2 - f1);
        a = points[i].a * (1 - t) + points[i + 1].a * t;
        break;
      }
      if (lf > f2) a = points[i + 1].a;
    }
    mags[k] = a;
  }
  // 归一：保持单位均方，避免系统性增益
  let e = 0;
  for (let k = 0; k < fftSize; k++) e += mags[k] * mags[k];
  const s = Math.sqrt((fftSize + eps) / (e + eps));
  for (let k = 0; k < fftSize; k++) mags[k] *= s;
  return mags;
}

function dbToAmp(db: number) {
  return Math.pow(10, db / 20);
}

function applyPinkTilt(shape: Float32Array, sampleRate: number) {
  // 约 -3 dB / oct（粉噪）：幅度按频率的 -1/2 次幂缩放（功率 ~ 1/f）
  // 参考频率 1kHz，避免直流/极高频异常
  const fRef = 1000;
  for (let k = 0; k < shape.length; k++) {
    const f = (k * sampleRate) / shape.length;
    const fr = Math.max(20, Math.min(sampleRate / 2, f));
    const factor = Math.pow(fr / fRef, -0.5);
    shape[k] *= factor;
  }
  // 重新归一，避免系统性增益
  let e = 0;
  for (let k = 0; k < shape.length; k++) e += shape[k] * shape[k];
  const s = Math.sqrt((shape.length + 1e-9) / (e + 1e-9));
  for (let k = 0; k < shape.length; k++) shape[k] *= s;
}

  function drawWaveWithFrames(
    canvas: HTMLCanvasElement | undefined,
    data: Float32Array,
    frames: number[],
    color: string
  ) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // 波形
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const i = Math.floor((x / w) * data.length);
      const y = (0.5 - 0.45 * data[i]) * h;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 帧边界
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 0.5;
    for (const pos of frames) {
      const x = Math.floor((pos / data.length) * w);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
  }

export default function AudioSpectrumCorrector() {
  const [file, setFile] = createSignal<File | null>(null);
  const [status, setStatus] = createSignal<string>("");
  const [winMs, setWinMs] = createSignal(32);
  const [hopRatio, setHopRatio] = createSignal(0.5);
  const [strength, setStrength] = createSignal(0.8);
  // 预留：可扩展不同目标谱（中位/均值等）
  const [origUrl, setOrigUrl] = createSignal<string | null>(null);
  const [procUrl, setProcUrl] = createSignal<string | null>(null);
  const [hopSlide, setHopSlide] = createSignal(false);
  const [interleave, setInterleave] = createSignal(8); // 交织数：hop = winLen / interleave
  const [maxBoostDb, setMaxBoostDb] = createSignal(6);
  const [maxCutDb, setMaxCutDb] = createSignal(12);
  const [noiseFloorFactor, setNoiseFloorFactor] = createSignal(0.2);
  const [smoothBins, setSmoothBins] = createSignal(5);
  const [usePinkTilt, setUsePinkTilt] = createSignal(false);

  // 可视化：canvas refs
  let origCanvas: HTMLCanvasElement | undefined;
  let procCanvas: HTMLCanvasElement | undefined;
  // 10段EQ（中心频率, dB 增益）
  const eqCenters = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const [eqGainsDb, setEqGainsDb] = createSignal<number[]>(
    new Array(10).fill(0)
  );
  function setEqGain(idx: number, v: number) {
    const arr = eqGainsDb().slice();
    arr[idx] = v;
    setEqGainsDb(arr);
  }
  function resetEq() {
    setEqGainsDb(new Array(10).fill(0));
  }

  let audioCtx: AudioContext | null = null;

  onCleanup(() => {
    if (origUrl()) URL.revokeObjectURL(origUrl()!);
    if (procUrl()) URL.revokeObjectURL(procUrl()!);
  });

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const f = input.files[0]!;
    setFile(f);
    if (origUrl()) URL.revokeObjectURL(origUrl()!);
    setOrigUrl(URL.createObjectURL(f));
    setProcUrl(null);
  }

  async function process() {
    try {
      const f = file();
      if (!f) return;
      setStatus("解码中...");
      const { audioBuffer, context } = await decodeAudioFile(f);
      audioCtx = context;
      const sampleRate = audioBuffer.sampleRate;
      const ch = audioBuffer.numberOfChannels;
      const length = audioBuffer.length;
      const channels: Float32Array[] = [];
      for (let i = 0; i < ch; i++)
        channels.push(audioBuffer.getChannelData(i).slice(0));

      // 统一参数
      const winLen = nextPow2(
        Math.max(16, Math.floor((winMs() / 1000) * sampleRate))
      );
      const hop = hopSlide()
        ? Math.max(1, Math.floor(winLen / Math.max(1, interleave())))
        : Math.max(1, Math.floor(winLen * clamp(hopRatio(), 0.1, 0.9)));
      const win = hannWindow(winLen);
      const fft = new FFT(winLen);
      const targetShape = buildTargetMagnitudes(
        winLen,
        sampleRate,
        eqCenters,
        eqGainsDb()
      );
      if (usePinkTilt()) applyPinkTilt(targetShape, sampleRate);

      setStatus(`STFT中... 窗口=${winLen}, hop=${hop}`);

      // 为每个声道处理
      const outChannels: Float32Array[] = [];
      const framePositions: number[] = [];
      for (let c = 0; c < ch; c++) {
        const x = channels[c];
        const y = new Float32Array(length + winLen * 2);
        const wsum = new Float32Array(length + winLen * 2);
        for (let pos = 0; pos < x.length; pos += hop) {
          if (c === 0) framePositions.push(pos);
          const frame = new Float32Array(winLen);
          for (let n = 0; n < winLen; n++) {
            const xi = pos + n;
            frame[n] = (xi < x.length ? x[xi] : 0) * win[n];
          }

          let spec = rfftForwardReal(fft, frame);
          enforceToTargetSpectrumPreserveEnergy(spec, targetShape, {
            strength: clamp(strength(), 0, 1),
            maxBoostDb: maxBoostDb(),
            maxCutDb: maxCutDb(),
            noiseFloorFactor: noiseFloorFactor(),
            smoothBins: smoothBins(),
          });
          const recon = rfftInverseReal(fft, spec);

          for (let n = 0; n < winLen; n++) {
            const yi = pos + n;
            if (yi < y.length) {
              y[yi] += recon[n] * win[n];
              wsum[yi] += win[n] * win[n];
            }
          }
        }
        // OLA 解析归一：按窗口平方和归一化，适配任意 hop（含逐样滑动）
        for (let i = 0; i < length; i++) {
          const w = wsum[i];
          if (w > 1e-9) y[i] /= w;
        }
        outChannels.push(y.subarray(0, length));
      }

      // 匹配整体电平（RMS）到原始（加入极小值避免NaN）
      const rms = (arr: Float32Array) => {
        let sum = 0;
        for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
        return Math.sqrt(sum / Math.max(1, arr.length));
      };
      const origMix = new Float32Array(length);
      const procMix = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += channels[c][i] || 0;
        origMix[i] = s / ch;
      }
      for (let i = 0; i < length; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += outChannels[c][i] || 0;
        procMix[i] = s / ch;
      }
      const g = (rms(origMix) + 1e-12) / (rms(procMix) + 1e-12);
      for (let c = 0; c < ch; c++) {
        const y = outChannels[c];
        for (let i = 0; i < y.length; i++) y[i] *= g;
      }

      // 导出为 wav blob
      setStatus("编码WAV...");
      const wav = encodeWav(outChannels, sampleRate);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      if (procUrl()) URL.revokeObjectURL(procUrl()!);
      setProcUrl(url);
      setStatus("完成，绘制可视化...");

      // 可视化：绘制原始/处理后波形与帧边界
      requestAnimationFrame(() => {
        try {
          drawWaveWithFrames(origCanvas, origMix, framePositions, "#6b7280");
          drawWaveWithFrames(procCanvas, procMix, framePositions, "#2563eb");
          setStatus("完成");
        } catch {}
      });
    } catch (err: any) {
      console.error(err);
      setStatus("失败: " + err?.message || String(err));
    }
  }

  function encodeWav(
    channels: Float32Array[],
    sampleRate: number
  ): ArrayBuffer {
    const numChannels = channels.length;
    const length = channels[0].length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset: number, s: string) {
      for (let i = 0; i < s.length; i++)
        view.setUint8(offset + i, s.charCodeAt(i));
    }
    let offset = 0;
    writeString(offset, "RIFF");
    offset += 4;
    view.setUint32(offset, 36 + dataSize, true);
    offset += 4;
    writeString(offset, "WAVE");
    offset += 4;
    writeString(offset, "fmt ");
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4; // PCM chunk size
    view.setUint16(offset, 1, true);
    offset += 2; // PCM
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, byteRate, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2; // bits per sample
    writeString(offset, "data");
    offset += 4;
    view.setUint32(offset, dataSize, true);
    offset += 4;

    // interleave
    let idx = 44;
    const clamp16 = (v: number) => Math.max(-1, Math.min(1, v));
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = clamp16(channels[c][i]);
        const s = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(idx, s, true);
        idx += 2;
      }
    }
    return buffer;
  }

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center gap-2">
        <A href="/" class="text-blue-500">
          返回
        </A>
        <h1 class="text-xl font-bold">Audio Spectrum Corrector（实验）</h1>
      </div>

      <div class="space-y-2">
        <input type="file" accept="audio/*" onChange={handleFile} />
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2">
            <span>窗口(ms)</span>
            <input
              type="number"
              value={winMs()}
              onInput={(e) =>
                setWinMs(parseFloat((e.target as HTMLInputElement).value))
              }
              class="border px-2 w-24"
            />
          </label>
          <label class="flex items-center gap-2">
            <span>hop 比例</span>
            <input
              type="number"
              step="0.05"
              value={hopRatio()}
              onInput={(e) =>
                setHopRatio(parseFloat((e.target as HTMLInputElement).value))
              }
              class="border px-2 w-24"
            />
          </label>
          <label class="flex items-center gap-2">
            <span>纠正强度</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={strength()}
              onInput={(e) =>
                setStrength(parseFloat((e.target as HTMLInputElement).value))
              }
              class="border px-2 w-24"
            />
          </label>
          <label class="flex items-center gap-2">
            <span>逐样滑动</span>
            <input
              type="checkbox"
              checked={hopSlide()}
              onInput={(e) => setHopSlide((e.target as HTMLInputElement).checked)}
            />
          </label>
          <Show when={hopSlide()}>
            <label class="flex items-center gap-2">
              <span>交织数</span>
              <input
                type="number"
                min={1}
                max={64}
                step={1}
                value={interleave()}
                onInput={(e) => setInterleave(parseInt((e.target as HTMLInputElement).value) || 1)}
                class="border px-2 w-24"
              />
            </label>
          </Show>
          <button class="border px-3 py-1" onClick={process} disabled={!file()}>
            开始处理
          </button>
          <span>{status()}</span>
        </div>
        <div class="mt-2">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold">目标频谱（10段EQ，单位 dB）</span>
            <button class="border px-2 py-0.5" onClick={resetEq}>
              重置EQ
            </button>
          </div>
          <div class="grid grid-cols-5 md:grid-cols-10 gap-2">
            <For each={eqCenters}>
              {(fc, i) => (
                <div class="flex flex-col items-center gap-1 p-1 border rounded">
                  <span class="text-xs">{fc}Hz</span>
                  <input
                    type="range"
                    aria-orientation="vertical"
                    min={-24}
                    max={24}
                    step={1}
                    value={eqGainsDb()[i()]}
                    onInput={(e) =>
                      setEqGain(
                        i(),
                        parseFloat((e.target as HTMLInputElement).value)
                      )
                    }
                    class="h-5"
                    style="writing-mode: bt-lr; -webkit-appearance: slider-vertical; appearance: slider-vertical; height: 160px;"
                  />
                  <span class="text-xs">{eqGainsDb()[i()]} dB</span>
                </div>
              )}
            </For>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
            <label class="flex items-center gap-2">
              <span>最大提升(dB)</span>
              <input type="number" class="border px-2 w-24" value={maxBoostDb()} onInput={(e) => setMaxBoostDb(parseFloat((e.target as HTMLInputElement).value))} />
            </label>
            <label class="flex items-center gap-2">
              <span>最大削减(dB)</span>
              <input type="number" class="border px-2 w-24" value={maxCutDb()} onInput={(e) => setMaxCutDb(parseFloat((e.target as HTMLInputElement).value))} />
            </label>
            <label class="flex items-center gap-2">
              <span>噪声门相对中位</span>
              <input type="number" step="0.05" min={0} max={1} class="border px-2 w-24" value={noiseFloorFactor()} onInput={(e) => setNoiseFloorFactor(parseFloat((e.target as HTMLInputElement).value))} />
            </label>
            <label class="flex items-center gap-2">
              <span>频域平滑半径(格)</span>
              <input type="number" min={0} max={64} class="border px-2 w-24" value={smoothBins()} onInput={(e) => setSmoothBins(parseInt((e.target as HTMLInputElement).value) || 0)} />
            </label>
            <label class="flex items-center gap-2">
              <span>粉噪倾斜</span>
              <input type="checkbox" checked={usePinkTilt()} onInput={(e) => setUsePinkTilt((e.target as HTMLInputElement).checked)} />
            </label>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <h2 class="font-semibold">原始</h2>
          <Show when={origUrl()}>
            <audio src={origUrl()!} controls></audio>
            <canvas ref={(el) => (origCanvas = el)} width={600} height={120} class="w-full border" />
          </Show>
        </div>
        <div class="space-y-2">
          <h2 class="font-semibold">处理后</h2>
          <Show when={procUrl()}>
            <audio src={procUrl()!} controls></audio>
            <canvas ref={(el) => (procCanvas = el)} width={600} height={120} class="w-full border" />
          </Show>
        </div>
      </div>
    </div>
  );
}
