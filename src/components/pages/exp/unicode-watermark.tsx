import { createEffect, createMemo, createSignal } from "solid-js";

// 零宽字符映射：位0/位1 + 起始/结束标记
const ZWSP = "\u200B"; // Zero Width Space
const ZWNJ = "\u200C"; // Zero Width Non-Joiner
const ZWJ = "\u200D"; // Zero Width Joiner
const START_MARK = "\u2060"; // WJ
const END_MARK = "\u2063"; // Invisible Separator

type SymbolSet = {
  key: string;
  name: string;
  pool: string[]; // 自由大小的符号池，作为“进制字母表”
  start: string; // 段开始标记
  end: string; // 段结束标记（可为空字符串）
};

const SYMBOL_SETS: SymbolSet[] = [
  {
    key: "zw",
    name: "零宽字符符号表",
    pool: [ZWSP, ZWNJ, ZWJ],
    start: START_MARK,
    end: END_MARK,
  },
  {
    key: "vs",
    name: "变体选择符",
    pool: Array.from({ length: 15 }, (_, i) => String.fromCharCode(0xfe00 + i)),
    start: "\uFE0F",
    end: "\uFE0F",
  },
  {
    key: "heart",
    name: "❥♥❤♡",
    pool: ["♥", "❤", "♡"],
    start: "❥",
    end: "❥",
  },
  {
    key: "star",
    name: "★☆✩✫⛤⛥⛦",
    pool: ["★", "☆", "✩", "✫", "⛤", "⛥"],
    start: "⛦",
    end: "⛦",
  },
];

// 符号表与模式一句话说明
const SYMBOL_SET_DESC: Record<string, string> = {
  zw: "零宽字符：隐蔽性好，但少数平台可能丢失不可见字符",
  vs: "变体选择符：与 emoji 等组合常见，兼容性一般",
  heart: "可见符号（爱心）：最不易丢失，但可见",
  star: "可见符号（星标）：最不易丢失，但可见",
};
const MODE_DESC: Record<InjectMode, string> = {
  dense: "逐间隙密集注入：最稳但体积增长最大",
  random: "随机跳跃注入：较均匀兼顾体积与稳健",
  head: "头注入：全部集中在开头",
  tail: "尾注入：全部集中在结尾",
  "full-random-one": "全文随机（仅一段）：隐蔽且体积小",
  "paragraph-random-one": "段落随机（每段一段）：更分散",
};

function getSymbolSetByKey(key: string): SymbolSet {
  return SYMBOL_SETS.find((s) => s.key === key) ?? SYMBOL_SETS[0];
}

// 通用“进制字母表”映射：把字节流转为 base-N 的符号索引，再映射到 pool
function bytesToBaseNIndices(bytes: Uint8Array, base: number): number[] {
  if (base < 2) return [];
  // 使用大整数除法，将字节（基数 256）转换为 base 进制的数字序列
  let digits = Array.from(bytes); // base 256 big-endian
  const out: number[] = [];
  while (digits.length && digits.some((d) => d !== 0)) {
    const next: number[] = [];
    let carry = 0;
    for (let i = 0; i < digits.length; i++) {
      const cur = digits[i] + carry * 256;
      const q = Math.floor(cur / base);
      const r = cur % base;
      if (next.length || q !== 0) next.push(q);
      carry = r;
    }
    out.push(carry);
    digits = next;
  }
  out.reverse();
  return out;
}

function baseNIndicesToBytes(indices: number[], base: number): Uint8Array {
  if (!indices.length) return new Uint8Array();
  let digits = indices.slice(); // base-N big-endian
  const out: number[] = [];
  while (digits.length && digits.some((d) => d !== 0)) {
    const next: number[] = [];
    let carry = 0;
    for (let i = 0; i < digits.length; i++) {
      const cur = digits[i] + carry * base;
      const q = Math.floor(cur / 256);
      const r = cur % 256;
      if (next.length || q !== 0) next.push(q);
      carry = r;
    }
    out.push(carry);
    digits = next;
  }
  out.reverse();
  return new Uint8Array(out);
}

function mapIndicesToPool(indices: number[], pool: string[]): string {
  let out = "";
  for (const i of indices) out += pool[i] ?? "";
  return out;
}

