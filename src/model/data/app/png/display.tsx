import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

const color_table_template: Template = {
  params: [{ type: "param", id: "palette" }],
  spec: [
    {
      type: "row",
      children: [
        {
          type: "list_map",
          provider: { type: ExpressionType.Ref, id: "palette" },
          item_param: "color",
          children: [
            {
              type: "rgb_color_map",
              r_provider: { type: ExpressionType.Ref, id: "color.r" },
              g_provider: { type: ExpressionType.Ref, id: "color.g" },
              b_provider: { type: ExpressionType.Ref, id: "color.b" },
            },
          ],
        },
      ],
    },
  ],
};

const chunk_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "column",
      class:
        "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
      children: [
        {
          type: "row",
          children: [
            { type: "text", class: "font-bold", value: "Chunk" },
            { type: "text", value: ": " },
            {
              type: "text_map",
              provider: { type: ExpressionType.Ref, id: "item.type" },
            },
            { type: "text", value: "  (" },
            { type: "text", value: "Length: " },
            {
              type: "text_map",
              provider: { type: ExpressionType.Ref, id: "item.length" },
            },
            { type: "text", value: ")" },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "IHDR" },
            ],
          },
          children: [
            {
              type: "row",
              children: [
                { type: "text", value: "尺寸：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "item.width" },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "item.height" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "位深：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "item.bit_depth" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "颜色类型：" },
                {
                  type: "text_match_map",
                  provider: { type: ExpressionType.Ref, id: "item.color_type" },
                  text_matcher: {
                    0: "Grayscale",
                    2: "Truecolor",
                    3: "Indexed-color",
                    4: "Grayscale with alpha",
                    6: "Truecolor with alpha",
                  } as any,
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "压缩：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.compression_method",
                  },
                },
                { type: "text", value: "  过滤：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.filter_method",
                  },
                },
                { type: "text", value: "  隔行：" },
                {
                  type: "text_match_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.interlace_method",
                  },
                  text_matcher: {
                    0: "None",
                    1: "Adam7",
                  } as any,
                },
              ],
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "PLTE" },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "调色板" },
            {
              type: "template_ref",
              id: "color_table",
              params: {
                palette: { type: ExpressionType.Ref, id: "item.palette" },
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "pHYs" },
            ],
          },
          children: [
            {
              type: "row",
              children: [
                { type: "text", value: "物理像素密度：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.pixels_per_unit_x",
                  },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.pixels_per_unit_y",
                  },
                },
                { type: "text", value: "  单位：" },
                {
                  type: "text_match_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "item.unit_specifier",
                  },
                  text_matcher: {
                    0: "未指定",
                    1: "米制",
                  } as any,
                },
              ],
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "tEXt" },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "文本信息" },
            {
              type: "row",
              children: [
                { type: "text", value: "关键字：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "png::parse_text_chunk" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "item.data" },
                        ],
                      },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "keyword" },
                    ],
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "内容：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "png::parse_text_chunk" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "item.data" },
                        ],
                      },
                      { type: ExpressionType.Operator, value: "access" },
                      { type: ExpressionType.TextLiteral, value: "text" },
                    ],
                  },
                },
              ],
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "sBIT" },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "有效位数 (sBIT)" },
            {
              type: "row",
              children: [
                { type: "text", value: "颜色类型：" },
                {
                  type: "text_match_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "input" },
                          {
                            type: ExpressionType.TextLiteral,
                            value: "color_type",
                          },
                        ],
                      },
                    ],
                  },
                  text_matcher: {
                    0: "灰度",
                    2: "真彩",
                    3: "索引",
                    4: "灰度+Alpha",
                    6: "真彩+Alpha",
                  } as any,
                },
              ],
            },
            {
              type: "if",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "input" },
                      { type: ExpressionType.TextLiteral, value: "color_type" },
                    ],
                  },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 0 },
                ],
              },
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "灰度有效位数：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "gray" },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: "if",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "input" },
                      { type: ExpressionType.TextLiteral, value: "color_type" },
                    ],
                  },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 2 },
                ],
              },
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "R：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "r" },
                        ],
                      },
                    },
                    { type: "text", value: "  G：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "g" },
                        ],
                      },
                    },
                    { type: "text", value: "  B：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "b" },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: "if",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "input" },
                      { type: ExpressionType.TextLiteral, value: "color_type" },
                    ],
                  },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 3 },
                ],
              },
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "调色板 R：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          {
                            type: ExpressionType.TextLiteral,
                            value: "palette",
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "r" },
                        ],
                      },
                    },
                    { type: "text", value: "  G：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          {
                            type: ExpressionType.TextLiteral,
                            value: "palette",
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "g" },
                        ],
                      },
                    },
                    { type: "text", value: "  B：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          {
                            type: ExpressionType.TextLiteral,
                            value: "palette",
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "b" },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: "if",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "input" },
                      { type: ExpressionType.TextLiteral, value: "color_type" },
                    ],
                  },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 4 },
                ],
              },
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "灰度：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "gray" },
                        ],
                      },
                    },
                    { type: "text", value: "  Alpha：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "a" },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: "if",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "png::get_ihdr_field" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "input" },
                      { type: ExpressionType.TextLiteral, value: "color_type" },
                    ],
                  },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 6 },
                ],
              },
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "R：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "r" },
                        ],
                      },
                    },
                    { type: "text", value: "  G：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "g" },
                        ],
                      },
                    },
                    { type: "text", value: "  B：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "b" },
                        ],
                      },
                    },
                    { type: "text", value: "  A：" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "png::parse_sbit" },
                          {
                            type: ExpressionType.Call,
                            children: [
                              { type: ExpressionType.Ref, id: "input" },
                              { type: ExpressionType.Ref, id: "item.data" },
                            ],
                          },
                          { type: ExpressionType.Operator, value: "access" },
                          { type: ExpressionType.TextLiteral, value: "a" },
                        ],
                      },
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

export const png_ds: DisplaySchema = {
  template: {
    color_table: color_table_template,
    chunk: chunk_template,
  },
  nodes: [
    {
      type: "column",
      children: [
        {
          type: "column",
          class:
            "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "PNG 文件信息" },
            {
              type: "row",
              children: [
                { type: "text", value: "签名：89 50 4E 47 0D 0A 1A 0A" },
              ],
            },
          ],
        },
        {
          type: "column",
          class:
            "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "Chunks" },
            {
              type: "row",
              class: "flex flex-row gap-2 items-start flex-shrink-0 flex-wrap",
              children: [
                {
                  type: "list_map",
                  provider: { type: ExpressionType.Ref, id: "input.chunks" },
                  item_param: "item",
                  children: [
                    {
                      type: "template_ref",
                      id: "chunk",
                      params: {
                        item: { type: ExpressionType.Ref, id: "item" },
                      },
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
