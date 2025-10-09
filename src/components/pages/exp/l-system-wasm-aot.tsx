import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import wabt from "wabt";

type WabtModule = Awaited<ReturnType<typeof wabt>>;

// 规则输入可为：
// - 简单映射：{ "F": "FF" }
// - 概率映射：{ "F": [{ rhs: "FF", p: 0.6 }, { rhs: "F[+F]F", p: 0.4 }] }
// - 上下文敏感（简版）：key 形如 "A<F>B" 表示左邻为 A，右邻为 B 时 F 的替换
type RuleOption = { rhs: string; p?: number };
type RuleInput = Record<string, string | RuleOption[]>;
type CompiledRule = {
  lhs: string;
  rhsOptions: RuleOption[];
  left?: string;
  right?: string;
  params?: string[];
};

type Preset = {
  name: string;
  axiom: string;
  rules: RuleInput;
  angleDeg: number;
  step: number;
  depth: number;
  initAngleDeg?: number;
  // optional runtime parameters for nicer presets
  noiseType?: "none" | "white" | "pink";
  angleNoiseAmpDeg?: number;
  stepNoiseAmp?: number;
  noiseSeed?: number;
  tropismX?: number;
  tropismY?: number;
  tropismK?: number;
};

const PRESETS: Preset[] = [
  {
    name: "科赫曲线",
    axiom: "F",
    rules: { F: "F+F--F+F" },
    angleDeg: 60,
    step: 5,
    depth: 4,
    initAngleDeg: 0,
  },
  {
    name: "谢尔宾斯基三角形",
    axiom: "F-G-G",
    rules: { F: "F-G+F+G-F", G: "GG" },
    angleDeg: 120,
    step: 6,
    depth: 4,
    initAngleDeg: 0,
  },
  {
    name: "分形植物",
    axiom: "X",
    rules: {
      X: "F+[[X]-X]-F[-FX]+X",
      F: "FF",
    },
    angleDeg: 25,
    step: 4,
    depth: 5,
    initAngleDeg: -90,
  },
  {
    name: "科赫雪花",
    axiom: "F--F--F",
    rules: { F: "F+F--F+F" },
    angleDeg: 60,
    step: 4,
    depth: 4,
    initAngleDeg: 0,
  },
  {
    name: "莱维C形曲线",
    axiom: "F",
    rules: { F: "+F--F+" },
    angleDeg: 45,
    step: 3,
    depth: 12,
    initAngleDeg: 0,
  },
  {
    name: "龙曲线",
    axiom: "FX",
    rules: { X: "X+YF+", Y: "-FX-Y" },
    angleDeg: 90,
    step: 4,
    depth: 10,
    initAngleDeg: 0,
  },
  {
    name: "希尔伯特曲线",
    axiom: "A",
    rules: { A: "+BF-AFA-FB+", B: "-AF+BFB+FA-" },
    angleDeg: 90,
    step: 6,
    depth: 6,
    initAngleDeg: 0,
  },
  {
    name: "二叉树",
    axiom: "F",
    rules: { F: "F[+F]F[-F]F" },
    angleDeg: 25,
    step: 5,
    depth: 6,
    initAngleDeg: -90,
  },
  {
    name: "高斯帕曲线",
    axiom: "A",
    rules: { A: "A-B--B+A++AA+B-", B: "+A-BB--B-A++A+B" },
    angleDeg: 60,
    step: 6,
    depth: 4,
    initAngleDeg: 0,
  },
  {
    name: "灌木丛",
    axiom: "F",
    rules: { F: "FF-[-F+F+F]+[+F-F-F]" },
    angleDeg: 22.5,
    step: 3,
    depth: 4,
    initAngleDeg: -90,
  },
  {
    name: "枯枝",
    axiom: "X",
    rules: { X: "F[+X]F[-X]+X", F: "FF" },
    angleDeg: 20,
    step: 3,
    depth: 7,
    initAngleDeg: -90,
  },
  {
    name: "水晶",
    axiom: "F+F+F+F",
    rules: { F: "FF+F++F+F" },
    angleDeg: 90,
    step: 6,
    depth: 4,
    initAngleDeg: 0,
  },
  // ---- Advanced aesthetics with context, randomness, macros, noise & tropism ----
  {
    name: "风吹树冠（随机 + 向性）",
    axiom: "X",
    rules: {
      X: [
        { rhs: "F[+X]F[-X]FX", p: 0.6 },
        { rhs: "F[+X]-FX[-X]F", p: 0.4 },
      ],
      F: "FF",
    },
    angleDeg: 22.5,
    step: 3,
    depth: 6,
    initAngleDeg: -90,
    noiseType: "pink",
    angleNoiseAmpDeg: 3,
    stepNoiseAmp: 0.06,
    noiseSeed: 2,
    tropismX: 0.2,
    tropismY: -1,
    tropismK: 0.15,
  },
  {
    name: "上下文敏感藤蔓（上下文 + 随机）",
    axiom: "ABFBA",
    rules: {
      "A<F": "F[+F]F",
      "F>B": "F[-F]F",
      F: [
        { rhs: "FF", p: 0.7 },
        { rhs: "F", p: 0.3 },
      ],
      A: "A",
      B: "B",
    },
    angleDeg: 25,
    step: 3,
    depth: 7,
    initAngleDeg: -90,
    noiseType: "white",
    angleNoiseAmpDeg: 2,
    stepNoiseAmp: 0.04,
    noiseSeed: 7,
    tropismX: 0.1,
    tropismY: -1,
    tropismK: 0.1,
  },
  {
    name: "闪电（随机 + 噪声 + 向性）",
    axiom: "X",
    rules: {
      X: [
        { rhs: "F[+X]X", p: 0.2 },
        { rhs: "F[-X]X", p: 0.2 },
        { rhs: "FX", p: 0.6 },
      ],
      F: "FF",
    },
    angleDeg: 20,
    step: 4,
    depth: 9,
    initAngleDeg: -90,
    noiseType: "white",
    angleNoiseAmpDeg: 14,
    stepNoiseAmp: 0.1,
    noiseSeed: 9,
    tropismX: 0,
    tropismY: -1,
    tropismK: 0.05,
  },
  {
    name: "花序（参数宏 + 随机）",
    axiom: "P(1)",
    rules: {
      "P(n)": [
        { rhs: "F[+P($n)]F[-P($n)]B($n)", p: 0.7 },
        { rhs: "F[+P($n)]B($n)", p: 0.15 },
        { rhs: "F[-P($n)]B($n)", p: 0.15 },
      ],
      "B(n)": [
        { rhs: "F[+F]F[-F]F", p: 0.5 },
        { rhs: "F[+F][-F]", p: 0.5 },
      ],
      F: "FF",
    },
    angleDeg: 30,
    step: 3,
    depth: 5,
    initAngleDeg: -90,
    noiseType: "pink",
    angleNoiseAmpDeg: 2,
    stepNoiseAmp: 0.03,
    noiseSeed: 4,
    tropismX: 0,
    tropismY: -1,
    tropismK: 0.08,
  },
  {
    name: "珊瑚（上下文 + 随机 + 噪声）",
    axiom: "F",
    rules: {
      "F<F": "F[+F]F",
      "F>F": "F[-F]F",
      F: [
        { rhs: "FF", p: 0.5 },
        { rhs: "F[+F][-F]", p: 0.3 },
        { rhs: "F", p: 0.2 },
      ],
    },
    angleDeg: 18,
    step: 2.5,
    depth: 8,
    initAngleDeg: -90,
    noiseType: "pink",
    angleNoiseAmpDeg: 1.5,
    stepNoiseAmp: 0.05,
    noiseSeed: 11,
    tropismX: 0,
    tropismY: 1,
    tropismK: 0.05,
  },
];

const MAX_WAT_DISPLAY_CHARS = 6000;

