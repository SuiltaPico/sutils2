import { For, Show, createMemo, createSignal } from "solid-js";

import StopwordsRaw from "./baidu_stopwords.txt?raw";

const Stopwords = StopwordsRaw.split(/\s+/);

type WordStat = {
  word: string;
  count: number;
};

type CharStat = {
  count: number;
  ratio: number;
};

type ScriptStat = {
  script: string;
  name: string;
  count: number;
  ratio: number;
};

type Stats = {
  charCountWithSpaces: number;
  charCountNoSpaces: number;
  wordCount: number;
  symbolCount: number;
  lineCount: number;
  paragraphCount: number;
  sentenceCount: number;
  uniqueWords: number;
  entropyBits: number;
  normalizedEntropyBits: number;
  // 可感知字符（字素）层熵
  graphemeEntropyBits: number;
  graphemeNormalizedEntropyBits: number;
  topWords: WordStat[];
  topWordPositions: Record<string, number[]>;
  topicDrift: {
    segmentCount: number;
    segmentSizes: number[];
    valuesAdjacent: number[]; // 邻接段散度序列（KL 或 JS）
    valueMax: number;
    valueAvg: number;
    metric: "kl" | "js";
  } | null;
  miLag: number;
  miTopPairs: Array<{ x: string; y: string; pmi: number; count: number }>;
  zipf: { slope: number; exponent: number; r2: number; points: number } | null;
  sentenceLength: {
    count: number;
    min: number;
    max: number;
    avg: number;
    median: number;
    p90: number;
  } | null;
  readability: {
    fleschReadingEase: number; // 数值越高越易读 [0-100+]，英文语料有效
    fleschKincaidGrade: number; // 美国年级水平，越高越难
    words: number; // 英文词数量（仅 A-Z）
    sentences: number; // 句子数
    syllables: number; // 英文音节总数
  } | null;
  // 词汇多样性
  yuleK: number | null;
  heaps: { k: number; beta: number; r2: number; points: number } | null;
  mtld: { forward: number; backward: number; average: number } | null;
  // 节奏与复杂度
  burstiness: { cv: number; b: number } | null;
  // Lempel–Ziv 复杂度（LZ76 近似，基于词序列）
  lz: { phrases: number; normalized: number; tokens: number } | null;
  // 低复杂度重复片段（n-gram Top）
  repeats: Array<{ fragment: string; length: number; count: number }>;
  // 字符构成
  composition: {
    emoji: CharStat;
    number: CharStat;
    uppercase: CharStat;
    fullWidth: CharStat;
    whitespace: CharStat;
    scripts: ScriptStat[];
  } | null;
};

function createWordSegmenter(): Intl.Segmenter | null {
  try {
    return new Intl.Segmenter(
      typeof navigator !== "undefined" && navigator.language
        ? [navigator.language, "zh-CN", "en"]
        : ["zh-CN", "en"],
      { granularity: "word" }
    );
  } catch {
    return null;
  }
}

function createGraphemeSegmenter(): Intl.Segmenter | null {
  try {
    return new Intl.Segmenter(
      typeof navigator !== "undefined" && navigator.language
        ? [navigator.language, "zh-CN", "en"]
        : ["zh-CN", "en"],
      { granularity: "grapheme" }
    );
  } catch {
    return null;
  }
}

function createSentenceSegmenter(): Intl.Segmenter | null {
  try {
    return new Intl.Segmenter(
      typeof navigator !== "undefined" && navigator.language
        ? [navigator.language, "zh-CN", "en"]
        : ["zh-CN", "en"],
      { granularity: "sentence" }
    );
  } catch {
    return null;
  }
}

function isPunctuationOrSymbol(grapheme: string): boolean {
  // 使用 Unicode 属性判断标点(P)与符号(S)
  // 单个字素簇可能包含多个 code point，这里以首个 code point 判断类别
  if (!grapheme) return false;
  const first = [...grapheme][0];
  return /[\p{P}\p{S}]/u.test(first);
}

// 英文单词音节估算（启发式）
// 参考通用做法：
// 1) 特殊后缀静音 e 去除 (…e, …es, …ed)，但保留类似 "le" 的音节
// 2) 统计 [aeiouy] 的连续分组数作为音节数
// 3) 以 1 为下界
function estimateEnglishSyllables(rawWord: string): number {
  const cleaned = rawWord
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z']/g, "") // 仅保留字母与撇号
    .replace(/'+/g, ""); // 音节估算中忽略撇号
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;
  let w = cleaned;
  // 去除常见静音结尾：...es, ...ed, ...e（但避免移除 ...le 的 e）
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/g, "");
  w = w.replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  const count = groups ? groups.length : 1;
  return Math.max(1, count);
}

