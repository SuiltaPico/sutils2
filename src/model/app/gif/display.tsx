import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

export const enum GifBlock {
  Extension = 0x21,
  Image = 0x2c,
  Trailer = 0x3b,
}
export const enum GifExtension {
  GraphicControl = 0xf9,
  Application = 0xff,
  Comment = 0xfe,
  PlainText = 0x01,
}

const color_table_template: Template = {
  params: [{ type: "param", id: "color_table" }],
  spec: [
    {
      type: "row",
      children: [
        {
          type: "list_map",
          provider: { type: ExpressionType.Ref, id: "color_table" },
          item_param: "item",
          children: [
            {
              type: "rgb_color_map",
              r_provider: { type: ExpressionType.Ref, id: "item.r" },
              g_provider: { type: ExpressionType.Ref, id: "item.g" },
              b_provider: { type: ExpressionType.Ref, id: "item.b" },
            },
          ],
        },
      ],
    },
  ],
};

const app_extension_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "row",
      children: [{ type: "text", value: "扩展标签：应用程序扩展" }],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "应用标识符：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.app_identifier",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "应用授权码：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.app_auth_code",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "循环次数：" },
        {
          type: "text_match_map",
          provider: { type: ExpressionType.Ref, id: "item.loop_count" },
          text_matcher: { 0: "无限" },
        },
      ],
    },
  ],
};

const graphic_control_extension_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "row",
      children: [{ type: "text", value: "扩展标签：图形控件扩展" }],
    },
    {
      type: "row",
      children: [{ type: "text", value: "块大小：4 字节" }],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "处置方法：" },
        {
          type: "text_match_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.disposal_method",
          },
          text_matcher: {
            0: "未指定",
            1: "不处置",
            2: "恢复背景色",
            3: "恢复上一个图像",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "用户输入：" },
        {
          type: "check_box_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.user_input_flag",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "透明色：" },
        {
          type: "check_box_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.transparent_color_flag",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "延迟时间：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.delay_time" },
              { type: ExpressionType.Operator, value: "*" },
              { type: ExpressionType.UintLiteral, value: 10 },
            ],
          },
        },
        { type: "text", value: " 毫秒" },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "透明色索引：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.transparent_color_index",
          },
        },
      ],
    },
  ],
};

const comment_extension_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "row",
      children: [{ type: "text", value: "扩展标签：注释扩展" }],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "注释内容：" },
        { type: "text", value: "(暂未实现)" },
      ],
    },
  ],
};

const plain_text_extension_template: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "row",
      children: [{ type: "text", value: "扩展标签：纯文本扩展" }],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "文本网格：" },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.text_grid_width" },
        },
        { type: "text", value: "x" },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.text_grid_height" },
        },
        { type: "text", value: " @ (" },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.text_grid_left" },
        },
        { type: "text", value: ", " },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.text_grid_top" },
        },
        { type: "text", value: ")" },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "字符网格：" },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.char_cell_width" },
        },
        { type: "text", value: "x" },
        {
          type: "text_map",
          provider: { type: ExpressionType.Ref, id: "item.char_cell_height" },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "前景颜色索引：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.text_fg_color_index",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "背景颜色索引：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.text_bg_color_index",
          },
        },
      ],
    },
  ],
};

