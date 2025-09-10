import { ExpressionType } from "../../base";
import type { DisplaySchema } from "../../display/type";

export const pdf_ds: DisplaySchema = {
  template: {},
  nodes: [
    {
      type: "column",
      children: [
        {
          type: "column",
          class:
            "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "PDF 文件信息" },
            {
              type: "row",
              children: [
                { type: "text", value: "头行：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::parse_header" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "header_line" },
                    ],
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "版本：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::parse_header" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "version" },
                    ],
                  },
                },
              ],
            },
          ],
        },

        {
          type: "column",
          class:
            "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "结构摘要" },
            {
              type: "row",
              children: [
                { type: "text", value: "对象数：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::analyze" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "object_count" },
                    ],
                  },
                },
              ],
            },
            // 已展示一次 startxref，这里去重
            {
              type: "row",
              children: [
                { type: "text", value: "startxref：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::analyze" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "startxref" },
                    ],
                  },
                },
              ],
            },
          ],
        },

        {
          type: "collapse",
          title: "文档信息 (Info)",
          default_open: true,
          summary: [
            { type: "text", value: "作者、创建时间等元数据" },
          ],
          details: [
            {
              type: "table_of_rows",
              provider: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "pdf::analyze" },
                  { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                  { type: ExpressionType.Operator, value: "access" },
                  { type: ExpressionType.TextLiteral, value: "info_rows" },
                ],
              },
              columns: [
                { key: "key", title: "字段", width: "160px" },
                { key: "value", title: "值" },
              ],
            },
          ],
        },

        {
          type: "collapse",
          title: "Metadata (XML)",
          default_open: false,
          summary: [
            { type: "text", value: "XMP 元数据" },
          ],
          details: [
            {
              type: "list_map",
              provider: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "pdf::analyze" },
                  { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                  { type: ExpressionType.Operator, value: "access" },
                  { type: ExpressionType.TextLiteral, value: "metadata_list" },
                ],
              },
              item_param: "md",
              children: [
                {
                  type: "column",
                  class: "gap-1 border p-2 rounded",
                  children: [
                    {
                      type: "row",
                      children: [
                        { type: "text", value: "引用：" },
                        { type: "text_map", provider: { type: ExpressionType.Ref, id: "md.ref" } },
                        { type: "text", value: "  长度：" },
                        { type: "text_map", provider: { type: ExpressionType.Ref, id: "md.length" } },
                      ],
                    },
                    {
                      type: "pre_block_map",
                      max_height: "320px",
                      provider: { type: ExpressionType.Ref, id: "md.xml_text" },
                    },
                  ],
                },
              ],
            },
          ],
        },

        {
          type: "collapse",
          title: "页面结构 (Pages)",
          default_open: false,
          summary: [
            { type: "text", value: "Pages → Kids → Page 树" },
          ],
          details: [
            {
              type: "column",
              class: "gap-2",
              children: [
                {
                  type: "table_of_rows",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::analyze" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "pages_tree" },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "children" },
                    ],
                  },
                  columns: [
                    { key: "ref", title: "引用", width: "140px" },
                    { key: "type", title: "类型", width: "100px" },
                    { key: "count", title: "Count", width: "80px" },
                    { key: "media_box", title: "MediaBox" },
                  ],
                },
              ],
            },
          ],
        },

        {
          type: "column",
          class:
            "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "对象列表" },
            {
              type: "row",
              class: "flex flex-col gap-3",
              children: [
                {
                  type: "list_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "pdf::analyze" },
                      { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "input" }] },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "objects" },
                    ],
                  },
                  item_param: "obj",
                  children: [
                    {
                      type: "column",
                      class: "flex flex-col gap-2 border p-2 rounded",
                      children: [
                        {
                          type: "row",
                          class: "flex flex-wrap gap-2",
                          children: [
                            { type: "text", value: "#" },
                            { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.obj_num" } },
                            { type: "text", value: " gen " },
                            { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.gen" } },
                            { type: "text", value: "  /Type=" },
                            { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.type" } },
                            { type: "text", value: "  stream=" },
                            {
                              type: "text_match_map",
                              provider: { type: ExpressionType.Ref, id: "obj.has_stream" },
                              true_value: "有",
                              false_value: "无",
                            },
                            { type: "text", value: "  Length=" },
                            { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.stream_length" } },
                          ],
                        },
                        {
                          type: "if",
                          condition: {
                            type: ExpressionType.Expression,
                            expr: [
                              { type: ExpressionType.Ref, id: "obj.is_image" },
                            ],
                          },
                          children: [
                            {
                              type: "row",
                              class: "items-center gap-3",
                              children: [
                                { type: "text", value: "图片：" },
                                {
                                  type: "text",
                                  value: "(仅支持 DCTDecode/JPXDecode 直显)",
                                },
                              ],
                            },
                            {
                              type: "row",
                              class: "items-center gap-3",
                              children: [
                                { type: "text", value: "尺寸：" },
                                { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.width" } },
                                { type: "text", value: "x" },
                                { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.height" } },
                                { type: "text", value: "  颜色空间：" },
                                { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.color_space" } },
                                { type: "text", value: "  过滤：" },
                                { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.filter" } },
                              ],
                            },
                            {
                              type: "pdf_image_map",
                              url_provider: {
                                type: ExpressionType.Expression,
                                expr: [
                                  { type: ExpressionType.Ref, id: "pdf::object_image_data_url" },
                                  {
                                    type: ExpressionType.Call,
                                    children: [
                                      { type: ExpressionType.Ref, id: "input" },
                                      { type: ExpressionType.Ref, id: "obj" },
                                    ],
                                  },
                                ],
                              },
                              style: "max-width: 480px; border: 1px solid #eee; border-radius: 6px;",
                            } as any,
                          ],
                        },
                        {
                          type: "if",
                          condition: {
                            type: ExpressionType.Expression,
                            expr: [
                              { type: ExpressionType.Ref, id: "obj.is_image" },
                              { type: ExpressionType.Operator, value: "eq" },
                              { type: ExpressionType.BooleanLiteral, value: false },
                            ],
                          },
                          children: [
                            {
                              type: "if",
                              condition: {
                                type: ExpressionType.Expression,
                                expr: [
                                  { type: ExpressionType.Ref, id: "list::size" },
                                  { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "obj.kv_rows" }] },
                                  { type: ExpressionType.Operator, value: "gt" },
                                  { type: ExpressionType.UintLiteral, value: 0 },
                                ],
                              },
                              children: [
                                {
                                  type: "table_of_rows",
                                  provider: { type: ExpressionType.Ref, id: "obj.kv_rows" },
                                  columns: [
                                    { key: "key", title: "键", width: "160px" },
                                    { key: "value", title: "值" },
                                  ],
                                },
                              ],
                            },
                            {
                              type: "if",
                              condition: {
                                type: ExpressionType.Expression,
                                expr: [
                                  { type: ExpressionType.Ref, id: "list::size" },
                                  { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "obj.kv_rows" }] },
                                  { type: ExpressionType.Operator, value: "eq" },
                                  { type: ExpressionType.UintLiteral, value: 0 },
                                ],
                              },
                              children: [
                                {
                                  type: "row",
                                  children: [
                                    { type: "text", value: "预览：" },
                                    { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.preview" } },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          type: "if",
                          condition: {
                            type: ExpressionType.Expression,
                            expr: [{ type: ExpressionType.Ref, id: "obj.has_stream" }],
                          },
                          children: [
                            {
                              type: "row",
                              class: "items-center gap-2 mt-2 pt-2 border-t",
                              children: [
                                { type: "text", class: "font-semibold", value: "Stream Hex Preview:" },
                                { type: "text_map", class:"font-mono", provider: { type: ExpressionType.Ref, id: "obj.stream_preview_hex" } },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};


