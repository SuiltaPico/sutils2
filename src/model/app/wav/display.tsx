import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

const chunk_template: Template = {
  params: [{ type: "param", id: "c" }],
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
            { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.chunk_id" } },
            { type: "text", value: "  (" },
            { type: "text", value: "Size: " },
            { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.size" } },
            { type: "text", value: ")" },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "c.chunk_id" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "fmt " },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "fmt" },
            {
              type: "row",
              children: [
                { type: "text", value: "格式：" },
                {
                  type: "text_map",
                  provider: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "wav::format_name" },
                      { type: ExpressionType.Call, children: [ { type: ExpressionType.Ref, id: "c.audio_format" } ] },
                    ],
                  },
                },
                { type: "text", value: "  通道数：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.num_channels" } },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "采样率：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.sample_rate" } },
                { type: "text", value: " Hz  位深：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.bits_per_sample" } },
                { type: "text", value: " bit" },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "字节率：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.byte_rate" } },
                { type: "text", value: "  块对齐：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.block_align" } },
              ],
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "c.chunk_id" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.TextLiteral, value: "data" },
            ],
          },
          children: [
            { type: "text", class: "font-bold", value: "data" },
            {
              type: "row",
              children: [
                { type: "text", value: "样本数据字节数：" },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "c.size" } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const wav_ds: DisplaySchema = {
  template: {
    chunk: chunk_template,
  },
  nodes: [
    { type: "text", class: "text-lg font-bold", value: "WAV 文件" },
    {
      type: "row",
      children: [
        { type: "text", value: "RIFF: " },
        { type: "text_map", provider: { type: ExpressionType.Ref, id: "input.riff_id" } },
        { type: "text", value: "  Format: " },
        { type: "text_map", provider: { type: ExpressionType.Ref, id: "input.format" } },
      ],
    },
    {
      type: "row",
      children: [
        { type: "text", value: "文件大小字段：" },
        { type: "text_map", provider: { type: ExpressionType.Ref, id: "input.file_size" } },
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
              item_param: "c",
              children: [
                { type: "template_ref", id: "chunk", params: { c: { type: ExpressionType.Ref, id: "c" } } },
              ],
            },
          ],
        },
      ],
    },
  ],
};


