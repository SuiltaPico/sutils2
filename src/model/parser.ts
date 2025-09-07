import { ByteOrder, type Schema } from "./schemas/type";
import { gif } from "./schemas/app/gif";

type Numeric = number;

type ParseState = {
  view: DataView;
  offset: number;
  byteOrder: number;
  // 全局解析结果（根作用域）
  root: any;
  // 作用域栈：用于支持 `$.x` 引用当前条目字段
  scopeStack: any[];
  // 模板参数
  paramsStack: Array<Record<string, Numeric>>;
  // 控制 loop_list 的中断
  breakLoop: boolean;
};

function createState(buffer: ArrayBuffer, schema: Schema): ParseState {
  return {
    view: new DataView(buffer),
    offset: 0,
    byteOrder: schema.config.byte_order,
    root: {},
    scopeStack: [],
    paramsStack: [],
    breakLoop: false,
  };
}

function isLittleEndian(state: ParseState): boolean {
  return state.byteOrder === ByteOrder.LittleEndian;
}

function readUint(state: ParseState, length: number): number {
  if (state.offset + length > state.view.byteLength) {
    throw new RangeError(`读取越界: uint(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`);
  }
  let result = 0;
  if (isLittleEndian(state)) {
    for (let i = 0; i < length; i++) {
      const byte = state.view.getUint8(state.offset + i);
      result |= byte << (8 * i);
    }
  } else {
    for (let i = 0; i < length; i++) {
      const byte = state.view.getUint8(state.offset + i);
      result = (result << 8) | byte;
    }
  }
  state.offset += length;
  return result >>> 0;
}