function computeStats(
  text: string,
  options: {
    caseSensitive: boolean;
    minWordLength: number;
    maxTop: number;
    ignoreStopWords: boolean;
    stopWords: ReadonlySet<string>;
    segmentCount: number;
    divergence: "kl" | "js";
    miMode: "lag" | "window";
    miLag: number;
    miTopN: number;
    miMinPairCount: number;
    smoothingAlpha: number;
  }
): Stats {
  const {
    caseSensitive,
    minWordLength,
    maxTop,
    ignoreStopWords,
    stopWords,
    segmentCount,
    divergence,
    miMode,
    miLag,
    miTopN,
    miMinPairCount,
    smoothingAlpha,
  } = options;

  const wordSegmenter = createWordSegmenter();
  const graphemeSegmenter = createGraphemeSegmenter();
  const sentenceSegmenter = createSentenceSegmenter();

  // 字素计数（用户感知字符）
  let graphemes: string[] = [];
  if (graphemeSegmenter) {
    graphemes = Array.from(
      graphemeSegmenter.segment(text),
      (s: any) => s.segment as string
    );
  } else {
    // 退化方案：按 code point 遍历（不完全等价于 grapheme）
    graphemes = Array.from(text);
  }

  const charCountWithSpaces = graphemes.length;
  const charCountNoSpaces = graphemes.reduce(
    (acc, g) => acc + (/^\s+$/u.test(g) ? 0 : 1),
    0
  );
  const symbolCount = graphemes.reduce(
    (acc, g) => acc + (isPunctuationOrSymbol(g) ? 1 : 0),
    0
  );
  const lineCount = text.length === 0 ? 0 : text.split(/\r?\n/).length;

  // 字素层熵：对非空白的字素计频并计算香农熵与归一化
  let graphemeEntropyBits = 0;
  let graphemeNormalizedEntropyBits = 0;
  {
    const valid = graphemes.filter((g) => !/^\s+$/u.test(g));
    const N = valid.length | 0;
    if (N > 0) {
      const gf = new Map<string, number>();
      for (const g of valid) gf.set(g, (gf.get(g) ?? 0) + 1);
      for (const [, c] of gf) {
        const p = c / N;
        graphemeEntropyBits += -p * Math.log2(p);
      }
      const U = gf.size;
      graphemeNormalizedEntropyBits =
        U > 1 ? graphemeEntropyBits / Math.log2(U) : 0;
    }
  }

  // 段落与句子
  const paragraphCount =
    text.trim().length === 0
      ? 0
      : text
          .split(/\r?\n\s*\r?\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0).length;

  let sentenceCount = 0;
  if (sentenceSegmenter) {
    for (const s of sentenceSegmenter.segment(text) as any) {
      if (s.segment && String(s.segment).trim().length > 0) sentenceCount += 1;
    }
  } else {
    const parts = text
      .split(/(?<=[.!?。！？；;])\s+|\r?\n+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    sentenceCount = parts.length;
  }

  // 英文可读性：提取英文词、估算音节与使用句子数
  let readability: Stats["readability"] = null;
  {
    const enTokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
    const enWords = enTokens.map((w) => w.normalize("NFKC"));
    const wordsNum = enWords.length;
    // 若没有句子但存在英文词，按英文终止符粗略切分
    const sentencesNum =
      sentenceCount > 0
        ? sentenceCount
        : text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    if (wordsNum > 0 && sentencesNum > 0) {
      let syllables = 0;
      for (const w of enWords) syllables += estimateEnglishSyllables(w);
      const W = wordsNum;
      const S = Math.max(1, sentencesNum);
      const Y = Math.max(1, syllables);
      const wordsPerSentence = W / S;
      const syllablesPerWord = Y / W;
      const fleschReadingEase =
        206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
      const fleschKincaidGrade =
        0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
      readability = {
        fleschReadingEase,
        fleschKincaidGrade,
        words: W,
        sentences: S,
        syllables: Y,
      };
    }
  }

  // 词切分
  let rawWords: string[] = [];
  if (wordSegmenter) {
    const seg = wordSegmenter.segment(text);
    for (const part of seg as any) {
      if (part.isWordLike && part.segment && part.segment.trim().length > 0) {
        rawWords.push(part.segment as string);
      }
    }
  } else {
    // 退化方案：按 Unicode 字母数字的连续段作为词
    rawWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  }

  // 归一化与过滤 + 位置收集（按保留词序列的索引）
  const words: string[] = [];
  const positions = new Map<string, number[]>();
  for (const raw of rawWords) {
    let t = raw.normalize("NFKC").trim();
    if (!caseSensitive) t = t.toLocaleLowerCase("en-US");
    if (t.length < minWordLength) continue;
    if (ignoreStopWords && stopWords.has(t)) continue;
    const index = words.length;
    words.push(t);
    const list = positions.get(t);
    if (list) list.push(index);
    else positions.set(t, [index]);
  }

  // 词频
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const wordCount = words.length;
  const uniqueWords = freq.size;
  let entropyBits = 0;
  if (wordCount > 0) {
    for (const [, c] of freq) {
      const p = c / wordCount;
      // 香农熵，log2
      entropyBits += -p * Math.log2(p);
    }
  }
  const normalizedEntropyBits =
    uniqueWords > 1 ? entropyBits / Math.log2(uniqueWords) : 0;
  const topWords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, maxTop))
    .map(([word, count]) => ({ word, count }));
  const topWordPositions: Record<string, number[]> = Object.fromEntries(
    topWords.map((tw) => [tw.word, positions.get(tw.word) ?? []])
  );

  // Yule's K：K = 1e4 * (sum(f_i^2) - N) / N^2
  let yuleK: number | null = null;
  if (wordCount > 0 && uniqueWords > 0) {
    let sumSquares = 0;
    for (const [, c] of freq) sumSquares += c * c;
    const denom = wordCount * wordCount;
    if (denom > 0) yuleK = 10000 * ((sumSquares - wordCount) / denom);
  }

  // Heaps' Law：V(N) = K * N^beta，在线拟合 ln V = ln K + beta ln N
  let heaps: Stats["heaps"] = null;
  if (wordCount >= 10 && uniqueWords >= 2) {
    const seen = new Set<string>();
    const xs: number[] = [];
    const ys: number[] = [];
    const maxSamples = 64;
    const stride = Math.max(1, Math.floor(wordCount / maxSamples));
    for (let i = 0; i < wordCount; i += 1) {
      const w = words[i];
      if (!seen.has(w)) seen.add(w);
      const shouldSample = i % stride === stride - 1 || i === wordCount - 1;
      if (shouldSample) {
        const Np = i + 1;
        const Vp = seen.size;
        if (Np > 0 && Vp > 0) {
          xs.push(Math.log(Np));
          ys.push(Math.log(Vp));
        }
      }
    }
    const n = Math.min(xs.length, ys.length);
    if (n >= 5) {
      let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumXY = 0,
        sumYY = 0;
      for (let i = 0; i < n; i += 1) {
        const x = xs[i];
        const y = ys[i];
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumXY += x * y;
        sumYY += y * y;
      }
      const denom = n * sumXX - sumX * sumX;
      const beta = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - beta * sumX) / (n || 1);
      const k = Math.exp(intercept);
      const rDen = Math.sqrt(
        (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)
      );
      const r = rDen !== 0 ? (n * sumXY - sumX * sumY) / rDen : 0;
      const r2 = r * r;
      heaps = { k, beta, r2, points: n };
    }
  }

  // MTLD：基于已保留与过滤后的词序列
  const mtld = computeMTLD(words, 0.72);

  // 主题漂移（相对熵：KL 或 JS）
  let topicDrift: Stats["topicDrift"] = null;
  const segN = Math.max(2, Math.min(64, segmentCount | 0));
  if (wordCount >= segN) {
    const segmentSizes: number[] = [];
    const segStartIdx: number[] = [];
    const base = Math.floor(wordCount / segN);
    const remainder = wordCount % segN;
    let start = 0;
    for (let i = 0; i < segN; i += 1) {
      const size = base + (i < remainder ? 1 : 0);
      segmentSizes.push(size);
      segStartIdx.push(start);
      start += size;
    }
    const segCounts: Array<Map<string, number>> = new Array(segN);
    const vocab = new Set<string>();
    for (let i = 0; i < segN; i += 1) {
      const m = new Map<string, number>();
      const s = segStartIdx[i];
      const e = s + segmentSizes[i];
      for (let j = s; j < e; j += 1) {
        const w = words[j];
        vocab.add(w);
        m.set(w, (m.get(w) ?? 0) + 1);
      }
      segCounts[i] = m;
    }
    const V = Math.max(1, vocab.size);
    const alpha = Math.max(1e-6, Math.min(1e3, smoothingAlpha)); // 平滑项，可调
    const valuesAdjacent: number[] = [];
    for (let i = 0; i < segN - 1; i += 1) {
      const A = segCounts[i];
      const B = segCounts[i + 1];
      const sizeA = segmentSizes[i];
      const sizeB = segmentSizes[i + 1];
      const denomA = sizeA + alpha * V;
      const denomB = sizeB + alpha * V;
      // 仅遍历出现过的词以降本，缺失视作 alpha
      const keys = new Set<string>([...A.keys(), ...B.keys()]);
      if (divergence === "kl") {
        let kl = 0;
        for (const w of keys) {
          const p = ((A.get(w) ?? 0) + alpha) / denomA;
          const q = ((B.get(w) ?? 0) + alpha) / denomB;
          kl += p * Math.log2(p / q);
        }
        valuesAdjacent.push(kl);
      } else {
        // JS(P||Q) = 0.5 * KL(P||M) + 0.5 * KL(Q||M), M=(P+Q)/2
        let klPM = 0;
        let klQM = 0;
        for (const w of keys) {
          const p = ((A.get(w) ?? 0) + alpha) / denomA;
          const q = ((B.get(w) ?? 0) + alpha) / denomB;
          const m = 0.5 * (p + q);
          klPM += p * Math.log2(p / m);
          klQM += q * Math.log2(q / m);
        }
        const js = 0.5 * (klPM + klQM);
        valuesAdjacent.push(js);
      }
    }
    const valueMax = valuesAdjacent.length ? Math.max(...valuesAdjacent) : 0;
    const valueAvg = valuesAdjacent.length
      ? valuesAdjacent.reduce((a, b) => a + b, 0) / valuesAdjacent.length
      : 0;
    topicDrift = {
      segmentCount: segN,
      segmentSizes,
      valuesAdjacent,
      valueMax,
      valueAvg,
      metric: divergence,
    };
  }

  // 逐点互信息（PMI）
  const miDistance = Math.max(1, Math.min(32, miLag | 0));
  const countsX = new Map<string, number>();
  const countsY = new Map<string, number>();
  const countsXY = new Map<string, number>();
  let Npairs = 0;

  if (miMode === "lag") {
    Npairs = Math.max(0, wordCount - miDistance);
    if (Npairs > 0) {
      for (let i = 0; i < Npairs; i += 1) {
        const x = words[i];
        const y = words[i + miDistance];
        countsX.set(x, (countsX.get(x) ?? 0) + 1);
        countsY.set(y, (countsY.get(y) ?? 0) + 1);
        const k = x + "\u0000" + y;
        countsXY.set(k, (countsXY.get(k) ?? 0) + 1);
      }
    }
  } else {
    // window mode
    for (let i = 0; i < wordCount; i += 1) {
      const x = words[i];
      const windowEnd = Math.min(wordCount, i + 1 + miDistance);
      for (let j = i + 1; j < windowEnd; j += 1) {
        const y = words[j];
        Npairs += 1;
        countsX.set(x, (countsX.get(x) ?? 0) + 1);
        countsY.set(y, (countsY.get(y) ?? 0) + 1);
        const k = x + "\u0000" + y;
        countsXY.set(k, (countsXY.get(k) ?? 0) + 1);
      }
    }
  }

  const miCandidates: Array<{
    x: string;
    y: string;
    pmi: number;
    count: number;
  }> = [];
  const N = Math.max(1, Npairs);
  for (const [k, cxy] of countsXY.entries()) {
    if (cxy < Math.max(1, miMinPairCount)) continue;
    const idx = k.indexOf("\u0000");
    const x = k.slice(0, idx);
    const y = k.slice(idx + 1);
    const cx = countsX.get(x) ?? 1;
    const cy = countsY.get(y) ?? 1;
    const pmi = Math.log2((cxy * N) / (cx * cy));
    miCandidates.push({ x, y, pmi, count: cxy });
  }
  miCandidates.sort((a, b) => b.pmi - a.pmi || b.count - a.count);
  const miTopPairs = miCandidates.slice(0, Math.max(1, miTopN));

  // 齐夫定律拟合：rank-frequency 的对数线性回归
  let zipf: Stats["zipf"] = null;
  if (freq.size >= 2) {
    const sortedFreq = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < sortedFreq.length; i += 1) {
      const rank = i + 1;
      const f = sortedFreq[i][1];
      if (f > 0) {
        xs.push(Math.log(rank));
        ys.push(Math.log(f));
      }
    }
    const n = Math.min(xs.length, ys.length);
    if (n >= 2) {
      let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumXY = 0,
        sumYY = 0;
      for (let i = 0; i < n; i += 1) {
        const x = xs[i];
        const y = ys[i];
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumXY += x * y;
        sumYY += y * y;
      }
      const denom = n * sumXX - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const rDen = Math.sqrt(
        (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)
      );
      const r = rDen !== 0 ? (n * sumXY - sumX * sumY) / rDen : 0;
      const r2 = r * r;
      const exponent = -slope;
      zipf = { slope, exponent, r2, points: n };
    }
  }

  // 句子长度（按词）
  let sentenceLength: Stats["sentenceLength"] = null;
  let burstiness: Stats["burstiness"] = null;
  {
    const sentenceTexts: string[] = [];
    if (sentenceSegmenter) {
      for (const s of sentenceSegmenter.segment(text) as any) {
        const seg = String(s.segment || "").trim();
        if (seg.length > 0) sentenceTexts.push(seg);
      }
    } else {
      const parts = text
        .split(/(?<=[.!?。！？；;])\s+|\r?\n+/u)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      sentenceTexts.push(...parts);
    }
    if (sentenceTexts.length > 0) {
      const lens: number[] = [];
      for (const s of sentenceTexts) {
        // 对每个句子做分词并沿用过滤规则
        let tokens: string[] = [];
        if (wordSegmenter) {
          for (const part of wordSegmenter.segment(s) as any) {
            if (
              part.isWordLike &&
              part.segment &&
              part.segment.trim().length > 0
            ) {
              tokens.push(part.segment as string);
            }
          }
        } else {
          tokens = s.match(/[\p{L}\p{N}]+/gu) ?? [];
        }
        let count = 0;
        for (const raw of tokens) {
          let t = raw.normalize("NFKC").trim();
          if (!caseSensitive) t = t.toLocaleLowerCase("en-US");
          if (t.length < minWordLength) continue;
          if (ignoreStopWords && stopWords.has(t)) continue;
          count += 1;
        }
        lens.push(count);
      }
      const sorted = lens.slice().sort((a, b) => a - b);
      const min = sorted[0] ?? 0;
      const max = sorted[sorted.length - 1] ?? 0;
      const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
      // Burstiness 与变异系数
      let variance = 0;
      if (lens.length > 0) {
        for (const v of lens) {
          const d = v - avg;
          variance += d * d;
        }
        variance /= lens.length;
      }
      const std = Math.sqrt(Math.max(0, variance));
      const cv = avg > 0 ? std / avg : 0;
      const b = std + avg > 0 ? (std - avg) / (std + avg) : 0;
      burstiness = { cv, b };
      const median =
        sorted.length % 2 === 1
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      const p90Index = Math.max(
        0,
        Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)
      );
      const p90 = sorted[p90Index] ?? 0;
      sentenceLength = {
        count: sentenceTexts.length,
        min,
        max,
        avg,
        median,
        p90,
      };
    }
  }

  // Lempel–Ziv 复杂度（LZ78 近似，基于词序列）
  let lz: Stats["lz"] = null;
  {
    const n = words.length | 0;
    if (n >= 1) {
      // 字典：短语 -> id
      const dict = new Map<string, number>();
      let phrases = 0;
      let i = 0;
      const maxPhraseLen = 16; // 限制短语最长，控制复杂度
      while (i < n) {
        let phrase = words[i];
        let j = i + 1;
        // 尽量延长到尚存在字典中的最长短语
        while (j <= Math.min(n, i + maxPhraseLen) && dict.has(phrase)) {
          if (j === n) break;
          phrase += "\u0001" + words[j];
          j += 1;
        }
        // 现在的 phrase 要么是新短语，要么达到最大
        if (!dict.has(phrase)) {
          dict.set(phrase, ++phrases);
        }
        // 移动指针：至少前进 1，若扩展了则跳过整段
        i = Math.max(i + 1, j);
      }
      // 归一化：C_norm ≈ phrases * log(n) / n，压到 [0, ~]
      const normalized = (phrases * Math.log(Math.max(2, n))) / Math.max(1, n);
      lz = { phrases, normalized, tokens: n };
    }
  }

  // 低复杂度重复片段检测：统计 n-gram（n=2..4）Top
  const repeats: Stats["repeats"] = (() => {
    const results: Array<{ fragment: string; length: number; count: number }> =
      [];
    const n = words.length | 0;
    if (n < 2) return results;
    const maxN = 4;
    const topK = 10;
    for (let ng = 2; ng <= maxN; ng += 1) {
      if (n < ng) break;
      const map = new Map<string, number>();
      const sep = "\u0001";
      for (let i = 0; i + ng <= n; i += 1) {
        let key = words[i];
        for (let k = 1; k < ng; k += 1) key += sep + words[i + k];
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const arr: Array<{ fragment: string; length: number; count: number }> =
        [];
      for (const [k, c] of map) {
        if (c <= 1) continue; // 仅关注重复
        arr.push({ fragment: k.split(sep).join(" "), length: ng, count: c });
      }
      arr.sort(
        (a, b) =>
          b.count - a.count ||
          b.length - a.length ||
          a.fragment.localeCompare(b.fragment)
      );
      for (let i = 0; i < Math.min(topK, arr.length); i += 1)
        results.push(arr[i]);
    }
    return results;
  })();

  // 字符构成分析
  let composition: Stats["composition"] = null;
  if (charCountWithSpaces > 0) {
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
    const numberRegex = /\p{N}/gu;
    const uppercaseRegex = /\p{Lu}/gu;
    const fullWidthRegex = /[\uFF01-\uFF5E]/gu;
    const emojiCount = (text.match(emojiRegex) ?? []).length;
    const numberCount = (text.match(numberRegex) ?? []).length;
    const uppercaseCount = (text.match(uppercaseRegex) ?? []).length;
    const fullWidthCount = (text.match(fullWidthRegex) ?? []).length;
    const whitespaceCount = graphemes.reduce(
      (acc, g) => acc + (/^\s+$/u.test(g) ? 1 : 0),
      0
    );
    const scriptsToDetect = [
      { script: "Latin", name: "拉丁文", regex: /\p{Script=Latin}/gu },
      { script: "Han", name: "汉字", regex: /\p{Script=Han}/gu },
      { script: "Hiragana", name: "平假名", regex: /\p{Script=Hiragana}/gu },
      { script: "Katakana", name: "片假名", regex: /\p{Script=Katakana}/gu },
      { script: "Cyrillic", name: "西里尔文", regex: /\p{Script=Cyrillic}/gu },
      { script: "Hangul", name: "韩文", regex: /\p{Script=Hangul}/gu },
      { script: "Arabic", name: "阿拉伯文", regex: /\p{Script=Arabic}/gu },
      { script: "Hebrew", name: "希伯来文", regex: /\p{Script=Hebrew}/gu },
    ];
    const scriptCounts: { [key: string]: { name: string; count: number } } = {};
    for (const { script, name, regex } of scriptsToDetect) {
      const count = (text.match(regex) ?? []).length;
      if (count > 0) scriptCounts[script] = { name, count };
    }
    const total = charCountWithSpaces;
    const toCharStat = (count: number): CharStat => ({
      count,
      ratio: total > 0 ? count / total : 0,
    });
    const scripts: ScriptStat[] = Object.entries(scriptCounts)
      .map(([script, { name, count }]) => ({
        script,
        name,
        count,
        ratio: total > 0 ? count / total : 0,
      }))
      .sort((a, b) => b.count - a.count);
    composition = {
      emoji: toCharStat(emojiCount),
      number: toCharStat(numberCount),
      uppercase: toCharStat(uppercaseCount),
      fullWidth: toCharStat(fullWidthCount),
      whitespace: toCharStat(whitespaceCount),
      scripts,
    };
  }

  return {
    charCountWithSpaces,
    charCountNoSpaces,
    wordCount,
    symbolCount,
    lineCount,
    paragraphCount,
    sentenceCount,
    uniqueWords,
    entropyBits,
    normalizedEntropyBits,
    graphemeEntropyBits,
    graphemeNormalizedEntropyBits,
    topWords,
    topWordPositions,
    topicDrift,
    miLag: miDistance,
    miTopPairs,
    zipf,
    sentenceLength,
    readability,
    yuleK,
    heaps,
    mtld,
    burstiness,
    lz,
    repeats,
    composition,
  };
}

