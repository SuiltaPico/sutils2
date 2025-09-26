import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { JSX } from "solid-js";

/*
基本属性 {
  宽度: 数字
  高度: 数字

  最小宽度: 数字
  最小高度: 数字

  最大宽度: 数字
  最大高度: 数字

  背景色: 颜色

  字体: 字体
  字体大小: 数字
  字体粗细: 数字
  字体样式: 字符串
  字体颜色: 颜色
}

UI 设计器 {
  顶部横栏 {
    开关按钮组 {
      左侧栏 {}
      右侧栏 {}
    }
  }
  侧栏 @id: 左侧栏 {
    操作面板 {
      删除 {}
    }
    组件列表 {
      @行为: 点击按钮后，在选中容器中添加一个组件。
      行容器 {
        @属性 {
          宽度: 数字
          换行: 布尔值
        }
      }
      列容器 {
        @属性 {
          宽度: 数字
          换行: 布尔值
        }
      }
      文本 {}
    }
  }
  编辑面板 {

  }
  侧栏 @id: 右侧栏 {
    属性面板 {

    }
  }
}
*/

type NodeType = "root" | "row" | "col" | "text" | "button" | "image" | "input" | "divider";

type BaseProps = {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: string;
  color?: string;
  // 布局与装饰
  margin?: number;
  padding?: number;
  borderWidth?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderColor?: string;
  borderRadius?: number;
  boxShadow?: string;
};

type RowColProps = BaseProps & {
  wrap?: boolean;
  justifyContent?: string; // 主轴对齐
  alignItems?: string; // 交叉轴对齐
  gap?: number; // 间距
};

type TextProps = BaseProps & {
  text?: string; // 也用于按钮文本
};

type NodeProps = RowColProps &
  TextProps & {
    // 输入框
    placeholder?: string;
    inputType?: string;
    // 图片
    src?: string;
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
    // 分隔线
    thickness?: number;
  };