function parseRuleKey(key: string): {
  left?: string;
  lhs: string;
  right?: string;
  params?: string[];
} {
  const trimmed = key.trim();
  const m = trimmed.match(
    /^(?:(?<left>[A-Za-z])<)?(?<core>[A-Za-z](?:\((?<params>[^)]*)\))?)(?:>(?<right>[A-Za-z]))?$/
  );
  if (!m || !m.groups) return { lhs: trimmed } as any;
  const core = m.groups.core!;
  const lhs = core.replace(/\(.*\)$/, "");
  const paramsStr = m.groups.params;
  const params = paramsStr
    ? paramsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const left = m.groups.left || undefined;
  const right = m.groups.right || undefined;
  return { left, lhs, right, params };
}

type Token =
  | { kind: "module"; name: string; args?: string[]; raw: string }
  | { kind: "control"; raw: string };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[A-Z]/.test(ch)) {
      // module with optional ( ... )
      if (s[i + 1] === "(") {
        let j = i + 2;
        let depth = 1;
        while (j < s.length && depth > 0) {
          if (s[j] === "(") depth++;
          else if (s[j] === ")") depth--;
          j++;
        }
        const raw = s.slice(i, j);
        const inside = raw.slice(2, -1);
        const args = inside
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        out.push({ kind: "module", name: ch, args, raw });
        i = j - 1;
      } else {
        out.push({ kind: "module", name: ch, raw: ch });
      }
    } else if (ch === "+" || ch === "-" || ch === "[" || ch === "]") {
      out.push({ kind: "control", raw: ch });
    } else {
      // ignore or pass-through unknowns
      out.push({ kind: "control", raw: ch });
    }
  }
  return out;
}

function nearestModuleName(tokens: Token[], idx: number, dir: -1 | 1): string | undefined {
  let i = idx + dir;
  while (i >= 0 && i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "module") return t.name;
    i += dir;
  }
  return undefined;
}

function compileRules(ruleInput: RuleInput): CompiledRule[] {
  const compiled: CompiledRule[] = [];
  for (const [k, v] of Object.entries(ruleInput || {})) {
    const { left, lhs, right, params } = parseRuleKey(k);
    let rhsOptions: RuleOption[];
    if (typeof v === "string") {
      rhsOptions = [{ rhs: v, p: 1 }];
    } else if (Array.isArray(v)) {
      const hasAnyP = v.some((o) => typeof o.p === "number");
      if (!hasAnyP) {
        const eq = 1 / Math.max(1, v.length);
        rhsOptions = v.map((o) => ({ rhs: o.rhs, p: eq }));
      } else {
        const sum = v.reduce((acc, o) => acc + (o.p ?? 0), 0);
        rhsOptions = v.map((o) => ({ rhs: o.rhs, p: (o.p ?? 0) / (sum || 1) }));
      }
    } else {
      continue;
    }
    compiled.push({ lhs, rhsOptions, left, right, params });
  }
  return compiled;
}

function substituteParams(rhs: string, paramNames?: string[], argValues?: string[]): string {
  if (!paramNames || !argValues) return rhs;
  let out = rhs;
  for (let i = 0; i < paramNames.length; i++) {
    const name = paramNames[i];
    const val = argValues[i] ?? "";
    out = out.replace(new RegExp(`\\$${name}\\b`, "g"), val);
  }
  return out;
}

function buildRuleIndex(compiledRules: CompiledRule[]): Map<string, CompiledRule[]> {
  const m = new Map<string, CompiledRule[]>();
  for (const cr of compiledRules) {
    const arr = m.get(cr.lhs) || [];
    arr.push(cr);
    m.set(cr.lhs, arr);
  }
  return m;
}

function expandLSystem(
  axiom: string,
  compiledRules: CompiledRule[],
  depth: number,
  hardLimit = 120_000,
  r?: () => number
): string {
  let current = axiom;
  const rngFn = r ?? (() => Math.random());
  const rulesByLhs = buildRuleIndex(compiledRules);
  const limit = hardLimit && hardLimit > 0 ? hardLimit : Number.POSITIVE_INFINITY;
  for (let iter = 0; iter < depth; iter++) {
    const tokens = tokenize(current);
    const out: string[] = [];
    let outLen = 0;
    // precompute nearest module names on both sides in O(n)
    const leftNames: (string | undefined)[] = new Array(tokens.length);
    let lastMod: string | undefined = undefined;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      leftNames[i] = lastMod;
      if (tk.kind === "module") lastMod = tk.name;
    }
    const rightNames: (string | undefined)[] = new Array(tokens.length);
    let nextMod: string | undefined = undefined;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tk = tokens[i];
      rightNames[i] = nextMod;
      if (tk.kind === "module") nextMod = tk.name;
    }

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const t = tokens[tIdx];
      if (t.kind !== "module") {
        out.push(t.raw);
        outLen += t.raw.length;
        if (outLen > limit) break;
        continue;
      }
      const leftName = leftNames[tIdx];
      const rightName = rightNames[tIdx];
      const list = rulesByLhs.get(t.name) || [];
      const candidates: CompiledRule[] = [];
      for (const cr of list) {
        if (cr.left && cr.left !== leftName) continue;
        if (cr.right && cr.right !== rightName) continue;
        candidates.push(cr);
      }
      if (candidates.length === 0) {
        out.push(t.raw);
        outLen += t.raw.length;
        if (outLen > limit) break;
        continue;
      }
      // flatten options with weights
      const flat: { rhs: string; w: number; cr: CompiledRule }[] = [];
      const baseW = 1 / candidates.length;
      for (const cr of candidates) {
        for (const opt of cr.rhsOptions) {
          flat.push({ rhs: opt.rhs, w: baseW * (opt.p ?? 1), cr });
        }
      }
      // renormalize
      let sumW = 0;
      for (const f of flat) sumW += f.w;
      let x = rngFn() * (sumW || 1);
      let chosen = flat[0];
      for (const f of flat) {
        if (x <= f.w) {
          chosen = f;
          break;
        }
        x -= f.w;
      }
      // simple param substitution: $paramName -> actual arg string
      const actual = substituteParams(
        chosen.rhs,
        chosen.cr.params,
        t.args
      );
      out.push(actual);
      outLen += actual.length;
      if (outLen > limit) break;
    }
    current = out.join("");
    if (current.length > limit) {
      current = current.slice(0, limit as number);
      break;
    }
  }
  return current;
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

// --- Heuristic estimator: expected growth without building strings ---
function indexForModuleName(ch: string): number {
  if (!ch || ch.length === 0) return -1;
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 65; // 'A'..'Z'
  return -1;
}

function countFromTokens(tokens: Token[]): {
  modVec: number[]; // length 26
  ctrlCount: number; // only '+', '-', '[', ']'
} {
  const modVec = new Array(26).fill(0);
  let ctrlCount = 0;
  for (const t of tokens) {
    if (t.kind === "module") {
      const idx = indexForModuleName(t.name);
      if (idx >= 0) modVec[idx] += 1;
    } else {
      const ch = t.raw;
      if (ch === "+" || ch === "-" || ch === "[" || ch === "]") ctrlCount += 1;
    }
  }
  return { modVec, ctrlCount };
}

function buildExpectedProduction(compiledRules: CompiledRule[]): {
  M: number[][]; // 26x26, expected modules produced per LHS
  ctrlPerSym: number[]; // expected controls produced per LHS
} {
  const M: number[][] = Array.from({ length: 26 }, () => new Array(26).fill(0));
  const ctrlPerSym: number[] = new Array(26).fill(0);

  const byLhs = new Map<string, CompiledRule[]>();
  for (const cr of compiledRules) {
    const arr = byLhs.get(cr.lhs) || [];
    arr.push(cr);
    byLhs.set(cr.lhs, arr);
  }

  for (const [lhs, list] of byLhs.entries()) {
    const lhsIdx = indexForModuleName(lhs);
    if (lhsIdx < 0) continue;
    const contextWeight = list.length > 0 ? 1 / list.length : 1;
    for (const cr of list) {
      for (const opt of cr.rhsOptions) {
        const w = contextWeight * (opt.p ?? 1);
        const { modVec, ctrlCount } = countFromTokens(tokenize(opt.rhs));
        for (let j = 0; j < 26; j++) M[lhsIdx][j] += w * modVec[j];
        ctrlPerSym[lhsIdx] += w * ctrlCount;
      }
    }
  }

  // Symbols without rules should carry over themselves unchanged
  for (let i = 0; i < 26; i++) {
    const row = M[i];
    let sumRow = 0;
    for (let j = 0; j < 26; j++) sumRow += row[j];
    if (sumRow === 0) row[i] = 1;
  }

  return { M, ctrlPerSym };
}

