// =================================================================
// ExpressionTerms
// =================================================================

import type { ExpressionTerm } from "../base";

// =================================================================
// Base Spec Nodes
// =================================================================

type UintNode = {
  type: "uint";
  id: string;
  length: number;
  emit?: boolean;
};

type AsciiNode = {
  type: "ascii";
  id: string;
  length: number;
};

type BytesNode = {
  type: "bytes";
  id: string;
  length: ExpressionTerm;
  emit?: boolean;
};

// 宽松字节读取：当 length 超过剩余可读字节时，自动截断到文件末尾
type BytesLenientNode = {
  type: "bytes_lenient";
  id: string;
  length: ExpressionTerm;
  emit?: boolean;
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
  count?: ExpressionTerm;
  read_until?: ExpressionTerm;
  stop_when?: ExpressionTerm;
  emit_when?: ExpressionTerm;
};

type TemplateRefNode = {
  type: "template_ref";
  id: string;
  params?: Record<string, ExpressionTerm>;
};

type IfNode = {
  type: "if";
  // 升级为支持表达式条件
  condition: ExpressionTerm;
  spec: SpecNode[];
};

type SwitchNode = {
  type: "switch";
  on: ExpressionTerm;
  cases: {
    [key: string]: SpecNode[];
  };
};

// 新增核心节点类型定义 ---------------------------------------------------

type IntNode = {
  type: "int";
  id: string;
  length: number;
};

type FP32Node = {
  type: "fp32";
  id: string;
};

type FP64Node = {
  type: "fp64";
  id: string;
};

type Latin1Node = {
  type: "latin_1";
  id: string;
  length: number;
};

type Utf8Node = {
  type: "utf_8";
  id: string;
  length: number;
};

type Utf16LENode = {
  type: "utf_16le";
  id: string;
  length: number;
};

type Utf16BENode = {
  type: "utf_16be";
  id: string;
  length: number;
};

type BoundedNode = {
  type: "bounded";
  id: string;
  length_expr: ExpressionTerm;
  spec: SpecNode[];
};

type BytesUntilPrefixedNode = {
  type: "bytes_until_prefixed";
  id: string;
  prefix: number;
  passthrough_values?: number[];
  passthrough_ranges?: Array<{ from: number; to: number }>;
};

type WithByteOrderNode = {
  type: "with_byte_order";
  byte_order: number;
  spec: SpecNode[];
};

type AssertNode = {
  type: "assert";
  condition: ExpressionTerm;
  message?: string;
};

type LetNode = {
  type: "let";
  id: string;
  expr: ExpressionTerm;
  emit?: boolean;
};

type SetNode = {
  type: "set";
  id: string;
  expr: ExpressionTerm;
};

type AlignNode = {
  type: "align";
  to: number;
  basis?: "scope" | "global" | ExpressionTerm;
};

// 新增通用词法解析节点
type SkipWhitespaceNode = {
  type: "skip_ws";
};

type PeekBytesNode = {
  type: "peek_bytes";
  id: string;
  length: ExpressionTerm;
};

type AsciiUntilNode = {
  type: "ascii_until";
  id: string;
  terminators: number[];
  max_len?: number;
};

type BytesUntilSeqNode = {
  type: "bytes_until_seq";
  id: string;
  seq: number[];
  max_len?: number;
};
// ----------------------------------------------------------------------

// EBML 可变长整数（VINT）支持 -------------------------------------------

type EbmlVintIdNode = {
  type: "ebml_vint_id";
  id: string;
};

type EbmlVintSizeNode = {
  type: "ebml_vint_size";
  id: string;
};

// =================================================================
// The main SpecNode union type
// =================================================================

export type SpecNode =
  | IntNode
  | UintNode
  | FP32Node
  | FP64Node
  | AsciiNode
  | Latin1Node
  | Utf8Node
  | Utf16LENode
  | Utf16BENode
  | BytesNode
  | SkipNode
  | BooleanNode
  | BitfieldNode
  | ListNode
  | TemplateRefNode
  | IfNode
  | SwitchNode
  | BoundedNode
  | WithByteOrderNode
  | AssertNode
  | LetNode
  | SetNode
  | AlignNode
  | BytesUntilPrefixedNode
  | BytesLenientNode
  | EbmlVintIdNode
  | EbmlVintSizeNode
  | SkipWhitespaceNode
  | PeekBytesNode
  | AsciiUntilNode
  | BytesUntilSeqNode;

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
