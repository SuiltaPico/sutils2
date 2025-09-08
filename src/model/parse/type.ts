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
  condition: Ref;
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
  | BreakLoopNode;

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
