import { createSignal, onMount } from "solid-js";
import wabt from "wabt";

// ========== 1. 配置 ==========
const PARTICLE_COUNT = 20000; // 粒子数量
const PARTICLE_VAR_NAMES = ["px", "py", "vx", "vy"]; // 支持的变量名
type ParticleAttribute = "px" | "py" | "vx" | "vy";

// 群体智能配置（数据驱动，避免魔法数字）
const SWARM_CONFIG = {
  cellSize: 32, // 栅格大小（像素）
  rayLength: 48, // 射线长度（像素）
  rayStep: 8, // 射线步进（像素）
  hitRadius: 16, // 命中半径（像素）
  rotateRad: 0.05, // 未命中时每帧旋转角速度（弧度）
  accel: 0.5, // 命中时沿射线方向加速度
  maxSpeed: 1, // 速度上限，避免数值爆炸
  predictHorizon: 6, // 预测目标未来帧数
  turnMaxRad: 0.2, // 每帧最大转向角
  desiredSeparation: 12, // 与目标保持的最小安全距离（像素）
  separationAccel: 0.6, // 过近时的分离加速度强度
} as const;

// ========== 2. 类型定义 ==========
type WabtModule = Awaited<ReturnType<typeof wabt>>;

const enum TokenType {
  Number,
  Plus,
  Minus,
  Multiply,
  Divide,
  Identifier, // 变量名
  Equals, // =
  LParen,
  RParen,
  EOF,
}

interface Token {
  type: TokenType;
  value: string;
}

// AST 节点
type ASTNode = BinaryOpNode | UnaryOpNode | NumberNode | VariableNode;
type StatementNode = AssignmentNode;

interface ProgramNode {
  type: "Program";
  body: StatementNode[];
}

interface AssignmentNode {
  type: "Assignment";
  identifier: VariableNode;
  value: ASTNode;
}

interface VariableNode {
  type: "Variable";
  name: string;
}

interface BinaryOpNode {
  type: "BinaryOp";
  left: ASTNode;
  op: Token;
  right: ASTNode;
}

interface NumberNode {
  type: "Number";
  value: number;
}

interface UnaryOpNode {
  type: "UnaryOp";
  op: Token; // Plus 或 Minus
  argument: ASTNode;
}

// ========== 3. 编译器: 词法分析器 ==========
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex =
    /\s*([0-9]+\.?[0-9]*|[a-zA-Z_][a-zA-Z0-9_]*|\=|\(|\)|\+|\-|\*|\/)\s*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = match[1];
    if (/[0-9]/.test(value[0]) || value[0] === ".") {
      tokens.push({ type: TokenType.Number, value });
    } else if (/[a-zA-Z_]/.test(value[0])) {
      tokens.push({ type: TokenType.Identifier, value });
    } else {
      switch (value) {
        case "+":
          tokens.push({ type: TokenType.Plus, value });
          break;
        case "-":
          tokens.push({ type: TokenType.Minus, value });
          break;
        case "*":
          tokens.push({ type: TokenType.Multiply, value });
          break;
        case "/":
          tokens.push({ type: TokenType.Divide, value });
          break;
        case "(":
          tokens.push({ type: TokenType.LParen, value });
          break;
        case ")":
          tokens.push({ type: TokenType.RParen, value });
          break;
        case "=":
          tokens.push({ type: TokenType.Equals, value });
          break;
      }
    }
  }
  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}

// ========== 4. 编译器: 语法分析器 ==========
// 语法规则:
// program    : statement* EOF
// statement  : IDENTIFIER EQUALS expr
// expr       : term ((PLUS | MINUS) term)*
// term       : factor ((MUL | DIV) factor)*
// factor     : (PLUS | MINUS) factor | NUMBER | IDENTIFIER | LPAREN expr RPAREN
class Parser {
  private tokens: Token[];
  private currentTokenIndex: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private get currentToken(): Token {
    return this.tokens[this.currentTokenIndex];
  }

  private advance(): void {
    if (this.currentTokenIndex < this.tokens.length - 1) {
      this.currentTokenIndex++;
    }
  }

  private eat(tokenType: TokenType): Token {
    const token = this.currentToken;
    if (token.type === tokenType) {
      this.advance();
      return token;
    } else {
      throw new Error(
        `Syntax Error: Expected ${tokenType}, got ${this.currentToken.type}`
      );
    }
  }

