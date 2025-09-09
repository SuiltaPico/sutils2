// =================================================================
// Expressions
// =================================================================

import type { Ref, Expression } from "../base";

// =================================================================
// Base Spec Nodes
// =================================================================

type UintNode = {
  type: "uint";
  id: string;
  length: number;
};

type AsciiNode = {
  type: "ascii";
  id: string;
  length: number;
};

type BytesNode = {
  type: "bytes";
  id: string;
  length: number | Ref;
};

type SkipNode = {
  type: "skip";
  length: number;
};

type BooleanNode = {
  type: "boolean";
  id: string;
  length: 1;
};

type BreakLoopNode = {
  type: "break_loop";
};

// =================================================================
// Composite Spec Nodes
// =================================================================

type BitfieldNode = {
  type: "bitfield";
  id?: string;
  spec: Array<BooleanNode | UintNode | SkipNode>;
};

type ListNode = {
  type: "list";
  id: string;
  items: SpecNode[];
  count?: Expression;
  read_until?: Expression;
  push_condition?: Expression;
};

type TemplateRefNode = {
  type: "template_ref";
  id: string;
  params?: {
    [key: string]: Ref;
  };
};

type IfNode = {
  type: "if";
  // 升级为支持表达式条件
  condition: Ref | Expression;
  spec: SpecNode[];
};

type SwitchNode = {
  type: "switch";
  on: Ref;
  cases: {
    [key: string]: SpecNode[];
  };
};

type LoopListNode = {
  type: "loop_list";
  id: string;
  spec: SpecNode[];
  push_condition?: Expression;
};

// 自定义节点：读取扫描数据直到遇到下一个真正的标记（0xFF 后跟非 0x00 且非 RSTn）
type ReadUntilMarkerNode = {
  type: "read_until_marker";
  id: string;
};

// 更通用：读取直到遇到指定前缀，且前缀后的下一个字节不在“透传集合/区间”中；
// 满足终止条件时停在前缀处（不消耗）。
type ReadUntilPrefixedNode = {
  type: "read_until_prefixed";
  id: string;
  prefix: number;
  // 若遇到 prefix 后的 next 字节命中以下集合或区间，则将 (prefix,next) 作为数据吞掉并继续；
  // 例如 JPEG 的 0x00 stuffed、0xD0..0xD7 RSTn
  next_passthrough_values?: number[];
  next_passthrough_ranges?: Array<{ from: number; to: number }>;
};

// 在进入该循环时记录起始 offset，重复解析子 spec，直到消费的字节数 >= length_expr
type LoopUntilConsumedNode = {
  type: "loop_until_consumed";
  id: string;
  spec: SpecNode[];
  length_expr: Expression;
};

// =================================================================
// The main SpecNode union type
// =================================================================

type SpecNode =
  | UintNode
  | AsciiNode
  | BytesNode
  | SkipNode
  | BooleanNode
  | BitfieldNode
  | ListNode
  | TemplateRefNode
  | IfNode
  | SwitchNode
  | LoopListNode
  | BreakLoopNode
  | ReadUntilMarkerNode
  | ReadUntilPrefixedNode
  | LoopUntilConsumedNode;

// =================================================================
// Template and Schema structure
// =================================================================

type TemplateParam = {
  type: "param";
  id: string;
};

type Template = {
  params: TemplateParam[];
  spec: SpecNode[] | SpecNode;
};

export type ParseSchema = {
  config: {
    byte_order: number;
  };
  template: {
    [templateId: string]: Template;
  };
  spec: SpecNode[];
};

export const ByteOrder = {
  LittleEndian: 0,
  BigEndian: 1,
};