function renderHotspots(
  positions: readonly number[] | undefined,
  total: number,
  bins = 50
) {
  if (!positions || positions.length === 0 || total <= 0) {
    return <div class="h-2 w-36 rounded bg-slate-100" />;
  }
  const bucket = new Array<number>(bins).fill(0);
  const denom = Math.max(1, total - 1);
  for (const idx of positions) {
    const b = Math.min(bins - 1, Math.floor((idx / denom) * bins));
    bucket[b] += 1;
  }
  const items = Array.from({ length: bins }, (_, i) => bucket[i]);
  return (
    <div class="grid h-2 w-36 grid-cols-[repeat(50,minmax(0,1fr))] gap-0.5">
      <For each={items}>
        {(c) => <div class={c > 0 ? "bg-blue-500/70" : "bg-slate-200"} />}
      </For>
    </div>
  );
}

function getNormalizedEntropyInsight(value: number): string {
  if (value >= 0.9) return "信息密度极高";
  if (value >= 0.8) return "信息密度较高";
  if (value >= 0.5) return "信息密度中等";
  if (value >= 0.3) return "信息密度较低";
  return "信息密度很低";
}

function getZipfInsight(
  zipf: { exponent: number; r2: number; points: number } | null
) {
  if (!zipf || zipf.points < 10) return null;
  const fitDesc =
    zipf.r2 >= 0.95 ? "非常符合" : zipf.r2 >= 0.8 ? "基本符合" : "不太符合";
  const expDesc =
    zipf.exponent > 1.2
      ? "少数词汇主导"
      : zipf.exponent < 0.8
      ? "词汇分布更均匀"
      : "词汇分布典型";
  return `文本词频分布${fitDesc}齐夫定律，${expDesc}。`;
}

