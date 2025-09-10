import { For, onMount, createEffect } from "solid-js";
import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { DisplayNode, DisplaySchema } from "./type";
import { type ExpressionTerm, type Expression, type Ref, type Operator, type Call, ExpressionType, type UintLiteral, type TextLiteral } from "../base";
import { ensureNumber, resolvePath, applyOp, evalExpressionWith } from "../expr";

// ============================
// 显示层表达式求值（与解析层分离）
// ============================

export type EvalContext = {
  variables: Record<string, any>;
};

// ================
// 节点渲染器注册表
// ================
export type DisplayNodeRenderer = (
  node: any,
  ctx: any,
  schema: DisplaySchema
) => JSX.Element | undefined;

const nodeRendererRegistry: Record<string, DisplayNodeRenderer> = {};

export function registerDisplayNodeRenderer(
  type: string,
  renderer: DisplayNodeRenderer
) {
  nodeRendererRegistry[type] = renderer;
}

// 供显示层表达式调用的全局函数注册表
const functionRegistry: Record<string, (...args: any[]) => any> = {};
export function registerFunction(name: string, fn: (...args: any[]) => any) {
  functionRegistry[name] = fn;
}

function evalRef(ctx: EvalContext, ref: Ref): any {
  const id = ref.id;
  if (id.startsWith("$.")) {
    // 对显示层，暂不引入作用域栈；若有需要可扩展
    const path = id.slice(2);
    return resolvePath(ctx.variables, path);
  }
  return resolvePath(ctx.variables, id);
}