function mapPoolToIndices(hidden: string, pool: string[]): number[] {
  // 兼容 Emoji 变体选择符 (U+FE0F)：允许池中符号后紧跟 FE0F 被识别为同一符号
  const variantMap = new Map<string, number>();
  let maxLen = 1;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    variantMap.set(s, i);
    const withVs = s + "\uFE0F";
    variantMap.set(withVs, i);
    if (s.length > maxLen) maxLen = s.length;
    if (withVs.length > maxLen) maxLen = withVs.length;
  }
  const out: number[] = [];
  let i = 0;
  while (i < hidden.length) {
    let matched = false;
    // 优先最长匹配
    for (let L = Math.min(maxLen, hidden.length - i); L >= 1; L--) {
      const sub = hidden.slice(i, i + L);
      const idx = variantMap.get(sub);
      if (idx !== undefined) {
        out.push(idx);
        i += L;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return out;
}

function encodeWithSet(wm: string, set: SymbolSet): string {
  if (!wm) return "";
  const bytes = stringToUtf8Bytes(wm);
  const indices = bytesToBaseNIndices(bytes, set.pool.length);
  const payload = mapIndicesToPool(indices, set.pool);
  return set.start + payload + (set.end ?? "");
}

function extractSegmentsForSet(text: string, set: SymbolSet): string[] {
  if (!text) return [];
  const segments: string[] = [];
  let idx = 0;
  while (true) {
    const s = text.indexOf(set.start, idx);
    if (s < 0) break;
    const from = s + set.start.length;
    if (set.end) {
      const e = text.indexOf(set.end, from);
      if (e < 0) break;
      segments.push(text.slice(from, e));
      idx = e + set.end.length;
    } else {
      const next = text.indexOf(set.start, from);
      const end = next >= 0 ? next : text.length;
      segments.push(text.slice(from, end));
      idx = end;
    }
  }
  return segments.filter((s) => s.length > 0);
}

function majorityVoteDecode(segments: string[], set: SymbolSet): string | null {
  if (!segments.length) return null;
  // 选择出现最多的长度，避免掺杂异常片段
  const lenCounts = new Map<number, number>();
  for (const s of segments) {
    const n = s.length;
    lenCounts.set(n, (lenCounts.get(n) ?? 0) + 1);
  }
  let targetLen = segments[0].length;
  let bestCount = 0;
  for (const [len, count] of lenCounts) {
    if (count > bestCount) {
      bestCount = count;
      targetLen = len;
    }
  }
  // 放宽：允许长度相近（±1）以容忍个别丢失/插入
  const filtered = segments.filter((s) => Math.abs(s.length - targetLen) <= 1);
  if (!filtered.length) return null;
  const indexRows = filtered.map((s) => mapPoolToIndices(s, set.pool));
  if (!indexRows.length) return null;
  const cols = Math.min(...indexRows.map((b) => b.length));
  if (cols < 1) return null;
  const votedIndices: number[] = [];
  for (let i = 0; i < cols; i++) {
    const count = new Map<number, number>();
    for (const row of indexRows) {
      const v = row[i];
      if (v === undefined) continue;
      count.set(v, (count.get(v) ?? 0) + 1);
    }
    let best = 0,
      bestCnt = -1;
    for (const [k, c] of count.entries()) {
      if (c > bestCnt) {
        bestCnt = c;
        best = k;
      }
    }
    votedIndices.push(best);
  }
  const bytes = baseNIndicesToBytes(votedIndices, set.pool.length);
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

// 注入策略
type InjectMode =
  | "dense"
  | "random"
  | "head"
  | "tail"
  | "full-random-one"
  | "paragraph-random-one";

function injectDense(text: string, hiddenSegment: string): string {
  if (!text) return hiddenSegment;
  if (!hiddenSegment) return text;
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isLast = i === chars.length - 1;
    out += ch;
    if (!isLast) out += hiddenSegment;
  }
  return out;
}

function injectHead(text: string, hiddenSegment: string): string {
  if (!hiddenSegment) return text;
  return hiddenSegment + text;
}

function injectTail(text: string, hiddenSegment: string): string {
  if (!hiddenSegment) return text;
  return text + hiddenSegment;
}

function injectRandom(
  text: string,
  hiddenSegment: string,
  options: {
    minGap?: number;
    maxGap?: number;
    minRepeat?: number;
    maxRepeat?: number;
  }
): string {
  if (!text) return hiddenSegment;
  if (!hiddenSegment) return text;
  const {
    minGap = 1,
    maxGap = 5,
    minRepeat = 1,
    maxRepeat = 3,
  } = options ?? {};
  const chars = Array.from(text);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const gap = Math.max(
      minGap,
      Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap
    );
    const end = Math.min(chars.length, i + gap);
    for (let j = i; j < end; j++) out += chars[j];
    i = end;
    if (i < chars.length) {
      const repeat = Math.max(
        minRepeat,
        Math.floor(Math.random() * (maxRepeat - minRepeat + 1)) + minRepeat
      );
      for (let r = 0; r < repeat; r++) out += hiddenSegment;
    }
  }
  return out;
}

function stripBySet(text: string, set: SymbolSet): string {
  // 清除 start/end 以及池内所有符号
  let out = text.split(set.start).join("");
  if (set.end) out = out.split(set.end).join("");
  if (set.pool.length) {
    const regex = new RegExp(
      "[" + set.pool.map((c) => escapeForCharClass(c)).join("") + "]",
      "g"
    );
    out = out.replace(regex, "");
  }
  return out;
}

function escapeForCharClass(ch: string): string {
  // 简化处理：如遇到多码点 emoji，此处逐字符拼入字符类；
  // 对大多数 BMP 字符仍有效，遇 surrogate pair 情况正则类并非逐 codepoint 精确，但足够用于清理
  return ch.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
}

// 构建按位令牌流： [start] + bitSymbols + [end]，重复冗余次数
function buildTokenStreamFromWm(
  wm: string,
  set: SymbolSet,
  redundancy: number
): string[] {
  if (!wm) return [];
  const bytes = stringToUtf8Bytes(wm);
  const indices = bytesToBaseNIndices(bytes, set.pool.length);
  const bitSymbols = indices.map((i) => set.pool[i] ?? set.pool[0]);
  const tokens: string[] = [];
  const times = Math.max(1, redundancy | 0);
  for (let r = 0; r < times; r++) {
    tokens.push(set.start);
    for (const s of bitSymbols) tokens.push(s);
    if (set.end) tokens.push(set.end);
  }
  return tokens;
}

// 将令牌分配到文本间隙：
// 间隙索引 0=头，1..len-1=字符间隙，len=尾
function injectTokensDense(text: string, tokens: string[]): string {
  if (!tokens.length) return text;
  const chars = Array.from(text);
  const gaps: string[][] = Array(chars.length + 1)
    .fill(0)
    .map(() => []);
  let gapIdx = 1; // 从第一个字符后的间隙开始，匹配“概🔒念...”
  for (const tk of tokens) {
    if (gapIdx < gaps.length) {
      gaps[gapIdx].push(tk);
      gapIdx++;
    } else {
      // 超出则全部落到尾间隙
      gaps[gaps.length - 1].push(tk);
    }
  }
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    out += gaps[i].join("") + chars[i];
  }
  out += gaps[gaps.length - 1].join("");
  return out;
}