const image_data_template: Template = {
  params: [
    { type: "param", id: "item" },
    { type: "param", id: "global_color_table" },
    { type: "param", id: "idx" },
  ],
  spec: [
    {
      type: "row",
      children: [
        { type: "text", value: "图像尺寸：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.image_width",
          },
        },
        { type: "text", value: "x" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.image_height",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "图像位置：(" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.image_left",
          },
        },
        { type: "text", value: ", " },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.image_top",
          },
        },
        { type: "text", value: ")" },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "局部颜色表：" },
        {
          type: "check_box_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.local_color_table_flag",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "局部颜色表排序：" },
        {
          type: "check_box_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.sort_flag",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "局部颜色表项数：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.size_of_local_color_table",
          },
        },
      ],
    },
    {
      type: "if",
      condition: {
        type: ExpressionType.Ref,
        id: "item.local_color_table_flag",
      },
      children: [
        { type: "text", value: "局部颜色表：" },
        {
          type: "template_ref",
          id: "color_table",
          params: {
            color_table: { type: ExpressionType.Ref, id: "item.color_table" },
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "隔行扫描：" },
        {
          type: "check_box_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.interlace_flag",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "最小码字长度：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Ref,
            id: "item.lzw_minimum_code_size",
          },
        },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "数据子块数量：" },
        {
          type: "text_map",
          provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "list::size" },
              {
                type: ExpressionType.Call,
                children: [{ type: ExpressionType.Ref, id: "item.sub_blocks" }],
              },
            ],
          },
        },
        {
          type: "text",
          value: " 个",
        },
      ],
    },
    {
      type: "row",
      children: [
        {
          type: "gif_image_map",
          width_provider: { type: ExpressionType.Ref, id: "item.image_width" },
          height_provider: {
            type: ExpressionType.Ref,
            id: "item.image_height",
          },
          interlace_provider: {
            type: ExpressionType.Ref,
            id: "item.interlace_flag",
          },
          lzw_min_code_size_provider: {
            type: ExpressionType.Ref,
            id: "item.lzw_minimum_code_size",
          },
          sub_blocks_provider: {
            type: ExpressionType.Ref,
            id: "item.sub_blocks",
          },
          transparent_index_provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "gif::find_gce_prop" },
              {
                type: ExpressionType.Call,
                children: [
                  { type: ExpressionType.Ref, id: "input.blocks" },
                  { type: ExpressionType.Ref, id: "idx" },
                  {
                    type: ExpressionType.TextLiteral,
                    value: "transparent_color_index",
                  },
                ],
              },
            ],
          },
          palette_provider: {
            type: ExpressionType.MatchExpr,
            condition: {
              type: ExpressionType.Ref,
              id: "item.local_color_table_flag",
            },
            cases: [
              {
                type: ExpressionType.MatchCase,
                item: { type: ExpressionType.BooleanLiteral, value: true },
                children: { type: ExpressionType.Ref, id: "item.color_table" },
              },
              {
                type: ExpressionType.MatchCase,
                item: { type: ExpressionType.BooleanLiteral, value: false },
                children: {
                  type: ExpressionType.Ref,
                  id: "global_color_table",
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

const block_template: Template = {
  params: [
    { type: "param", id: "item" },
    { type: "param", id: "global_color_table" },
    { type: "param", id: "idx" },
  ],
  spec: [
    {
      type: "column",
      class:
        "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
      children: [
        {
          type: "row",
          children: [
            {
              type: "text_match_map",
              class: "font-bold",
              provider: {
                type: ExpressionType.Ref,
                id: "item.block_introducer",
              },
              text_matcher: {
                [GifBlock.Extension]: "扩展块",
                [GifBlock.Image]: "图像块",
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.extension_label" },
              { type: ExpressionType.Operator, value: "eq" },
              {
                type: ExpressionType.UintLiteral,
                value: GifExtension.Application,
              },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "app_extension",
              params: {
                item: {
                  type: ExpressionType.Ref,
                  id: "item",
                },
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.extension_label" },
              { type: ExpressionType.Operator, value: "eq" },
              {
                type: ExpressionType.UintLiteral,
                value: GifExtension.GraphicControl,
              },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "graphic_control_extension",
              params: {
                item: { type: ExpressionType.Ref, id: "item" },
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.extension_label" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: GifExtension.Comment },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "comment_extension",
              params: {
                item: { type: ExpressionType.Ref, id: "item" },
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.extension_label" },
              { type: ExpressionType.Operator, value: "eq" },
              {
                type: ExpressionType.UintLiteral,
                value: GifExtension.PlainText,
              },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "plain_text_extension",
              params: {
                item: { type: ExpressionType.Ref, id: "item" },
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "item.block_introducer" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: GifBlock.Image },
            ],
          },
          children: [
            {
              type: "template_ref",
              id: "image_data",
              params: {
                item: { type: ExpressionType.Ref, id: "item" },
                global_color_table: {
                  type: ExpressionType.Ref,
                  id: "global_color_table",
                },
                idx: { type: ExpressionType.Ref, id: "idx" },
              },
            },
          ],
        },
      ],
    },
  ],
};

export const gif_ds: DisplaySchema = {
  template: {
    color_table: color_table_template,
    app_extension: app_extension_template,
    graphic_control_extension: graphic_control_extension_template,
    comment_extension: comment_extension_template,
    plain_text_extension: plain_text_extension_template,
    image_data: image_data_template,
    block: block_template,
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
            {
              type: "text",
              class: "font-bold",
              value: "GIF 文件信息",
            },
            {
              type: "row",
              children: [
                { type: "text", value: "版本：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "input.version" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "尺寸：" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "input.width" },
                },
                { type: "text", value: "x" },
                {
                  type: "text_map",
                  provider: { type: ExpressionType.Ref, id: "input.height" },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "全局颜色表：" },
                {
                  type: "check_box_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "input.global_color_table_flag",
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "背景色索引：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "input.background_color_index",
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "像素纵横比：" },
                {
                  type: "text_match_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "input.pixel_aspect_ratio",
                  },
                  text_matcher: { 0: "未指定" } as any,
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "颜色分辨率：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      {
                        type: ExpressionType.Ref,
                        id: "input.color_resolution_flag",
                      },
                      { type: ExpressionType.Operator, value: "+" },
                      { type: ExpressionType.UintLiteral, value: 1 },
                    ],
                  },
                },
                { type: "text", value: " 位" },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "全局颜色表排序：" },
                {
                  type: "check_box_map",
                  provider: {
                    type: ExpressionType.Ref,
                    id: "input.sorted_flag",
                  },
                },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "全局颜色表项数：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.UintLiteral, value: 2 },
                      { type: ExpressionType.Operator, value: "pow" },
                      {
                        type: ExpressionType.Expression,
                        expr: [
                          {
                            type: ExpressionType.Ref,
                            id: "input.color_table_size_flag",
                          },
                          { type: ExpressionType.Operator, value: "+" },
                          { type: ExpressionType.UintLiteral, value: 1 },
                        ],
                      },
                    ],
                  },
                },
                { type: "text", value: " 项" },
              ],
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Ref,
            id: "input.global_color_table_flag",
          },
          children: [
            {
              type: "column",
              class:
                "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
              children: [
                { type: "text", class: "font-bold", value: "全局颜色表" },
                {
                  type: "template_ref",
                  id: "color_table",
                  params: {
                    color_table: {
                      type: ExpressionType.Ref,
                      id: "input.color_table",
                    },
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
            { type: "text", class: "font-bold", value: "块" },
            {
              type: "row",
              class: "flex flex-row gap-2 items-start flex-shrink-0 flex-wrap",
              children: [
                {
                  type: "list_map",
                  provider: { type: ExpressionType.Ref, id: "input.blocks" },
                  item_param: "item",
                  index_param: "idx",
                  children: [
                    {
                      type: "template_ref",
                      id: "block",
                      params: {
                        item: { type: ExpressionType.Ref, id: "item" },
                        idx: { type: ExpressionType.Ref, id: "idx" },
                        global_color_table: {
                          type: ExpressionType.Ref,
                          id: "input.color_table",
                        },
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
