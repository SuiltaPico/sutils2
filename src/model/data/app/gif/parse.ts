import { ExpressionType } from "../../base";
import { type ParseSchema, ByteOrder } from "../../parse/type";

export const gif_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.LittleEndian,
  },
  template: {
    color_table: {
      params: [{ type: "param", id: "size_flag_id" }],
      spec: [
        {
          type: "list",
          id: "color_table",
          items: [
            {
              type: "uint",
              id: "r",
              length: 1,
            },
            {
              type: "uint",
              id: "g",
              length: 1,
            },
            {
              type: "uint",
              id: "b",
              length: 1,
            },
          ],
          count: {
            type: ExpressionType.Expression,
            expr: [
              {
                type: ExpressionType.UintLiteral,
                value: 2,
              },
              {
                type: ExpressionType.Operator,
                value: "pow",
              },
              {
                type: ExpressionType.Expression,
                expr: [
                  {
                    type: ExpressionType.Ref,
                    id: "size_flag_id",
                  },
                  {
                    type: ExpressionType.Operator,
                    value: "+",
                  },
                  {
                    type: ExpressionType.UintLiteral,
                    value: 1,
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    data_sub_blocks: {
      params: [],
      spec: {
        type: "list",
        id: "sub_blocks",
        read_until: {
          type: ExpressionType.Expression,
          expr: [
            { type: ExpressionType.Ref, id: "$.size" },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.UintLiteral, value: 0 },
          ],
        },
        items: [
          { type: "uint", id: "size", length: 1 },
          {
            type: "bytes",
            id: "data",
            length: { type: ExpressionType.Ref, id: "size" },
          },
        ],
      },
    },
  },
  spec: [
    {
      // GIF
      type: "skip",
      length: 3,
    },
    {
      // 文件版本
      type: "ascii",
      id: "version",
      length: 3,
    },
    // ---- 逻辑屏幕描述符 ----
    {
      type: "uint",
      id: "width",
      length: 2,
    },
    {
      type: "uint",
      id: "height",
      length: 2,
    },
    {
      type: "bitfield",
      spec: [
        {
          type: "boolean",
          id: "global_color_table_flag",
          length: 1,
        },
        {
          type: "uint",
          id: "color_resolution_flag",
          length: 3,
        },
        {
          type: "boolean",
          id: "sorted_flag",
          length: 1,
        },
        {
          type: "uint",
          id: "color_table_size_flag",
          length: 3,
        },
      ],
    },
    {
      type: "uint",
      id: "background_color_index",
      length: 1,
    },
    {
      type: "uint",
      id: "pixel_aspect_ratio",
      length: 1,
    },
    // ---- 全局颜色表 ----
    {
      type: "if",
      condition: { type: ExpressionType.Ref, id: "global_color_table_flag" },
      spec: [
        {
          type: "template_ref",
          id: "color_table",
          params: {
            size_flag_id: {
              type: ExpressionType.Ref,
              id: "color_table_size_flag",
            },
          },
        },
      ],
    },
    {
      type: "list",
      id: "blocks",
      // 循环读取块，直到遇到文件尾 (0x3B)
      items: [
        {
          type: "uint",
          id: "block_introducer", // 读取块的第一个字节，即引导符
          length: 1,
        },
        {
          type: "switch",
          on: { type: ExpressionType.Ref, id: "block_introducer" },
          cases: {
            // Case 1: 扩展块 (Extension Block)
            0x21: [
              { type: "uint", id: "extension_label", length: 1 },
              {
                type: "switch",
                on: { type: ExpressionType.Ref, id: "extension_label" },
                cases: {
                  // 图形控制扩展 (Graphics Control Extension)
                  0xf9: [
                    { type: "skip", length: 1 }, // Block Size (固定为 4)
                    {
                      type: "bitfield",
                      id: "packed_field_gce",
                      spec: [
                        { type: "skip", length: 3 }, // Reserved
                        { type: "uint", id: "disposal_method", length: 3 },
                        { type: "boolean", id: "user_input_flag", length: 1 },
                        {
                          type: "boolean",
                          id: "transparent_color_flag",
                          length: 1,
                        },
                      ],
                    },
                    {
                      type: "uint",
                      id: "delay_time",
                      length: 2,
                    },
                    { type: "uint", id: "transparent_color_index", length: 1 },
                    { type: "skip", length: 1 }, // Block Terminator (0x00)
                  ],
                  // 应用程序扩展 (Application Extension) - 主要用于动画循环
                  0xff: [
                    { type: "skip", length: 1 }, // Block Size (固定为 11)
                    { type: "ascii", id: "app_identifier", length: 8 }, // e.g., "NETSCAPE"
                    { type: "ascii", id: "app_auth_code", length: 3 }, // e.g., "2.0"

                    // Data Sub-blocks for loop count
                    { type: "skip", length: 1 }, // Sub-block Size (固定为 3)
                    { type: "skip", length: 1 }, // Sub-block Index (固定为 1)
                    {
                      type: "uint",
                      id: "loop_count",
                      length: 2,
                    },
                    { type: "skip", length: 1 }, // Block Terminator (0x00)
                  ],
                  // 注释扩展 (Comment Extension)
                  0xfe: [
                    {
                      type: "template_ref",
                      id: "data_sub_blocks",
                    },
                  ],
                  // 纯文本扩展 (Plain Text Extension)
                  0x01: [
                    { type: "skip", length: 1 }, // Block Size (12)
                    { type: "uint", id: "text_grid_left", length: 2 },
                    { type: "uint", id: "text_grid_top", length: 2 },
                    { type: "uint", id: "text_grid_width", length: 2 },
                    { type: "uint", id: "text_grid_height", length: 2 },
                    { type: "uint", id: "char_cell_width", length: 1 },
                    { type: "uint", id: "char_cell_height", length: 1 },
                    { type: "uint", id: "text_fg_color_index", length: 1 },
                    { type: "uint", id: "text_bg_color_index", length: 1 },
                    {
                      type: "template_ref",
                      id: "data_sub_blocks",
                    },
                  ],
                  // 其他扩展可以类似定义，或直接跳过
                  default: [
                    {
                      type: "template_ref",
                      id: "data_sub_blocks",
                    },
                  ],
                },
              },
            ],
            // Case 2: 图像块 (Image Block)
            0x2c: [
              // ---- 图像描述符 (Image Descriptor) ----
              {
                type: "uint",
                id: "image_left",
                length: 2,
              },
              {
                type: "uint",
                id: "image_top",
                length: 2,
              },
              {
                type: "uint",
                id: "image_width",
                length: 2,
              },
              {
                type: "uint",
                id: "image_height",
                length: 2,
              },
              {
                type: "bitfield",
                id: "packed_field_id",
                spec: [
                  { type: "boolean", id: "local_color_table_flag", length: 1 },
                  { type: "boolean", id: "interlace_flag", length: 1 },
                  { type: "boolean", id: "sort_flag", length: 1 },
                  { type: "skip", length: 2 }, // Reserved
                  { type: "uint", id: "size_of_local_color_table", length: 3 },
                ],
              },
              // ---- 局部颜色表 (Local Color Table) - 可选 ----
              {
                type: "if",
                condition: {
                  type: ExpressionType.Ref,
                  id: "local_color_table_flag",
                },
                spec: [
                  {
                    type: "template_ref",
                    id: "color_table",
                    params: {
                      size_flag_id: {
                        type: ExpressionType.Ref,
                        id: "size_of_local_color_table",
                      },
                    },
                  },
                ],
              },
              // ---- 图像数据 (Image Data) ----
              { type: "uint", id: "lzw_minimum_code_size", length: 1 },
              {
                type: "template_ref",
                id: "data_sub_blocks",
              },
            ],
            // Case 3: 文件尾 (Trailer)
            0x3b: [],
          },
        },
      ],
      stop_when: {
        type: ExpressionType.Expression,
        expr: [
          { type: ExpressionType.Ref, id: "block_introducer" },
          { type: ExpressionType.Operator, value: "eq" },
          { type: ExpressionType.UintLiteral, value: 0x3b },
        ],
      },
    },
  ],
};