type NodeItem = {
  id: string;
  type: NodeType;
  props: NodeProps;
  children?: NodeItem[];
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function isContainer(t: NodeType) {
  return t === "root" || t === "row" || t === "col";
}

function findNode(root: NodeItem, id: string): NodeItem | undefined {
  if (root.id === id) return root;
  if (!root.children) return undefined;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}

function findParentId(
  root: NodeItem,
  id: string,
  parentId?: string
): string | undefined {
  if (root.id === id) return parentId;
  if (!root.children) return undefined;
  for (const c of root.children) {
    const p = findParentId(c, id, root.id);
    if (p) return p;
  }
  return undefined;
}

function updateNode(
  root: NodeItem,
  id: string,
  updater: (n: NodeItem) => void
): NodeItem {
  if (root.id === id) {
    const clone: NodeItem = {
      ...root,
      props: { ...root.props },
      children: root.children ? [...root.children] : undefined,
    };
    updater(clone);
    return clone;
  }
  if (!root.children) return root;
  const nextChildren = root.children.map((ch) => updateNode(ch, id, updater));
  return { ...root, children: nextChildren };
}

function appendChild(
  root: NodeItem,
  parentId: string,
  child: NodeItem
): NodeItem {
  return updateNode(root, parentId, (n) => {
    n.children = n.children ? [...n.children, child] : [child];
  });
}

function removeNode(root: NodeItem, id: string): NodeItem {
  if (root.id === id) return root;
  if (!root.children) return root;
  const filtered = root.children
    .filter((c) => c.id !== id)
    .map((c) => removeNode(c, id));
  return { ...root, children: filtered };
}

function toStyle(n: NodeItem): JSX.CSSProperties {
  const p = n.props || {};
  const style: JSX.CSSProperties = {
    "box-sizing": "border-box",
    width: p.width ? `${p.width}px` : undefined,
    height: p.height ? `${p.height}px` : undefined,
    "min-width": p.minWidth ? `${p.minWidth}px` : undefined,
    "min-height": p.minHeight ? `${p.minHeight}px` : undefined,
    "max-width": p.maxWidth ? `${p.maxWidth}px` : undefined,
    "max-height": p.maxHeight ? `${p.maxHeight}px` : undefined,
    "background-color": p.backgroundColor,
    "font-family": p.fontFamily,
    "font-size": p.fontSize as any,
    "font-weight": p.fontWeight as any,
    "font-style": p.fontStyle as any,
    color: p.color,
    margin: p.margin !== undefined ? `${p.margin}px` : undefined,
    padding: p.padding !== undefined ? `${p.padding}px` : undefined,
    "border-width": p.borderWidth !== undefined ? `${p.borderWidth}px` : undefined,
    "border-style": p.borderStyle,
    "border-color": p.borderColor,
    "border-radius": p.borderRadius !== undefined ? `${p.borderRadius}px` : undefined,
    "box-shadow": p.boxShadow,
  };
  if (n.type === "row" || n.type === "root") {
    style.display = "flex";
    style["flex-direction"] = "row";
    style["flex-wrap"] = (p as RowColProps).wrap ? "wrap" : "nowrap";
    style["justify-content"] = (p as RowColProps).justifyContent || "flex-start";
    style["align-items"] = (p as RowColProps).alignItems || "flex-start";
    style.gap = (p as RowColProps).gap !== undefined ? `${(p as RowColProps).gap}px` : "8px";
    if (!style.width) style.width = "100%";
  }
  if (n.type === "col") {
    style.display = "flex";
    style["flex-direction"] = "column";
    style["flex-wrap"] = (p as RowColProps).wrap ? "wrap" : "nowrap";
    style["justify-content"] = (p as RowColProps).justifyContent || "flex-start";
    style["align-items"] = (p as RowColProps).alignItems || "flex-start";
    style.gap = (p as RowColProps).gap !== undefined ? `${(p as RowColProps).gap}px` : "8px";
    if (!style.width) style.width = "100%";
  }
  if (n.type === "text") {
    if (!style.width) style.width = "auto";
  }
  return style;
}

type PanelProps = {
  node: NodeItem;
  onChange: (partial: Partial<NodeProps>) => void;
};

function NumInput(props: {
  label: string;
  value?: number;
  onChange: (v?: number) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "8px",
        "align-items": "center",
        "margin-bottom": "8px",
      }}
    >
      <span style={{ width: "90px" }}>{props.label}</span>
      <input
        style={{ width: "120px" }}
        type="number"
        value={props.value ?? ""}
        disabled={props.disabled}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          props.onChange(v === "" ? undefined : Number(v));
        }}
      />
    </label>
  );
}

function ColorInput(props: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "8px",
        "align-items": "center",
        "margin-bottom": "8px",
      }}
    >
      <span style={{ width: "90px" }}>{props.label}</span>
      <input
        type="color"
        value={props.value ?? "#000000"}
        disabled={props.disabled}
        onInput={(e) =>
          props.onChange((e.currentTarget as HTMLInputElement).value)
        }
      />
      <input
        style={{ width: "120px" }}
        type="text"
        value={props.value ?? ""}
        disabled={props.disabled}
        onInput={(e) =>
          props.onChange(
            ((e.currentTarget as HTMLInputElement).value || undefined) as any
          )
        }
        placeholder="#RRGGBB"
      />
    </label>
  );
}

function BoolInput(props: {
  label: string;
  value?: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "8px",
        "align-items": "center",
        "margin-bottom": "8px",
      }}
    >
      <span style={{ width: "90px" }}>{props.label}</span>
      <input
        type="checkbox"
        checked={!!props.value}
        disabled={props.disabled}
        onInput={(e) =>
          props.onChange((e.currentTarget as HTMLInputElement).checked)
        }
      />
    </label>
  );
}

function TextInput(props: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "8px",
        "align-items": "center",
        "margin-bottom": "8px",
      }}
    >
      <span style={{ width: "90px" }}>{props.label}</span>
      <input
        style={{ width: "220px" }}
        type="text"
        value={props.value ?? ""}
        disabled={props.disabled}
        onInput={(e) =>
          props.onChange(
            ((e.currentTarget as HTMLInputElement).value || undefined) as any
          )
        }
      />
    </label>
  );
}