function getFleschReadingEaseInsight(score: number) {
  if (score >= 90) return "非常易读，适合初学者";
  if (score >= 70) return "比较易读，大众水平";
  if (score >= 50) return "标准难度，适合多数读者";
  if (score >= 30) return "较难，需要一定背景知识";
  return "非常难，学术或专业水平";
}

function getFleschKincaidGradeInsight(grade: number) {
  return `约等于美国 ${grade.toFixed(1)} 年级阅读水平`;
}

function getTopicDriftInsight(
  drift: { valueAvg: number; valueMax: number; metric: "kl" | "js" } | null
) {
  if (!drift) return null;
  const avg = drift.valueAvg;
  const vmax = drift.valueMax;
  if (drift.metric === "js") {
    // JS 散度（以 log2 为底）范围约 [0, 1]
    if (vmax >= 0.4 || avg >= 0.25) return "主题跳跃性大，内容多样";
    if (vmax >= 0.25 || avg >= 0.15) return "主题有明显变化";
    if (vmax >= 0.12 || avg >= 0.08) return "主题有轻微变化";
    return "主题高度一致";
  }
  // KL 散度：不对称、无上界，继续沿用较高阈值，并参考最大值做升级判断
  if (vmax >= 3.0 || avg >= 1.5) return "主题跳跃性大，内容多样";
  if (vmax >= 1.5 || avg >= 0.7) return "主题有明显变化";
  if (vmax >= 0.5 || avg >= 0.3) return "主题有轻微变化";
  return "主题高度一致";
}