function estimateComplexityHeuristic(
  axiom: string,
  compiledRules: CompiledRule[],
  depth: number,
  forwardSet?: Set<string>
): { filteredLen: number; segments: number; fullLen: number } {
  const { M, ctrlPerSym } = buildExpectedProduction(compiledRules);
  // initial modules and controls from axiom
  const axTok = tokenize(axiom);
  const init = countFromTokens(axTok);
  let v = init.modVec.slice();
  let ctrlTotal = init.ctrlCount;

  // iterate
  for (let iter = 0; iter < Math.max(0, depth); iter++) {
    // controls produced this iteration
    let producedCtrl = 0;
    for (let i = 0; i < 26; i++) producedCtrl += v[i] * ctrlPerSym[i];
    ctrlTotal += producedCtrl;
    // next modules vector
    const nextV = new Array(26).fill(0);
    for (let j = 0; j < 26; j++) {
      let acc = 0;
      for (let i = 0; i < 26; i++) acc += v[i] * M[i][j];
      nextV[j] = acc;
    }
    v = nextV;
  }

  let segments = 0;
  if (forwardSet && forwardSet.size > 0) {
    for (const ch of forwardSet) {
      const idx = indexForModuleName(ch);
      if (idx >= 0) segments += v[idx];
    }
  } else {
    const idxF = indexForModuleName("F");
    const idxG = indexForModuleName("G");
    segments = (idxF >= 0 ? v[idxF] : 0) + (idxG >= 0 ? v[idxG] : 0);
  }
  let sumModules = 0;
  for (let j = 0; j < 26; j++) sumModules += v[j];
  const fullLen = sumModules + ctrlTotal;
  const filteredLen = segments + ctrlTotal; // only F,G,+,-,[,]
  return { filteredLen, segments, fullLen };
}

function toOrderLabel(n: number): string {
  if (!isFinite(n) || n <= 0) return "10^0";
  const k = Math.floor(Math.log10(n));
  return `10^${k}`;
}

function heatClass(n: number): string {
  if (!isFinite(n) || n <= 0) return "text-gray-600";
  if (n >= 1e7) return "text-red-600";
  if (n >= 1e4) return "text-amber-600";
  return "text-gray-600";
}