function SelectInput(props: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "8px",
        "align-items": "center",
        "margin-bottom": "8px",
      }}
    >
      <span style={{ width: "90px" }}>{props.label}</span>
      <select
        style={{ width: "220px" }}
        value={props.value ?? ""}
        disabled={props.disabled}
        onInput={(e) =>
          props.onChange(((e.currentTarget as HTMLSelectElement).value || undefined) as any)
        }
      >
        <option value="">(默认)</option>
        <For each={props.options}>
          {(opt) => (
            <option value={opt.value}>{opt.label}</option>
          )}
        </For>
      </select>
    </label>
  );
}

function PropertyPanel(props: PanelProps) {
  const base = () => props.node.props;
  const disabled = false as boolean;
  return (
    <div style={{ padding: "12px" }}>
      <div style={{ "font-weight": 600, "margin-bottom": "8px" }}>
        属性面板：{props.node.type}
      </div>
      <NumInput
        label="宽度(px)"
        value={base().width}
        onChange={(v) => props.onChange({ width: v })}
        disabled={disabled}
      />
      <NumInput
        label="高度(px)"
        value={base().height}
        onChange={(v) => props.onChange({ height: v })}
        disabled={disabled}
      />
      <NumInput
        label="最小宽度"
        value={base().minWidth}
        onChange={(v) => props.onChange({ minWidth: v })}
        disabled={disabled}
      />
      <NumInput
        label="最小高度"
        value={base().minHeight}
        onChange={(v) => props.onChange({ minHeight: v })}
        disabled={disabled}
      />
      <NumInput
        label="最大宽度"
        value={base().maxWidth}
        onChange={(v) => props.onChange({ maxWidth: v })}
        disabled={disabled}
      />
      <NumInput
        label="最大高度"
        value={base().maxHeight}
        onChange={(v) => props.onChange({ maxHeight: v })}
        disabled={disabled}
      />
      <ColorInput
        label="背景色"
        value={base().backgroundColor}
        onChange={(v) => props.onChange({ backgroundColor: v })}
        disabled={disabled}
      />
      <NumInput
        label="外边距"
        value={base().margin}
        onChange={(v) => props.onChange({ margin: v })}
        disabled={disabled}
      />
      <NumInput
        label="内边距"
        value={base().padding}
        onChange={(v) => props.onChange({ padding: v })}
        disabled={disabled}
      />
      <NumInput
        label="边框宽度"
        value={base().borderWidth}
        onChange={(v) => props.onChange({ borderWidth: v })}
        disabled={disabled}
      />
      <SelectInput
        label="边框样式"
        value={base().borderStyle}
        onChange={(v) => props.onChange({ borderStyle: v as any })}
        options={[
          { label: "none", value: "none" },
          { label: "solid", value: "solid" },
          { label: "dashed", value: "dashed" },
          { label: "dotted", value: "dotted" },
        ]}
        disabled={disabled}
      />
      <ColorInput
        label="边框颜色"
        value={base().borderColor}
        onChange={(v) => props.onChange({ borderColor: v })}
        disabled={disabled}
      />
      <NumInput
        label="圆角"
        value={base().borderRadius}
        onChange={(v) => props.onChange({ borderRadius: v })}
        disabled={disabled}
      />
      <TextInput
        label="阴影(box-shadow)"
        value={base().boxShadow}
        onChange={(v) => props.onChange({ boxShadow: v })}
        disabled={disabled}
      />
      <Show when={props.node.type === "text"}>
        <>
          <TextInput
            label="文本内容"
            value={base().text}
            onChange={(v) => props.onChange({ text: v })}
            disabled={disabled}
          />
          <NumInput
            label="字体大小"
            value={base().fontSize}
            onChange={(v) => props.onChange({ fontSize: v })}
            disabled={disabled}
          />
          <NumInput
            label="字体粗细"
            value={base().fontWeight}
            onChange={(v) => props.onChange({ fontWeight: v })}
            disabled={disabled}
          />
          <TextInput
            label="字体样式"
            value={base().fontStyle}
            onChange={(v) => props.onChange({ fontStyle: v })}
            disabled={disabled}
          />
          <TextInput
            label="字体"
            value={base().fontFamily}
            onChange={(v) => props.onChange({ fontFamily: v })}
            disabled={disabled}
          />
          <ColorInput
            label="字体颜色"
            value={base().color}
            onChange={(v) => props.onChange({ color: v })}
            disabled={disabled}
          />
        </>
      </Show>
      <Show
        when={
          props.node.type === "row" ||
          props.node.type === "col" ||
          props.node.type === "root"
        }
      >
        <>
          <BoolInput
            label="换行"
            value={base().wrap}
            onChange={(v) => props.onChange({ wrap: v })}
            disabled={disabled}
          />
          <SelectInput
            label="主轴对齐"
            value={base().justifyContent as any}
            onChange={(v) => props.onChange({ justifyContent: v })}
            options={[
              { label: "flex-start", value: "flex-start" },
              { label: "center", value: "center" },
              { label: "space-between", value: "space-between" },
              { label: "space-around", value: "space-around" },
              { label: "flex-end", value: "flex-end" },
            ]}
            disabled={disabled}
          />
          <SelectInput
            label="交叉轴对齐"
            value={base().alignItems as any}
            onChange={(v) => props.onChange({ alignItems: v })}
            options={[
              { label: "flex-start", value: "flex-start" },
              { label: "center", value: "center" },
              { label: "flex-end", value: "flex-end" },
              { label: "stretch", value: "stretch" },
            ]}
            disabled={disabled}
          />
          <NumInput
            label="间距(gap)"
            value={base().gap as any}
            onChange={(v) => props.onChange({ gap: v })}
            disabled={disabled}
          />
        </>
      </Show>
      <Show when={props.node.type === "button"}>
        <>
          <TextInput
            label="按钮文本"
            value={base().text}
            onChange={(v) => props.onChange({ text: v })}
            disabled={disabled}
          />
          <NumInput
            label="字体大小"
            value={base().fontSize}
            onChange={(v) => props.onChange({ fontSize: v })}
            disabled={disabled}
          />
          <ColorInput
            label="字体颜色"
            value={base().color}
            onChange={(v) => props.onChange({ color: v })}
            disabled={disabled}
          />
        </>
      </Show>
      <Show when={props.node.type === "input"}>
        <>
          <TextInput
            label="占位符"
            value={base().placeholder}
            onChange={(v) => props.onChange({ placeholder: v })}
            disabled={disabled}
          />
          <SelectInput
            label="输入类型"
            value={base().inputType}
            onChange={(v) => props.onChange({ inputType: v })}
            options={[
              { label: "text", value: "text" },
              { label: "password", value: "password" },
              { label: "email", value: "email" },
              { label: "number", value: "number" },
            ]}
            disabled={disabled}
          />
        </>
      </Show>
      <Show when={props.node.type === "image"}>
        <>
          <TextInput
            label="图片地址"
            value={base().src}
            onChange={(v) => props.onChange({ src: v })}
            disabled={disabled}
          />
          <SelectInput
            label="填充方式"
            value={base().objectFit as any}
            onChange={(v) => props.onChange({ objectFit: v as any })}
            options={[
              { label: "cover", value: "cover" },
              { label: "contain", value: "contain" },
              { label: "fill", value: "fill" },
              { label: "none", value: "none" },
              { label: "scale-down", value: "scale-down" },
            ]}
            disabled={disabled}
          />
        </>
      </Show>
      <Show when={props.node.type === "divider"}>
        <>
          <NumInput
            label="厚度(px)"
            value={base().thickness}
            onChange={(v) => props.onChange({ thickness: v })}
            disabled={disabled}
          />
          <ColorInput
            label="颜色"
            value={base().borderColor}
            onChange={(v) => props.onChange({ borderColor: v })}
            disabled={disabled}
          />
        </>
      </Show>
    </div>
  );
}

