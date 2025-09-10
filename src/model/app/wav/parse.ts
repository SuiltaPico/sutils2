import { ExpressionType } from "../../base";
import { type ParseSchema, ByteOrder } from "../../parse/type";

export const wav_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.LittleEndian,
  },
  template: {
    // 解析 fmt 子块（最少 16 字节），多余部分作为 extra 保存
    fmt_chunk: {
      params: [{ type: "param", id: "payload_length" }],
      spec: [
        { type: "uint", id: "audio_format", length: 2 },
        { type: "uint", id: "num_channels", length: 2 },
        { type: "uint", id: "sample_rate", length: 4 },
        { type: "uint", id: "byte_rate", length: 4 },
        { type: "uint", id: "block_align", length: 2 },
        { type: "uint", id: "bits_per_sample", length: 2 },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "payload_length" },
              { type: ExpressionType.Operator, value: "gt" },
              { type: ExpressionType.UintLiteral, value: 16 },
            ],
          },
          spec: [
            {
              type: "list",
              id: "extra",
              items: [{ type: "uint", id: "b", length: 1 }],
              count: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "payload_length" },
                  { type: ExpressionType.Operator, value: "+" },
                  { type: ExpressionType.UintLiteral, value: -16 },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  spec: [
    // RIFF 头
    { type: "ascii", id: "riff_id", length: 4 }, // "RIFF"
    { type: "uint", id: "file_size", length: 4 }, // 从此字段之后的总字节数
    { type: "ascii", id: "format", length: 4 }, // "WAVE"
    // 子块区域长度 = file_size - 4 (扣除 format 四字节)
    {
      type: "bounded",
      id: "chunks",
      length_expr: {
        type: ExpressionType.Expression,
        expr: [
          { type: ExpressionType.Ref, id: "file_size" },
          { type: ExpressionType.Operator, value: "+" },
          { type: ExpressionType.UintLiteral, value: -4 },
        ],
      },
      spec: [
        { type: "ascii", id: "chunk_id", length: 4 },
        { type: "uint", id: "size", length: 4 },
        {
          type: "switch",
          on: {
            type: ExpressionType.Expression,
            expr: [{ type: ExpressionType.Ref, id: "chunk_id" }],
          },
          cases: {
            // fmt 子块
            "fmt ": [
              {
                type: "template_ref",
                id: "fmt_chunk",
                params: {
                  payload_length: {
                    type: ExpressionType.Expression,
                    expr: [{ type: ExpressionType.Ref, id: "size" }],
                  },
                },
              },
            ],
            // data 子块直接读取原始字节（避免构造庞大的 list）
            data: [
              {
                type: "bytes",
                id: "data",
                length: {
                  type: ExpressionType.Expression,
                  expr: [{ type: ExpressionType.Ref, id: "size" }],
                },
              },
            ],
            // 其他子块按原始字节读取
            default: [
              {
                type: "bytes",
                id: "data",
                length: {
                  type: ExpressionType.Expression,
                  expr: [{ type: ExpressionType.Ref, id: "size" }],
                },
              },
            ],
          },
        },
        // 2 字节对齐到偶数（在 bounded 作用域相对对齐）
        { type: "align", to: 2, basis: "scope" },
      ],
    },
  ],
};


