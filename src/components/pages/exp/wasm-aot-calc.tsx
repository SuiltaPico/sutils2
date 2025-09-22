import { createSignal, onMount } from "solid-js";
import wabt from "wabt";

// ========== 1. 类型定义 ==========
type WabtModule = Awaited<ReturnType<typeof wabt>>;

// 定义 Token 的类型
const enum TokenType {
  Number,
  Plus,
  Minus,
  Multiply,
  Divide,
  LParen, // 左括号
  RParen, // 右括号
  Comma, // 逗号
  Identifier, // for function names
  EOF, // End of File
}

interface Token {
  type: TokenType;
  value: string;
}

// 定义抽象语法树 (AST) 节点的类型
type ASTNode = BinaryOpNode | NumberNode | FunctionCallNode | UnaryOpNode;

interface UnaryOpNode {
  type: "UnaryOp";
  op: Token;
  operand: ASTNode;
}

interface FunctionCallNode {
  type: "FunctionCall";
  identifier: Token;
  arguments: ASTNode[];
}

interface BinaryOpNode {
  type: "BinaryOp";
  left: ASTNode;
  op: Token;
  right: ASTNode;
}

interface NumberNode {
  type: "Number";
  token: Token;
  value: number;
}

// ========== 2. 词法分析器 (Tokenizer/Lexer) ==========
// 将输入的字符串表达式分解成 Token 数组
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // 使用正则表达式匹配数字、标识符和操作符
  const regex =
    /\s*([0-9]+\.?[0-9]*|[a-zA-Z_][a-zA-Z0-9_]*|,|\(|\)|\+|\-|\*|\/)\s*/g;
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
        case ",":
          tokens.push({ type: TokenType.Comma, value });
          break;
      }
    }
  }
  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}

// ========== 3. 语法分析器 (Parser) ==========
// 根据 Token 数组构建 AST。这里我们使用一个简单的递归下降解析器。
// 语法规则:
// expr   : term ((PLUS | MINUS) term)*
// term   : factor ((MUL | DIV) factor)*
// factor : (PLUS | MINUS) factor | NUMBER | IDENTIFIER LPAREN (expr (COMMA expr)*)? RPAREN | LPAREN expr RPAREN
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

  private eat(tokenType: TokenType): void {
    if (this.currentToken.type === tokenType) {
      this.advance();
    } else {
      throw new Error(
        `Syntax Error: Expected ${tokenType}, got ${this.currentToken.type}`
      );
    }
  }

  // factor: (PLUS | MINUS) factor | NUMBER | IDENTIFIER LPAREN (expr (COMMA expr)*)? RPAREN | LPAREN expr RPAREN
  private factor(): ASTNode {
    const token = this.currentToken;

    if (token.type === TokenType.Plus || token.type === TokenType.Minus) {
      this.eat(token.type);
      return {
        type: "UnaryOp",
        op: token,
        operand: this.factor(),
      };
    }

    if (token.type === TokenType.Number) {
      this.eat(TokenType.Number);
      return { type: "Number", token, value: parseFloat(token.value) };
    } else if (token.type === TokenType.Identifier) {
      const identifierToken = token;
      this.eat(TokenType.Identifier);
      this.eat(TokenType.LParen);
      const args: ASTNode[] = [];
      if (this.currentToken.type !== TokenType.RParen) {
        args.push(this.expr());
        while (this.currentToken.type === TokenType.Comma) {
          this.eat(TokenType.Comma);
          args.push(this.expr());
        }
      }
      this.eat(TokenType.RParen);
      return {
        type: "FunctionCall",
        identifier: identifierToken,
        arguments: args,
      };
    } else if (token.type === TokenType.LParen) {
      this.eat(TokenType.LParen);
      const node = this.expr();
      this.eat(TokenType.RParen);
      return node;
    }
    throw new Error(`Syntax Error: Invalid factor token ${token.type}`);
  }

  // term: factor ((MUL | DIV) factor)*
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

  // expr: term ((PLUS | MINUS) term)*
  private expr(): ASTNode {
    let node = this.term();
    while ([TokenType.Plus, TokenType.Minus].includes(this.currentToken.type)) {
      const opToken = this.currentToken;
      this.eat(opToken.type);
      node = {
        type: "BinaryOp",
        left: node,
        op: opToken,
        right: this.term(),
      };
    }
    return node;
  }

  public parse(): ASTNode {
    return this.expr();
  }
}