  private factor(): ASTNode {
    const token = this.currentToken;
    if (token.type === TokenType.Plus) {
      this.eat(TokenType.Plus);
      return { type: "UnaryOp", op: token, argument: this.factor() };
    } else if (token.type === TokenType.Minus) {
      this.eat(TokenType.Minus);
      return { type: "UnaryOp", op: token, argument: this.factor() };
    }
    if (token.type === TokenType.Number) {
      this.eat(TokenType.Number);
      return { type: "Number", value: parseFloat(token.value) };
    } else if (token.type === TokenType.Identifier) {
      this.eat(TokenType.Identifier);
      if (!PARTICLE_VAR_NAMES.includes(token.value)) {
        throw new Error(`Syntax Error: Unknown variable '${token.value}'`);
      }
      return { type: "Variable", name: token.value };
    } else if (token.type === TokenType.LParen) {
      this.eat(TokenType.LParen);
      const node = this.expr();
      this.eat(TokenType.RParen);
      return node;
    }
    throw new Error(`Syntax Error: Invalid factor token ${token.type}`);
  }

  private term(): ASTNode {
    let node = this.factor();
    while (
      [TokenType.Multiply, TokenType.Divide].includes(this.currentToken.type)
    ) {
      const opToken = this.currentToken;
      this.eat(opToken.type);
      node = {
        type: "BinaryOp",
        left: node,
        op: opToken,
        right: this.factor(),
      };
    }
    return node;
  }

  private expr(): ASTNode {
    let node = this.term();
    while ([TokenType.Plus, TokenType.Minus].includes(this.currentToken.type)) {
      const opToken = this.currentToken;
      this.eat(opToken.type);
      node = { type: "BinaryOp", left: node, op: opToken, right: this.term() };
    }
    return node;
  }

  private assignmentStatement(): StatementNode {
    const identifierToken = this.eat(TokenType.Identifier);
    if (!PARTICLE_VAR_NAMES.includes(identifierToken.value)) {
      throw new Error(
        `Syntax Error: Unknown variable '${identifierToken.value}'`
      );
    }
    const identifierNode: VariableNode = {
      type: "Variable",
      name: identifierToken.value,
    };
    this.eat(TokenType.Equals);
    const valueNode = this.expr();
    return { type: "Assignment", identifier: identifierNode, value: valueNode };
  }

  public parse(): ProgramNode {
    const statements: StatementNode[] = [];
    while (this.currentToken.type !== TokenType.EOF) {
      statements.push(this.assignmentStatement());
    }
    return { type: "Program", body: statements };
  }
}

// ========== 5. 编译器: WAT 代码生成器 (SIMD) ==========
function generateWat(
  ast: ProgramNode,
  particleVarOffsets: Record<ParticleAttribute, number>
): string {
  const watParts: string[] = [];

  function generateExpressionWat(node: ASTNode): string {
    if (node.type === "Number") {
      return `(f32x4.splat (f32.const ${node.value}))`;
    }
    if (node.type === "Variable") {
      const offset = particleVarOffsets[node.name as ParticleAttribute];
      return `(v128.load (i32.add (local.get $base_addr) (i32.const ${offset})))`;
    }
    if (node.type === "UnaryOp") {
      const inner = generateExpressionWat(node.argument);
      switch (node.op.type) {
        case TokenType.Plus:
          return `${inner}`;
        case TokenType.Minus:
          return `${inner}\n(f32x4.neg)`;
      }
    }
    if (node.type === "BinaryOp") {
      const leftWat = generateExpressionWat(node.left);
      const rightWat = generateExpressionWat(node.right);
      let opWat = "";
      switch (node.op.type) {
        case TokenType.Plus:
          opWat = "f32x4.add";
          break;
        case TokenType.Minus:
          opWat = "f32x4.sub";
          break;
        case TokenType.Multiply:
          opWat = "f32x4.mul";
          break;
        case TokenType.Divide:
          opWat = "f32x4.div";
          break;
      }
      return `${leftWat}\n${rightWat}\n(${opWat})`;
    }
    throw new Error("Unknown AST node type in expression");
  }

  for (const statement of ast.body) {
    if (statement.type === "Assignment") {
      const varName = statement.identifier.name as ParticleAttribute;
      const offset = particleVarOffsets[varName];
      const valueWat = generateExpressionWat(statement.value);

      const wat = `
;; Statement: ${varName} = ...
(v128.store (i32.add (local.get $base_addr) (i32.const ${offset}))
  ${valueWat}
)
      `;
      watParts.push(wat);
    }
  }

  const coreLogic = watParts.join("\n");

  return `(module
  (memory (export "memory") 100)

  (func (export "update") (param $count i32)
    (local $i i32)
    (local $base_addr i32)

    (loop $main_loop
      (local.set $base_addr (i32.mul (local.get $i) (i32.const 16)))
      
      ${coreLogic}

      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      
      (br_if $main_loop
        (i32.lt_s
          (local.get $i)
          (i32.div_s (local.get $count) (i32.const 4))
        )
      )
    )
  )
)`;
}