function injectTokensRandom(
  text: string,
  tokens: string[],
  options: {
    minGap?: number;
    maxGap?: number;
    minRepeat?: number;
    maxRepeat?: number;
  }
): string {
  if (!tokens.length) return text;
  const {
    minGap = 1,
    maxGap = 5,
    minRepeat = 1,
    maxRepeat = 3,
  } = options ?? {};
  const chars = Array.from(text);
  const gaps: string[][] = Array(chars.length + 1)
    .fill(0)
    .map(() => []);
  let pos = 1; // 从第一个字符后的间隙开始
  let cursor = 0;
  while (cursor < tokens.length && pos < gaps.length) {
    const repeat = Math.min(
      Math.max(
        minRepeat,
        Math.floor(Math.random() * (maxRepeat - minRepeat + 1)) + minRepeat
      ),
      tokens.length - cursor
    );
    for (let r = 0; r < repeat; r++) gaps[pos].push(tokens[cursor++]);
    if (cursor >= tokens.length) break;
    const step = Math.max(
      minGap,
      Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap
    );
    pos = Math.min(gaps.length - 1, pos + step);
  }
  // 剩余放到尾间隙
  while (cursor < tokens.length) gaps[gaps.length - 1].push(tokens[cursor++]);
  let out = "";
  for (let i = 0; i < chars.length; i++) out += gaps[i].join("") + chars[i];
  out += gaps[gaps.length - 1].join("");
  return out;
}