function NodeView(props: {
  node: NodeItem;
  selectedId: string;
  onSelect: (id: string) => void;
  mode: "design" | "preview";
}) {
  const style = createMemo(() => toStyle(props.node));
  const isSel = () => props.node.id === props.selectedId;
  const border = () =>
    props.mode === "design"
      ? isSel()
        ? "2px solid #1677ff"
        : "1px dashed #bbb"
      : "none";
  const label = createMemo(() =>
    props.node.type === "row"
      ? "行容器"
      : props.node.type === "col"
      ? "列容器"
      : props.node.type === "text"
      ? "文本"
      : props.node.type === "button"
      ? "按钮"
      : props.node.type === "image"
      ? "图片"
      : props.node.type === "input"
      ? "输入框"
      : props.node.type === "divider"
      ? "分隔线"
      : "根容器"
  );

  if (props.node.type === "text") {
    return (
      <div
        onClick={(e) => {
          if (props.mode !== "design") return;
          e.stopPropagation();
          props.onSelect(props.node.id);
        }}
        style={{
          ...style(),
          border: border(),
          padding: "6px",
          "border-radius": "4px",
          position: "relative",
          cursor: props.mode === "design" ? "pointer" : "default",
        }}
      >
        <Show when={props.mode === "design"}>
          <span
          style={{
            position: "absolute",
            top: "-10px",
            left: "-1px",
            background: "#fff",
            "font-size": "10px",
            padding: "0 4px",
          }}
        >
          {label()}
        </span>
        </Show>
        {props.node.props.text ?? "双击右侧编辑文本"}
      </div>
    );
  }

  if (props.node.type === "button") {
    return (
      <button
        onClick={(e) => {
          if (props.mode !== "design") return;
          e.stopPropagation();
          props.onSelect(props.node.id);
        }}
        style={{
          ...style(),
          border: border(),
          padding: style().padding || "6px 10px",
          "border-radius": style()["border-radius"] || "4px",
          position: "relative",
          cursor: props.mode === "design" ? "pointer" : "pointer",
          background: (style() as any)["background-color"] || "#1677ff",
          color: style().color || "#fff",
        }}
      >
        <Show when={props.mode === "design"}>
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "-1px",
              background: "#fff",
              "font-size": "10px",
              padding: "0 4px",
            }}
          >
            {label()}
          </span>
        </Show>
        {props.node.props.text ?? "按钮"}
      </button>
    );
  }

  if (props.node.type === "input") {
    return (
      <div
        onClick={(e) => {
          if (props.mode !== "design") return;
          e.stopPropagation();
          props.onSelect(props.node.id);
        }}
        style={{ position: "relative", display: "inline-block" }}
      >
        <Show when={props.mode === "design"}>
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "-1px",
              background: "#fff",
              "font-size": "10px",
              padding: "0 4px",
            }}
          >
            {label()}
          </span>
        </Show>
        <input
          type={props.node.props.inputType || "text"}
          placeholder={props.node.props.placeholder}
          style={{
            ...style(),
            border: border(),
            padding: style().padding || "6px 8px",
            "border-radius": style()["border-radius"] || "4px",
            background: (style() as any)["background-color"] || "#fff",
            color: style().color || "#333",
          }}
        />
      </div>
    );
  }

  if (props.node.type === "image") {
    const s = style();
    return (
      <div
        onClick={(e) => {
          if (props.mode !== "design") return;
          e.stopPropagation();
          props.onSelect(props.node.id);
        }}
        style={{ position: "relative", display: "inline-block", border: border() }}
      >
        <Show when={props.mode === "design"}>
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "-1px",
              background: "#fff",
              "font-size": "10px",
              padding: "0 4px",
            }}
          >
            {label()}
          </span>
        </Show>
        <img
          src={props.node.props.src || ""}
          style={{
            width: s.width || "200px",
            height: s.height || "120px",
            "object-fit": (props.node.props.objectFit as any) || "cover",
            "border-radius": s["border-radius"],
            "box-shadow": s["box-shadow"],
            background: (s as any)["background-color"] || "#f5f5f5",
          }}
        />
      </div>
    );
  }

  if (props.node.type === "divider") {
    const t = props.node.props.thickness ?? 1;
    const c = props.node.props.borderColor || "#e5e5e5";
    return (
      <div
        onClick={(e) => {
          if (props.mode !== "design") return;
          e.stopPropagation();
          props.onSelect(props.node.id);
        }}
        style={{ position: "relative", width: "100%" }}
      >
        <Show when={props.mode === "design"}>
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "-1px",
              background: "#fff",
              "font-size": "10px",
              padding: "0 4px",
            }}
          >
            {label()}
          </span>
        </Show>
        <div
          style={{
            height: `${t}px`,
            width: "100%",
            background: c,
            margin: style().margin || "8px 0",
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        if (props.mode !== "design") return;
        e.stopPropagation();
        props.onSelect(props.node.id);
      }}
      style={{
        ...style(),
        border: border(),
        padding: "8px",
        "border-radius": "4px",
        position: "relative",
        cursor: props.mode === "design" ? "pointer" : "default",
        background: (style() as any)["background-color"] || "#fafafa",
      }}
    >
      <Show when={props.mode === "design"}>
        <span
        style={{
          position: "absolute",
          top: "-10px",
          left: "-1px",
          background: "#fff",
          "font-size": "10px",
          padding: "0 4px",
        }}
      >
        {label()}
      </span>
      </Show>
      <div style={{ width: "100%" }}>
        <For each={props.node.children ?? []}>
          {(child) => (
            <NodeView
              node={child}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
              mode={props.mode}
            />
          )}
        </For>
      </div>
    </div>
  );
}

