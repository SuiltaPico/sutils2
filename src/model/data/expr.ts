import {
  type ExpressionTerm,
  type Expression,
  type Operator,
  type Call,
  type Ref,
  ExpressionType,
} from "./base";

export function ensureNumber(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return Number(value);
  return Number(value);
}

export function resolvePath(obj: any, path: string): any {
  if (!obj) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as any)[p];
  }
  return cur;
}

export function applyOp(op: Operator["value"], left: any, right: any): any {
  if (op === "+") return ensureNumber(left) + ensureNumber(right);
  if (op === "*") return ensureNumber(left) * ensureNumber(right);
  if (op === "/") return ensureNumber(left) / ensureNumber(right);
  if (op === "pow") return Math.pow(ensureNumber(left), ensureNumber(right));
  if (op === "-") return ensureNumber(left) - ensureNumber(right);
  if (op === "ge") return ensureNumber(left) >= ensureNumber(right);
  if (op === "le") return ensureNumber(left) <= ensureNumber(right);
  if (op === "gt") return ensureNumber(left) > ensureNumber(right);
  if (op === "lt") return ensureNumber(left) < ensureNumber(right);
  if (op === "eq") {
    if (typeof left === "string" || typeof right === "string") {
      return String(left) === String(right);
    }
    if (typeof left === "boolean" || typeof right === "boolean") {
      return Boolean(left) === Boolean(right);
    }
    const le_is_nil = left === null || left === undefined;
    const ri_is_nil = right === null || right === undefined;
    if (le_is_nil && ri_is_nil) {
      return true;
    }
    if (le_is_nil || ri_is_nil) {
      return false;
    }
    return ensureNumber(left) === ensureNumber(right);
  }
  if (op === "ne") {
    if (typeof left === "string" || typeof right === "string") {
      return String(left) !== String(right);
    }
    if (typeof left === "boolean" || typeof right === "boolean") {
      return Boolean(left) !== Boolean(right);
    }
    const le_is_nil = left === null || left === undefined;
    const ri_is_nil = right === null || right === undefined;
    if (le_is_nil && ri_is_nil) {
      return false;
    }
    if (le_is_nil || ri_is_nil) {
      return true;
    }
    return ensureNumber(left) !== ensureNumber(right);
  }
  if (op === "access") {
    if (right == null) return undefined;
    const key = typeof right === "string" ? right : String(right);
    if (left == null) return undefined;
    return (left as any)[key];
  }
  throw new Error(`不支持的操作符: ${op}`);
}

export type EvalHooks = {
  getRef: (id: string) => any;
  call?: (
    callee: any,
    call: Call,
    evalTerm: (t: ExpressionTerm) => any,
    evalExpression: (e: Expression["expr"]) => any
  ) => any;
};

export function evalTermWith(hooks: EvalHooks, term: ExpressionTerm): any {
  switch (term.type) {
    case ExpressionType.Ref:
      return hooks.getRef((term as Ref).id);
    case ExpressionType.UintLiteral:
      return (term as any).value as number;
    case ExpressionType.TextLiteral:
      return (term as any).value as string;
    case ExpressionType.NilLiteral:
      return null;
    case ExpressionType.BooleanLiteral:
      return (term as any).value as boolean;
    case ExpressionType.Expression:
      return evalExpressionWith(hooks, (term as Expression).expr);
    case ExpressionType.Operator:
      return (term as Operator).value;
    case ExpressionType.MatchExpr: {
      const cond = evalTermWith(hooks, (term as any).condition);
      const cases = (term as any).cases as any[];
      for (const c of cases || []) {
        const item = evalTermWith(hooks, c.item);
        if (item === cond) {
          const ch = c.children as any;
          if (ch?.type === "expr") return evalExpressionWith(hooks, ch.expr);
          return evalTermWith(hooks, ch);
        }
      }
      return undefined;
    }
    case ExpressionType.Call: {
      // Call 的求值在 evalExpressionWith 流程中处理，这里返回占位
      return term;
    }
    default:
      return undefined;
  }
}

export function evalExpressionWith(
  hooks: EvalHooks,
  expr: Expression["expr"]
): any {
  if (!expr || expr.length === 0) return undefined;
  let acc: any = evalTermWith(hooks, expr[0] as ExpressionTerm);
  let i = 1;
  while (i < expr.length) {
    const term = expr[i] as ExpressionTerm;
    if (term.type === ExpressionType.Operator) {
      const rightTerm = expr[i + 1] as ExpressionTerm;
      const op = (term as Operator).value;
      const right = evalTermWith(hooks, rightTerm);
      acc = applyOp(op, acc, right);
      i += 2;
      continue;
    }
    if (term.type === ExpressionType.Call) {
      if (!hooks.call) throw new Error("当前上下文不支持函数调用");
      acc = hooks.call(
        acc,
        term as Call,
        (t) => evalTermWith(hooks, t),
        (e) => evalExpressionWith(hooks, e)
      );
      i += 1;
      continue;
    }
    throw new Error("表达式语法错误，未知项: " + String((term as any)?.type));
  }
  return acc;
}