function buildWatForProgram(
  _commands: string,
  angleRad: number,
  initAngleRad: number
): string {
  // 固定体积解释器：
  // - 顶点缓冲：0 起始，每段 16 字节（4 x f32）
  // - 栈：STACK_BASE 起始，帧为 x,y,dx,dy (4 x f64 = 32 字节)
  // - 命令流：CMD_BASE 起始，8-bit 字符编码
  const STACK_BASE = 1_048_576; // 1 MiB
  const CMD_BASE = 3_145_728; // 3 MiB
  const NOISE_BASE = 4_194_304; // 4 MiB: angleNoise[n] (f32), then stepScale[n] (f32)

  const mod = `(module
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "cos" (func $cos (param f64) (result f64)))
  (memory (export "memory") 128)
  (global $g_vertices_base (mut i32) (i32.const 0))
  (global $g_segment_stride (mut i32) (i32.const 16))
  (global $g_cmd_base (mut i32) (i32.const ${CMD_BASE}))
  (global $g_noise_base (mut i32) (i32.const ${NOISE_BASE}))
  (global $g_stack_base (mut i32) (i32.const ${STACK_BASE}))
  (func (export "get_vertices_ptr") (result i32) (global.get $g_vertices_base))
  (func (export "get_segment_stride") (result i32) (global.get $g_segment_stride))
  (func (export "get_cmd_ptr") (result i32) (global.get $g_cmd_base))
  (func (export "get_noise_ptr") (result i32) (global.get $g_noise_base))
  (func (export "set_layout") (param $cmd i32) (param $noise i32) (param $stack i32)
    (global.set $g_cmd_base (local.get $cmd))
    (global.set $g_noise_base (local.get $noise))
    (global.set $g_stack_base (local.get $stack))
  )
  (func (export "run") (param $len f64) (param $n i32) (param $tx f64) (param $ty f64) (param $k f64) (result i32)
    (local $x f64) (local $y f64) (local $dx f64) (local $dy f64)
    (local $nx f64) (local $ny f64)
    (local $ptr i32) (local $count i32)
    (local $sp i32) (local $addr i32)
    (local $rot f64) (local $crot f64) (local $srot f64)
    (local $tdx f64) (local $tdy f64)
    (local $ip i32) (local $cmd i32)
    (local $noiseBase2 i32) (local $ang f64) (local $scl f64) (local $ls f64)
    (local $c f64) (local $s f64)
    (local $inv f64) (local $vx f64) (local $vy f64)

    (local.set $x (f64.const 0))
    (local.set $y (f64.const 0))
    (local.set $rot (f64.const ${angleRad}))
    (local.set $crot (call $cos (local.get $rot)))
    (local.set $srot (call $sin (local.get $rot)))
    (local.set $dx (call $cos (f64.const ${initAngleRad})))
    (local.set $dy (call $sin (f64.const ${initAngleRad})))

    (local.set $ptr (i32.const 0))
    (local.set $count (i32.const 0))
    (local.set $sp (i32.const 0))
    (local.set $ip (i32.const 0))
    (local.set $noiseBase2 (i32.add (global.get $g_noise_base) (i32.mul (local.get $n) (i32.const 4))))

    (block
      (loop
        (br_if 1 (i32.ge_u (local.get $ip) (local.get $n)))
        (local.set $cmd (i32.load8_u (i32.add (global.get $g_cmd_base) (local.get $ip))))
        ;; load per-instruction noise: angle (rad) and step scale
        (local.set $ang (f64.promote_f32 (f32.load (i32.add (global.get $g_noise_base) (i32.mul (local.get $ip) (i32.const 4))))))
        (local.set $scl (f64.promote_f32 (f32.load (i32.add (local.get $noiseBase2) (i32.mul (local.get $ip) (i32.const 4))))))

        (block
          ;; F (70)
          (if (i32.eq (local.get $cmd) (i32.const 70))
            (then
              (f32.store (local.get $ptr) (f32.demote_f64 (local.get $x)))
              (f32.store (i32.add (local.get $ptr) (i32.const 4)) (f32.demote_f64 (local.get $y)))
              (local.set $ls (f64.mul (local.get $len) (local.get $scl)))
              ;; tropism: d = normalize(d + k * T)
              (local.set $vx (f64.add (local.get $dx) (f64.mul (local.get $k) (local.get $tx))))
              (local.set $vy (f64.add (local.get $dy) (f64.mul (local.get $k) (local.get $ty))))
              (local.set $inv (f64.sqrt (f64.add (f64.mul (local.get $vx) (local.get $vx)) (f64.mul (local.get $vy) (local.get $vy)))))
              (local.set $inv (f64.div (f64.const 1) (select (f64.const 1) (local.get $inv) (f64.le (local.get $inv) (f64.const 1e-12)))))
              (local.set $dx (f64.mul (local.get $vx) (local.get $inv)))
              (local.set $dy (f64.mul (local.get $vy) (local.get $inv)))
              (local.set $nx (f64.add (local.get $x) (f64.mul (local.get $dx) (local.get $ls))))
              (local.set $ny (f64.add (local.get $y) (f64.mul (local.get $dy) (local.get $ls))))
              (f32.store (i32.add (local.get $ptr) (i32.const 8)) (f32.demote_f64 (local.get $nx)))
              (f32.store (i32.add (local.get $ptr) (i32.const 12)) (f32.demote_f64 (local.get $ny)))
              (local.set $ptr (i32.add (local.get $ptr) (i32.const 16)))
              (local.set $count (i32.add (local.get $count) (i32.const 1)))
              (local.set $x (local.get $nx))
              (local.set $y (local.get $ny))
              (br 0)
            )
          )
          ;; G (71)
          (if (i32.eq (local.get $cmd) (i32.const 71))
            (then
              (f32.store (local.get $ptr) (f32.demote_f64 (local.get $x)))
              (f32.store (i32.add (local.get $ptr) (i32.const 4)) (f32.demote_f64 (local.get $y)))
              (local.set $ls (f64.mul (local.get $len) (local.get $scl)))
              ;; tropism: d = normalize(d + k * T)
              (local.set $vx (f64.add (local.get $dx) (f64.mul (local.get $k) (local.get $tx))))
              (local.set $vy (f64.add (local.get $dy) (f64.mul (local.get $k) (local.get $ty))))
              (local.set $inv (f64.sqrt (f64.add (f64.mul (local.get $vx) (local.get $vx)) (f64.mul (local.get $vy) (local.get $vy)))))
              (local.set $inv (f64.div (f64.const 1) (select (f64.const 1) (local.get $inv) (f64.le (local.get $inv) (f64.const 1e-12)))))
              (local.set $dx (f64.mul (local.get $vx) (local.get $inv)))
              (local.set $dy (f64.mul (local.get $vy) (local.get $inv)))
              (local.set $nx (f64.add (local.get $x) (f64.mul (local.get $dx) (local.get $ls))))
              (local.set $ny (f64.add (local.get $y) (f64.mul (local.get $dy) (local.get $ls))))
              (f32.store (i32.add (local.get $ptr) (i32.const 8)) (f32.demote_f64 (local.get $nx)))
              (f32.store (i32.add (local.get $ptr) (i32.const 12)) (f32.demote_f64 (local.get $ny)))
              (local.set $ptr (i32.add (local.get $ptr) (i32.const 16)))
              (local.set $count (i32.add (local.get $count) (i32.const 1)))
              (local.set $x (local.get $nx))
              (local.set $y (local.get $ny))
              (br 0)
            )
          )
          ;; + (43)
          (if (i32.eq (local.get $cmd) (i32.const 43))
            (then
              (local.set $c (call $cos (f64.add (local.get $rot) (local.get $ang))))
              (local.set $s (call $sin (f64.add (local.get $rot) (local.get $ang))))
              (local.set $tdx (f64.sub (f64.mul (local.get $dx) (local.get $c)) (f64.mul (local.get $dy) (local.get $s))))
              (local.set $tdy (f64.add (f64.mul (local.get $dx) (local.get $s)) (f64.mul (local.get $dy) (local.get $c))))
              (local.set $dx (local.get $tdx))
              (local.set $dy (local.get $tdy))
              (br 0)
            )
          )
          ;; - (45)
          (if (i32.eq (local.get $cmd) (i32.const 45))
            (then
              ;; explicit right turn by angle (rot + ang)
              (local.set $c (call $cos (f64.add (local.get $rot) (local.get $ang))))
              (local.set $s (call $sin (f64.add (local.get $rot) (local.get $ang))))
              ;; new = R(-theta) * old
              ;; x' = x*c + y*s
              ;; y' = -x*s + y*c
              (local.set $tdx (f64.add (f64.mul (local.get $dx) (local.get $c)) (f64.mul (local.get $dy) (local.get $s))))
              (local.set $tdy (f64.sub (f64.mul (local.get $dy) (local.get $c)) (f64.mul (local.get $dx) (local.get $s))))
              (local.set $dx (local.get $tdx))
              (local.set $dy (local.get $tdy))
              (br 0)
            )
          )
          ;; [ (91)
          (if (i32.eq (local.get $cmd) (i32.const 91))
            (then
              (local.set $addr (i32.add (global.get $g_stack_base) (i32.mul (local.get $sp) (i32.const 32))))
              (f64.store (local.get $addr) (local.get $x))
              (f64.store (i32.add (local.get $addr) (i32.const 8)) (local.get $y))
              (f64.store (i32.add (local.get $addr) (i32.const 16)) (local.get $dx))
              (f64.store (i32.add (local.get $addr) (i32.const 24)) (local.get $dy))
              (local.set $sp (i32.add (local.get $sp) (i32.const 1)))
              (br 0)
            )
          )
          ;; ] (93)
          (if (i32.eq (local.get $cmd) (i32.const 93))
            (then
              (if (i32.gt_s (local.get $sp) (i32.const 0))
                (then
                  (local.set $sp (i32.sub (local.get $sp) (i32.const 1)))
                  (local.set $addr (i32.add (global.get $g_stack_base) (i32.mul (local.get $sp) (i32.const 32))))
                  (local.set $x (f64.load (local.get $addr)))
                  (local.set $y (f64.load (i32.add (local.get $addr) (i32.const 8))))
                  (local.set $dx (f64.load (i32.add (local.get $addr) (i32.const 16))))
                  (local.set $dy (f64.load (i32.add (local.get $addr) (i32.const 24))))
                )
              )
              (br 0)
            )
          )
          ;; default: noop
        )

        (local.set $ip (i32.add (local.get $ip) (i32.const 1)))
        (br 0)
      )
    )

    (local.get $count)
  )
)`;
  return mod;
}

