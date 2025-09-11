import { gif_ps } from "../app/gif/parse";
import { jpeg_ps } from "../app/jpeg/parse";
import { png_ps } from "../app/png/parse";
import { wav_ps } from "../app/wav/parse";
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
  // 控制 loop_list 的中断（旧）
  breakLoop: boolean;
  // 有界作用域起始偏移（用于 align basis="scope"）
  boundedStartStack: number[];
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
    boundedStartStack: [],
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

function readInt(state: ParseState, length: number): number {
  if (state.offset + length > state.view.byteLength) {
    throw new RangeError(
      `读取越界: int(${length}) at ${state.offset}, 总长度 ${state.view.byteLength}`
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
  // 符号扩展
  const bits = length * 8;
  if ((result & (1 << (bits - 1))) !== 0) {
    result = result - (1 << bits);
  }
  state.offset += length;
  return result;
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

function readBytesLenient(state: ParseState, length: number): Uint8Array {
  const remaining = state.view.byteLength - state.offset;
  const safeLen = Math.max(0, Math.min(remaining, length));
  const arr = new Uint8Array(
    state.view.buffer,
    state.view.byteOffset + state.offset,
    safeLen
  );
  state.offset += safeLen;
  return new Uint8Array(arr);
}

function skip(state: ParseState, length: number): void {
  state.offset += length;
}

// EBML VINT: 读取长度前缀位来确定总长度
function ebmlVintLength(firstByte: number): number {
  for (let len = 1; len <= 8; len++) {
    const mask = 1 << (8 - len);
    if ((firstByte & mask) !== 0) return len;
  }
  return 1;
}

function readEbmlVintId(state: ParseState): { value: number; length: number } {
  if (state.offset >= state.view.byteLength) throw new RangeError("读取越界: ebml_vint_id");
  const b0 = state.view.getUint8(state.offset);
  const len = ebmlVintLength(b0);
  if (state.offset + len > state.view.byteLength) throw new RangeError("读取越界: ebml_vint_id len");
  let v = 0;
  for (let i = 0; i < len; i++) v = (v << 8) | state.view.getUint8(state.offset + i);
  state.offset += len;
  return { value: v >>> 0, length: len };
}

function readEbmlVintSize(state: ParseState): { value: number; length: number } {
  if (state.offset >= state.view.byteLength) throw new RangeError("读取越界: ebml_vint_size");
  const b0 = state.view.getUint8(state.offset);
  const len = ebmlVintLength(b0);
  if (state.offset + len > state.view.byteLength) throw new RangeError("读取越界: ebml_vint_size len");
  let v = b0 & ((1 << (8 - len)) - 1);
  for (let i = 1; i < len; i++) v = (v << 8) | state.view.getUint8(state.offset + i);
  state.offset += len;
  return { value: v >>> 0, length: len };
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
  // 无前缀：沿作用域栈由内向外查找
  for (let i = state.scopeStack.length - 1; i >= 0; i--) {
    const scope = state.scopeStack[i];
    const found = resolvePath(scope, id);
    if (found !== undefined) return found;
  }
  // 再次尝试从模板参数栈解析（统一 ref 语义可引用模板参数）
  if (state.paramsStack.length > 0) {
    const topParams = state.paramsStack[state.paramsStack.length - 1];
    const inParams = topParams[id];
    if (inParams !== undefined) return inParams;
  }
  // 最后回退到根
  return resolvePath(state.root, id);
}

function evalExprTerms(state: ParseState, expr: ExpressionTerm[]): any {
  return evalExpressionWith(
    {
      getRef: (id: string) => evalRef(state, id),
      call: (callee: any, call: any, _evalTerm: (t: any) => any, _evalExpr: (e: any) => any) => {
        // 解析层内置函数（与下方 evalExpression 保持一致）
        const args = (call.children || []).map((child: any) =>
          child?.type === ExpressionType.Expression ? _evalExpr(child.expr) : _evalTerm(child)
        );
        if (typeof callee === "string") {
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

function evalTermAny(state: ParseState, term: ExpressionTerm): any {
  if (!term) return undefined;
  // 将单个 term 视为表达式求值，确保 TextLiteral/BooleanLiteral/Call 等都能正常计算
  return evalExprTerms(state, [term]);
}

function evalToNumber(state: ParseState, termOrNum: ExpressionTerm | number): number {
  if (typeof termOrNum === "number") return termOrNum;
  return ensureNumber(evalTermAny(state, termOrNum));
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
      case "ebml_vint_id": {
        const r = readEbmlVintId(state);
        setField(targetObj, (node as any).id, r.value >>> 0);
        break;
      }
      case "ebml_vint_size": {
        const r = readEbmlVintSize(state);
        setField(targetObj, (node as any).id, r.value >>> 0);
        break;
      }
      case "uint": {
        const v = readUint(state, node.length);
        if ((node as any).emit === false) {
          // 不输出
        } else {
          setField(targetObj, node.id, v);
        }
        break;
      }
      case "int": {
        const v = readInt(state, node.length);
        if ((node as any).emit === false) {
          // 不输出
        } else {
          setField(targetObj, node.id, v);
        }
        break;
      }
      case "ascii": {
        const s = readAscii(state, node.length);
        setField(targetObj, node.id, s);
        break;
      }
      case "bytes": {
        const len = evalToNumber(state, (node as any).length);
        const b = readBytes(state, len);
        if ((node as any).emit === false) {
          // 不输出
        } else {
          setField(targetObj, node.id, b);
        }
        break;
      }
      case "bytes_lenient": {
        const len = evalToNumber(state, (node as any).length);
        const b = readBytesLenient(state, len);
        if ((node as any).emit === false) {
          // 不输出
        } else {
          setField(targetObj, node.id, b);
        }
        break;
      }
      case "skip": {
        skip(state, node.length);
        break;
      }
      case "skip_if_odd": {
        const v = ensureNumber(evalRef(state, (node as any).ref.id));
        if ((v & 1) === 1) skip(state, 1);
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
          const startOffset = state.offset;
          state.scopeStack.push(item);
          parseSpecList(state, item, itemSpec, schema);
          state.scopeStack.pop();
          // Inject special variables into the item
          item.__start_offset__ = startOffset;
          item.__end_offset__ = state.offset;
          return item;
        };
        if ((node as any).count) {
          const count = ensureNumber(
            (node as any).count?.type === ExpressionType.Expression
              ? evalExpression(state, (node as any).count.expr)
              : evalExprTerms(state, [(node as any).count])
          );
          for (let i = 0; i < count; i++) {
            const item = parseOne();
            let emit = true;
            if ((node as any).emit_when) {
              state.scopeStack.push(item);
              emit = Boolean(
                (node as any).emit_when.type === ExpressionType.Expression
                  ? evalExpression(state, (node as any).emit_when.expr)
                  : evalExprTerms(state, [(node as any).emit_when])
              );
              state.scopeStack.pop();
            }
            if (emit) arr.push(item);
          }
        } else {
          while (true) {
            const item = parseOne();
            let emit = true;
            if ((node as any).emit_when) {
              state.scopeStack.push(item);
              emit = Boolean(
                (node as any).emit_when.type === ExpressionType.Expression
                  ? evalExpression(state, (node as any).emit_when.expr)
                  : evalExprTerms(state, [(node as any).emit_when])
              );
              state.scopeStack.pop();
            }
            if (emit) arr.push(item);
            // 判断停止条件：优先 stop_when，其次 read_until（保持旧语义）
            let shouldStop = false;
            if ((node as any).stop_when) {
              state.scopeStack.push(item);
              shouldStop = Boolean(
                (node as any).stop_when.type === ExpressionType.Expression
                  ? evalExpression(state, (node as any).stop_when.expr)
                  : evalExprTerms(state, [(node as any).stop_when])
              );
              state.scopeStack.pop();
            } else if ((node as any).read_until) {
              state.scopeStack.push(item);
              shouldStop = Boolean(
                (node as any).read_until.type === ExpressionType.Expression
                  ? evalExpression(state, (node as any).read_until.expr)
                  : evalExprTerms(state, [(node as any).read_until])
              );
              state.scopeStack.pop();
            }
            if (shouldStop) break;
          }
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
            params[k] = ensureNumber(
              (v as any).type === ExpressionType.Expression
                ? evalExpression(state, (v as any).expr)
                : evalExprTerms(state, [v as any])
            );
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
        const onRaw: any =
          (node as any).on?.type === ExpressionType.Expression
            ? evalExpression(state, (node as any).on.expr)
            : evalExprTerms(state, [(node as any).on]);
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
        // 旧节点不再支持
        throw new Error("read_until_marker 已移除");
      }
      case "read_until_prefixed": {
        // 旧节点不再支持
        throw new Error("read_until_prefixed 已移除");
      }
      case "bounded": {
        const lengthBytes = ensureNumber(evalTermAny(state, (node as any).length_expr));
        const start = state.offset;
        // 防止 EBML 未知长度（全 1）导致的越界，将 end 限制在文件总长度以内
        const total = state.view.byteLength;
        const end = Math.min(total, start + lengthBytes);
        const items: any[] = [];
        state.boundedStartStack.push(start);
        while (state.offset < end) {
          const before = state.offset;
          const item: any = {};
          state.scopeStack.push(item);
          parseSpecList(state, item, (node as any).spec, schema);
          state.scopeStack.pop();
          if (Object.keys(item).length > 0) items.push(item);
          if (state.offset === before) {
            // 防止死循环，若未推进则跳出
            break;
          }
        }
        state.boundedStartStack.pop();
        // 若越界，回退到 end
        if (state.offset > end) {
          state.offset = end;
        } else if (state.offset < end) {
          // 补齐未消费字节
          skip(state, end - state.offset);
        }
        if ((node as any).id) setField(targetObj, (node as any).id, items);
        break;
      }
      case "align": {
        const to = Number((node as any).to) >>> 0;
        let base = 0;
        const basis = (node as any).basis;
        if (basis === "scope") {
          base = state.boundedStartStack.length > 0 ? state.boundedStartStack[state.boundedStartStack.length - 1] : 0;
        } else if (basis === "global" || basis == null) {
          base = 0;
        } else {
          base = ensureNumber(evalTermAny(state, basis));
        }
        const rel = state.offset - base;
        const rem = rel % to;
        if (rem !== 0) skip(state, to - rem);
        break;
      }
      case "with_byte_order": {
        const prev = state.byteOrder;
        state.byteOrder = (node as any).byte_order;
        parseSpecList(state, targetObj, (node as any).spec, schema);
        state.byteOrder = prev;
        break;
      }
      case "assert": {
        const ok = Boolean(evalTermAny(state, (node as any).condition));
        if (!ok) throw new Error((node as any).message ?? "断言失败");
        break;
      }
      case "let": {
        const val = evalTermAny(state, (node as any).expr);
        setField(targetObj, (node as any).id, val);
        break;
      }
      case "set": {
        const val = evalTermAny(state, (node as any).expr);
        setField(targetObj, (node as any).id, val);
        break;
      }
      // =======================================================
      // 新增通用词法解析节点实现
      // =======================================================
      case "skip_ws": {
        const view = state.view;
        const total = view.byteLength;
        let i = 0;
        while (state.offset + i < total) {
          const b = view.getUint8(state.offset + i);
          // PDF Whitespace: NULL(0), HT(9), LF(10), FF(12), CR(13), SP(32)
          if (b === 0 || b === 9 || b === 10 || b === 12 || b === 13 || b === 32) {
            i++;
          } else {
            break;
          }
        }
        state.offset += i;
        break;
      }
      case "peek_bytes": {
        const n = node as any;
        const len = evalToNumber(state, n.length);
        const bytes = readBytesLenient({ ...state, offset: state.offset }, len); // Read without advancing state's offset
        setField(targetObj, n.id, bytes);
        break;
      }
      case "ascii_until": {
        const n = node as any;
        const terminators = new Set(n.terminators as number[]);
        const maxLen = n.max_len ?? 8192;
        const view = state.view;
        const total = view.byteLength;
        const bytes: number[] = [];
        let i = 0;
        while (state.offset + i < total && i < maxLen) {
          const b = view.getUint8(state.offset + i);
          if (terminators.has(b)) {
            break; // Terminator found, stop before it
          }
          bytes.push(b);
          i++;
        }
        state.offset += i;
        setField(targetObj, n.id, String.fromCharCode(...bytes));
        break;
      }
      case "bytes_until_seq": {
        const n = node as any;
        const seq = n.seq as number[];
        const maxLen = n.max_len ?? state.view.byteLength; // Limit search range
        const view = state.view;
        const start = state.offset;
        const end = Math.min(view.byteLength, start + maxLen);
        let found = -1;
        for (let i = start; i <= end - seq.length; i++) {
          let match = true;
          for (let j = 0; j < seq.length; j++) {
            if (view.getUint8(i + j) !== seq[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            found = i;
            break;
          }
        }

        if (found !== -1) {
          const len = found - start;
          const content = readBytes(state, len);
          setField(targetObj, n.id, content);
        } else {
          // Sequence not found, read up to maxLen and stop
          const len = end - start;
          const content = readBytes(state, len);
          setField(targetObj, n.id, content);
        }
        break;
      }
      // =======================================================
      case "bytes_until_prefixed": {
        const n = node as any;
        const prefix: number = Number(n.prefix) >>> 0;
        const passthroughValues: number[] = Array.isArray(n.passthrough_values)
          ? n.passthrough_values.map((x: any) => Number(x) >>> 0)
          : [];
        const passthroughRanges: Array<{ from: number; to: number }> = Array.isArray(n.passthrough_ranges)
          ? n.passthrough_ranges.map((r: any) => ({ from: Number(r.from) >>> 0, to: Number(r.to) >>> 0 }))
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
      // 旧循环节点均已删除
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }
  }
}

export function parseWithSchema(buffer: ArrayBuffer, schema: ParseSchema): any {
  const state = createState(buffer, schema);
  // 读取 GIF 签名跳过，由 schema 自身控制
  const spec = schema.spec;
  // 将输入总长度注入根作用域，供表达式引用
  (state.root as any)["__input_length__"] = state.view.byteLength >>> 0;
  parseSpecList(state, state.root, spec, schema);
  return state.root;
}