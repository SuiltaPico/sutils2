import { gif_ps } from "../app/gif/parse";
import { jpeg_ps } from "../app/jpeg/parse";
import { png_ps } from "../app/png/parse";
import { ExpressionType, type ExpressionTerm, type Ref } from "../base";
import { ensureNumber, evalExpressionWith, resolvePath } from "../expr";
import { ByteOrder, type ParseSchema } from "./type";

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
  // 自增 id 以追踪循环边界等（可扩展）
};

function createState(buffer: ArrayBuffer, schema: ParseSchema): ParseState {
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
    throw new RangeError(
      `读取越界: uint(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`
    );
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
    throw new RangeError(
      `读取越界: ascii(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`
    );
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
    throw new RangeError(
      `读取越界: bytes(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`
    );
  }
  const arr = new Uint8Array(
    state.view.buffer,
    state.view.byteOffset + state.offset,
    length
  );
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

function evalRef(state: ParseState, id: string): any {
  if (id.startsWith("$.")) {
    const scope = getCurrentScope(state);
    return resolvePath(scope, id.slice(2));
  }
  // 无前缀：优先在当前作用域解析，找不到再回退根作用域
  const scope = getCurrentScope(state);
  const inScope = resolvePath(scope, id);
  if (inScope !== undefined) return inScope;
  // 再次尝试从模板参数栈解析（统一 ref 语义可引用模板参数）
  if (state.paramsStack.length > 0) {
    const topParams = state.paramsStack[state.paramsStack.length - 1];
    const inParams = topParams[id];
    if (inParams !== undefined) return inParams;
  }
  return resolvePath(state.root, id);
}

function evalTerm(state: ParseState, term: ExpressionTerm): any {
  switch (term.type) {
    case ExpressionType.Ref:
      return evalRef(state, term.id);
    case ExpressionType.UintLiteral:
      return term.value;
    case ExpressionType.Expression:
      return evalExpression(state, term.expr);
    case ExpressionType.Operator:
      return term.value; // 由上层处理
    default:
      return undefined;
  }
}