function readAscii(state: ParseState, length: number): string {
  if (state.offset + length > state.view.byteLength) {
    throw new RangeError(`读取越界: ascii(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(state.view.getUint8(state.offset + i));
  }
  state.offset += length;
  return String.fromCharCode(...bytes);
}

function readBytes(state: ParseState, length: number): Uint8Array {
  if (state.offset + length > state.view.byteLength) {
    throw new RangeError(`读取越界: bytes(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`);
  }
  const arr = new Uint8Array(state.view.buffer, state.view.byteOffset + state.offset, length);
  state.offset += length;
  // 拷贝返回，避免后续 offset 变化影响视图
  return new Uint8Array(arr);
}

function skip(state: ParseState, length: number): void {
  state.offset += length;
}

function getCurrentScope(state: ParseState): any | undefined {
  if (state.scopeStack.length === 0) return undefined;
  return state.scopeStack[state.scopeStack.length - 1];
}

function resolvePath(obj: any, path: string): any {
  if (!obj) return undefined;
  // 简单点支持 a.b.c 的点路径
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalRef(state: ParseState, id: string): any {
  if (id.startsWith("$.")) {
    const scope = getCurrentScope(state);
    return resolvePath(scope, id.slice(2));
  }
  // 无前缀：优先在当前作用域解析，找不到再回退根作用域
  const scope = getCurrentScope(state);
  const inScope = resolvePath(scope, id);
  if (inScope !== undefined) return inScope;
  return resolvePath(state.root, id);
}

function evalParamRef(state: ParseState, id: string): any {
  if (state.paramsStack.length === 0) return undefined;
  const top = state.paramsStack[state.paramsStack.length - 1];
  return top[id];
}

function ensureNumber(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return Number(value);
  return Number(value);
}

type ExpressionTerm =
  | { type: "ref"; id: string }
  | { type: "param_ref"; id: string }
  | { type: "uint_literal"; value: number }
  | { type: "op"; value: "pow" | "+" | "eq" }
  | { type: "expr"; expr: ExpressionTerm[] };

function evalTerm(state: ParseState, term: ExpressionTerm): any {
  switch (term.type) {
    case "ref":
      return evalRef(state, term.id);
    case "param_ref":
      return evalParamRef(state, term.id);
    case "uint_literal":
      return term.value;
    case "expr":
      return evalExpression(state, term.expr);
    case "op":
      return term.value; // 由上层处理
    default:
      return undefined;
  }
}

function applyOp(op: string, left: any, right: any): any {
  if (op === "+") return ensureNumber(left) + ensureNumber(right);
  if (op === "pow") return Math.pow(ensureNumber(left), ensureNumber(right));
  if (op === "eq") return ensureNumber(left) === ensureNumber(right);
  throw new Error(`不支持的操作符: ${op}`);
}

function evalExpression(state: ParseState, expr: ExpressionTerm[]): any {
  // 约定为二元中缀表达式，可链式左结合：v0 op v1 op v2 ...
  if (expr.length === 0) return undefined;
  let acc = evalTerm(state, expr[0]);
  let i = 1;
  while (i < expr.length) {
    const opTerm = expr[i] as any;
    const rightTerm = expr[i + 1] as any;
    const op = opTerm.type === "op" ? opTerm.value : undefined;
    const right = evalTerm(state, rightTerm);
    if (!op) throw new Error("表达式语法错误，缺少操作符");
    acc = applyOp(op, acc, right);
    i += 2;
  }
  return acc;
}

function setField(target: any, key: string, value: any): void {
  target[key] = value;
}

function parseBitfieldToObject(byteValue: number, spec: Array<any>): any {
  // MSB -> LSB 顺序解析以匹配 GIF 规范
  let remaining = 8;
  let cursor = 7; // 从高位开始
  const result: any = {};
  for (const node of spec) {
    const len = node.length;
    if (len <= 0) continue;
    let value = 0;
    if (node.type === "skip") {
      cursor -= len;
      remaining -= len;
      continue;
    }
    // 取 len 位（从高位往低位）
    for (let i = 0; i < len; i++) {
      const bitIndex = cursor - i;
      const bit = (byteValue >> bitIndex) & 1;
      value = (value << 1) | bit;
    }
    cursor -= len;
    remaining -= len;
    if (node.type === "boolean") {
      result[node.id] = value !== 0;
    } else if (node.type === "uint") {
      result[node.id] = value >>> 0;
    }
  }
  return result;
}

function parseSpecList(state: ParseState, targetObj: any, specList: any[], schema: Schema): void {
  for (const node of specList) {
    if (state.breakLoop) return;
    switch (node.type) {
      case "uint": {
        const v = readUint(state, node.length);
        setField(targetObj, node.id, v);
        break;
      }
      case "ascii": {
        const s = readAscii(state, node.length);
        setField(targetObj, node.id, s);
        break;
      }
      case "bytes": {
        const len = typeof node.length === "number" ? node.length : ensureNumber(evalRef(state, node.length.id));
        const b = readBytes(state, len);
        setField(targetObj, node.id, b);
        break;
      }
      case "skip": {
        skip(state, node.length);
        break;
      }
      case "boolean": {
        // boolean 仅在 bitfield 内部使用，不应单独出现
        throw new Error("boolean 节点只能出现在 bitfield 内部");
      }
      case "bitfield": {
        const byte = readUint(state, 1);
        const sub = parseBitfieldToObject(byte, node.spec);
        if (node.id) {
          setField(targetObj, node.id, sub);
        }
        // 同时把子字段提升到当前作用域，方便后续 ref
        for (const k of Object.keys(sub)) {
          setField(targetObj, k, sub[k]);
        }
        break;
      }
      case "list": {
        const arr: any[] = [];
        const itemSpec: any[] = node.items;
        const parseOne = (): any => {
          const item: any = {};
          state.scopeStack.push(item);
          parseSpecList(state, item, itemSpec, schema);
          state.scopeStack.pop();
          return item;
        };
        if (node.count) {
          const count = ensureNumber(evalExpression(state, node.count.expr));
          for (let i = 0; i < count; i++) {
            const item = parseOne();
            arr.push(item);
          }
        } else if (node.read_until) {
          while (true) {
            const item = parseOne();
            arr.push(item);
            // 使用刚刚读到的 item 作为 $. 作用域来判断终止条件
            state.scopeStack.push(item);
            const cond = evalExpression(state, node.read_until.expr);
            state.scopeStack.pop();
            if (cond) break;
          }
        } else {
          throw new Error("list 缺少 count 或 read_until 定义");
        }
        setField(targetObj, node.id, arr);
        break;
      }
      case "template_ref": {
        const tpl = schema.template[node.id];
        if (!tpl) throw new Error(`未找到模板: ${node.id}`);
        const params: Record<string, number> = {};
        if (node.params) {
          const entries = Object.entries(node.params) as Array<[
            string,
            { type: "ref" | "param_ref"; id: string }
          ]>;
          for (const [k, v] of entries) {
            if (v.type === "ref") params[k] = ensureNumber(evalRef(state, v.id));
            else if (v.type === "param_ref") params[k] = ensureNumber(evalParamRef(state, v.id));
          }
        }
        state.paramsStack.push(params);
        const tempObj: any = {};
        const tplSpec = Array.isArray(tpl.spec) ? tpl.spec : [tpl.spec];
        parseSpecList(state, tempObj, tplSpec, schema);
        state.paramsStack.pop();
        // 合并模板结果到当前对象
        for (const key of Object.keys(tempObj)) {
          setField(targetObj, key, tempObj[key]);
        }
        break;
      }
      case "if": {
        const cond = evalRef(state, node.condition.id);
        if (cond) {
          parseSpecList(state, targetObj, node.spec, schema);
        }
        break;
      }
      case "switch": {
        const onValue = ensureNumber(evalRef(state, node.on.id));
        const key = String(onValue);
        const cases = node.cases as Record<string, any[]>;
        const chosen = cases.hasOwnProperty(key) ? cases[key] : cases["default"];
        if (chosen) {
          parseSpecList(state, targetObj, chosen, schema);
        }
        break;
      }
      case "loop_list": {
        const arr: any[] = [];
        while (true) {
          const item: any = {};
          state.scopeStack.push(item);
          const prevBreak: boolean = state.breakLoop;
          state.breakLoop = false;
          parseSpecList(state, item, node.spec, schema);
          const didBreak = state.breakLoop;
          state.breakLoop = prevBreak; // 恢复
          state.scopeStack.pop();
          if (didBreak) {
            break;
          }
          arr.push(item);
        }
        setField(targetObj, node.id, arr);
        break;
      }
      case "break_loop": {
        state.breakLoop = true;
        break;
      }
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }
  }
}

export function parseWithSchema(buffer: ArrayBuffer, schema: Schema): any {
  const state = createState(buffer, schema);
  // 读取 GIF 签名跳过，由 schema 自身控制
  const spec = schema.spec;
  parseSpecList(state, state.root, spec, schema);
  return state.root;
}

export function parseGif(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, gif);
}

 