// ========== 4. WAT 代码生成器 ==========
// 遍历 AST 并生成 WebAssembly 文本格式 (WAT) 代码
function generateWat(node: ASTNode): string {
  if (node.type === "Number") {
    return `(f64.const ${node.value})`;
  }

  if (node.type === "UnaryOp") {
    const operandWat = generateWat(node.operand);
    if (node.op.type === TokenType.Minus) {
      return `${operandWat}\nf64.neg`;
    }
    return operandWat; // Unary plus is a no-op
  }

  if (node.type === "FunctionCall") {
    const nativeFunctions: Record<string, string> = {
      sqrt: "f64.sqrt",
      abs: "f64.abs",
      ceil: "f64.ceil",
      floor: "f64.floor",
      trunc: "f64.trunc",
    };
    const importedFunctions: string[] = ["sin", "cos", "tan", "pow"];

    const functionName = node.identifier.value;

    if (nativeFunctions[functionName]) {
      if (node.arguments.length !== 1) {
        throw new Error(
          `Function ${functionName} expects 1 argument, but got ${node.arguments.length}`
        );
      }
      const argumentWat = generateWat(node.arguments[0]);
      const opWat = nativeFunctions[functionName];
      return `${argumentWat}\n${opWat}`;
    }

    if (importedFunctions.includes(functionName)) {
      const argsWat = node.arguments.map(generateWat).join("\n");
      return `${argsWat}\ncall $${functionName}`;
    }

    throw new Error(`Unknown function: ${functionName}`);
  }

  if (node.type === "BinaryOp") {
    const leftWat = generateWat(node.left);
    const rightWat = generateWat(node.right);
    let opWat = "";
    switch (node.op.type) {
      case TokenType.Plus:
        opWat = "f64.add";
        break;
      case TokenType.Minus:
        opWat = "f64.sub";
        break;
      case TokenType.Multiply:
        opWat = "f64.mul";
        break;
      case TokenType.Divide:
        opWat = "f64.div";
        break; // s for signed
    }
    // Wasm 是基于栈的，所以我们先把左右两个操作数压栈，然后执行操作
    return `${leftWat}\n${rightWat}\n${opWat}`;
  }

  // Unreachable code, but helps with type checking
  throw new Error("Unknown AST node type");
}

function createWatModule(ast: ASTNode): string {
  const coreLogic = generateWat(ast);
  return `(module
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "cos" (func $cos (param f64) (result f64)))
  (import "env" "tan" (func $tan (param f64) (result f64)))
  (import "env" "pow" (func $pow (param f64 f64) (result f64)))
  (func (export "calculate") (result f64)
    ${coreLogic}
  )
)`;
}