export default function LSystemWasmAot() {
  const [wabtInstance, setWabtInstance] = createSignal<WabtModule | null>(null);
  const [error, setError] = createSignal("");
  const [watCode, setWatCode] = createSignal("");
  const [wasmInstance, setWasmInstance] =
    createSignal<WebAssembly.Instance | null>(null);
  const [vertexCount, setVertexCount] = createSignal(0);
  const [presetIdx, setPresetIdx] = createSignal(0);

  const [axiom, setAxiom] = createSignal(PRESETS[0].axiom);
  const [rulesText, setRulesText] = createSignal(
    JSON.stringify(PRESETS[0].rules)
  );
  const [angleDeg, setAngleDeg] = createSignal(PRESETS[0].angleDeg);
  const [depth, setDepth] = createSignal(PRESETS[0].depth);
  const [step, setStep] = createSignal(PRESETS[0].step);
  const [initAngleDeg, setInitAngleDeg] = createSignal(
    PRESETS[0].initAngleDeg ?? 0
  );
  const [copyButtonText, setCopyButtonText] = createSignal("复制 WAT");
  const [expandMs, setExpandMs] = createSignal<number | null>(null);
  const [compileMs, setCompileMs] = createSignal<number | null>(null);
  const [execMs, setExecMs] = createSignal<number | null>(null);
  const [drawMs, setDrawMs] = createSignal<number | null>(null);
  const [estSegments, setEstSegments] = createSignal<number | null>(null);
  const [estFilteredLen, setEstFilteredLen] = createSignal<number | null>(null);
  const [estFullLen, setEstFullLen] = createSignal<number | null>(null);
  const [strokeColor, setStrokeColor] = createSignal<string>("#111111");
  const [strokeAlpha, setStrokeAlpha] = createSignal<number>(1);
  const [renderer, setRenderer] = createSignal<"2d" | "webgl2">("webgl2");
  const [noiseType, setNoiseType] = createSignal<"none" | "white" | "pink">(
    "none"
  );
  const [angleNoiseAmpDeg, setAngleNoiseAmpDeg] = createSignal(0);
  const [stepNoiseAmp, setStepNoiseAmp] = createSignal(0);
  const [noiseSeed, setNoiseSeed] = createSignal(1);
  // tropism
  const [tropismX, setTropismX] = createSignal(0);
  const [tropismY, setTropismY] = createSignal(-1);
  const [tropismK, setTropismK] = createSignal(0);

  let canvasRef: HTMLCanvasElement | undefined;
  let canvas2dRef: HTMLCanvasElement | undefined;
  let canvasGlRef: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let gl: WebGL2RenderingContext | null = null;
  let glProgram: WebGLProgram | null = null;
  let glVao: WebGLVertexArrayObject | null = null;
  let glVbo: WebGLBuffer | null = null;
  let glLocScale: WebGLUniformLocation | null = null;
  let glLocOffset: WebGLUniformLocation | null = null;
  let glLocViewport: WebGLUniformLocation | null = null;
  let glLocColor: WebGLUniformLocation | null = null;
  // MSAA resources
  let glMsaaFbo: WebGLFramebuffer | null = null;
  let glMsaaColorRb: WebGLRenderbuffer | null = null;
  let glMsaaW = 0, glMsaaH = 0, glMsaaSamples = 0;

  function setupCanvasDPR() {
    if (!canvasRef) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvasRef.getBoundingClientRect();
    const cssW = Math.max(
      1,
      Math.round(rect.width || canvasRef.clientWidth || 900)
    );
    const cssH = Math.max(
      1,
      Math.round(rect.height || canvasRef.clientHeight || 600)
    );
    canvasRef.style.width = cssW + "px";
    canvasRef.style.height = cssH + "px";
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    if (canvasRef.width !== pixelW) canvasRef.width = pixelW;
    if (canvasRef.height !== pixelH) canvasRef.height = pixelH;
  }

  function hexToRgba(hex: string, alpha: number): string {
    let h = hex.trim();
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    const a = Math.min(1, Math.max(0, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  onMount(async () => {
    try {
      const instance = await wabt();
      setWabtInstance(instance);
    } catch (e) {
      setError("WABT 加载失败");
      console.error(e);
    }
  });

  function rng(seed: number) {
    // xorshift32
    let s = seed | 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 0xffffffff;
    };
  }

  function genWhite(n: number, r: () => number) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
    return out;
  }

  function genPink(n: number, r: () => number) {
    // Voss-McCartney：叠加多个不同更新频率的白噪声
    const numRows = 8;
    const rows = new Float32Array(numRows);
    const counters = new Uint32Array(numRows);
    for (let i = 0; i < numRows; i++) {
      rows[i] = r() * 2 - 1;
      counters[i] = 0;
    }
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let which = 0;
      let t = i + 1;
      while ((t & 1) === 0) {
        which++;
        t >>= 1;
      }
      if (which < numRows) rows[which] = r() * 2 - 1;
      let sum = 0;
      for (let k = 0; k < numRows; k++) sum += rows[k];
      out[i] = sum / numRows;
    }
    return out;
  }

  function disposeGL() {
    if (gl) {
      if (glVbo) gl.deleteBuffer(glVbo);
      if (glVao) gl.deleteVertexArray(glVao);
      if (glProgram) gl.deleteProgram(glProgram);
      if (glMsaaColorRb) gl.deleteRenderbuffer(glMsaaColorRb);
      if (glMsaaFbo) gl.deleteFramebuffer(glMsaaFbo);
    }
    glVbo = null;
    glVao = null;
    glProgram = null;
    gl = null;
    glMsaaColorRb = null;
    glMsaaFbo = null;
    glMsaaW = glMsaaH = glMsaaSamples = 0;
  }

  function initGLIfNeeded() {
    if (!canvasRef) return false;
    if (!gl) {
      gl = canvasRef.getContext("webgl2", {
        antialias: false,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
        alpha: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) {
        setError("WebGL2 不可用");
        return false;
      }
    }
    if (!glProgram) {
      const vsSrc = `#version 300 es\nlayout(location=0) in vec4 a_segment;\nuniform float uScale;\nuniform vec2 uOffset;\nuniform vec2 uViewport;\nuniform float uFlipX;\nvoid main(){\n  int v = gl_VertexID % 2;\n  vec2 p = (v == 0) ? a_segment.xy : a_segment.zw;\n  float x = uFlipX * ( ( (p.x * uScale + uOffset.x) / uViewport.x ) * 2.0 - 1.0 );\n  float y = 1.0 - ( (p.y * uScale + uOffset.y) / uViewport.y ) * 2.0;\n  gl_Position = vec4(x, y, 0.0, 1.0);\n}`;
      const fsSrc = `#version 300 es\nprecision mediump float;\nuniform vec4 uColor;\nout vec4 fragColor;\nvoid main(){ fragColor = uColor; }`;
      const vs = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vs, vsSrc);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        setError("WebGL2 顶点着色器编译失败: " + gl.getShaderInfoLog(vs));
        return false;
      }
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fs, fsSrc);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        setError("WebGL2 片元着色器编译失败: " + gl.getShaderInfoLog(fs));
        return false;
      }
      glProgram = gl.createProgram()!;
      gl.attachShader(glProgram, vs);
      gl.attachShader(glProgram, fs);
      gl.linkProgram(glProgram);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        setError("WebGL2 程序链接失败: " + gl.getProgramInfoLog(glProgram));
        return false;
      }
      gl.useProgram(glProgram);
      glLocScale = gl.getUniformLocation(glProgram, "uScale");
      glLocOffset = gl.getUniformLocation(glProgram, "uOffset");
      glLocViewport = gl.getUniformLocation(glProgram, "uViewport");
      glLocColor = gl.getUniformLocation(glProgram, "uColor");
      var glLocFlipXTmp = gl.getUniformLocation(glProgram, "uFlipX");
      // store on any to avoid TS narrowing here
      (gl as any)._uFlipX = glLocFlipXTmp;
      glVao = gl.createVertexArray();
      gl.bindVertexArray(glVao);
      glVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      // 每个实例一条线段（vec4），两个顶点由 gl_VertexID 选择端点
      gl.vertexAttribDivisor(0, 1);
      gl.bindVertexArray(null);
    }
    return true;
  }

  function ensureGlMsaa(width: number, height: number): boolean {
    if (!gl) return false;
    const maxSamples = (gl.getParameter(gl.MAX_SAMPLES) as number) || 0;
    const desired = Math.max(1, Math.min(4, maxSamples));
    if (glMsaaFbo && glMsaaColorRb && glMsaaW === width && glMsaaH === height && glMsaaSamples === desired) {
      return true;
    }
    if (glMsaaColorRb) gl.deleteRenderbuffer(glMsaaColorRb);
    if (glMsaaFbo) gl.deleteFramebuffer(glMsaaFbo);
    glMsaaFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, glMsaaFbo);
    glMsaaColorRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, glMsaaColorRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, desired, gl.RGBA8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, glMsaaColorRb);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      setError("MSAA 帧缓冲创建失败");
      return false;
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    glMsaaW = width;
    glMsaaH = height;
    glMsaaSamples = desired;
    return true;
  }

  createEffect(() => {
    // 绑定当前 canvas 引用
    canvasRef = renderer() === "2d" ? canvas2dRef : canvasGlRef;
    if (!canvasRef) return;
    // 切换渲染器时重建上下文
    if (renderer() === "2d") {
      disposeGL();
      ctx = canvasRef.getContext("2d");
    } else {
      ctx = null;
      initGLIfNeeded();
    }
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  const parsedRules = createMemo<RuleInput>(() => {
    try {
      return JSON.parse(rulesText()) as RuleInput;
    } catch (e) {
      setError("规则 JSON 解析失败");
      return {};
    }
  });

  // 指令展开改为在“生成并运行”时触发，避免每次参数变更都做重计算

  function buildAndInstantiate() {
    setError("");
    setWatCode("");
    setWasmInstance(null);
    setVertexCount(0);
    setExpandMs(null);
    setCompileMs(null);
    setExecMs(null);
    setDrawMs(null);

    const instance = wabtInstance();
    if (!instance) {
      setError("WABT 未就绪");
      return;
    }
    try {
      // 延迟到点击时再展开 L-system，避免参数修改触发重计算
      const compiled = compileRules(parsedRules());
      const r = rng(noiseSeed());
      const tExpandStart = performance.now();
      const cmds = expandLSystem(axiom(), compiled, depth(), 0, r);
      setExpandMs(performance.now() - tExpandStart);
      const wat = buildWatForProgram(
        cmds,
        degToRad(angleDeg()),
        degToRad(initAngleDeg())
      );
      setWatCode(wat);
      const tCompileStart = performance.now();
      const wasmModule = instance.parseWat("lsys.wat", wat);
      const { buffer } = wasmModule.toBinary({
        log: true,
        write_debug_names: true,
      });

      const importObject = {
        env: { sin: Math.sin, cos: Math.cos },
      } as WebAssembly.Imports;
      (
        WebAssembly.instantiate(
          buffer,
          importObject
        ) as unknown as Promise<WebAssembly.WebAssemblyInstantiatedSource>
      )
        .then(({ instance: inst }) => {
          setCompileMs(performance.now() - tCompileStart);
          setWasmInstance(inst);

          const memory = inst.exports.memory as WebAssembly.Memory;
          const getCmdPtr = inst.exports.get_cmd_ptr as () => number;
          const getNoisePtr = inst.exports.get_noise_ptr as () => number;
          const getStride = inst.exports.get_segment_stride as () => number;
          const getVerticesPtr = inst.exports.get_vertices_ptr as () => number;
          const setLayout = inst.exports.set_layout as (cmd: number, noise: number, stack: number) => void;

          // 预扫描：过滤有效指令 + 统计线段数 + 最大栈深度
          const allowed = new Set(["F", "G", "+", "-", "[", "]"]);
          const filtered: number[] = [];
          let segmentCount = 0;
          let depthNow = 0;
          let maxDepth = 0;
          for (let i = 0; i < cmds.length; i++) {
            const ch = cmds.charAt(i);
            if (!allowed.has(ch)) continue;
            filtered.push(ch.charCodeAt(0));
            if (ch === "F" || ch === "G") segmentCount++;
            else if (ch === "[") {
              depthNow++;
              if (depthNow > maxDepth) maxDepth = depthNow;
            } else if (ch === "]") {
              depthNow = Math.max(0, depthNow - 1);
            }
          }

          // 估算所需内存并增长
          let cmdPtr = getCmdPtr();
          let noisePtr = getNoisePtr();
          const noise2Ptr = noisePtr + filtered.length * 4;
          const stride = getStride(); // bytes per segment
          const verticesPtr = getVerticesPtr(); // usually 0
          let stackBase = 1_048_576; // 与 WAT 初始一致，允许后续动态迁移

          let cmdEnd = cmdPtr + filtered.length;
          let noiseEnd = noise2Ptr + filtered.length * 4;
          let verticesEnd = verticesPtr + segmentCount * stride;
          let stackEnd = stackBase + maxDepth * 32; // x,y,dx,dy -> 4 * f64 = 32B
          let requiredBytes = Math.max(cmdEnd, noiseEnd, verticesEnd, stackEnd);
          const pageSize = 65536;
          const currentPages = Math.ceil(memory.buffer.byteLength / pageSize);
          const neededPages = Math.ceil(requiredBytes / pageSize);
          if (neededPages > currentPages) {
            try { memory.grow(neededPages - currentPages); } catch {}
          }

          // 重新计算基址，确保各区间互不重叠并满足对齐（cmd:1B 对齐，noise:4B 对齐，stack:8B 对齐）
          // 更稳妥的线性布局：顶点 -> 指令 -> 噪声 -> 栈
          // 若 vertices 区过大，向后顺延其余区，避免重叠与覆盖
          const base0 = Math.max(verticesPtr, 0);
          const verticesEndAligned = Math.ceil((base0 + segmentCount * stride) / 8) * 8; // 8B 对齐
          cmdPtr = verticesEndAligned;
          const afterCmd = cmdPtr + filtered.length; // 字节
          noisePtr = Math.ceil(afterCmd / 4) * 4; // 4 字节对齐
          const afterNoise = noisePtr + filtered.length * 8; // angle + scale 共 8 字节/指令
          const stackBaseCandidate = Math.ceil(afterNoise / 8) * 8; // 8 字节对齐（f64）
          stackBase = Math.max(stackBaseCandidate, 1_048_576);
          setLayout(cmdPtr, noisePtr, stackBase);
          // 重新计算末尾并检查，若仍不足再增长一轮
          cmdEnd = cmdPtr + filtered.length;
          const noise2Ptr2 = noisePtr + filtered.length * 4;
          noiseEnd = noise2Ptr2 + filtered.length * 4;
          stackEnd = stackBase + maxDepth * 32;
          const required2 = Math.max(cmdEnd, noiseEnd, verticesEnd, stackEnd);
          const pages2 = Math.ceil(required2 / pageSize);
          const cur2 = Math.ceil(memory.buffer.byteLength / pageSize);
          if (pages2 > cur2) {
            try { memory.grow(pages2 - cur2); } catch {}
          }

          // 如果 segmentCount 超大，提前提示，避免运行期长时间等待
          if (segmentCount > 5_000_000) {
            setError(`线段数过大（${segmentCount}），可能导致长时间运行或内存不足`);
          }

          // 创建视图并写入数据（注意：grow 后需重新取 buffer）
          new Uint8Array(memory.buffer, cmdPtr, filtered.length).set(filtered);

          // 写入噪声：angleNoise[n] (rad) and stepScale[n]
          const r = rng(noiseSeed());
          let series: Float32Array;
          if (noiseType() === "white") series = genWhite(filtered.length, r);
          else if (noiseType() === "pink") series = genPink(filtered.length, r);
          else series = new Float32Array(filtered.length);
          const angleAmpRad = degToRad(angleNoiseAmpDeg());
          const angleNoise = new Float32Array(filtered.length);
          const stepScale = new Float32Array(filtered.length);
          for (let i = 0; i < filtered.length; i++) {
            angleNoise[i] = series[i] * angleAmpRad;
            stepScale[i] = 1 + series[i] * stepNoiseAmp();
          }
          new Float32Array(memory.buffer, noisePtr, filtered.length).set(
            angleNoise
          );
          new Float32Array(memory.buffer, noise2Ptr2, filtered.length).set(
            stepScale
          );

          const run = inst.exports.run as (
            len: number,
            n: number,
            tx: number,
            ty: number,
            k: number
          ) => number;
          const tExecStart = performance.now();
          const count = run(
            step(),
            filtered.length,
            tropismX(),
            tropismY(),
            tropismK()
          );
          setExecMs(performance.now() - tExecStart);
          setVertexCount(count | 0);
        })
        .catch((e) => {
          setError(e?.message ?? "WASM 实例化失败");
          console.error(e);
        });
    } catch (e: any) {
      setError(e?.message ?? "构建失败");
      console.error(e);
    }
  }

  function draw() {
    if (!canvasRef) return;
    const inst = wasmInstance();
    if (!inst) return;
    setupCanvasDPR();
    const memory = inst.exports.memory as WebAssembly.Memory;
    const stride = (inst.exports.get_segment_stride as () => number)();
    const ptr = (inst.exports.get_vertices_ptr as () => number)();
    const count = vertexCount();
    if (count <= 0) {
      setDrawMs(0);
      return;
    }
    const t0 = performance.now();
    const f32 = new Float32Array(memory.buffer, ptr, count * (stride / 4));

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvasRef.getBoundingClientRect();
    const W = Math.max(
      1,
      Math.round(rect.width || canvasRef.clientWidth || canvasRef.width / dpr)
    );
    const H = Math.max(
      1,
      Math.round(
        rect.height || canvasRef.clientHeight || canvasRef.height / dpr
      )
    );
    // 2D 模式的清屏与坐标系设置在分支内进行

    // compute bounds (ignore non-finite values)
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      finiteCount = 0;
    for (let i = 0; i < count; i++) {
      const base = i * 4;
      const x0 = f32[base + 0];
      const y0 = f32[base + 1];
      const x1 = f32[base + 2];
      const y1 = f32[base + 3];
      if (Number.isFinite(x0) && Number.isFinite(y0)) {
        if (x0 < minX) minX = x0;
        if (y0 < minY) minY = y0;
        if (x0 > maxX) maxX = x0;
        if (y0 > maxY) maxY = y0;
        finiteCount++;
      }
      if (Number.isFinite(x1) && Number.isFinite(y1)) {
        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x1 > maxX) maxX = x1;
        if (y1 > maxY) maxY = y1;
        finiteCount++;
      }
    }
    if (finiteCount === 0 || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      setError("绘制数据无效：出现 NaN/Infinity 坐标");
      setDrawMs(0);
      return;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const padding = 10;
    const scale = Math.min(
      (W - padding * 2) / width,
      (H - padding * 2) / height
    );
    const offsetX = (W - width * scale) / 2 - minX * scale;
    const offsetY = (H - height * scale) / 2 - minY * scale;

    if (renderer() === "2d") {
      if (!ctx) return;
      // clear with identity to ensure full clear regardless of current transform
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
      ctx.restore();
      // set DPR transform so that 1 unit = 1 css px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.save();
      ctx.lineWidth = Math.max(1 / dpr, 0.5 / dpr);
      ctx.strokeStyle = hexToRgba(strokeColor(), strokeAlpha());
      // 分块绘制，避免一次 Path 过大导致浏览器丢弃
      const CHUNK = 200000; // 每批线段数
      for (let start = 0; start < count; start += CHUNK) {
        const end = Math.min(count, start + CHUNK);
        ctx.beginPath();
        for (let i = start; i < end; i++) {
          const base = i * 4;
          const X0 = f32[base + 0];
          const Y0 = f32[base + 1];
          const X1 = f32[base + 2];
          const Y1 = f32[base + 3];
          if (!Number.isFinite(X0) || !Number.isFinite(Y0) || !Number.isFinite(X1) || !Number.isFinite(Y1)) continue;
          const x0 = X0 * scale + offsetX;
          const y0 = (Y0 * scale + offsetY);
          const x1 = X1 * scale + offsetX;
          const y1 = (Y1 * scale + offsetY);
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else {
      if (!initGLIfNeeded() || !gl || !glProgram || !glVao || !glVbo) {
        setError("WebGL2 初始化失败");
        setDrawMs(performance.now() - t0);
        return;
      }
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      // 颜色：srcAlpha,1-srcAlpha；Alpha：1,1-srcAlpha，避免整幅图统一变透明，保留像素级叠加
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // MSAA 离屏绘制
      if (!ensureGlMsaa(canvasRef.width, canvasRef.height)) {
        setError("MSAA 初始化失败");
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, glMsaaFbo);
      gl.viewport(0, 0, canvasRef.width, canvasRef.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(glProgram);
      // 颜色
      const rgba = hexToRgba(strokeColor(), strokeAlpha());
      // parse rgba string
      const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
      let cr = 0, cg = 0, cb = 0, ca = 1;
      if (m) {
        cr = parseInt(m[1]) / 255;
        cg = parseInt(m[2]) / 255;
        cb = parseInt(m[3]) / 255;
        ca = parseFloat(m[4]);
      }
      gl.uniform4f(glLocColor, cr, cg, cb, ca);
      gl.uniform1f(glLocScale, scale);
      gl.uniform2f(glLocOffset, offsetX, offsetY);
      gl.uniform2f(glLocViewport, W, H);
      gl.uniform1f((gl as any)._uFlipX, -1.0); // 与 Canvas2D 的水平镜像保持一致
      gl.bindVertexArray(glVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, glVbo);
      // 将 WASM 内存中的段数据上传为 per-instance a_segment
      // 注意：每段占 4 个 float，数组长度 = count * 4
      gl.bufferData(gl.ARRAY_BUFFER, f32, gl.STREAM_DRAW);
      // 每实例一条线段；WebGL2 不支持 baseInstance，这里直接绘制全部实例
      gl.drawArraysInstanced(gl.LINES, 0, 2, count);
      gl.bindVertexArray(null);
      // 解析 MSAA 到默认帧缓冲
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, glMsaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0, 0, canvasRef.width, canvasRef.height,
        0, 0, canvasRef.width, canvasRef.height,
        gl.COLOR_BUFFER_BIT, gl.NEAREST
      );
    }
    setDrawMs(performance.now() - t0);
  }

  async function handleCopyWat() {
    if (!watCode()) return;
    try {
      await navigator.clipboard.writeText(watCode());
      setCopyButtonText("已复制!");
      setTimeout(() => setCopyButtonText("复制 WAT"), 2000);
    } catch (e) {
      setError("无法复制 WAT 到剪贴板");
      console.error(e);
    }
  }

  function estimateNow() {
    try {
      const compiled = compileRules(parsedRules());
      // 自动推断前进符集合：凡是在规则 RHS 内出现，且模块名未在控制符集合中者
      const controlSet = new Set(["+", "-", "[", "]"]);
      const forward = new Set<string>();
      // 如果用户未使用 F/G，也可自动识别 A..Z 里实际会出现的“可能产生线段”的模块名
      for (const cr of compiled) {
        for (const opt of cr.rhsOptions) {
          const toks = tokenize(opt.rhs);
          for (const t of toks) {
            if (t.kind === "module" && !controlSet.has(t.name)) {
              forward.add(t.name);
            }
          }
        }
      }
      const { filteredLen, segments, fullLen } = estimateComplexityHeuristic(
        axiom(),
        compiled,
        depth(),
        forward
      );
      setEstFilteredLen(Math.round(filteredLen));
      setEstSegments(Math.round(segments));
      setEstFullLen(Math.round(fullLen));
    } catch (e) {
      setEstFilteredLen(null);
      setEstSegments(null);
      setEstFullLen(null);
    }
  }

  // 自动估算：当 axiom/rules/depth 变更时重算
  createEffect(() => {
    // 仅使用轻量级启发式，不会展开具体字符串
    axiom();
    rulesText();
    depth();
    estimateNow();
  });

  createEffect(() => {
    // redraw when vertices updated
    vertexCount();
    draw();
  });

  function applyPreset(i: number) {
    const p = PRESETS[i];
    setPresetIdx(i);
    setAxiom(p.axiom);
    setRulesText(JSON.stringify(p.rules));
    setAngleDeg(p.angleDeg);
    setDepth(p.depth);
    setStep(p.step);
    setInitAngleDeg(p.initAngleDeg ?? 0);
    // optional runtime params
    setNoiseType((p.noiseType ?? "none") as any);
    setAngleNoiseAmpDeg(p.angleNoiseAmpDeg ?? 0);
    setStepNoiseAmp(p.stepNoiseAmp ?? 0);
    setNoiseSeed(p.noiseSeed ?? 1);
    setTropismX(p.tropismX ?? 0);
    setTropismY(p.tropismY ?? -1);
    setTropismK(p.tropismK ?? 0);
  }

  onCleanup(() => {
    // nothing to cleanup now
  });

  return (
    <div class="font-sans max-w-5xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">L-system 演练场（WASM AOT）</h1>
      <p class="text-gray-600 mb-4">
        在 JS 中展开 L-system，将指令序列 AOT 生成 WAT，并用 wabt 编译为
        WASM，WASM 计算线段并写入线性内存，前端读取并绘制。
      </p>

      <div class="flex flex-wrap gap-3 items-end mb-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1">预设</span>
          <select
            class="border rounded px-2 py-1"
            value={presetIdx()}
            onChange={(e) => applyPreset(parseInt(e.currentTarget.value))}
          >
            {PRESETS.map((p, i) => (
              <option value={i}>{p.name}</option>
            ))}
          </select>
        </label>
        <label class="flex-1 min-w-[200px] flex flex-col text-sm">
          <span class="mb-1">Axiom</span>
          <input
            class="border rounded px-2 py-1"
            value={axiom()}
            onInput={(e) => setAxiom(e.currentTarget.value)}
          />
        </label>
        <label class="flex-1 min-w-[200px] flex flex-col text-sm">
          <span class="mb-1">Rules (JSON)</span>
          <input
            class="border rounded px-2 py-1"
            value={rulesText()}
            onInput={(e) => setRulesText(e.currentTarget.value)}
          />
        </label>
      </div>

      <div class="flex flex-wrap gap-3 items-end mb-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1">迭代次数</span>
          <input
            type="number"
            min="0"
            class="border rounded px-2 py-1 w-24"
            value={depth()}
            onInput={(e) => setDepth(parseInt(e.currentTarget.value || "0"))}
          />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">转角 (°)</span>
          <input
            type="number"
            class="border rounded px-2 py-1 w-24"
            value={angleDeg()}
            onInput={(e) =>
              setAngleDeg(parseFloat(e.currentTarget.value || "0"))
            }
          />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">初始角度 (°)</span>
          <input
            type="number"
            class="border rounded px-2 py-1 w-28"
            value={initAngleDeg()}
            onInput={(e) =>
              setInitAngleDeg(parseFloat(e.currentTarget.value || "0"))
            }
          />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">步长</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            class="border rounded px-2 py-1 w-24"
            value={step()}
            onInput={(e) => setStep(parseFloat(e.currentTarget.value || "1"))}
          />
        </label>
        <label class="flex flex-col text-sm items-start">
          <span class="mb-1">颜色</span>
          <input
            type="color"
            class="border rounded w-10 h-10 p-0"
            value={strokeColor()}
            onInput={(e) => setStrokeColor(e.currentTarget.value)}
          />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">透明度</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="w-36"
            value={strokeAlpha()}
            onInput={(e) =>
              setStrokeAlpha(parseFloat(e.currentTarget.value || "1"))
            }
          />
          <span class="text-xs text-gray-600">
            {Math.round(strokeAlpha() * 100)}%
          </span>
        </label>
      </div>

      <div class="flex flex-wrap gap-3 items-end mb-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1">渲染器</span>
          <select
            class="border rounded px-2 py-1"
            value={renderer()}
            onChange={(e) => setRenderer(e.currentTarget.value as any)}
          >
            <option value="2d">Canvas 2D</option>
            <option value="webgl2">WebGL2</option>
          </select>
        </label>
        <fieldset class="flex gap-3 items-end border rounded px-2 py-2">
          <legend class="text-sm text-gray-600">向性（Tropism）</legend>
          <label class="flex flex-col text-sm">
            <span class="mb-1">T.x</span>
            <input
              type="number"
              step="0.1"
              class="border rounded px-2 py-1 w-24"
              value={tropismX()}
              onInput={(e) => setTropismX(parseFloat(e.currentTarget.value || "0"))}
            />
          </label>
          <label class="flex flex-col text-sm">
            <span class="mb-1">T.y</span>
            <input
              type="number"
              step="0.1"
              class="border rounded px-2 py-1 w-24"
              value={tropismY()}
              onInput={(e) => setTropismY(parseFloat(e.currentTarget.value || "0"))}
            />
          </label>
          <label class="flex flex-col text-sm">
            <span class="mb-1">强度 k</span>
            <input
              type="number"
              min="0"
              step="0.01"
              class="border rounded px-2 py-1 w-24"
              value={tropismK()}
              onInput={(e) => setTropismK(parseFloat(e.currentTarget.value || "0"))}
            />
          </label>
        </fieldset>
        <label class="flex flex-col text-sm">
          <span class="mb-1">噪声</span>
          <select
            class="border rounded px-2 py-1"
            value={noiseType()}
            onChange={(e) => setNoiseType(e.currentTarget.value as any)}
          >
            <option value="none">无</option>
            <option value="white">白噪音</option>
            <option value="pink">粉噪音</option>
          </select>
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">角度扰动幅度 (°)</span>
          <input
            type="number"
            class="border rounded px-2 py-1 w-28"
            value={angleNoiseAmpDeg()}
            onInput={(e) =>
              setAngleNoiseAmpDeg(parseFloat(e.currentTarget.value || "0"))
            }
          />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">步长缩放幅度</span>
          <input
            type="number"
            step="0.01"
            class="border rounded px-2 py-1 w-28"
            value={stepNoiseAmp()}
            onInput={(e) =>
              setStepNoiseAmp(parseFloat(e.currentTarget.value || "0"))
            }
          />
          <span class="text-xs text-gray-600">
            最终步长 = 步长 × (1 + 干扰×幅度)
          </span>
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1">噪声种子</span>
          <input
            type="number"
            class="border rounded px-2 py-1 w-28"
            value={noiseSeed()}
            onInput={(e) =>
              setNoiseSeed(parseInt(e.currentTarget.value || "1"))
            }
          />
        </label>
        <button
          class="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
          disabled={!wabtInstance()}
          onClick={buildAndInstantiate}
        >
          生成并运行
        </button>
        {/* 自动估算（指数显示），阈值上色：>=1e5 amber，>=1e7 red */}
        {estFilteredLen() !== null && (
          <span class={`text-sm ${heatClass(estFilteredLen()!)}`}>
            计算量 ≈ {toOrderLabel(estFilteredLen()!)}
          </span>
        )}
        {estSegments() !== null && (
          <span class={`text-sm ${heatClass(estSegments()!)}`}>
            绘制量 ≈ {toOrderLabel(estSegments()!)}
          </span>
        )}
      </div>

      <div class="flex flex-wrap gap-4 items-center text-sm text-gray-700 mb-2">
        <div>
          展开：{expandMs() !== null ? `${expandMs()!.toFixed(2)} ms` : "-"}
        </div>
        <div>
          编译：{compileMs() !== null ? `${compileMs()!.toFixed(2)} ms` : "-"}
        </div>
        <div>
          执行：{execMs() !== null ? `${execMs()!.toFixed(2)} ms` : "-"}
        </div>
        <div>
          绘图：{drawMs() !== null ? `${drawMs()!.toFixed(2)} ms` : "-"}
        </div>
      </div>

      {error() && (
        <div class="mt-3">
          <h2 class="text-red-600 font-bold">错误</h2>
          <pre class="bg-red-100 text-red-800 p-2.5 rounded whitespace-pre-wrap">
            {error()}
          </pre>
        </div>
      )}

      {watCode() && (
        <div class="mt-3">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xl font-bold">WAT</h2>
            <button
              class="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
              disabled={!watCode()}
              onClick={handleCopyWat}
            >
              {copyButtonText()}
            </button>
          </div>
          {watCode().length <= MAX_WAT_DISPLAY_CHARS ? (
            <details>
              <summary class="cursor-pointer select-none">
                查看生成的 WAT
              </summary>
              <pre class="bg-gray-100 text-gray-800 p-2.5 rounded whitespace-pre-wrap overflow-auto max-h-80">
                <code>{watCode()}</code>
              </pre>
            </details>
          ) : (
            <div class="text-sm text-gray-600">
              WAT 过长（{watCode().length} 字符），已隐藏，仅提供复制。
            </div>
          )}
        </div>
      )}

      <div class="mt-4">
        {renderer() === "2d" ? (
          <canvas
            ref={canvas2dRef}
            width={900}
            height={600}
            class="border rounded w-full h-auto"
          />
        ) : (
          <canvas
            ref={canvasGlRef}
            width={900}
            height={600}
            class="border rounded w-full h-auto"
          />
        )}
      </div>
    </div>
  );
}
