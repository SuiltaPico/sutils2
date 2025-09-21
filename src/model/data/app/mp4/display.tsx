import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

const ftyp_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "主品牌：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Ref,
          id: "item.major_brand",
        },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "次要版本：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Ref,
          id: "item.minor_version",
        },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "兼容品牌：" },
      {
        type: "list_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Ref,
              id: "mp4::parse_compatible_brands",
            },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.Ref,
                  id: "item.compatible_brands_raw",
                },
              ],
            },
          ],
        },
        item_param: "brand",
        children: [
          {
            type: "row",
            class:
              "px-2 py-1 rounded border border-gray-300 text-xs bg-gray-50",
            children: [
              {
                type: "text_map",
                provider: { type: ExpressionType.Ref, id: "brand" },
              },
            ],
          },
        ],
      },
    ],
  },
];

const mvhd_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "创建时间：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::mp4_time_to_iso" },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.MatchExpr,
                  condition: { type: ExpressionType.Ref, id: "item.version" },
                  cases: [
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 1 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.creation_time_bytes",
                      },
                    },
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 0 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.creation_time",
                      },
                    },
                  ],
                },
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
      { type: "text", value: "修改时间：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::mp4_time_to_iso" },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.MatchExpr,
                  condition: { type: ExpressionType.Ref, id: "item.version" },
                  cases: [
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 1 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.modification_time_bytes",
                      },
                    },
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 0 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.modification_time",
                      },
                    },
                  ],
                },
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
      { type: "text", value: "时基：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.timescale" },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "时长：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::seconds_from_timescale" },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.MatchExpr,
                  condition: { type: ExpressionType.Ref, id: "item.version" },
                  cases: [
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 1 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.duration_bytes",
                      },
                    },
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 0 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.duration",
                      },
                    },
                  ],
                },
                { type: ExpressionType.Ref, id: "item.timescale" },
              ],
            },
          ],
        },
      },
      { type: "text", value: "秒" },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "播放速率：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" },
            {
              type: ExpressionType.Call,
              children: [{ type: ExpressionType.Ref, id: "item.rate" }],
            },
          ],
        },
      },
      { type: "text", value: "倍" },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "音量：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::fixed88_to_float" },
            {
              type: ExpressionType.Call,
              children: [{ type: ExpressionType.Ref, id: "item.volume" }],
            },
          ],
        },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "下一个轨道ID：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.next_track_id" },
      },
    ],
  },
];

const tkhd_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "创建时间：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::mp4_time_to_iso" },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.MatchExpr,
                  condition: { type: ExpressionType.Ref, id: "item.version" },
                  cases: [
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 1 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.creation_time_bytes",
                      },
                    },
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 0 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.creation_time",
                      },
                    },
                  ],
                },
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
      { type: "text", value: "修改时间：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::mp4_time_to_iso" },
            {
              type: ExpressionType.Call,
              children: [
                {
                  type: ExpressionType.MatchExpr,
                  condition: { type: ExpressionType.Ref, id: "item.version" },
                  cases: [
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 1 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.modification_time_bytes",
                      },
                    },
                    {
                      type: ExpressionType.MatchCase,
                      item: { type: ExpressionType.UintLiteral, value: 0 },
                      children: {
                        type: ExpressionType.Ref,
                        id: "item.modification_time",
                      },
                    },
                  ],
                },
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
      { type: "text", value: "轨道ID：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.track_id" },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "时长 (原始值, movie timescale): " },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.MatchExpr,
          condition: { type: ExpressionType.Ref, id: "item.version" },
          cases: [
            {
              type: ExpressionType.MatchCase,
              item: { type: ExpressionType.UintLiteral, value: 1 },
              children: {
                type: ExpressionType.Ref,
                id: "item.duration_bytes",
              },
            },
            {
              type: ExpressionType.MatchCase,
              item: { type: ExpressionType.UintLiteral, value: 0 },
              children: { type: ExpressionType.Ref, id: "item.duration" },
            },
          ],
        },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "层级 (layer): " },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.layer" },
      },
      { type: "text", value: "备用组: " },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.alternate_group" },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "音量: " },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::fixed88_to_float" },
            {
              type: ExpressionType.Call,
              children: [{ type: ExpressionType.Ref, id: "item.volume" }],
            },
          ],
        },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "保留字段 1, 2a, 2b, 3：" },
      { type: "text_map", provider: { type: ExpressionType.Ref, id: "item.reserved1" } },
      { type: "text", value: ", " },
      { type: "text_map", provider: { type: ExpressionType.Ref, id: "item.reserved2a" } },
      { type: "text", value: ", " },
      { type: "text_map", provider: { type: ExpressionType.Ref, id: "item.reserved2b" } },
      { type: "text", value: ", " },
      { type: "text_map", provider: { type: ExpressionType.Ref, id: "item.reserved3" } },
    ],
  },
  {
    type: "column",
    class: "flex flex-col",
    children: [
      { type: "text", value: "变换矩阵：" },
      {
        type: "row",
        class: "gap-2",
        children: [
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_a" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_b" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_u" }] } ] } },
        ],
      },
      {
        type: "row",
        class: "gap-2",
        children: [
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_c" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_d" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_v" }] } ] } },
        ],
      },
      {
        type: "row",
        class: "gap-2",
        children: [
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_x" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_y" }] } ] } },
          { type: "text_map", provider: { type: ExpressionType.Expression, expr: [ { type: ExpressionType.Ref, id: "mp4::fixed1616_to_float" }, { type: ExpressionType.Call, children: [{ type: ExpressionType.Ref, id: "item.matrix_w" }] } ] } },
        ],
      },
    ],
  },
];