function injectTokensHead(text: string, tokens: string[]): string {
  if (!tokens.length) return text;
  const chars = Array.from(text);
  return tokens.join("") + chars.join("");
}

function injectTokensTail(text: string, tokens: string[]): string {
  if (!tokens.length) return text;
  const chars = Array.from(text);
  return chars.join("") + tokens.join("");
}

// 全文随机填充：仅一段水印令牌，随机但尽量均匀地分布在全文的若干间隙
function injectTokensFullRandomOne(
  text: string,
  tokens: string[],
  options: { seed?: number }
): string {
  if (!tokens.length) return text;
  const chars = Array.from(text);
  const gapsCount = chars.length + 1;
  const gaps: string[][] = Array(gapsCount)
    .fill(0)
    .map(() => []);
  // 简单均匀采样：将间隙区间均分为 tokens.length+1 组，令牌落在每组随机一个位置
  const groups = tokens.length + 1;
  for (let i = 0; i < tokens.length; i++) {
    const start = Math.floor((i * gapsCount) / groups);
    const end = Math.floor(((i + 1) * gapsCount) / groups) - 1;
    const pos = Math.min(
      gapsCount - 1,
      Math.max(
        0,
        start + Math.floor(Math.random() * Math.max(1, end - start + 1))
      )
    );
    gaps[pos].push(tokens[i]);
  }
  let out = "";
  for (let i = 0; i < chars.length; i++) out += gaps[i].join("") + chars[i];
  out += gaps[gaps.length - 1].join("");
  return out;
}

// 段落随机填充：按 (\r?\n)+ 切段，每段仅投放一段令牌，并随机/均匀分布到该段内
function injectTokensParagraphRandomOne(
  text: string,
  tokens: string[],
  options: { seed?: number }
): string {
  if (!tokens.length) return text;
  const parts = text.split(/(\r?\n)+/);
  // parts 交替为段落与分隔符，处理段落部分
  for (let i = 0; i < parts.length; i += 2) {
    const paragraph = parts[i] ?? "";
    if (!paragraph) continue;
    const chars = Array.from(paragraph);
    const gapsCount = chars.length + 1;
    const gaps: string[][] = Array(gapsCount)
      .fill(0)
      .map(() => []);
    const groups = tokens.length + 1;
    for (let t = 0; t < tokens.length; t++) {
      const start = Math.floor((t * gapsCount) / groups);
      const end = Math.floor(((t + 1) * gapsCount) / groups) - 1;
      const pos = Math.min(
        gapsCount - 1,
        Math.max(
          0,
          start + Math.floor(Math.random() * Math.max(1, end - start + 1))
        )
      );
      gaps[pos].push(tokens[t]);
    }
    let rebuilt = "";
    for (let c = 0; c < chars.length; c++)
      rebuilt += gaps[c].join("") + chars[c];
    rebuilt += gaps[gaps.length - 1].join("");
    parts[i] = rebuilt;
  }
  return parts.join("");
}

function stringToUtf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToBits(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits;
}

function bitsToZw(bits: string): string {
  // 仅 0/1 两种映射，避免更多字符影响兼容性
  let out = "";
  for (const ch of bits) out += ch === "1" ? ZWNJ : ZWSP;
  return out;
}

function zwToBits(hidden: string): string {
  // 过滤只认 ZW0/ZW1，其他一律忽略
  let bits = "";
  for (const ch of hidden) {
    if (ch === ZWSP) bits += "0";
    else if (ch === ZWNJ) bits += "1";
  }
  return bits;
}

function bitsToBytes(bits: string): Uint8Array {
  const len = Math.floor(bits.length / 8);
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const byteBits = bits.slice(i * 8, i * 8 + 8);
    arr[i] = parseInt(byteBits, 2);
  }
  return arr;
}