// ========== 5. SolidJS 组件 ==========
export default function WasmAotCalculator() {
  const [expression, setExpression] = createSignal("pow(2, 8) + tan(0.785)");
  const [result, setResult] = createSignal<string | number | null>(null);
  const [watCode, setWatCode] = createSignal("");
  const [error, setError] = createSignal("");
  const [wabtInstance, setWabtInstance] = createSignal<WabtModule | null>(null);
  const [wasmBuffer, setWasmBuffer] = createSignal<Uint8Array | null>(null);
  const [copyButtonText, setCopyButtonText] = createSignal("复制 WAT");

  // 在组件挂载时异步加载 WABT 实例
  onMount(async () => {
    try {
      const instance = await wabt();
      setWabtInstance(instance);
    } catch (e) {
      setError("Failed to load WABT compiler.");
      console.error(e);
    }
  });

  const handleCalculate = async () => {
    setResult(null);
    setWatCode("");
    setError("");
    setWasmBuffer(null);
    setCopyButtonText("复制 WAT");

    if (!wabtInstance()) {
      setError("WABT compiler not loaded yet.");
      return;
    }

    try {
      // 1. 分词
      const tokens = tokenize(expression());

      // 2. 构建语法树
      const parser = new Parser(tokens);
      const ast = parser.parse();

      // 3. 生成 WAT
      const wat = createWatModule(ast);
      setWatCode(wat);

      // 4. wabt.js 编译成 wasm
      const wasmModule = wabtInstance()!.parseWat("calculator.wat", wat);
      const { buffer } = wasmModule.toBinary({
        log: true,
        write_debug_names: true,
      });
      setWasmBuffer(buffer);

      // 5. JS 执行编译结果
      const importObject = {
        env: {
          sin: Math.sin,
          cos: Math.cos,
          tan: Math.tan,
          pow: Math.pow,
        },
      };
      const { instance: wasmInstance } = (await WebAssembly.instantiate(
        buffer,
        importObject
      )) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
      const calculatedResult = (wasmInstance.exports.calculate as Function)();

      // 6. 显示结果
      setResult(calculatedResult);
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
      console.error(e);
    }
  };

  const handleCopyWat = async () => {
    if (!watCode()) return;
    try {
      await navigator.clipboard.writeText(watCode());
      setCopyButtonText("已复制!");
      setTimeout(() => setCopyButtonText("复制 WAT"), 2000);
    } catch (err) {
      console.error("Failed to copy WAT code: ", err);
      setError("无法将 WAT 复制到剪贴板。");
    }
  };

  const handleDownloadWasm = () => {
    if (!wasmBuffer()) return;
    try {
      const blob = new Blob([wasmBuffer()!.buffer as ArrayBuffer], {
        type: "application/wasm",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "calculator.wasm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download wasm binary: ", err);
      setError("下载 Wasm 二进制文件失败。");
    }
  };

  return (
    <div class="font-sans max-w-3xl mx-auto p-5">
      <h1 class="text-2xl font-bold mb-2">Wasm AOT 计算器</h1>
      <p class="text-gray-600 mb-4">
        使用 wabt.js 将数学表达式即时编译 (AOT) 成 WebAssembly 并执行。
      </p>

      <div class="flex items-center gap-2.5 mb-4">
        <input
          type="text"
          value={expression()}
          onInput={(e) => setExpression(e.currentTarget.value)}
          onKeyPress={(e) => e.key === "Enter" && handleCalculate()}
          class="flex-grow p-2 text-base border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <button
          onClick={handleCalculate}
          disabled={!wabtInstance()}
          class="px-4 py-2 text-base cursor-pointer bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {wabtInstance() ? "计算" : "加载中..."}
        </button>
      </div>

      {result() !== null && (
        <div class="mt-5">
          <h2 class="text-xl font-bold mb-2">结果</h2>
          <p class="text-2xl font-bold text-green-700 bg-gray-100 p-4 rounded-md">
            {result()}
          </p>
        </div>
      )}

      {error() && (
        <div class="mt-5">
          <h2 class="text-xl font-bold text-red-600 mb-2">错误</h2>
          <pre class="bg-red-100 text-red-800 p-2.5 rounded-md whitespace-pre-wrap">
            {error()}
          </pre>
        </div>
      )}

      {watCode() && (
        <div class="mt-5">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xl font-bold">生成的 WebAssembly 文本 (WAT)</h2>
            <div class="flex gap-2">
              <button
                onClick={handleCopyWat}
                disabled={!watCode()}
                class="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copyButtonText()}
              </button>
              <button
                onClick={handleDownloadWasm}
                disabled={!wasmBuffer()}
                class="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                下载 .wasm
              </button>
            </div>
          </div>
          <pre class="bg-gray-100 text-gray-800 p-2.5 rounded-md whitespace-pre-wrap">
            <code>{watCode()}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