function getYuleKInsight(k: number | null) {
  if (k == null) return null;
  if (k < 50) return "词汇多样性高，分布分散";
  if (k < 100) return "多样性中等";
  if (k < 300) return "重复较集中，词频偏头部";
  return "高度集中，可能存在强重复/模板化";
}

function getHeapsInsight(
  heaps: { k: number; beta: number; r2: number; points: number } | null
) {
  if (!heaps) return null;
  const beta = heaps.beta;
  const r2 = heaps.r2;
  const growth =
    beta >= 0.7
      ? "新词增长很快"
      : beta >= 0.5
      ? "新词增长较快"
      : beta >= 0.3
      ? "新词增长中等"
      : "新词增长较慢";
  const fit = r2 >= 0.95 ? "拟合极好" : r2 >= 0.8 ? "拟合良好" : "拟合一般";
  return `${growth}，${fit}`;
}

// MTLD 计算（McCarthy & Jarvis, 2010）
function computeMTLDDirectional(
  tokens: readonly string[],
  threshold = 0.72
): number | null {
  const n = tokens.length | 0;
  if (n < 10) return null;
  let factorCount = 0;
  let tokenCount = 0;
  const seen = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    tokenCount += 1;
    const t = tokens[i];
    if (!seen.has(t)) seen.add(t);
    const ttr = seen.size / tokenCount;
    if (ttr <= threshold) {
      factorCount += 1;
      seen.clear();
      tokenCount = 0;
    }
  }
  if (tokenCount > 0) {
    const ttr = seen.size / tokenCount;
    const partial = (1 - ttr) / (1 - threshold);
    factorCount += Math.max(0, Math.min(1, partial));
  }
  if (factorCount <= 0) return n; // 全程未达阈值，按极限情形返回长度
  return n / factorCount;
}

function computeMTLD(
  tokens: readonly string[],
  threshold = 0.72
): { forward: number; backward: number; average: number } | null {
  const fwd = computeMTLDDirectional(tokens, threshold);
  const bwd = computeMTLDDirectional(tokens.slice().reverse(), threshold);
  if (fwd == null || bwd == null) return null;
  return { forward: fwd, backward: bwd, average: (fwd + bwd) / 2 };
}

function getMTLDInsight(avg: number | null) {
  if (avg == null) return null;
  if (avg >= 80) return "词汇多样性极高";
  if (avg >= 60) return "多样性较高";
  if (avg >= 40) return "多样性中等";
  if (avg >= 20) return "多样性较低";
  return "多样性很低";
}

function getBurstinessInsight(burst: { cv: number; b: number } | null) {
  if (!burst) return null;
  const { cv, b } = burst;
  if (cv >= 1.0 || b >= 0.3) return "节奏波动很大，存在明显的长短句交替";
  if (cv >= 0.6 || b >= 0.15) return "节奏波动适中，存在一定的句长起伏";
  if (cv >= 0.3 || b >= 0.05) return "节奏较平稳";
  return "节奏非常平稳，句长一致性高";
}

function getLZInsight(lz: { normalized: number; tokens: number } | null) {
  if (!lz || lz.tokens < 10) return null;
  const x = lz.normalized;
  if (x >= 1.2) return "结构新颖度高，重复较少，复杂度偏高";
  if (x >= 0.8) return "复杂度中等，信息与重复较均衡";
  return "可压缩性强，存在较多重复或模板化表达";
}

function getRepeatsInsight(
  repeats: Array<{ fragment: string; length: number; count: number }>,
  wordCount: number
) {
  if (!repeats || repeats.length === 0 || wordCount <= 0) return null;
  const maxItem = repeats.reduce(
    (a, b) => (b.count > a.count ? b : a),
    repeats[0]
  );
  const densityHint =
    maxItem.count >= 5
      ? "重复密度很高"
      : maxItem.count >= 3
      ? "重复明显"
      : "重复轻微";
  if (maxItem.length >= 3 && maxItem.count >= 3)
    return `${densityHint}，疑似固定短语/模板："${maxItem.fragment}"`;
  if (maxItem.length === 2 && maxItem.count >= 4)
    return `${densityHint}，常见二元搭配被频繁复用："${maxItem.fragment}"`;
  return `${densityHint}，主要为短 n-gram 的重复`;
}