function encodeWatermarkToHidden(wm: string): string {
  if (!wm) return "";
  const bytes = stringToUtf8Bytes(wm);
  const bits = bytesToBits(bytes);
  const payload = bitsToZw(bits);
  return START_MARK + payload;
}

function injectHiddenEveryGap(text: string, hiddenSegment: string): string {
  if (!text) return hiddenSegment;
  if (!hiddenSegment) return text;
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isLast = i === chars.length - 1;
    out += ch;
    if (!isLast) out += hiddenSegment; // 在每个间隙重复填充整段隐藏码
  }
  return out;
}

function extractHiddenSequence(text: string): string {
  // 收集文中所有相关的不可见字符
  const relevant = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
  const hidden = (text.match(relevant) ?? []).join("");
  if (!hidden) return "";
  // 以 START_MARK 拆分，获取第一个非空片段作为载荷（其余为重复）
  const parts = hidden.split(START_MARK).filter((x) => x.length > 0);
  if (parts.length === 0) return "";
  return parts[0];
}

function decodeHiddenToWatermark(text: string): string | null {
  const payload = extractHiddenSequence(text);
  if (!payload) return null;
  const bits = zwToBits(payload);
  if (bits.length < 8) return null;
  try {
    const bytes = bitsToBytes(bits);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function stripHidden(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
}

export default function UnicodeWatermark() {
  const [input, setInput] = createSignal("");
  const [wm, setWm] = createSignal("");
  const [output, setOutput] = createSignal("");
  const [decoded, setDecoded] = createSignal<string | null>(null);

  // 新增：符号表/模式/纠错与随机参数
  const [symbolKey, setSymbolKey] = createSignal<string>(SYMBOL_SETS[0].key);
  const [mode, setMode] = createSignal<InjectMode>("full-random-one");
  const [redundancy, setRedundancy] = createSignal<number>(3);
  const [minGap, setMinGap] = createSignal<number>(1);
  const [maxGap, setMaxGap] = createSignal<number>(5);
  const [minRepeat, setMinRepeat] = createSignal<number>(1);
  const [maxRepeat, setMaxRepeat] = createSignal<number>(3);

  const selectedSet = createMemo(() => getSymbolSetByKey(symbolKey()));
  const singleHidden = createMemo(() => encodeWithSet(wm(), selectedSet()));
  const hiddenSegment = createMemo(() => {
    const seg = singleHidden();
    if (!seg) return "";
    return seg.repeat(Math.max(1, redundancy()));
  });

  // UI：简单/高级 与可用性估算
  const [simpleMode, setSimpleMode] = createSignal(true);
  const redundancyForModeMemo = createMemo(() =>
    mode() === "full-random-one" || mode() === "paragraph-random-one"
      ? 1
      : redundancy()
  );
  const tokensPreview = createMemo(() =>
    buildTokenStreamFromWm(wm(), selectedSet(), redundancyForModeMemo())
  );
  const estimatedAddedChars = createMemo(() =>
    tokensPreview().reduce((sum, t) => sum + t.length, 0)
  );
  const charCount = createMemo(() => Array.from(input()).length);
  const isReady = createMemo(() => Boolean(input() && wm()));
  const [workMode, setWorkMode] = createSignal<"inject" | "extract">("inject");
  const segmentsCount = createMemo(() => {
    const text = output() || input();
    return extractSegmentsForSet(text, selectedSet()).length;
  });
  const [copied, setCopied] = createSignal(false);
  const outputGrowth = createMemo(() => {
    const inLen = Array.from(input()).length;
    const outLen = Array.from(output()).length;
    if (!inLen)
      return { growthPct: 0, added: outLen, tokens: tokensPreview().length };
    const added = Math.max(0, outLen - inLen);
    const growthPct = Math.round((added / inLen) * 100);
    return { growthPct, added, tokens: tokensPreview().length };
  });

  async function copyWithFeedback(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function downloadTxt(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // 通用防抖
  function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
    let timer: any;
    return (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedInject = debounce(() => {
    if (workMode() !== "inject") return;
    const text = input();
    const set = selectedSet();
    const redundancyForMode =
      mode() === "full-random-one" || mode() === "paragraph-random-one"
        ? 1
        : redundancy();
    const tokens = buildTokenStreamFromWm(wm(), set, redundancyForMode);
    let res = text;
    switch (mode()) {
      case "dense":
        res = injectTokensDense(text, tokens);
        break;
      case "random":
        res = injectTokensRandom(text, tokens, {
          minGap: minGap(),
          maxGap: Math.max(minGap(), maxGap()),
          minRepeat: minRepeat(),
          maxRepeat: Math.max(minRepeat(), maxRepeat()),
        });
        break;
      case "head":
        res = injectTokensHead(text, tokens);
        break;
      case "tail":
        res = injectTokensTail(text, tokens);
        break;
      case "full-random-one":
        res = injectTokensFullRandomOne(text, tokens, {});
        break;
      case "paragraph-random-one":
        res = injectTokensParagraphRandomOne(text, tokens, {});
        break;
    }
    setOutput(res);
  }, 350);

  // 自动生成：注入模式下监听相关依赖
  createEffect(() => {
    // 读取依赖触发追踪
    input();
    wm();
    symbolKey();
    mode();
    redundancy();
    minGap();
    maxGap();
    minRepeat();
    maxRepeat();
    if (workMode() === "inject") debouncedInject();
  });

  // 提取模式：自动防抖解码
  const debouncedDecode = debounce(() => {
    if (workMode() !== "extract") return;
    runDecode();
  }, 300);

  createEffect(() => {
    // 触发追踪
    input();
    symbolKey();
    if (workMode() === "extract") debouncedDecode();
  });

  function fillDemo() {
    if (!input())
      setInput(
        "这是一段用于演示的文本。你可以把任何文章粘贴到这里，我会把水印悄悄藏进文字里而不改变肉眼可见效果。"
      );
    if (!wm()) setWm("owner=user@example.com; ts=2025-10-09");
  }

  function runInject() {
    const text = input();
    const set = selectedSet();
    // 使用按位令牌流分配而不是整段插入
    const redundancyForMode =
      mode() === "full-random-one" || mode() === "paragraph-random-one"
        ? 1
        : redundancy();
    const tokens = buildTokenStreamFromWm(wm(), set, redundancyForMode);
    let res = text;
    switch (mode()) {
      case "dense":
        res = injectTokensDense(text, tokens);
        break;
      case "random":
        res = injectTokensRandom(text, tokens, {
          minGap: minGap(),
          maxGap: Math.max(minGap(), maxGap()),
          minRepeat: minRepeat(),
          maxRepeat: Math.max(minRepeat(), maxRepeat()),
        });
        break;
      case "head":
        res = injectTokensHead(text, tokens);
        break;
      case "tail":
        res = injectTokensTail(text, tokens);
        break;
      case "full-random-one":
        res = injectTokensFullRandomOne(text, tokens, {});
        break;
      case "paragraph-random-one":
        res = injectTokensParagraphRandomOne(text, tokens, {});
        break;
    }
    setOutput(res);
  }

  function runDecode() {
    const set = selectedSet();
    const text = output() || input();
    const segments = extractSegmentsForSet(text, set);
    const msg = majorityVoteDecode(segments, set);
    setDecoded(msg);
  }

  function runStrip() {
    const set = selectedSet();
    setOutput(stripBySet(output() || input(), set));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  return (
    <div class="p-4 space-y-4">
      <h1 class="text-lg font-600">文本水印机</h1>
      <div class="rounded border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div class="flex items-center gap-1 px-2 pt-2 border-b border-gray-200 bg-gray-50">
          <button
            class={
              "px-3 py-2 rounded-t text-sm " +
              (workMode() === "inject"
                ? "bg-white border border-b-transparent border-gray-200 -mb-px text-blue-600"
                : "text-gray-600 hover:text-gray-900")
            }
            onClick={() => setWorkMode("inject")}
          >
            注入水印
          </button>
          <button
            class={
              "px-3 py-2 rounded-t text-sm " +
              (workMode() === "extract"
                ? "bg-white border border-b-transparent border-gray-200 -mb-px text-blue-600"
                : "text-gray-600 hover:text-gray-900")
            }
            onClick={() => setWorkMode("extract")}
          >
            提取水印
          </button>
        </div>
        <div class="p-4 space-y-4">
          {workMode() === "inject" && (
            <div class="space-y-4">
              <div class="flex items-center gap-3 text-sm">
                <div class="text-gray-500">
                  字数：{charCount()}，预计新增字符：{estimatedAddedChars()}
                </div>
              </div>

              {/* 步骤 1：贴原文 */}
              <div class="space-y-2 p-3 rounded border border-gray-200 bg-white/50">
                <div class="font-600">步骤 1：输入原文</div>
                <div class="text-xs text-gray-500">
                  这部分的文本会对外展示。
                </div>
                <textarea
                  class="w-full h-40 p-2 rounded border border-gray-200 font-mono text-sm"
                  placeholder="把要加水印的文字放这里"
                  value={input()}
                  onInput={(e) =>
                    setInput((e.target as HTMLTextAreaElement).value)
                  }
                />
              </div>

              {/* 步骤 2：写水印 */}
              <div class="space-y-2 p-3 rounded border border-gray-200 bg-white/50">
                <div class="font-600">步骤 2：输入水印</div>
                <div class="text-xs text-gray-500">
                  这部分的文本会藏在原文里。
                </div>
                <input
                  class="w-full p-2 rounded border border-gray-200 text-sm"
                  placeholder="输入你想隐式加入的文本"
                  value={wm()}
                  onInput={(e) => setWm((e.target as HTMLInputElement).value)}
                />
              </div>

              {/* 高级设置：保留原有功能 */}
              <div class="space-y-2 p-3 rounded border border-gray-200 bg-white/30">
                <details open={!simpleMode()}>
                  <summary class="cursor-pointer select-none text-sm font-600">
                    高级设置（可选）
                  </summary>
                  <div class="mt-2 space-y-3">
                    <div class="grid gap-2 md:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-sm text-gray-600">符号表</label>
                        <select
                          class="w-full p-2 rounded border border-gray-200 text-sm bg-white"
                          value={symbolKey()}
                          onInput={(e) =>
                            setSymbolKey((e.target as HTMLSelectElement).value)
                          }
                        >
                          {SYMBOL_SETS.map((s) => (
                            <option value={s.key}>{s.name}</option>
                          ))}
                        </select>
                        <div class="text-xs text-gray-500">
                          说明：{SYMBOL_SET_DESC[symbolKey()] ?? ""}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <label class="text-sm text-gray-600">注入模式</label>
                        <select
                          class="w-full p-2 rounded border border-gray-200 text-sm bg-white"
                          value={mode()}
                          onInput={(e) =>
                            setMode(
                              (e.target as HTMLSelectElement).value as any
                            )
                          }
                        >
                          <option value="dense">逐间隙密集注入</option>
                          <option value="random">随机跳跃注入</option>
                          <option value="head">头注入</option>
                          <option value="tail">尾注入</option>
                          <option value="full-random-one">
                            全文随机填充（仅一段）
                          </option>
                          <option value="paragraph-random-one">
                            段落随机填充（每段一段）
                          </option>
                        </select>
                        <div class="text-xs text-gray-500">
                          说明：{MODE_DESC[mode()]}
                        </div>
                      </div>
                    </div>

                    {mode() === "random" && (
                      <div class="grid gap-2 md:grid-cols-2">
                        <div class="space-y-1">
                          <label class="text-sm text-gray-600">
                            随机间隔最小
                          </label>
                          <input
                            type="number"
                            class="w-full p-2 rounded border border-gray-200 text-sm"
                            min="1"
                            value={minGap()}
                            onInput={(e) =>
                              setMinGap(
                                parseInt(
                                  (e.target as HTMLInputElement).value || "1"
                                )
                              )
                            }
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-sm text-gray-600">
                            随机间隔最大
                          </label>
                          <input
                            type="number"
                            class="w-full p-2 rounded border border-gray-200 text-sm"
                            min={minGap()}
                            value={maxGap()}
                            onInput={(e) =>
                              setMaxGap(
                                parseInt(
                                  (e.target as HTMLInputElement).value ||
                                    String(minGap())
                                )
                              )
                            }
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-sm text-gray-600">
                            随机重复最小
                          </label>
                          <input
                            type="number"
                            class="w-full p-2 rounded border border-gray-200 text-sm"
                            min="1"
                            value={minRepeat()}
                            onInput={(e) =>
                              setMinRepeat(
                                parseInt(
                                  (e.target as HTMLInputElement).value || "1"
                                )
                              )
                            }
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-sm text-gray-600">
                            随机重复最大
                          </label>
                          <input
                            type="number"
                            class="w-full p-2 rounded border border-gray-200 text-sm"
                            min={minRepeat()}
                            value={maxRepeat()}
                            onInput={(e) =>
                              setMaxRepeat(
                                parseInt(
                                  (e.target as HTMLInputElement).value ||
                                    String(minRepeat())
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div class="grid gap-2 md:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-sm text-gray-600">
                          冗余次数（纠错）
                        </label>
                        <input
                          type="number"
                          class="w-full p-2 rounded border border-gray-200 text-sm"
                          min="1"
                          value={redundancy()}
                          onInput={(e) =>
                            setRedundancy(
                              parseInt(
                                (e.target as HTMLInputElement).value || "1"
                              )
                            )
                          }
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-sm text-gray-600">
                          按位令牌数（预估）
                        </label>
                        <div class="p-2 rounded border border-gray-200 text-xs text-gray-600 bg-gray-50">
                          {tokensPreview().length} 个
                        </div>
                      </div>
                    </div>
                    {(mode() === "full-random-one" ||
                      mode() === "paragraph-random-one") && (
                      <div class="text-xs text-gray-500 leading-5">
                        当前模式仅注入一段水印，冗余设置将被忽略。
                      </div>
                    )}
                  </div>
                </details>
              </div>

              {/* 步骤 3：结果与复制（自动生成） */}
              <div class="space-y-2 p-3 rounded border border-gray-200 bg-white/50">
                <div class="font-600">步骤 3：结果</div>
                <div class="flex gap-2 items-center flex-wrap">
                  <button
                    class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                    disabled={!output()}
                    onClick={() => copyWithFeedback(output() || input())}
                  >
                    {copied() ? "√ 已复制" : "复制结果"}
                  </button>
                  <button
                    class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                    disabled={!output()}
                    onClick={() => downloadTxt("watermarked.txt", output())}
                  >
                    导出 .txt
                  </button>
                </div>
                <label class="text-xs text-gray-500">这部分的文本是原文被加上水印的结果。</label>
                <textarea
                  class="w-full h-40 p-2 rounded border border-gray-200 font-mono text-sm"
                  placeholder="点击“生成”后在此查看结果"
                  value={output()}
                  onInput={(e) =>
                    setOutput((e.target as HTMLTextAreaElement).value)
                  }
                />
              </div>
            </div>
          )}

          {workMode() === "extract" && (
            <div class="space-y-4">
              {/* <div class="space-y-2 p-3 rounded border border-gray-200 bg-white/50"> */}
                <div class="font-600">粘贴含水印文本</div>
                <textarea
                  class="w-full h-40 p-2 rounded border border-gray-200 font-mono text-sm"
                  placeholder="把文本粘贴到这里"
                  value={input()}
                  onInput={(e) =>
                    setInput((e.target as HTMLTextAreaElement).value)
                  }
                />
                <div class="grid gap-2 md:grid-cols-2 items-end">
                  <div class="space-y-1">
                    <label class="text-sm text-gray-600">
                      符号表
                    </label>
                    <select
                      class="w-full p-2 rounded border border-gray-200 text-sm bg-white"
                      value={symbolKey()}
                      onInput={(e) =>
                        setSymbolKey((e.target as HTMLSelectElement).value)
                      }
                    >
                      {SYMBOL_SETS.map((s) => (
                        <option value={s.key}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div class="text-xs text-gray-500">
                    已发现片段：{segmentsCount()} 个
                  </div>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <button
                    class="px-3 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
                    disabled={!input()}
                    onClick={() => {
                      setOutput(input());
                      runStrip();
                    }}
                  >
                    清洗水印
                  </button>
                  <button
                    class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                    disabled={!input()}
                    onClick={() => copy(input())}
                  >
                    复制
                  </button>
                </div>
                <div class="text-sm">
                  <span class="text-gray-600">解码结果：</span>
                  <span class="font-mono break-all">{decoded() ?? "(无)"}</span>
                </div>
              {/* </div> */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