function evalExpression(state: ParseState, expr: ExpressionTerm[]): any {
  return evalExpressionWith(
    {
      getRef: (id: string) => evalRef(state, id),
      call: (callee: any, call: any, _evalTerm: (t: any) => any, _evalExpr: (e: any) => any) => {
        // 解析层内置函数
        const args = (call.children || []).map((child: any) =>
          child?.type === ExpressionType.Expression ? _evalExpr(child.expr) : _evalTerm(child)
        );
        if (typeof callee === "string") {
          // list::sum(list[, key])
          if (callee === "list::sum") {
            const list = Array.isArray(args[0]) ? args[0] : [];
            const key = args.length >= 2 ? args[1] : undefined;
            let s = 0;
            for (const it of list) {
              if (key != null && typeof key === "string") {
                const v = it != null ? (it as any)[key] : undefined;
                if (typeof v === "number") s += v;
              } else if (typeof it === "number") {
                s += it;
              }
            }
            return s >>> 0;
          }
          // list::length(list)
          if (callee === "list::length") {
            const list = Array.isArray(args[0]) ? args[0] : [];
            return list.length >>> 0;
          }
        }
        return undefined;
      },
    },
    expr as unknown as any
  );
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

function parseSpecList(
  state: ParseState,
  targetObj: any,
  specList: any[],
  schema: ParseSchema
): void {
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
        const len =
          typeof node.length === "number"
            ? node.length
            : ensureNumber(evalRef(state, node.length.id));
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
            // evaluate push_condition in item's scope
            if (node.push_condition) {
              state.scopeStack.push(item);
              const cond = evalExpression(state, node.push_condition.expr);
              state.scopeStack.pop();
              if (!cond) continue;
            }
            arr.push(item);
          }
        } else if (node.read_until) {
          while (true) {
            const item = parseOne();
            // evaluate push_condition in item's scope
            if (node.push_condition) {
              state.scopeStack.push(item);
              const allow = evalExpression(state, node.push_condition.expr);
              state.scopeStack.pop();
              if (allow) arr.push(item);
            } else {
              arr.push(item);
            }
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
          for (const [k, v] of Object.entries(node.params)) {
            if ((v as any).type === ExpressionType.Ref) {
              params[k] = ensureNumber(evalRef(state, (v as Ref).id));
            }
          }
        }
        state.paramsStack.push(params);
        const tempObj: any = {};
        const tplSpec = Array.isArray(tpl.spec) ? tpl.spec : [tpl.spec];
        // 在模板解析期间，将模板对象压入作用域栈，
        // 以便模板内部表达式能引用同级已解析字段（如 length）。
        state.scopeStack.push(tempObj);
        parseSpecList(state, tempObj, tplSpec, schema);
        state.scopeStack.pop();
        state.paramsStack.pop();
        // 合并模板结果到当前对象
        for (const key of Object.keys(tempObj)) {
          setField(targetObj, key, tempObj[key]);
        }
        break;
      }
      case "if": {
        let cond: any = false;
        const c: any = (node as any).condition;
        if (c?.type === ExpressionType.Expression) {
          cond = evalExpression(state, c.expr);
        } else {
          cond = evalRef(state, c.id);
        }
        if (cond) {
          parseSpecList(state, targetObj, (node as any).spec, schema);
        }
        break;
      }
      case "switch": {
        const onRaw: any = evalRef(state, node.on.id);
        const key =
          typeof onRaw === "string" ? onRaw : String(ensureNumber(onRaw));
        const cases = node.cases as Record<string, any[]>;
        const chosen = cases.hasOwnProperty(key)
          ? cases[key]
          : cases["default"];
        if (chosen) {
          parseSpecList(state, targetObj, chosen, schema);
        }
        break;
      }
      case "read_until_marker": {
        // 读取字节直到遇到 0xFF 且下一个字节不是 0x00（stuffing）且不在 RSTn (0xD0-0xD7)
        const bytes: number[] = [];
        const view = state.view;
        const total = view.byteLength;
        let i = 0;
        while (state.offset + i < total) {
          const b = view.getUint8(state.offset + i);
          if (b === 0xff) {
            if (state.offset + i + 1 >= total) {
              // 文件结束，停止，保留 0xFF 未消耗（不推进）
              break;
            }
            const next = view.getUint8(state.offset + i + 1);
            // 0xFF00: stuffing，当作数据吞掉两个字节
            if (next === 0x00) {
              bytes.push(0xff, 0x00);
              i += 2;
              continue;
            }
            // RSTn: 0xD0..0xD7，吞掉两个字节继续
            if (next >= 0xd0 && next <= 0xd7) {
              bytes.push(0xff, next);
              i += 2;
              continue;
            }
            // 遇到真正的段标记，停止在 0xFF（不消耗）
            break;
          }
          bytes.push(b);
          i += 1;
        }
        // 推进 offset 但不消耗终止的 0xFF
        state.offset += i;
        setField(targetObj, (node as any).id, new Uint8Array(bytes));
        break;
      }
      case "read_until_prefixed": {
        const n = node as any;
        const prefix: number = Number(n.prefix) >>> 0;
        const passthroughValues: number[] = Array.isArray(
          n.next_passthrough_values
        )
          ? n.next_passthrough_values.map((x: any) => Number(x) >>> 0)
          : [];
        const passthroughRanges: Array<{ from: number; to: number }> =
          Array.isArray(n.next_passthrough_ranges)
            ? n.next_passthrough_ranges.map((r: any) => ({
                from: Number(r.from) >>> 0,
                to: Number(r.to) >>> 0,
              }))
            : [];
        const isPassthrough = (v: number): boolean => {
          if (passthroughValues.includes(v)) return true;
          for (const r of passthroughRanges) {
            if (v >= r.from && v <= r.to) return true;
          }
          return false;
        };
        const bytes: number[] = [];
        const view = state.view;
        const total = view.byteLength;
        let i = 0;
        while (state.offset + i < total) {
          const b = view.getUint8(state.offset + i);
          if (b === prefix) {
            if (state.offset + i + 1 >= total) break;
            const next = view.getUint8(state.offset + i + 1);
            if (isPassthrough(next)) {
              bytes.push(prefix, next);
              i += 2;
              continue;
            }
            break; // 命中终止，停在前缀处
          }
          bytes.push(b);
          i += 1;
        }
        state.offset += i; // 不消耗终止前缀
        setField(targetObj, n.id, new Uint8Array(bytes));
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
          if (node.push_condition) {
            state.scopeStack.push(item);
            const allow = evalExpression(state, node.push_condition.expr);
            state.scopeStack.pop();
            if (allow) {
              arr.push(item);
            }
          } else {
            arr.push(item);
          }
          if (didBreak) {
            break;
          }
        }
        setField(targetObj, node.id, arr);
        break;
      }
      case "break_loop": {
        state.breakLoop = true;
        break;
      }
      case "loop_until_consumed": {
        // 记录进入时的偏移量
        const startOffset = state.offset;
        const outArr: any[] = [];
        // 计算应消费字节数（目标长度）
        const expectedBytes = ensureNumber(evalExpression(state, (node as any).length_expr.expr));
        while (state.offset - startOffset < expectedBytes) {
          const item: any = {};
          state.scopeStack.push(item);
          parseSpecList(state, item, (node as any).spec, schema);
          state.scopeStack.pop();
          outArr.push(item);
          // 防止死循环（若子 spec 未推进 offset）
          if (state.offset - startOffset > expectedBytes) break;
          if ((node as any).spec == null || (node as any).spec.length === 0) break;
        }
        setField(targetObj, (node as any).id, outArr);
        break;
      }
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }
  }
}

export function parseWithSchema(buffer: ArrayBuffer, schema: ParseSchema): any {
  const state = createState(buffer, schema);
  // 读取 GIF 签名跳过，由 schema 自身控制
  const spec = schema.spec;
  parseSpecList(state, state.root, spec, schema);
  return state.root;
}

export function parseGif(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, gif_ps);
}

export function parsePng(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, png_ps);
}

export function parseJpeg(buffer: ArrayBuffer): any {
  return parseWithSchema(buffer, jpeg_ps);
}