export default function TextStats() {
  const [text, setText] = createSignal("");
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [minWordLength, setMinWordLength] = createSignal(1);
  const [maxTop, setMaxTop] = createSignal(50);
  const [ignoreStopWords, setIgnoreStopWords] = createSignal(true);
  const [customStopWordsText, setCustomStopWordsText] = createSignal(
    Stopwords.join(", ")
  );

  // 信息论/主题漂移/互信息 参数
  const [segmentCount, setSegmentCount] = createSignal(10);
  const [miMode, setMiMode] = createSignal<"lag" | "window">("window");
  const [miLag, setMiLag] = createSignal(10);
  const [miTopN, setMiTopN] = createSignal(20);
  const [miMinPairCount, setMiMinPairCount] = createSignal(10);
  const [smoothingAlpha, setSmoothingAlpha] = createSignal(0.5);
  const [divergence, setDivergence] = createSignal<"kl" | "js">("js");

  function normalizeForStopWord(word: string): string {
    let t = word.normalize("NFKC").trim();
    if (!caseSensitive()) t = t.toLocaleLowerCase("en-US");
    return t;
  }

  const stopWords = createMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    const custom = customStopWordsText()
      .split(/[，,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const w of custom) set.add(normalizeForStopWord(w));
    return set;
  });

  const stats = createMemo<Stats>(() =>
    computeStats(text(), {
      caseSensitive: caseSensitive(),
      minWordLength: Math.max(1, minWordLength() | 0),
      maxTop: Math.max(1, Math.min(500, maxTop() | 0)),
      ignoreStopWords: ignoreStopWords(),
      stopWords: stopWords(),
      segmentCount: segmentCount(),
      divergence: divergence(),
      miMode: miMode(),
      miLag: miLag(),
      miTopN: Math.max(1, Math.min(200, miTopN() | 0)),
      miMinPairCount: Math.max(1, miMinPairCount() | 0),
      smoothingAlpha: smoothingAlpha(),
    })
  );

  return (
    <div class="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <header class="space-y-1">
          <h1 class="text-2xl font-semibold tracking-tight">文本统计</h1>
          <p class="text-sm text-slate-500">
            支持中英文词切分、词频、字数与符号统计。默认按 NFKC
            规整并对英文小写化。
          </p>
        </header>

        <section class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px]">
          <div class="space-y-3">
            <textarea
              class="h-[360px] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm shadow-sm outline-none focus:border-blue-400"
              placeholder="在此粘贴或输入文本..."
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />

            <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <input
                  type="checkbox"
                  checked={caseSensitive()}
                  onInput={(e) => setCaseSensitive(e.currentTarget.checked)}
                />
                区分大小写（仅英文）
              </label>
              <label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <span class="text-slate-600">最小词长</span>
                <input
                  type="number"
                  min="1"
                  class="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  value={minWordLength()}
                  onInput={(e) =>
                    setMinWordLength(parseInt(e.currentTarget.value || "1", 10))
                  }
                />
              </label>
              <label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <span class="text-slate-600">Top N 词频</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  value={maxTop()}
                  onInput={(e) =>
                    setMaxTop(parseInt(e.currentTarget.value || "50", 10))
                  }
                />
              </label>
              <label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <input
                  type="checkbox"
                  checked={ignoreStopWords()}
                  onInput={(e) => setIgnoreStopWords(e.currentTarget.checked)}
                />
                忽略停用词（仅使用下方自定义列表）
              </label>
            </div>

            <div class="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
              <label class="flex flex-col gap-2 text-sm">
                <span class="text-slate-600">
                  自定义停用词（逗号/空白分隔）
                </span>
                <textarea
                  class="h-[72px] w-full resize-y rounded border border-slate-200 bg-white p-2 font-mono text-xs outline-none focus:border-blue-400"
                  placeholder="例如：的, 了, 在, the, of"
                  value={customStopWordsText()}
                  onInput={(e) => setCustomStopWordsText(e.currentTarget.value)}
                  disabled={!ignoreStopWords()}
                />
              </label>
            </div>

            <div class="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <div class="mb-3 flex items-center gap-4 text-sm">
                <span class="font-medium text-slate-600">PMI 计算模式</span>
                <div class="flex items-center rounded-md border border-slate-200 p-0.5 text-xs shadow-sm">
                  <button
                    class={`rounded-sm px-3 py-1 transition-colors ${
                      miMode() === "lag"
                        ? "bg-blue-500 text-white shadow"
                        : "hover:bg-slate-100"
                    }`}
                    onClick={() => setMiMode("lag")}
                  >
                    固定 Lag
                  </button>
                  <button
                    class={`rounded-sm px-3 py-1 transition-colors ${
                      miMode() === "window"
                        ? "bg-blue-500 text-white shadow"
                        : "hover:bg-slate-100"
                    }`}
                    onClick={() => setMiMode("window")}
                  >
                    滑动窗口
                  </button>
                </div>
              </div>
              <div class="mb-3 flex items-center gap-4 text-sm">
                <span class="font-medium text-slate-600">主题散度</span>
                <div class="flex items-center rounded-md border border-slate-200 p-0.5 text-xs shadow-sm">
                  <button
                    class={`${
                      divergence() === "kl"
                        ? "bg-blue-500 text-white shadow"
                        : "hover:bg-slate-100"
                    } rounded-sm px-3 py-1 transition-colors`}
                    onClick={() => setDivergence("kl")}
                  >
                    KL
                  </button>
                  <button
                    class={`${
                      divergence() === "js"
                        ? "bg-blue-500 text-white shadow"
                        : "hover:bg-slate-100"
                    } rounded-sm px-3 py-1 transition-colors`}
                    onClick={() => setDivergence("js")}
                  >
                    JS
                  </button>
                </div>
              </div>
              <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 text-sm">
                <label class="flex items-center gap-2">
                  <span class="text-slate-600">主题段数</span>
                  <input
                    type="number"
                    min="2"
                    max="32"
                    class="w-20 rounded border border-slate-200 bg-white px-2 py-1"
                    value={segmentCount()}
                    onInput={(e) =>
                      setSegmentCount(
                        parseInt(e.currentTarget.value || "6", 10)
                      )
                    }
                  />
                </label>
                <label class="flex items-center gap-2">
                  <span class="text-slate-600">
                    {miMode() === "lag" ? "互信息 lag" : "窗口大小"}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    class="w-20 rounded border border-slate-200 bg-white px-2 py-1"
                    value={miLag()}
                    onInput={(e) =>
                      setMiLag(parseInt(e.currentTarget.value || "1", 10))
                    }
                  />
                </label>
                <label class="flex items-center gap-2">
                  <span class="text-slate-600">互信息 TopN</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    class="w-24 rounded border border-slate-200 bg-white px-2 py-1"
                    value={miTopN()}
                    onInput={(e) =>
                      setMiTopN(parseInt(e.currentTarget.value || "20", 10))
                    }
                  />
                </label>
                <label class="flex items-center gap-2">
                  <span class="text-slate-600">最小共现次数</span>
                  <input
                    type="number"
                    min="1"
                    class="w-24 rounded border border-slate-200 bg-white px-2 py-1"
                    value={miMinPairCount()}
                    onInput={(e) =>
                      setMiMinPairCount(
                        parseInt(e.currentTarget.value || "2", 10)
                      )
                    }
                  />
                </label>
                <label class="flex items-center gap-2">
                  <span class="text-slate-600">主题漂移平滑 α</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    class="w-24 rounded border border-slate-200 bg-white px-2 py-1"
                    value={smoothingAlpha()}
                    onInput={(e) =>
                      setSmoothingAlpha(
                        Math.max(0, parseFloat(e.currentTarget.value || "0.5"))
                      )
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <aside class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <h2 class="mb-2 text-sm font-semibold text-slate-700">概览</h2>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt class="text-slate-500">行数</dt>
                <dd class="text-slate-900">{stats().lineCount}</dd>
                <dt class="text-slate-500">字符数（计空格）</dt>
                <dd class="text-slate-900">{stats().charCountWithSpaces}</dd>
                <dt class="text-slate-500">字符数（不计空格）</dt>
                <dd class="text-slate-900">{stats().charCountNoSpaces}</dd>
                <dt class="text-slate-500">句子数</dt>
                <dd class="text-slate-900">{stats().sentenceCount}</dd>
                <dt class="text-slate-500">段落数</dt>
                <dd class="text-slate-900">{stats().paragraphCount}</dd>
                <dt class="text-slate-500">符号数</dt>
                <dd class="text-slate-900">{stats().symbolCount}</dd>
                <dt class="text-slate-500">词数</dt>
                <dd class="text-slate-900">{stats().wordCount}</dd>
                <dt class="text-slate-500">唯一词</dt>
                <dd class="text-slate-900">{stats().uniqueWords}</dd>
              </dl>
            </div>

            <Show when={stats().composition}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  字符构成
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">Emoji</dt>
                  <dd class="text-slate-900">
                    {stats().composition!.emoji.count} (
                    {(stats().composition!.emoji.ratio * 100).toFixed(1)}%)
                  </dd>
                  <dt class="text-slate-500">数字</dt>
                  <dd class="text-slate-900">
                    {stats().composition!.number.count} (
                    {(stats().composition!.number.ratio * 100).toFixed(1)}%)
                  </dd>
                  <dt class="text-slate-500">大写字母</dt>
                  <dd class="text-slate-900">
                    {stats().composition!.uppercase.count} (
                    {(stats().composition!.uppercase.ratio * 100).toFixed(1)}%)
                  </dd>
                  <dt class="text-slate-500">全角字符</dt>
                  <dd class="text-slate-900">
                    {stats().composition!.fullWidth.count} (
                    {(stats().composition!.fullWidth.ratio * 100).toFixed(1)}%)
                  </dd>
                  <dt class="text-slate-500">空白字符</dt>
                  <dd class="text-slate-900">
                    {stats().composition!.whitespace.count} (
                    {(stats().composition!.whitespace.ratio * 100).toFixed(1)}%)
                  </dd>
                </dl>
                <Show when={stats().composition!.scripts.length > 0}>
                  <h3 class="mt-3 mb-1 text-xs font-semibold text-slate-600">
                    语言文字分布
                  </h3>
                  <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <For each={stats().composition!.scripts}>
                      {(s) => (
                        <>
                          <dt class="text-slate-500">{s.name}</dt>
                          <dd class="text-slate-900">
                            {s.count} ({(s.ratio * 100).toFixed(1)}%)
                          </dd>
                        </>
                      )}
                    </For>
                  </dl>
                </Show>
              </div>
            </Show>

            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <h2 class="mb-2 text-sm font-semibold text-slate-700">信息论</h2>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt class="text-slate-500">词熵 (bits)</dt>
                <dd class="text-slate-900">{stats().entropyBits.toFixed(3)}</dd>
                <dt class="text-slate-500">归一化熵</dt>
                <dd class="text-slate-900">
                  {stats().normalizedEntropyBits.toFixed(3)}
                  <Show when={stats().uniqueWords > 1}>
                    <span class="ml-2 text-xs text-slate-500">
                      (
                      {getNormalizedEntropyInsight(
                        stats().normalizedEntropyBits
                      )}
                      )
                    </span>
                  </Show>
                </dd>
                <dt class="text-slate-500">字素熵 (bits)</dt>
                <dd class="text-slate-900">
                  {stats().graphemeEntropyBits.toFixed(3)}
                </dd>
                <dt class="text-slate-500">字素归一化熵</dt>
                <dd class="text-slate-900">
                  {stats().graphemeNormalizedEntropyBits.toFixed(3)}
                </dd>
              </dl>
            </div>

            <Show when={stats().zipf}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  齐夫定律拟合
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">样本点</dt>
                  <dd class="text-slate-900">{stats().zipf!.points}</dd>
                  <dt class="text-slate-500">斜率</dt>
                  <dd class="text-slate-900">
                    {stats().zipf!.slope.toFixed(3)}
                  </dd>
                  <dt class="text-slate-500">指数</dt>
                  <dd class="text-slate-900">
                    {stats().zipf!.exponent.toFixed(3)}
                  </dd>
                  <dt class="text-slate-500">R²</dt>
                  <dd class="text-slate-900">{stats().zipf!.r2.toFixed(3)}</dd>
                </dl>
                <Show when={getZipfInsight(stats().zipf)}>
                  <p class="mt-2 text-xs text-slate-500">
                    {getZipfInsight(stats().zipf)}
                  </p>
                </Show>
              </div>
            </Show>

            <Show when={stats().yuleK != null || stats().heaps}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  词汇多样性
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <Show when={stats().yuleK != null}>
                    <>
                      <dt class="text-slate-500">Yule's K</dt>
                      <dd class="text-slate-900">
                        {stats().yuleK!.toFixed(2)}
                        <span class="ml-2 text-xs text-slate-500">
                          ({getYuleKInsight(stats().yuleK)})
                        </span>
                      </dd>
                    </>
                  </Show>
                  <Show when={stats().heaps}>
                    <>
                      <dt class="text-slate-500">Heaps 定律</dt>
                      <dd class="text-slate-900">
                        K≈{stats().heaps!.k.toFixed(3)}, β≈
                        {stats().heaps!.beta.toFixed(3)}, R²=
                        {stats().heaps!.r2.toFixed(3)}
                        <span class="ml-2 text-xs text-slate-500">
                          ({getHeapsInsight(stats().heaps)})
                        </span>
                      </dd>
                    </>
                  </Show>
                  <Show when={stats().mtld}>
                    <>
                      <dt class="text-slate-500">MTLD</dt>
                      <dd class="text-slate-900">
                        平均 {stats().mtld!.average.toFixed(1)}
                        <span class="mx-1 text-slate-500">/</span>
                        正向 {stats().mtld!.forward.toFixed(1)}
                        <span class="mx-1 text-slate-500">/</span>
                        反向 {stats().mtld!.backward.toFixed(1)}
                        <span class="ml-2 text-xs text-slate-500">
                          ({getMTLDInsight(stats().mtld!.average)})
                        </span>
                      </dd>
                    </>
                  </Show>
                </dl>
              </div>
            </Show>

            <Show when={stats().readability}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  英文可读性（Flesch/Kincaid）
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">英文词</dt>
                  <dd class="text-slate-900">{stats().readability!.words}</dd>
                  <dt class="text-slate-500">英文句子</dt>
                  <dd class="text-slate-900">
                    {stats().readability!.sentences}
                  </dd>
                  <dt class="text-slate-500">音节</dt>
                  <dd class="text-slate-900">
                    {stats().readability!.syllables}
                  </dd>
                  <dt class="text-slate-500">Flesch Reading Ease</dt>
                  <dd class="text-slate-900">
                    {stats().readability!.fleschReadingEase.toFixed(2)}
                    <span class="ml-2 text-xs text-slate-500">
                      (
                      {getFleschReadingEaseInsight(
                        stats().readability!.fleschReadingEase
                      )}
                      )
                    </span>
                  </dd>
                  <dt class="text-slate-500">Flesch–Kincaid Grade</dt>
                  <dd class="text-slate-900">
                    {stats().readability!.fleschKincaidGrade.toFixed(2)}
                    <span class="ml-2 text-xs text-slate-500">
                      (
                      {getFleschKincaidGradeInsight(
                        stats().readability!.fleschKincaidGrade
                      )}
                      )
                    </span>
                  </dd>
                </dl>
                <p class="mt-2 text-xs text-slate-500">
                  数值仅对英文文本有意义。Ease 越高越易读，Grade
                  越高表示需求更高年级水平。
                </p>
              </div>
            </Show>

            <Show when={stats().topicDrift}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  主题漂移 ({stats().topicDrift!.metric === "kl" ? "KL" : "JS"}{" "}
                  散度)
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">段数</dt>
                  <dd class="text-slate-900">
                    {stats().topicDrift!.segmentCount}
                  </dd>
                  <dt class="text-slate-500">平均</dt>
                  <dd class="text-slate-900">
                    {stats().topicDrift!.valueAvg.toFixed(3)}
                  </dd>
                  <dt class="text-slate-500">最大</dt>
                  <dd class="text-slate-900">
                    {stats().topicDrift!.valueMax.toFixed(3)}
                  </dd>
                </dl>
                <Show when={getTopicDriftInsight(stats().topicDrift)}>
                  <p class="mt-2 text-xs text-slate-500">
                    {getTopicDriftInsight(stats().topicDrift)}
                  </p>
                </Show>
                <div class="mt-2 flex flex-wrap gap-1">
                  <For each={stats().topicDrift!.valuesAdjacent}>
                    {(v) => (
                      <span class="rounded bg-slate-100 px-2 py-0.5 text-xs tabular-nums">
                        {v.toFixed(2)}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <h2 class="mb-2 text-sm font-semibold text-slate-700">
                Top 词频
              </h2>
              <Show
                when={stats().topWords.length > 0}
                fallback={<div class="text-sm text-slate-500">暂无数据</div>}
              >
                <div class="max-h-[420px] overflow-auto">
                  <table class="w-full table-auto border-collapse text-left text-sm">
                    <thead>
                      <tr class="sticky top-0 bg-slate-50 text-slate-600">
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          词
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          频次
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          热点
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={stats().topWords}>
                        {(item) => (
                          <tr>
                            <td class="border-b border-slate-100 px-2 py-1">
                              <code class="rounded bg-slate-100 px-1 py-0.5 font-mono">
                                {item.word}
                              </code>
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1 tabular-nums">
                              {item.count}
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1">
                              {renderHotspots(
                                stats().topWordPositions[item.word],
                                stats().wordCount
                              )}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </div>

            <Show when={stats().sentenceLength}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  句子长度（按词）
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">句子数</dt>
                  <dd class="text-slate-900">
                    {stats().sentenceLength!.count}
                  </dd>
                  <dt class="text-slate-500">最小</dt>
                  <dd class="text-slate-900">{stats().sentenceLength!.min}</dd>
                  <dt class="text-slate-500">最大</dt>
                  <dd class="text-slate-900">{stats().sentenceLength!.max}</dd>
                  <dt class="text-slate-500">平均</dt>
                  <dd class="text-slate-900">
                    {stats().sentenceLength!.avg.toFixed(2)}
                  </dd>
                  <dt class="text-slate-500">中位数</dt>
                  <dd class="text-slate-900">
                    {stats().sentenceLength!.median}
                  </dd>
                  <dt class="text-slate-500">P90</dt>
                  <dd class="text-slate-900">{stats().sentenceLength!.p90}</dd>
                </dl>
              </div>
            </Show>

            <Show when={stats().burstiness}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  节奏波动（Burstiness）
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">变异系数 CV</dt>
                  <dd class="text-slate-900">
                    {stats().burstiness!.cv.toFixed(3)}
                  </dd>
                  <dt class="text-slate-500">B 指标</dt>
                  <dd class="text-slate-900">
                    {stats().burstiness!.b.toFixed(3)}
                  </dd>
                </dl>
                <Show when={getBurstinessInsight(stats().burstiness)}>
                  <p class="mt-2 text-xs text-slate-500">
                    {getBurstinessInsight(stats().burstiness)}
                  </p>
                </Show>
              </div>
            </Show>

            <Show when={stats().lz}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  Lempel–Ziv 复杂度
                </h2>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt class="text-slate-500">短语数</dt>
                  <dd class="text-slate-900">{stats().lz!.phrases}</dd>
                  <dt class="text-slate-500">归一化</dt>
                  <dd class="text-slate-900">
                    {stats().lz!.normalized.toFixed(3)}
                  </dd>
                  <dt class="text-slate-500">令牌数</dt>
                  <dd class="text-slate-900">{stats().lz!.tokens}</dd>
                </dl>
                <Show when={getLZInsight(stats().lz)}>
                  <p class="mt-2 text-xs text-slate-500">
                    {getLZInsight(stats().lz)}
                  </p>
                </Show>
              </div>
            </Show>

            <Show when={stats().repeats.length > 0}>
              <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <h2 class="mb-2 text-sm font-semibold text-slate-700">
                  重复片段（n-gram）
                </h2>
                <Show
                  when={getRepeatsInsight(stats().repeats, stats().wordCount)}
                >
                  <p class="mb-2 text-xs text-slate-500">
                    {getRepeatsInsight(stats().repeats, stats().wordCount)}
                  </p>
                </Show>
                <div class="max-h-[280px] overflow-auto">
                  <table class="w-full table-auto border-collapse text-left text-sm">
                    <thead>
                      <tr class="sticky top-0 bg-slate-50 text-slate-600">
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          片段
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          n
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          次数
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={stats().repeats}>
                        {(r) => (
                          <tr>
                            <td class="border-b border-slate-100 px-2 py-1">
                              <code class="rounded bg-slate-100 px-1 py-0.5 font-mono">
                                {r.fragment}
                              </code>
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1 tabular-nums">
                              {r.length}
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1 tabular-nums">
                              {r.count}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <h2 class="mb-2 text-sm font-semibold text-slate-700">
                逐点互信息 (PMI)
              </h2>
              <p class="mb-2 text-xs text-slate-500">
                模式:{" "}
                {miMode() === "lag"
                  ? `固定 lag=${stats().miLag}`
                  : `滑动窗口=${stats().miLag}`}
                ，展示 Top {miTopN()} 对（按 PMI 排序）
              </p>
              <Show
                when={stats().miTopPairs.length > 0}
                fallback={<div class="text-sm text-slate-500">暂无数据</div>}
              >
                <div class="max-h-[280px] overflow-auto">
                  <table class="w-full table-auto border-collapse text-left text-sm">
                    <thead>
                      <tr class="sticky top-0 bg-slate-50 text-slate-600">
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          X → Y
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          PMI
                        </th>
                        <th class="border-b border-slate-200 px-2 py-1 font-medium">
                          次数
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={stats().miTopPairs}>
                        {(p) => (
                          <tr>
                            <td class="border-b border-slate-100 px-2 py-1">
                              <code class="rounded bg-slate-100 px-1 py-0.5 font-mono">
                                {p.x}
                              </code>
                              <span class="mx-1 text-slate-500">→</span>
                              <code class="rounded bg-slate-100 px-1 py-0.5 font-mono">
                                {p.y}
                              </code>
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1 tabular-nums">
                              {p.pmi.toFixed(3)}
                            </td>
                            <td class="border-b border-slate-100 px-2 py-1 tabular-nums">
                              {p.count}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