export function evalTerm(ctx: EvalContext, term: ExpressionTerm): any {
  switch (term.type) {
    case ExpressionType.Ref:
      return evalRef(ctx, term as Ref);
    case ExpressionType.UintLiteral:
      return (term as UintLiteral).value;
    case ExpressionType.TextLiteral:
      return (term as TextLiteral).value;
    case ExpressionType.BooleanLiteral:
      return (term as any).value as boolean;
    case ExpressionType.Expression:
      return evalExpression(ctx, (term as Expression).expr);
    case ExpressionType.Operator:
      return (term as Operator).value; // 由上层处理
    case ExpressionType.MatchExpr: {
      const cond = evalTerm(ctx, (term as any).condition);
      const cases = (term as any).cases as any[];
      for (const c of cases || []) {
        const item = evalTerm(ctx, c.item);
        if (item === cond) {
          // children 可以是表达式或字面量
          const ch = c.children as any;
          if (ch?.type === "expr") return evalExpression(ctx, ch.expr);
          return evalTerm(ctx, ch);
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function evalCall(ctx: EvalContext, callee: any, call: Call): any {
  const args = (call.children || []).map((child) => {
    if ((child as any).type === "expr")
      return evalExpression(ctx, (child as Expression).expr);
    return evalTerm(ctx, child as ExpressionTerm);
  });
  // 直接可调用
  if (typeof callee === "function") return callee(...args);
  // 支持通过名称调用内置函数（当上一步返回字符串或未解析到函数时）
  if (typeof callee === "string") {
    const fn = (ctx.variables as any)[callee];
    if (typeof fn === "function") return fn(...args);
  }
  return undefined;
}

export function evalExpression(ctx: EvalContext, expr: Expression["expr"]): any {
  return evalExpressionWith(
    {
      getRef: (id: string) => resolvePath(ctx.variables, id.startsWith("$.") ? id.slice(2) : id),
      call: (callee: any, call: Call, _evalTerm, _evalExpr) => {
        const args = (call.children || []).map((child) =>
          (child as any).type === "expr" ? _evalExpr((child as Expression).expr) : _evalTerm(child as ExpressionTerm)
        );
        if (typeof callee === "function") return callee(...args);
        if (typeof callee === "string") {
          const fn = (ctx.variables as any)[callee];
          if (typeof fn === "function") return fn(...args);
        }
        return undefined;
      },
    },
    expr
  );
}

function clampToByte(n: any): number {
  const v = ensureNumber(n);
  if (!Number.isFinite(v)) return 0;
  const r = Math.round(v);
  if (r < 0) return 0;
  if (r > 255) return 255;
  return r;
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

function renderNode(
  node: DisplayNode,
  ctx: EvalContext,
  schema: DisplaySchema
): JSX.Element {
  // 先查找是否有外部注册的渲染器
  const external = nodeRendererRegistry[(node as any).type];
  if (external) return external(node, ctx, schema);
  if (node.type === "text") {
    return <span class={node.class ?? ""}>{node.value}</span>;
  }
  if (node.type === "table_map") {
    const matrix =
      (node as any).provider?.type === ExpressionType.Expression
        ? evalExpression(ctx, ((node as any).provider as any).expr)
        : evalTerm(ctx, (node as any).provider);
    const rows: any[] = Array.isArray(matrix) ? matrix : [];
    const auto = Boolean((node as any).auto_headers);
    const cols = rows.length > 0 && Array.isArray(rows[0]) ? (rows[0] as any[]).length : 0;
    const heatmap = Boolean((node as any).heatmap);
    const axisLabels = (node as any).axis_labels || {};
    const showCoordTitle = Boolean((node as any).show_coord_title);
    // 计算 heatmap 范围
    let minV = Infinity;
    let maxV = -Infinity;
    if (heatmap) {
      for (const r of rows) {
        if (!Array.isArray(r)) continue;
        for (const v of r) {
          const n = Number(v);
          if (!Number.isFinite(n)) continue;
          if (n < minV) minV = n;
          if (n > maxV) maxV = n;
        }
      }
      if (!Number.isFinite(minV)) minV = 0;
      if (!Number.isFinite(maxV)) maxV = 1;
      if (maxV === minV) maxV = minV + 1;
    }
    const colorFor = (n: any) => {
      if (!heatmap) return undefined as any;
      const v = Number(n);
      const t = (v - minV) / (maxV - minV);
      // 黑白灰度：高值更暗（突出强量化区域）
      const lum = Math.round(255 * (1 - t));
      const textColor = lum < 80 ? '#fff' : '#000';
      return `background-color: rgb(${lum},${lum},${lum}); color: ${textColor};`;
    };
    return (
      <table class={node.class ?? "border-collapse text-xs"} style="border: 1px solid #ccc;">
        <tbody>
          {auto && (
            <tr>
              <td></td>
              <For each={[...Array(cols).keys()] as any}>
                {(ci: number) => {
                  const label = axisLabels.col ? `${axisLabels.col} ${ci}` : String(ci);
                  return (
                    <td style="border:1px solid #ddd;padding:2px 4px;min-width:20px;text-align:center;font-weight:600;">{label}</td>
                  );
                }}
              </For>
            </tr>
          )}
          <For each={rows}>
            {(r: any[], ri) => {
              const rowIndex = typeof ri === "function" ? ri() : (ri as any);
              return (
                <tr>
                  {auto && (
                    <td style="border:1px solid #ddd;padding:2px 4px;min-width:20px;text-align:center;font-weight:600;">{axisLabels.row ? `${axisLabels.row} ${rowIndex}` : String(rowIndex)}</td>
                  )}
                  <For each={Array.isArray(r) ? r : []}>
                    {(cell, ci) => {
                      const colIndex = typeof ci === "function" ? ci() : (ci as any);
                      const title = showCoordTitle ? `${rowIndex},${colIndex}: ${String(cell)}` : undefined;
                      return (
                        <td title={title} style={`border:1px solid #ddd;padding:2px 4px;min-width:20px;text-align:right;${colorFor(cell) || ""}`}>{String(cell)}</td>
                      );
                    }}
                  </For>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
    );
  }
  if (node.type === "if") {
    const cond =
      node.condition.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.condition as Expression).expr)
        : evalTerm(ctx, node.condition as ExpressionTerm);
    if (cond) {
      return (
        <>
          <For each={node.children}>
            {(child) => renderNode(child, ctx, schema)}
          </For>
        </>
      );
    }
    return undefined;
  }
  if (node.type === "text_map") {
    const value =
      node.provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.provider as Expression).expr)
        : evalTerm(ctx, node.provider as ExpressionTerm);
    return <span class={node.class ?? ""}>{String(value ?? "")}</span>;
  }
  if (node.type === "info_text") {
    return renderNode(node.value, ctx, schema);
  }
  if (node.type === "rgb_color_map") {
    const r =
      node.r_provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.r_provider as Expression).expr)
        : evalTerm(ctx, node.r_provider as ExpressionTerm);
    const g =
      node.g_provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.g_provider as Expression).expr)
        : evalTerm(ctx, node.g_provider as ExpressionTerm);
    const b =
      node.b_provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.b_provider as Expression).expr)
        : evalTerm(ctx, node.b_provider as ExpressionTerm);
    const hex = `#${toHex2(clampToByte(r))}${toHex2(clampToByte(g))}${toHex2(
      clampToByte(b)
    )}`;
    return <input class="flex-shrink-0" type="color" value={hex} readOnly />;
  }
  if (node.type === "list_map") {
    const listValue =
      node.provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.provider as Expression).expr)
        : evalTerm(ctx, node.provider as ExpressionTerm);
    const items = Array.isArray(listValue) ? listValue : [];
    return (
      <For each={items}>
        {(item, index) => {
          const idxVal = typeof index === "function" ? index() : (index as any);
          const extraIdx = (node as any).index_param
            ? { [(node as any).index_param]: idxVal }
            : {};
          const iterCtx: EvalContext = {
            variables: {
              ...ctx.variables,
              [node.item_param]: item,
              ...extraIdx,
            },
          };
          return (
            <For each={node.children}>
              {(child) => renderNode(child, iterCtx, schema)}
            </For>
          );
        }}
      </For>
    );
  }
  if (node.type === "text_match_map") {
    const value =
      node.provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.provider as Expression).expr)
        : evalTerm(ctx, node.provider as ExpressionTerm);
    let text: string | undefined = undefined;
    if ((node as any).text_matcher) {
      const key = String(value);
      text = ((node as any).text_matcher as Record<string, string>)[key];
    }
    if (text === undefined && typeof value === "boolean") {
      if (value && (node as any).true_value != null)
        text = (node as any).true_value;
      if (!value && (node as any).false_value != null)
        text = (node as any).false_value;
    }
    if (text === undefined) text = String(value ?? "");
    return <span class={node.class ?? ""}>{text}</span>;
  }
  if (node.type === "check_box_map") {
    const value =
      node.provider.type === ExpressionType.Expression
        ? evalExpression(ctx, (node.provider as Expression).expr)
        : evalTerm(ctx, node.provider as ExpressionTerm);
    const checked = Boolean(value);
    return <input type="checkbox" checked={checked} readOnly />;
  }
  if (node.type === "row") {
    return (
      <div
        class={
          node.class ??
          "flex flex-row gap-2 items-center flex-shrink-0 flex-wrap"
        }
      >
        <For each={node.children}>
          {(child) => renderNode(child, ctx, schema)}
        </For>
      </div>
    );
  }
  if (node.type === "column") {
    return (
      <div class={node.class ?? "flex flex-col gap-2 flex-shrink-0 flex-wrap"}>
        <For each={node.children}>
          {(child) => renderNode(child, ctx, schema)}
        </For>
      </div>
    );
  }
  if (node.type === "template_ref") {
    const tpl = schema.template?.[node.id];
    if (!tpl) return undefined;
    const paramVars: Record<string, any> = { ...ctx.variables };
    const params = tpl.params || [];
    for (const p of params) {
      const term = (node as any).params?.[p.id] as ExpressionTerm | undefined;
      let value: any = undefined;
      if (term) {
        value =
          (term as any).type === "expr"
            ? evalExpression(ctx, (term as Expression).expr)
            : evalTerm(ctx, term as ExpressionTerm);
      }
      paramVars[p.id] = value;
    }
    const tplCtx: EvalContext = { variables: paramVars };
    return (
      <>
        <For each={tpl.spec}>
          {(child) => renderNode(child, tplCtx, schema)}
        </For>
      </>
    );
  }
  if (node.type === "table_of_rows") {
    const list =
      (node as any).provider?.type === ExpressionType.Expression
        ? evalExpression(ctx, ((node as any).provider as any).expr)
        : evalTerm(ctx, (node as any).provider);
    const rows = Array.isArray(list) ? list : [];
    const cols = (node as any).columns || [];
    return (
      <table class={node.class ?? "border-collapse text-xs"} style="border: 1px solid #ccc;">
        <thead>
          <tr>
            <For each={cols}>
              {(c: any) => (
                <th style={`border:1px solid #ddd;padding:2px 4px;text-align:left;${c.width ? `width:${c.width};` : ""}`}>{c.title}</th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={rows}>
            {(r: any) => (
              <tr>
                <For each={cols}>
                  {(c: any) => (
                    <td style="border:1px solid #ddd;padding:2px 4px;">{String((r ?? {})[c.key] ?? "")}</td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  }
  if (node.type === "collapse") {
    const [open, setOpen] = createSignal(Boolean((node as any).default_open));
    return (
      <div class={node.class ?? "flex flex-col gap-2"}>
        <div class="flex items-center gap-2">
          <button class="px-2 py-1 border rounded text-xs" onClick={() => setOpen(!open())}>
            {open() ? "收起" : "展开"}
          </button>
          {node.title && <span class="text-sm text-gray-700">{node.title}</span>}
        </div>
        <div>
          <For each={node.summary}>{(child) => renderNode(child, ctx, schema)}</For>
        </div>
        <Show when={open()}>
          <div>
            <For each={node.details}>{(child) => renderNode(child, ctx, schema)}</For>
          </div>
        </Show>
      </div>
    );
  }
  // 其他类型返回空
  return undefined;
}

export function renderDisplay(schema: DisplaySchema, input: any): JSX.Element {
  const builtins: Record<string, (...args: any[]) => any> = {
    "list::size": (list: any) => {
      if (Array.isArray(list)) return list.length;
      if (list && typeof list === "object" && "length" in list)
        return Number((list as any).length) || 0;
      return 0;
    },
  };
  const ctx: EvalContext = {
    variables: { input, ...builtins, ...functionRegistry },
  };
  return (
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <For each={schema.nodes}>{(n) => renderNode(n, ctx, schema)}</For>
    </div>
  );
}
