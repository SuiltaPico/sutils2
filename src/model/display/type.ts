import type { ExpressionTerm } from "../base";

export type Text = {
  type: "text";
  class?: string;
  value: string;
};

export type Row = {
  type: "row";
  class?: string;
  children: DisplayNode[];
};

export type Column = {
  type: "column";
  class?: string;
  children: DisplayNode[];
};

export type TextMap = {
  type: "text_map";
  class?: string;
  provider: ExpressionTerm;
};

export type TextMatchMap = {
  type: "text_match_map";
  class?: string;
  provider: ExpressionTerm;
  text_matcher?: Record<any, string>;
  true_value?: string;
  false_value?: string;
};

export type CheckBoxMap = {
  type: "check_box_map";
  provider: ExpressionTerm;
};

export type ListMap = {
  type: "list_map";
  provider: ExpressionTerm;
  item_param: string;
  index_param?: string;
  children: DisplayNode[];
};

export type InfoText = {
  type: "info_text";
  value: Text;
};

export type If = {
  type: "if";
  condition: ExpressionTerm;
  children: DisplayNode[];
};

export type RGBColorMap = {
  type: "rgb_color_map";
  r_provider: ExpressionTerm;
  g_provider: ExpressionTerm;
  b_provider: ExpressionTerm;
};

export type TableMap = {
  type: "table_map";
  class?: string;
  provider: ExpressionTerm; // 二维数组 number[][]
  auto_headers?: boolean;
  heatmap?: boolean;
  axis_labels?: { row?: string; col?: string };
  show_coord_title?: boolean;
};

export type TableOfRows = {
  type: "table_of_rows";
  class?: string;
  provider: ExpressionTerm; // 数组，每项为对象
  columns: Array<{ key: string; title: string; width?: string }>;
};

export type PreBlockMap = {
  type: "pre_block_map";
  class?: string;
  provider: ExpressionTerm; // string
  max_height?: string; // e.g., '320px'
};

export type Collapse = {
  type: "collapse";
  class?: string;
  title?: string;
  default_open?: boolean;
  summary: DisplayNode[];
  details: DisplayNode[];
};

export type TemplateRef = {
  type: "template_ref";
  id: string;
  params?: {
    [key: string]: ExpressionTerm;
  };
};

export type GIFImageMap = {
  type: "gif_image_map";
  class?: string;
  width_provider: ExpressionTerm;
  height_provider: ExpressionTerm;
  interlace_provider: ExpressionTerm;
  lzw_min_code_size_provider: ExpressionTerm;
  sub_blocks_provider: ExpressionTerm;
  /** 直接提供最终使用的调色板（list of {r,g,b}），支持 match/case */
  palette_provider?: ExpressionTerm;
  /** 可选：透明色索引提供者 */
  transparent_index_provider?: ExpressionTerm;
};

export type PDFImageMap = {
  type: "pdf_image_map";
  class?: string;
  /** 表达式求值为 data URL 字符串 */
  url_provider: ExpressionTerm;
  style?: string;
};

export type DisplayNode =
  | Text
  | Row
  | Column
  | TextMap
  | ListMap
  | TextMatchMap
  | CheckBoxMap
  | InfoText
  | If
  | RGBColorMap
  | TemplateRef
  | GIFImageMap
  | PDFImageMap
  | PreBlockMap
  | TableMap
  | TableOfRows
  | Collapse;

export type TemplateParam = {
  type: "param";
  id: string;
};

export type Template = {
  params: TemplateParam[];
  spec: DisplayNode[];
};

export type DisplaySchema = {
  template: {
    [templateId: string]: Template;
  };
  /** 默认接受输入变量 input。 */
  nodes: DisplayNode[];
};