// ========== 6. SolidJS 组件 ==========
export default function WasmAotSimdParticleSwarmSim() {
  const [script, setScript] = createSignal(
    `vx = vx * 0.9
vy = vy * 0.9
px = px + vx
py = py + vy`
  );
  const [error, setError] = createSignal("");
  const [wabtInstance, setWabtInstance] = createSignal<WabtModule | null>(null);
  const [simRunning, setSimRunning] = createSignal(false);

  // 指标
  const [fps, setFps] = createSignal(0);
  const [computeMs, setComputeMs] = createSignal(0);
  const [renderMs, setRenderMs] = createSignal(0);

  let canvas: HTMLCanvasElement | undefined;
  let animationFrameId: number;
  let wasmInstance: WebAssembly.Instance | null = null;
  let particleData: {
    px: Float32Array;
    py: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    dir: Float32Array; // 每个粒子的射线方向（弧度）
  } | null = null;

  onMount(async () => {
    try {
      const instance = await wabt();
      setWabtInstance(instance);
    } catch (e) {
      setError("Failed to load WABT compiler.");
      console.error(e);
    }
  });

  const initializeParticles = (width: number, height: number) => {
    particleData = {
      px: new Float32Array(PARTICLE_COUNT),
      py: new Float32Array(PARTICLE_COUNT),
      vx: new Float32Array(PARTICLE_COUNT),
      vy: new Float32Array(PARTICLE_COUNT),
      dir: new Float32Array(PARTICLE_COUNT),
    };
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleData.px[i] = Math.random() * width;
      particleData.py[i] = Math.random() * height;
      particleData.vx[i] = (Math.random() - 0.5) * 2;
      particleData.vy[i] = (Math.random() - 0.5) * 2;
      particleData.dir[i] = Math.random() * Math.PI * 2; // 随机初始化方向
    }
  };

  // 基于栅格+射线的群体智能行为：
  // - 若射线上探测到粒子：选择首个命中的目标，预测其未来位置并以限幅转向靠拢，然后沿该方向加速
  // - 若未探测到：按随机顺/逆时针旋转方向
  const applySwarmBehavior = (
    px: Float32Array,
    py: Float32Array,
    vx: Float32Array,
    vy: Float32Array,
    dir: Float32Array,
    width: number,
    height: number
  ) => {
    const { cellSize, rayLength, rayStep, hitRadius, rotateRad, accel, maxSpeed, predictHorizon, turnMaxRad, desiredSeparation, separationAccel } = SWARM_CONFIG;

    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    const cellCount = cols * rows;

    // 栅格头指针与链表（无分配构建）
    const head = new Int32Array(cellCount);
    head.fill(-1);
    const next = new Int32Array(PARTICLE_COUNT);

    // 构建栅格
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const cx = ((px[i] | 0) / cellSize) | 0;
      const cy = ((py[i] | 0) / cellSize) | 0;
      const gx = Math.min(cols - 1, Math.max(0, cx));
      const gy = Math.min(rows - 1, Math.max(0, cy));
      const cell = gy * cols + gx;
      next[i] = head[cell];
      head[cell] = i;
    }

    const maxSteps = Math.max(1, Math.floor(rayLength / rayStep));
    const hitR2 = hitRadius * hitRadius;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = dir[i];
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      let x = px[i];
      let y = py[i];
      let hit = false;
      let target = -1;

      for (let s = 0; s < maxSteps; s++) {
        x += dx * rayStep;
        y += dy * rayStep;

        // 出界则停止射线
        if (x < 0 || x >= width || y < 0 || y >= height) break;

        const cx = ((x | 0) / cellSize) | 0;
        const cy = ((y | 0) / cellSize) | 0;
        const gx = Math.min(cols - 1, Math.max(0, cx));
        const gy = Math.min(rows - 1, Math.max(0, cy));
        const cell = gy * cols + gx;

        // 检查当前cell的链表
        for (let p = head[cell]; p !== -1; p = next[p]) {
          if (p === i) continue;
          const dxp = px[p] - x;
          const dyp = py[p] - y;
          if (dxp * dxp + dyp * dyp <= hitR2) {
            hit = true;
            target = p;
            break;
          }
        }

        if (hit) break;
      }

      if (hit && target !== -1) {
        // 预测目标未来位置
        const tpx = px[target];
        const tpy = py[target];
        const tvx = vx[target];
        const tvy = vy[target];
        const predX = tpx + tvx * predictHorizon;
        const predY = tpy + tvy * predictHorizon;

        // 期望朝向角
        const desired = Math.atan2(predY - py[i], predX - px[i]);

        // 限幅转向到目标
        let delta = desired - angle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        if (delta > turnMaxRad) delta = turnMaxRad;
        if (delta < -turnMaxRad) delta = -turnMaxRad;
        let newAngle = angle + delta;
        if (newAngle > Math.PI) newAngle -= Math.PI * 2;
        if (newAngle < -Math.PI) newAngle += Math.PI * 2;
        dir[i] = newAngle;

        // 计算与预测点的距离，过近则施加分离力，否则按新朝向加速
        const dxp = predX - px[i];
        const dyp = predY - py[i];
        const dist = Math.hypot(dxp, dyp);
        let ax = 0;
        let ay = 0;
        if (dist < desiredSeparation && dist > 1e-4) {
          // 分离力：远离预测点，线性衰减，到阈值处最大
          const inv = 1 / dist;
          const nx = dxp * inv;
          const ny = dyp * inv;
          const k = (desiredSeparation - dist) / desiredSeparation; // [0,1]
          ax -= nx * separationAccel * k;
          ay -= ny * separationAccel * k;
        } else {
          const sdx = Math.cos(newAngle);
          const sdy = Math.sin(newAngle);
          ax += sdx * accel;
          ay += sdy * accel;
        }

        let nvx = vx[i] + ax;
        let nvy = vy[i] + ay;
        const speed2 = nvx * nvx + nvy * nvy;
        const maxS2 = maxSpeed * maxSpeed;
        if (speed2 > maxS2) {
          const inv = maxSpeed / Math.sqrt(speed2);
          nvx *= inv;
          nvy *= inv;
        }
        vx[i] = nvx;
        vy[i] = nvy;
      } else {
        // 未命中则随机顺/逆时针旋转方向
        const delta = Math.random() < 0.5 ? -rotateRad : rotateRad;
        let nd = angle + delta;
        if (nd > Math.PI) nd -= Math.PI * 2;
        if (nd < -Math.PI) nd += Math.PI * 2;
        dir[i] = nd;
      }
    }
  };

  const runSimulation = () => {
    if (!wasmInstance || !particleData || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const memory = wasmInstance.exports.memory as WebAssembly.Memory;
    const update = wasmInstance.exports.update as (count: number) => void;

    const bytesPerAttribute = PARTICLE_COUNT * 4;
    const pxView = new Float32Array(memory.buffer, 0, PARTICLE_COUNT);
    const pyView = new Float32Array(
      memory.buffer,
      bytesPerAttribute,
      PARTICLE_COUNT
    );
    const vxView = new Float32Array(
      memory.buffer,
      bytesPerAttribute * 2,
      PARTICLE_COUNT
    );
    const vyView = new Float32Array(
      memory.buffer,
      bytesPerAttribute * 3,
      PARTICLE_COUNT
    );
    const dirView = new Float32Array(
      memory.buffer,
      bytesPerAttribute * 4,
      PARTICLE_COUNT
    );

    pxView.set(particleData.px);
    pyView.set(particleData.py);
    vxView.set(particleData.vx);
    vyView.set(particleData.vy);
    dirView.set(particleData.dir);

    const width = canvas.width;
    const height = canvas.height;
    let frameImage = ctx.createImageData(width, height);
    let frameU32 = new Uint32Array(frameImage.data.buffer);
    // RGBA = (100,180,255,255)
    const dotColor = (255 << 24) | (255 << 16) | (180 << 8) | 100;
    const clearColor = 0xff000000; // Opaque black

    let lastStamp = performance.now();
    let emaFps = 0;
    const fpsAlpha = 0.15;

    const renderLoop = () => {
      const t0 = performance.now();

      // 群体智能：基于当前 px/py 与 dir 执行一次行为决策，更新 vx/vy/dir
      applySwarmBehavior(pxView, pyView, vxView, vyView, dirView, width, height);

      // 调用 Wasm SIMD 执行用户脚本（例如摩擦、重力、积分等）
      update(PARTICLE_COUNT);

      const t1 = performance.now();

      // 清空像素缓冲为不透明黑，避免透明像素残留引起的视觉“拖影”
      frameU32.fill(clearColor);

      // 更新像素
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let x = pxView[i];
        let y = pyView[i];

        if (x >= width) pxView[i] = x = 0;
        if (x < 0) pxView[i] = x = width - 1;
        if (y >= height) pyView[i] = y = 0;
        if (y < 0) pyView[i] = y = height - 1;

        const ix = x | 0;
        const iy = y | 0;
        if (ix < 0 || ix >= width || iy < 0 || iy >= height) continue;

        // 2x2 点
        const base = iy * width + ix;
        frameU32[base] = dotColor;
        if (ix + 1 < width) frameU32[base + 1] = dotColor;
        if (iy + 1 < height) {
          frameU32[base + width] = dotColor;
          if (ix + 1 < width) frameU32[base + width + 1] = dotColor;
        }
      }

      // 提交一帧像素
      ctx.putImageData(frameImage, 0, 0);

      const t2 = performance.now();

      // 指标
      setComputeMs(t1 - t0);
      setRenderMs(t2 - t1);
      const dt = t2 - lastStamp;
      lastStamp = t2;
      const instFps = dt > 0 ? 1000 / dt : 0;
      emaFps =
        emaFps === 0 ? instFps : emaFps * (1 - fpsAlpha) + instFps * fpsAlpha;
      setFps(emaFps);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
  };

  const handleCompileAndRun = async () => {
    if (simRunning()) {
      cancelAnimationFrame(animationFrameId);
      setSimRunning(false);
      return;
    }
    setError("");

    if (!wabtInstance()) {
      setError("WABT compiler not loaded yet.");
      return;
    }
    if (!canvas) return;

    try {
      initializeParticles(canvas.width, canvas.height);

      const tokens = tokenize(script());
      const parser = new Parser(tokens);
      const ast = parser.parse();

      const bytesPerAttribute = PARTICLE_COUNT * 4;
      const particleVarOffsets = {
        px: 0,
        py: bytesPerAttribute,
        vx: bytesPerAttribute * 2,
        vy: bytesPerAttribute * 3,
      };

      const wat = generateWat(ast, particleVarOffsets);

      const wasmModule = wabtInstance()!.parseWat("sim.wat", wat);
      const { buffer } = wasmModule.toBinary({
        log: false,
        write_debug_names: false,
        features: { simd: true },
      } as any);

      const { instance } = (await WebAssembly.instantiate(
        buffer
      )) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
      wasmInstance = instance;

      setSimRunning(true);
      runSimulation();
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
      console.error(e);
      setSimRunning(false);
    }
  };

  return (
    <div class="font-sans max-w-7xl mx-auto p-5 grid grid-cols-3 gap-4">
      <div class="col-span-2">
        <h1 class="text-2xl font-bold mb-2">Wasm SIMD 粒子模拟器</h1>
        <p class="text-gray-600 mb-4">
          使用自定义脚本动态编译 Wasm SIMD 来实时模拟 {PARTICLE_COUNT} 个粒子。
        </p>
        <div class="relative inline-block">
          <canvas
            ref={canvas}
            width="600"
            height="720"
            class="border border-gray-400 rounded-md bg-black"
          ></canvas>
          <div class="absolute top-2 left-2 bg-black/70 text-green-300 text-xs px-2 py-1 rounded shadow">
            <div>FPS: {fps().toFixed(1)}</div>
            <div>Compute: {computeMs().toFixed(2)} ms</div>
            <div>Render: {renderMs().toFixed(2)} ms</div>
          </div>
        </div>
      </div>
      <div class="col-span-1">
        <h2 class="text-xl font-bold mb-2">控制脚本</h2>
        <p class="text-sm text-gray-500 mb-2">支持的变量: px, py, vx, vy</p>
        <textarea
          class="w-full h-48 p-2 font-mono text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
          value={script()}
          onInput={(e) => setScript(e.currentTarget.value)}
          disabled={simRunning()}
        />
        <button
          onClick={handleCompileAndRun}
          disabled={!wabtInstance()}
          class="mt-4 w-full px-4 py-2 text-base cursor-pointer bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {simRunning()
            ? "停止模拟"
            : wabtInstance()
            ? "编译并运行"
            : "加载编译器..."}
        </button>
        {error() && (
          <div class="mt-5">
            <h2 class="text-xl font-bold text-red-600 mb-2">错误</h2>
            <pre class="bg-red-100 text-red-800 p-2.5 rounded-md whitespace-pre-wrap">
              {error()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