const mdhd_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "时基(timescale)：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.timescale" },
      },
    ],
  },
  {
    type: "row",
    children: [
      { type: "text", value: "语言：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::mdhd_lang_code" },
            {
              type: ExpressionType.Call,
              children: [{ type: ExpressionType.Ref, id: "item.language" }],
            },
          ],
        },
      },
    ],
  },
];

const hdlr_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "处理器：" },
      {
        type: "text_map",
        provider: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "mp4::handler_name_zh" },
            {
              type: ExpressionType.Call,
              children: [{ type: ExpressionType.Ref, id: "item.handler_type" }],
            },
          ],
        },
      },
      { type: "text", value: " (" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.handler_type" },
      },
      { type: "text", value: ")" },
    ],
  },
];

const entry_count_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "条目数：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.entry_count" },
      },
    ],
  },
];

const sample_count_box_content: Template["spec"] = [
  {
    type: "row",
    children: [
      { type: "text", value: "采样数：" },
      {
        type: "text_map",
        provider: { type: ExpressionType.Ref, id: "item.sample_count" },
      },
    ],
  },
];

const box_item_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "column",
      class:
        "flex flex-col gap-1 flex-shrink-0 flex-wrap border border-gray-200 p-2 rounded",
      children: [
        {
          type: "row",
          children: [
            {
              type: "text_map",
              class: "font-bold",
              provider: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "mp4::box_name_zh" },
                  {
                    type: ExpressionType.Call,
                    children: [
                      { type: ExpressionType.Ref, id: "item.box_type" },
                    ],
                  },
                ],
              },
            },
            { type: "text", value: "类型: " },
            {
              type: "text_map",
              provider: { type: ExpressionType.Ref, id: "item.box_type" },
            },
            { type: "text", value: "大小: " },
            {
              type: "text_map",
              provider: { type: ExpressionType.Ref, id: "item.box_size" },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "ftyp" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "ftyp_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "mvhd" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "mvhd_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "tkhd" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "tkhd_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "mdhd" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "mdhd_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "hdlr" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "hdlr_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "stsd" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "entry_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "stts" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "entry_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "stsc" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "entry_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "stsz" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "sample_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "stco" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "entry_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.box_type" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "co64" },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "entry_count_box_content",
              params: { item: { type: ExpressionType.Ref, id: "item" } },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.children" },
              { type: ExpressionType.Operator, value: "ne" },
              { type: ExpressionType.TextLiteral, value: "" },
            ] as any,
          },
          children: [
            {
              type: "column",
              class: "flex flex-col gap-2",
              children: [
                {
                  type: "list_map",
                  provider: { type: ExpressionType.Ref, id: "item.children" },
                  item_param: "c",
                  children: [
                    {
                      type: "template_ref",
                      id: "box_item",
                      params: { item: { type: ExpressionType.Ref, id: "c" } },
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

export const mp4_ds: DisplaySchema = {
  template: {
    box_item: box_item_template,
    ftyp_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: ftyp_box_content,
    },
    mvhd_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: mvhd_box_content,
    },
    tkhd_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: tkhd_box_content,
    },
    mdhd_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: mdhd_box_content,
    },
    hdlr_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: hdlr_box_content,
    },
    entry_count_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: entry_count_box_content,
    },
    sample_count_box_content: {
      params: [{ type: "param", id: "item" }],
      spec: sample_count_box_content,
    },
  },
  nodes: [
    {
      type: "column",
      class:
        "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
      children: [
        { type: "text", class: "font-bold", value: "MP4 文件信息" },
        {
          type: "column",
          class: "flex flex-col gap-2",
          children: [
            {
              type: "list_map",
              provider: { type: ExpressionType.Ref, id: "input.boxes" },
              item_param: "item",
              children: [
                {
                  type: "template_ref",
                  id: "box_item",
                  params: { item: { type: ExpressionType.Ref, id: "item" } },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
