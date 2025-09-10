import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

const segment_template: Template = {
  params: [{ type: "param", id: "seg" }],
  spec: [
    {
      type: "column",
      class:
        "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
      children: [
        {
          type: "row",
          children: [
            { type: "text", class: "font-bold", value: "Segment" },
            { type: "text", value: ": " },
            {
              type: "text_map",
              provider: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "jpeg::to_hex" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "seg.marker" },
                      { type: ExpressionType.UintLiteral, value: 2 },
                    ],
                  },
                ],
              },
            },
            { type: "text", value: "  (" },
            {
              type: "text_map",
              provider: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "jpeg::marker_name" },
                  {
                    type: ExpressionType.Call,
                    children: [{ type: ExpressionType.Ref, id: "seg.marker" }],
                  },
                ],
              },
            },
            { type: "text", value: ")" },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xc0 },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "SOF0 (Baseline)" },
            {
              type: "row",
              children: [
                { type: "text", value: "尺寸：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.width" },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.height" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "位深：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.precision" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "分量：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "seg.num_components",
                  },
                },
              ],
            },
            {
              type: "list_map",
              provider: { type: ExpressionType.Ref, id: "seg.components" },
              item_param: "c",
              index_param: "i",
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "#" },
                    {
                      type: "text_map",
                      provider: { type: ExpressionType.Ref, id: "i" },
                    },
                    { type: "text", value: "  id=" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "c.component_id",
                      },
                    },
                    { type: "text", value: "  名称=" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          {
                            type: ExpressionType.Ref,
                            id: "jpeg::component_name",
                          },
                          {
                            type: ExpressionType.Call,
                            children: [
                              {
                                type: ExpressionType.Ref,
                                id: "c.component_id",
                              },
                            ],
                          },
                        ],
                      },
                    },
                    { type: "text", value: "  采样=" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "c.h_sampling",
                      },
                    },
                    { type: "text", value: "x" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "c.v_sampling",
                      },
                    },
                    { type: "text", value: "  QTbl=" },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "c.quant_table_id",
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: "text",
              class: "text-xs text-gray-600",
              value:
                "提示：通常亮度(Y)组件使用量化表 ID=0，色度(Cb/Cr)组件使用 ID=1（但不绝对，以 SOF 中各组件的 QTbl 字段为准）。",
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xc2 },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "SOF2 (Progressive)" },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xe0 },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "APP0" },
            {
              type: "row",
              children: [
                { type: "text", value: "标识：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.identifier" },
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
                    type: ExpressionType.Ref,
                    id: "seg.version_major",
                  },
                },
                { type: "text", value: "." },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "seg.version_minor",
                  },
                },
                { type: "text", value: "  密度单位：" },
                {
                  type: "text_match_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "seg.density_units",
                  },
                  text_matcher: {
                    0: "无单位",
                    1: "每英寸",
                    2: "每厘米",
                  } as any,
                },
                { type: "text", value: "  像素密度：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.x_density" },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.y_density" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "缩略图尺寸：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.x_thumbnail" },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.y_thumbnail" },
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
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xdb },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "DQT（量化表）" },
            {
              type: "list_map",
              provider: { type: ExpressionType.Ref, id: "seg.tables" },
              item_param: "tbl",
              index_param: "i",
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "表 #" },
                    {
                      type: "text_map",
                      provider: { type: ExpressionType.Ref, id: "i" },
                    },
                    { type: "text", value: " ID: " },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "tbl.table_id",
                      },
                    },
                    { type: "text", value: " 精度: " },
                    {
                      type: "text_match_map",
                      provider: {
                        type: ExpressionType.Ref,
                        id: "tbl.precision",
                      },
                      text_matcher: { 0: "8-bit", 1: "16-bit" } as any,
                    },
                    { type: "text", value: "  被引用于组件: " },
                    {
                      type: "text_map",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          {
                            type: ExpressionType.Ref,
                            id: "jpeg::components_using_qtbl",
                          },
                          {
                            type: ExpressionType.Call,
                            children: [
                              {
                                type: ExpressionType.Ref,
                                id: "input.segments",
                              },
                              { type: ExpressionType.Ref, id: "tbl.table_id" },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  type: "text",
                  class: "text-sm text-gray-600",
                  value:
                    "下表为 8×8 频率分量的量化步长（左上低频 → 右下高频，值越大压缩越强）。列/行头为频率索引 0..7。",
                },
                {
                  type: "table_map",
                  class: "mt-1",
                  auto_headers: true,
                  heatmap: true,
                  axis_labels: { row: "v", col: "u" } as any,
                  show_coord_title: true,
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "jpeg::dezigzag" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "tbl.values" },
                        ],
                      },
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
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xc4 },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "DHT（哈夫曼表）" },
            {
              type: "list_map",
              provider: { type: ExpressionType.Ref, id: "seg.tables" },
              item_param: "tbl",
              index_param: "i",
              children: [
                {
                  type: "row",
                  children: [
                    { type: "text", value: "表 #" },
                    {
                      type: "text_map",
                      provider: { type: ExpressionType.Ref, id: "i" },
                    },
                    { type: "text", value: " ID: " },
                    {
                      type: "text_map",
                      provider: { type: ExpressionType.Ref, id: "tbl.table_id" },
                    },
                    { type: "text", value: " 类型: " },
                    {
                      type: "text_match_map",
                      provider: { type: ExpressionType.Ref, id: "tbl.table_class" },
                      text_matcher: { 0: "DC", 1: "AC" } as any,
                    },
                  ],
                },
                {
                  type: "collapse",
                  title: "展开查看完整哈夫曼码表",
                  summary: [
                    {
                      type: "row",
                      children: [
                        { type: "text", value: "码长统计: " },
                        {
                          type: "text_map",
                          provider: {
                            type: ExpressionType.Expression,
                            expr: [
                              { type: ExpressionType.Ref, id: "jpeg::bytes_preview_hex" },
                              { type: ExpressionType.Call, children: [
                                { type: ExpressionType.Ref, id: "tbl.counts" },
                                { type: ExpressionType.UintLiteral, value: 16 },
                              ] },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                  details: [
                    { type: "text", class: "text-sm text-gray-600", value: "根据 BITS/HUFFVAL 生成的码表：" },
                    {
                      type: "table_of_rows",
                      class: "mt-1",
                      provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "jpeg::generate_huffman_codes" },
                          { type: ExpressionType.Call, children: [
                            { type: ExpressionType.Ref, id: "tbl" },
                          ] },
                        ],
                      },
                      columns: [
                        { key: "length", title: "码长" } as any,
                        { key: "code", title: "哈夫曼码" } as any,
                        { key: "symbol_hex", title: "符号值" } as any,
                        { key: "meaning", title: "含义", width: "240px" } as any,
                      ] as any,
                    },
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
            expr: [
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xfe },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "COM（注释）" },
            {
              type: "row",
              children: [
                { type: "text", value: "长度：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "jpeg::payload_len" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "seg.payload" },
                        ],
                      },
                    ],
                  },
                },
                { type: "text", value: "字节" },
              ],
            },
            {
              type: "column",
              class:
                "p-1 bg-gray-100 rounded font-mono text-xs max-h-48 overflow-y-auto",
              children: [
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "jpeg::bytes_to_ascii" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "seg.payload" },
                        ],
                      },
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
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xe1 },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "APP1 (EXIF)" },
            {
              type: "row",
              children: [
                { type: "text", value: "TIFF 字节序：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "seg.tiff_endian" },
                },
                { type: "text", value: "  魔数：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "jpeg::to_hex" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "seg.tiff_magic" },
                          { type: ExpressionType.UintLiteral, value: 4 },
                        ],
                      },
                    ],
                  },
                },
                { type: "text", value: "  IFD0 偏移：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "seg.tiff_ifd0_offset",
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
              { type: ExpressionType.Ref, id: "seg.marker" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0xda },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "SOS" },
            {
              type: "row",
              children: [
                { type: "text", value: "扫描数据长度：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "seg.scan_data.length",
                  },
                },
                { type: "text", value: " 字节" },
              ],
            },
          ],
        },
        {
          // Generic APPx preview for E2..EF
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "jpeg::is_generic_app" },
              {
                type: ExpressionType.Call,
                children: [{ type: ExpressionType.Ref, id: "seg" }],
              },
            ],
          },
          children: [
            {
              type: "row",
              children: [
                { type: "text", value: "payload 长度：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "jpeg::payload_len" },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "seg.payload" },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "预览（hex）：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      {
                        type: ExpressionType.Ref,
                        id: "jpeg::bytes_preview_hex",
                      },
                      {
                        type: ExpressionType.Call,
                        children: [
                          { type: ExpressionType.Ref, id: "seg.payload" },
                          { type: ExpressionType.UintLiteral, value: 32 },
                        ],
                      },
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
};

export const jpeg_ds: DisplaySchema = {
  template: {
    segment: segment_template,
  },
  nodes: [
    { type: "text", class: "text-lg font-bold", value: "JPEG 文件" },
    {
      type: "row",
      children: [
        { type: "text", value: "SOI: " },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "jpeg::to_hex" },
              {
                type: ExpressionType.Call,
                children: [
                  { type: ExpressionType.Ref, id: "input.soi_ff" },
                  { type: ExpressionType.UintLiteral, value: 2 },
                ],
              },
            ],
          },
        },
        { type: "text", value: " " },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "jpeg::to_hex" },
              {
                type: ExpressionType.Call,
                children: [
                  { type: ExpressionType.Ref, id: "input.soi_d8" },
                  { type: ExpressionType.UintLiteral, value: 2 },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      type: "list_map",
      provider: { type: ExpressionType.Ref, id: "input.segments" },
      item_param: "seg",
      children: [
        {
          type: "if",
          condition: { type: ExpressionType.Ref, id: "seg.marker" },
          children: [
            {
              type: "template_ref",
              id: "segment",
              params: { seg: { type: ExpressionType.Ref, id: "seg" } },
            },
          ],
        },
      ],
    },
  ],
};
