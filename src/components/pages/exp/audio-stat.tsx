import { createSignal, onCleanup, createEffect } from "solid-js";
import * as d3 from "d3";
import FFT from "fft.js";

type Complex = { re: number; im: number };

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function hannWindow(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (length - 1)));
  }
  return w;
}

async function decodeAudioFile(
  file: File
): Promise<{ audioBuffer: AudioBuffer; context: AudioContext }> {
  const arrayBuffer = await file.arrayBuffer();
  const context = new AudioContext();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  return { audioBuffer, context };
}

function rfftForwardReal(fft: any, time: Float32Array): Complex[] {
  const out = new Float32Array(fft.size * 2);
  fft.realTransform(out, time);
  fft.completeSpectrum(out);
  const N = fft.size;
  const spec: Complex[] = new Array(N);
  for (let k = 0; k < N; k++) spec[k] = { re: out[2 * k], im: out[2 * k + 1] };
  return spec;
}

export default function AudioStat() {
  const [file, setFile] = createSignal<File | null>(null);
  const [status, setStatus] = createSignal<string>("");
  const [origUrl, setOrigUrl] = createSignal<string | null>(null);

  const [audioData, setAudioData] = createSignal<{ samples: Float32Array; sampleRate: number } | null>(null);
  const [winMs, setWinMs] = createSignal(32);
  const [fMin, setFMin] = createSignal(30);
  const [fMax, setFMax] = createSignal(8000);
  const [showDominant, setShowDominant] = createSignal(true);
  const [showCentroid, setShowCentroid] = createSignal(true);
  const [showScaloRidge, setShowScaloRidge] = createSignal(true);
  const [waveletType, setWaveletType] = createSignal<"ricker" | "morlet">("ricker");
  const [avgCentroid, setAvgCentroid] = createSignal<number | null>(null);
  const [avgDominant, setAvgDominant] = createSignal<number | null>(null);
  const [avgRidge, setAvgRidge] = createSignal<number | null>(null);

  const PADDING = { top: 10, right: 60, bottom: 30, left: 50 } as const;
  const [currentTime, setCurrentTime] = createSignal(0);
  const [durationSec, setDurationSec] = createSignal(0);
  let audioEl: HTMLAudioElement | undefined;
  let specWrap: HTMLDivElement | undefined;
  let scalWrap: HTMLDivElement | undefined;

  function seekTo(timeSec: number) {
    const d = durationSec();
    const t = Math.max(0, Math.min(d || 0, timeSec));
    if (audioEl) audioEl.currentTime = t;
    setCurrentTime(t);
    updateCursors();
  }

  function updateCursors() {
    const dur = durationSec() || 0;
    const t = currentTime();
    // waveform
    if (waveSvg) {
      const svg = d3.select(waveSvg);
      const width = waveSvg.clientWidth || 800;
      const height = 180;
      const padding = { top: 20, right: 20, bottom: 30, left: 50 };
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const x = padding.left + (dur > 0 ? (t / dur) * plotWidth : 0);
      const g = svg.select("g");
      let line = g.select<SVGLineElement>("#wave-cursor");
      if (line.empty()) {
        line = g
          .append("line")
          .attr("id", "wave-cursor")
          .attr("y1", 0)
          .attr("y2", height - padding.top - padding.bottom)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1)
          .attr("opacity", 0.9);
      }
      line.attr("x1", x - padding.left).attr("x2", x - padding.left);
    }
    // spectrogram
    if (specAxesSvg && specCanvas) {
      const width = specCanvas.width;
      const height = specCanvas.height;
      const padding = PADDING;
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const x = padding.left + (dur > 0 ? (t / dur) * plotWidth : 0);
      const svg = d3.select(specAxesSvg);
      let line = svg.select<SVGLineElement>("#spec-cursor");
      if (line.empty()) {
        line = svg
          .append("line")
          .attr("id", "spec-cursor")
          .attr("y1", padding.top)
          .attr("y2", height - padding.bottom)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1)
          .attr("opacity", 0.9);
      }
      line.attr("x1", x).attr("x2", x);
    }
    // scalogram
    if (scalAxesSvg && scalCanvas) {
      const width = scalCanvas.width;
      const height = scalCanvas.height;
      const padding = PADDING;
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const x = padding.left + (dur > 0 ? (t / dur) * plotWidth : 0);
      const svg = d3.select(scalAxesSvg);
      let line = svg.select<SVGLineElement>("#scal-cursor");
      if (line.empty()) {
        line = svg
          .append("line")
          .attr("id", "scal-cursor")
          .attr("y1", padding.top)
          .attr("y2", height - padding.bottom)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1)
          .attr("opacity", 0.9);
      }
      line.attr("x1", x).attr("x2", x);
    }
  }

  let waveSvg: SVGSVGElement | undefined;
  let specCanvas: HTMLCanvasElement | undefined;
  let specAxesSvg: SVGSVGElement | undefined;
  let scalCanvas: HTMLCanvasElement | undefined;
  let scalAxesSvg: SVGSVGElement | undefined;

  onCleanup(() => {
    if (origUrl()) URL.revokeObjectURL(origUrl()!);
    setAudioData(null);
  });

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const f = input.files[0]!;
    setFile(f);
    if (origUrl()) URL.revokeObjectURL(origUrl()!);
    const url = URL.createObjectURL(f);
    setOrigUrl(url);
    if (audioEl) {
      audioEl.src = url;
      try { audioEl.load(); } catch {}
    }
    setStatus("解码中...");
    const { audioBuffer } = await decodeAudioFile(f);
    setAudioData({ samples: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate });
    setDurationSec(audioBuffer.length / audioBuffer.sampleRate);
    setCurrentTime(0);
  }

  createEffect(() => {
    const data = audioData();
    // track config dependencies so changes trigger redraw
    const _win = winMs();
    const _min = fMin();
    const _max = fMax();
    const _wav = waveletType();
    const _sd = showDominant();
    const _sc = showCentroid();
    const _sr = showScaloRidge();
    if (!data) return;

    const redraw = async () => {
      setStatus("处理中...");
      await Promise.resolve(); // Allow UI to update status

      const { samples: ch0, sampleRate } = data;
      
      // Waveform (downsampled for performance)
      const targetLen = Math.min(48000 * 10, ch0.length);
      const decim = Math.max(1, Math.floor(ch0.length / targetLen));
      const samples = new Float32Array(Math.floor(ch0.length / decim));
      for (let i = 0; i < samples.length; i++) samples[i] = ch0[i * decim] || 0;
      const fs = Math.floor(sampleRate / decim);
      drawWaveform(samples, fs);
      
      // Spectrogram and Scalogram use full data
      await drawSpectrogram(ch0, sampleRate);
      await drawScalogram(ch0, sampleRate);

      setStatus("完成");
    };
    redraw();
  });

  function attachInteractions() {
    // Spectrogram click-to-seek
    if (specAxesSvg && specCanvas) {
      const width = specCanvas.width;
      const padding = PADDING;
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      d3.select(specAxesSvg)
        .on("click", (ev: MouseEvent) => {
          const x = ev.offsetX;
          const t = ((x - padding.left) / plotWidth) * (durationSec() || 0);
          seekTo(t);
        });
    }
    // Scalogram click-to-seek
    if (scalAxesSvg && scalCanvas) {
      const width = scalCanvas.width;
      const padding = PADDING;
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      d3.select(scalAxesSvg)
        .on("click", (ev: MouseEvent) => {
          const x = ev.offsetX;
          const t = ((x - padding.left) / plotWidth) * (durationSec() || 0);
          seekTo(t);
        });
    }
    // Waveform click-to-seek
    if (waveSvg) {
      const width = waveSvg.clientWidth || 800;
      const padding = { top: 20, right: 20, bottom: 30, left: 50 };
      const plotWidth = Math.max(1, width - padding.left - padding.right);
      d3.select(waveSvg)
        .on("click", (ev: MouseEvent) => {
          const x = ev.offsetX;
          const t = ((x - padding.left) / plotWidth) * (durationSec() || 0);
          seekTo(t);
        });
    }
  }

  function drawWaveform(x: Float32Array, fs: number) {
    if (!waveSvg) return;
    const svg = d3.select(waveSvg);
    const width = waveSvg.clientWidth || 800;
    const height = 180;
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const g = svg.append("g").attr("transform", `translate(${padding.left}, ${padding.top})`);

    const samplesPerPixel = Math.ceil(x.length / plotWidth);
    const aggregated: { min: number; max: number }[] = [];
    for (let i = 0; i < plotWidth; i++) {
        const start = i * samplesPerPixel;
        const end = Math.min(start + samplesPerPixel, x.length);
        let min = 0;
        let max = 0;
        if (end > start) {
        min = d3.min(x.slice(start, end)) || 0;
        max = d3.max(x.slice(start, end)) || 0;
        }
        aggregated.push({ min, max });
    }

    const xScale = d3.scaleLinear().domain([0, aggregated.length - 1]).range([0, plotWidth]);
    const yScale = d3.scaleLinear().domain([-1, 1]).range([plotHeight, 0]);

    const area = d3.area<{ min: number; max: number }>()
        .x((d, i) => xScale(i))
        .y0((d) => yScale(d.min))
        .y1((d) => yScale(d.max));
    
    g.append("path")
        .datum(aggregated)
        .attr("fill", "#60a5fa")
        .attr("d", area as any);
    
    const timeScale = d3.scaleLinear().domain([0, x.length / fs]).range([0, plotWidth]);
    const xAxis = d3.axisBottom(timeScale).ticks(8).tickFormat((d) => `${Number(d).toFixed(2)}s`);
    const yAxis = d3.axisLeft(yScale).ticks(5);

    g.append("g")
        .attr("transform", `translate(0, ${plotHeight})`)
        .call(xAxis as any);

    g.append("g")
        .call(yAxis as any);
    }

  async function drawSpectrogram(x: Float32Array, fs: number) {
    if (!specCanvas) return;
    const ctx = specCanvas.getContext("2d");
    if (!ctx) return;
    const width = specCanvas.width;
    const height = specCanvas.height;
    ctx.clearRect(0, 0, width, height);

    // 统一绘图区与坐标轴的 padding
    const padding = { top: 10, right: 60, bottom: 30, left: 50 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);

    const winMsVal = winMs();
    const winLen = nextPow2(Math.max(16, Math.floor((winMsVal / 1000) * fs)));
    // 动态 hop：适配长音频，确保总帧数与水平像素数相关，避免计算过量
    const targetFrames = plotWidth * 2; // 每像素渲染2帧，保证信息量
    const hop = Math.max(Math.floor(winLen / 4), Math.floor((x.length - winLen) / targetFrames));

    const minFreq = Math.max(20, fs / winLen);
    const maxFreq = fs / 2;

    const win = hannWindow(winLen);
    const fft = new FFT(winLen);
    const nFrames = Math.max(1, Math.floor((x.length - winLen) / hop));
    const nBins = winLen / 2;
    const spec = new Float32Array(nFrames * nBins);

    const domFreqs: number[] = [];
    const centroids: number[] = [];

    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (let f = 0; f < nFrames; f++) {
      const pos = f * hop;
      const frame = new Float32Array(winLen);
      for (let n = 0; n < winLen; n++) frame[n] = (x[pos + n] || 0) * win[n];
      const S = rfftForwardReal(fft, frame);
      let magSum = 0;
      let weightedFreqSum = 0;
      let maxMag = -Infinity;
      let maxIdx = 1;
      for (let k = 1; k < nBins; k++) {
        const mag = Math.hypot(S[k].re, S[k].im);
        const db = 20 * Math.log10(mag + 1e-9);
        spec[f * nBins + k] = db;
        if (db < globalMin) globalMin = db;
        if (db > globalMax) globalMax = db;
        magSum += mag;
        const fk = (k * fs) / winLen;
        weightedFreqSum += fk * mag;
        if (mag > maxMag) {
          maxMag = mag;
          maxIdx = k;
        }
      }
      const domF = (maxIdx * fs) / winLen;
      domFreqs.push(Math.max(minFreq, Math.min(maxFreq, domF)));
      const centroidRaw = magSum > 0 ? weightedFreqSum / Math.max(1e-12, magSum) : minFreq;
      const centroid = Math.max(minFreq, Math.min(maxFreq, centroidRaw));
      centroids.push(centroid);
    }

    // 统计
    if (domFreqs.length > 0) setAvgDominant(domFreqs.reduce((a, b) => a + b, 0) / domFreqs.length);
    if (centroids.length > 0) setAvgCentroid(centroids.reduce((a, b) => a + b, 0) / centroids.length);

    const vMin = globalMin;
    const vMax = globalMax;
    const color = d3.scaleSequential(d3.interpolateTurbo).domain([vMin, vMax]);

    // 频率与时间轴，与坐标轴完全一致
    const freqAxisScale = d3.scaleLog().domain([minFreq, maxFreq]).range([plotHeight - 1, 0]);
    const durationSec = x.length / fs;
    const timeScale = d3.scaleLinear().domain([0, durationSec]).range([0, plotWidth - 1]);

    const img = ctx.createImageData(width, height);
    // 可选：先填充背景为黑
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 0] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }

    for (let py = 0; py < plotHeight; py++) {
      const freq = freqAxisScale.invert(py);
      let k = Math.round((freq * winLen) / fs);
      if (k < 1) k = 1;
      if (k >= nBins) k = nBins - 1;
      for (let px = 0; px < plotWidth; px++) {
        const tSec = timeScale.invert(px);
        let fIdx = Math.round((tSec * fs - winLen / 2) / hop);
        if (fIdx < 0) fIdx = 0;
        if (fIdx >= nFrames) fIdx = nFrames - 1;
        const v = spec[fIdx * nBins + k];
        const c = d3.rgb(color(v));
        const cx = padding.left + px;
        const cy = padding.top + py;
        const p = (cy * width + cx) * 4;
        img.data[p + 0] = c.r;
        img.data[p + 1] = c.g;
        img.data[p + 2] = c.b;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 画坐标轴与图例（与绘图区严格同一几何）
    if (!specAxesSvg) return;
    const svg = d3.select(specAxesSvg);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${padding.left}, ${padding.top})`);
    const timeAxis = d3.axisBottom(timeScale).ticks(8).tickFormat((d) => `${Number(d).toFixed(2)}s`);
    g.append("g").attr("transform", `translate(0, ${plotHeight})`).call(timeAxis as any)
      .attr("color", "white");
    const freqAxis = d3.axisLeft(freqAxisScale).ticks(6, d3.format("~s"));
    g.append("g").call(freqAxis as any)
      .attr("color", "white");

    // overlays
    const drawLine = (values: number[], colorStr: string) => {
      const line = d3
        .line<number>()
        .x((_, i) => timeScale((i * hop) / fs))
        .y((v) => {
          const vv = Math.max(minFreq, Math.min(maxFreq, v || minFreq));
          return freqAxisScale(vv);
        });
      g.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", colorStr)
        .attr("stroke-width", 1.5)
        .attr("d", line as any);
    };
    if (showDominant()) drawLine(domFreqs, "#22c55e");
    if (showCentroid()) drawLine(centroids, "#eab308");

    // 图例
    const legendHeight = plotHeight;
    const legendY = d3.scaleLinear().domain([vMin, vMax]).range([legendHeight, 0]);
    const legend = svg.append("g").attr("transform", `translate(${padding.left + plotWidth + 10}, ${padding.top})`);
    const gradientId = "spec-gradient";
    const defs = svg.append("defs");
    const lg = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      lg.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(vMin + t * (vMax - vMin)) as any);
    }
    legend.append("rect").attr("width", 16).attr("height", legendHeight).style("fill", `url(#${gradientId})`);
    const legendAxis = d3.axisRight(legendY).ticks(6);
    legend.append("g").attr("transform", `translate(16, 0)`).call(legendAxis as any)
      .attr("color", "white");
    legend.append("text").text("dB").attr("x", 0).attr("y", -4).attr("fill", "white");

    attachInteractions();
    updateCursors();
  }

  // 简易 CWT（Ricker 小波）用于 scalogram，可视化强度
  async function drawScalogram(x: Float32Array, fs: number) {
    if (!scalCanvas) return;
    const ctx = scalCanvas.getContext("2d");
    if (!ctx) return;
    const width = scalCanvas.width;
    const height = scalCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 10, right: 60, bottom: 30, left: 50 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);

    const timeSteps = plotWidth; // 每个像素列计算一次
    const stride = Math.max(1, Math.floor(x.length / timeSteps));
    const times: number[] = [];
    for (let i = 0; i < timeSteps; i++) {
        times.push(Math.floor(i * stride));
    }

    const currentFMin = fMin();
    const currentFMax = fMax();
    const nScales = plotHeight; // 每个像素行计算一次
    const freqs: number[] = [];
    const freqScaleLog = d3.scaleLog().domain([currentFMin, currentFMax]).range([nScales - 1, 0]);
    for (let i = 0; i < nScales; i++) {
        freqs.push(freqScaleLog.invert(i));
    }

    const power = new Float32Array(times.length * freqs.length);

    for (let si = 0; si < freqs.length; si++) {
      const f = freqs[si];
      // build wavelet kernel
      const useMorlet = waveletType() === "morlet";
      const sigma = useMorlet ? 1 / (2 * Math.PI * f) : 6 / (2 * Math.PI * f);
      const halfWidth = Math.max(8, Math.floor(4 * sigma * fs));
      const wlen = halfWidth * 2 + 1;
      const w = new Float32Array(wlen);
      for (let n = -halfWidth; n <= halfWidth; n++) {
        const t = n / fs;
        if (useMorlet) {
          // Real Morlet (simplified): cos(2π f t) * exp(-t^2/(2σ^2))
          w[n + halfWidth] = Math.cos(2 * Math.PI * f * t) * Math.exp(-(t * t) / (2 * sigma * sigma));
        } else {
          // Ricker
          const a = 1 - (t * t) / (sigma * sigma);
          const g = Math.exp(-(t * t) / (2 * sigma * sigma));
          w[n + halfWidth] = a * g;
        }
      }
      let norm = 0;
      for (let i = 0; i < w.length; i++) norm += w[i] * w[i];
      const scale = 1 / Math.sqrt(norm + 1e-9);
      for (let i = 0; i < w.length; i++) w[i] *= scale;

      for (let ti = 0; ti < times.length; ti++) {
        const center = times[ti];
        let acc = 0;
        for (let n = -halfWidth; n <= halfWidth; n++) {
          const xi = center + n;
          const xv = xi >= 0 && xi < x.length ? x[xi] : 0;
          acc += xv * w[n + halfWidth];
        }
        power[ti * freqs.length + si] = Math.abs(acc);
      }
    }

    const sorted = Float32Array.from(power).sort();
    let vMin = sorted[0] ?? 0;
    let vMax = sorted[sorted.length - 1] ?? 1;
    const color = d3.scaleSequential(d3.interpolateTurbo).domain([vMin, vMax]);

    const img = ctx.createImageData(width, height);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = 255;

    for (let py = 0; py < plotHeight; py++) {
      for (let px = 0; px < plotWidth; px++) {
        const v = power[px * freqs.length + py];
        const c = d3.rgb(color(v));
        const p = ((py + padding.top) * width + (px + padding.left)) * 4;
        img.data[p + 0] = c.r;
        img.data[p + 1] = c.g;
        img.data[p + 2] = c.b;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Draw Axes and overlay ridge
    if (!scalAxesSvg) return;
    const svg = d3.select(scalAxesSvg);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${padding.left}, ${padding.top})`);
    
    const timeScale = d3.scaleLinear().domain([0, x.length / fs]).range([0, plotWidth]);
    const timeAxis = d3.axisBottom(timeScale).ticks(8).tickFormat(d => `${Number(d).toFixed(2)}s`);
    g.append("g")
        .attr("transform", `translate(0, ${plotHeight})`)
        .call(timeAxis as any)
        .attr("color", "white");

    const freqAxisScale = d3.scaleLog().domain([currentFMin, currentFMax]).range([plotHeight, 0]);
    const freqAxis = d3.axisLeft(freqAxisScale).ticks(5, d3.format("~s"));
    g.append("g")
        .call(freqAxis as any)
        .attr("color", "white");

    if (showScaloRidge()) {
      const ridge: number[] = new Array(times.length);
      for (let ti = 0; ti < times.length; ti++) {
        let best = 0;
        let idx = 0;
        for (let si = 0; si < freqs.length; si++) {
          const v = power[ti * freqs.length + si];
          if (v > best) {
            best = v;
            idx = si;
          }
        }
        ridge[ti] = freqs[idx];
      }
      if (ridge.length > 0) setAvgRidge(ridge.reduce((a, b) => a + b, 0) / ridge.length);
      const line = d3
        .line<number>()
        .x((_, i) => timeScale((times[i] || 0) / fs))
        .y((v) => freqAxisScale(v));
      g.append("path")
        .datum(ridge)
        .attr("fill", "none")
        .attr("stroke", "#ef4444")
        .attr("stroke-width", 1.5)
        .attr("d", line as any);
    }
    }

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center gap-2">
        <a href="/" class="text-blue-500">返回</a>
        <h1 class="text-xl font-bold">Audio Stat（波形 / Spectrogram / Scalogram）</h1>
      </div>
      <div class="space-y-2">
        <input type="file" accept="audio/*" onChange={handleFile} />
        <span>{status()}</span>
      </div>
      <div class="flex items-center gap-2">
        <audio ref={(el) => (audioEl = el)} src={origUrl() || ""} controls onTimeUpdate={(e) => { setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime || 0); updateCursors(); }} />
        <button class="border px-2 py-1" onClick={() => audioEl?.play()}>播放</button>
        <button class="border px-2 py-1" onClick={() => audioEl?.pause()}>暂停</button>
        <span class="text-sm">{currentTime().toFixed(2)} / {durationSec().toFixed(2)} s</span>
      </div>

      <div class="p-2 border rounded-md space-y-2">
        <h3 class="font-semibold">参数配置</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-sm">Spectrogram Window (ms)</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={winMs()}
              onInput={(e) => setWinMs(parseFloat(e.currentTarget.value) || 32)}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm">Scalogram Min Freq (Hz)</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={fMin()}
              onInput={(e) => setFMin(parseFloat(e.currentTarget.value) || 30)}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm">Scalogram Max Freq (Hz)</span>
            <input
              type="number"
              class="border px-2 py-1"
              value={fMax()}
              onInput={(e) => setFMax(parseFloat(e.currentTarget.value) || 8000)}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm">Wavelet</span>
            <select class="border px-2 py-1" value={waveletType()} onInput={(e) => setWaveletType((e.currentTarget.value as any) || "ricker")}>
              <option value="ricker">Ricker</option>
              <option value="morlet">Morlet</option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={showDominant()} onInput={(e) => setShowDominant((e.currentTarget as HTMLInputElement).checked)} />
            <span class="text-sm">显示主频</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={showCentroid()} onInput={(e) => setShowCentroid((e.currentTarget as HTMLInputElement).checked)} />
            <span class="text-sm">显示谱心</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={showScaloRidge()} onInput={(e) => setShowScaloRidge((e.currentTarget as HTMLInputElement).checked)} />
            <span class="text-sm">显示小波脊线</span>
          </label>
        </div>
        <div class="text-sm text-gray-700 flex gap-4">
          <span>平均谱心: {avgCentroid() ? `${avgCentroid()!.toFixed(1)} Hz` : '-'}</span>
          <span>平均主频: {avgDominant() ? `${avgDominant()!.toFixed(1)} Hz` : '-'}</span>
          <span>平均脊线: {avgRidge() ? `${avgRidge()!.toFixed(1)} Hz` : '-'}</span>
        </div>
      </div>

      <div class="space-y-2">
        <h2 class="font-semibold">原始时域波形</h2>
        <svg ref={(el) => (waveSvg = el)} width={800} height={180} class="w-full border" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <h2 class="font-semibold">FFT Spectrogram (dB)</h2>
          <div class="relative">
            <canvas ref={(el) => (specCanvas = el)} width={800} height={300} class="w-full border" />
            <svg ref={(el) => (specAxesSvg = el)} class="absolute top-0 left-0 w-full h-full pointer-events-none" />
          </div>
        </div>
        <div class="space-y-2">
          <h2 class="font-semibold">CWT Scalogram (Magnitude)</h2>
          <div class="relative">
            <canvas ref={(el) => (scalCanvas = el)} width={800} height={300} class="w-full border" />
            <svg ref={(el) => (scalAxesSvg = el)} class="absolute top-0 left-0 w-full h-full pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}