export default function SimpleUIDesigner() {
  const [tree, setTree] = createStore<NodeItem>({
    id: "root",
    type: "root",
    props: { wrap: true, backgroundColor: "#ffffff" },
    children: [],
  });
  const [selectedId, setSelectedId] = createSignal("root");
  const [showLeft, setShowLeft] = createSignal(true);
  const [showRight, setShowRight] = createSignal(true);
  const [mode, setMode] = createSignal<"design" | "preview">("design");

  const selectedNode = createMemo(() => findNode(tree, selectedId()) ?? tree);

  function ensureContainerTarget(id: string): string {
    const n = findNode(tree, id);
    if (n && isContainer(n.type)) return id;
    const p = findParentId(tree, id);
    return p ?? "root";
  }

  function addNode(type: Exclude<NodeType, "root">) {
    const target = ensureContainerTarget(selectedId());
    const child: NodeItem =
      type === "text"
        ? {
            id: uid(),
            type: "text",
            props: { text: "文本", fontSize: 14, color: "#333" },
          }
        : type === "row"
        ? {
            id: uid(),
            type: "row",
            props: { wrap: false, backgroundColor: "#f6ffed" },
            children: [],
          }
        : type === "col"
        ? {
            id: uid(),
            type: "col",
            props: { wrap: false, backgroundColor: "#e6f4ff" },
            children: [],
          }
        : type === "button"
        ? {
            id: uid(),
            type: "button",
            props: {
              text: "按钮",
              color: "#fff",
              backgroundColor: "#1677ff",
              padding: 8,
              borderRadius: 4,
            },
          }
        : type === "input"
        ? {
            id: uid(),
            type: "input",
            props: {
              placeholder: "请输入",
              inputType: "text",
              backgroundColor: "#fff",
              color: "#333",
              padding: 6,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#d9d9d9",
              borderRadius: 4,
            },
          }
        : type === "image"
        ? {
            id: uid(),
            type: "image",
            props: {
              src: "",
              width: 200,
              height: 120,
              objectFit: "cover",
              backgroundColor: "#f5f5f5",
              borderRadius: 4,
            },
          }
        : {
            id: uid(),
            type: "divider",
            props: { thickness: 1, borderColor: "#e5e5e5", width: 100 },
          };
    const next = appendChild(tree, target, child);
    setTree(next as any);
    setSelectedId(child.id);
  }

  function deleteSelected() {
    if (selectedId() === "root") return;
    const parent = findParentId(tree, selectedId()) ?? "root";
    const next = removeNode(tree, selectedId());
    setTree(next as any);
    setSelectedId(parent);
  }

  function updateSelectedProps(partial: Partial<NodeProps>) {
    const next = updateNode(tree, selectedId(), (n) => {
      n.props = { ...n.props, ...partial };
    });
    setTree(next as any);
  }

  const layout: JSX.CSSProperties = {
    display: "grid",
    "grid-template-rows": "48px 1fr",
    "grid-template-columns": `${showLeft() ? "240px" : "0px"} 1fr ${
      showRight() ? "320px" : "0px"
    }`,
    "grid-template-areas": `
      "top top top"
      "left center right"
    `,
    height: "100%",
    width: "100%",
    overflow: "hidden",
  };

  return (
    <Show
      when={mode() === "design"}
      fallback={
        // 预览模式：仅渲染画布内容
        <div style={{ height: "100%", width: "100%", overflow: "auto", background: "#fff", position: "relative" }}>
          <div style={{ padding: "12px" }}>
            <NodeView node={tree} selectedId={""} onSelect={() => {}} mode={"preview"} />
          </div>
          <button
            onClick={() => setMode("design")}
            style={{ position: "fixed", right: "16px", bottom: "16px", padding: "8px 12px", background: "#1677ff", color: "#fff", border: "0", "border-radius": "4px", cursor: "pointer", "box-shadow": "0 2px 8px rgba(0,0,0,0.15)" }}
          >
            返回设计
          </button>
        </div>
      }
    >
      {/* 设计模式：三栏布局 + 顶部栏 */}
      <div style={layout}>
        <div
          style={{
            "grid-area": "top",
            "border-bottom": "1px solid #eee",
            display: "flex",
            "align-items": "center",
            gap: "12px",
            padding: "0 12px",
          }}
        >
          <div style={{ "font-weight": 600 }}>UI 设计器</div>
          <button
            onClick={() => setMode("preview")}
            style={{ padding: "6px 10px", cursor: "pointer" }}
          >
            预览
          </button>
          <label style={{ display: "flex", "align-items": "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={showLeft()}
              onInput={(e) =>
                setShowLeft((e.currentTarget as HTMLInputElement).checked)
              }
            />
            左侧栏
          </label>
          <label style={{ display: "flex", "align-items": "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={showRight()}
              onInput={(e) =>
                setShowRight((e.currentTarget as HTMLInputElement).checked)
              }
            />
            右侧栏
          </label>
        </div>

        <div
          style={{
            "grid-area": "left",
            "border-right": showLeft() ? "1px solid #eee" : "none",
            overflow: "auto",
            display: showLeft() ? "block" : "none",
          }}
        >
          <div style={{ padding: "12px", "border-bottom": "1px solid #f0f0f0" }}>
            <div style={{ "font-weight": 600, "margin-bottom": "8px" }}>
              操作面板
            </div>
            <button
              onClick={deleteSelected}
              style={{
                padding: "6px 10px",
                background: "#ff4d4f",
                color: "#fff",
                border: "0",
                "border-radius": "4px",
                cursor: "pointer",
              }}
            >
              删除选中
            </button>
          </div>
          <div style={{ padding: "12px" }}>
            <div style={{ "font-weight": 600, "margin-bottom": "8px" }}>
              组件列表
            </div>
            <div
              style={{ display: "flex", "flex-direction": "column", gap: "8px" }}
            >
              <button
                onClick={() => addNode("row")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                行容器
              </button>
              <button
                onClick={() => addNode("col")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                列容器
              </button>
              <button
                onClick={() => addNode("text")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                文本
              </button>
              <button
                onClick={() => addNode("button")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                按钮
              </button>
              <button
                onClick={() => addNode("input")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                输入框
              </button>
              <button
                onClick={() => addNode("image")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                图片
              </button>
              <button
                onClick={() => addNode("divider")}
                style={{ padding: "6px 10px", cursor: "pointer" }}
              >
                分隔线
              </button>
            </div>
            <div
              style={{ "margin-top": "8px", "font-size": "12px", color: "#666" }}
            >
              点击按钮后，在选中容器中添加一个组件。若选中为非容器，则添加到其父容器。
            </div>
          </div>
        </div>

        <div
          style={{
            "grid-area": "center",
            padding: "12px",
            overflow: "auto",
            background: "#fafafa",
          }}
        >
          <div
            onClick={() => setSelectedId("root")}
            style={{
              "min-height": "480px",
              padding: "12px",
              background: "#fff",
              border: "1px solid #eee",
              "border-radius": "6px",
            }}
          >
            <NodeView
              node={tree}
              selectedId={selectedId()}
              onSelect={setSelectedId}
              mode={"design"}
            />
          </div>
        </div>

        <div
          style={{
            "grid-area": "right",
            "border-left": showRight() ? "1px solid #eee" : "none",
            overflow: "auto",
            display: showRight() ? "block" : "none",
          }}
        >
          <Show
            when={selectedNode()}
            fallback={<div style={{ padding: "12px" }}>未选中节点</div>}
          >
            <PropertyPanel
              node={selectedNode()!}
              onChange={updateSelectedProps}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
}
