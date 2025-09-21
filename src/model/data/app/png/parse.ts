import { ExpressionType } from "../../base";
import { type ParseSchema, ByteOrder } from "../../parse/type";

export const png_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.BigEndian,
  },
  template: {},
  spec: [
    // PNG signature (8 bytes): 89 50 4E 47 0D 0A 1A 0A
    {
      type: "bytes",
      id: "signature",
      length: {
        type: ExpressionType.Expression,
        expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
      },
      emit: false, // 魔数不输出
    },
    // Chunk loop
    {
      type: "list",
      id: "chunks",
      items: [
        // length and type
        { type: "uint", id: "length", length: 4 },
        { type: "ascii", id: "type", length: 4 },
        // chunk data by type
        {
          type: "switch",
          on: {
            type: ExpressionType.Expression,
            expr: [{ type: ExpressionType.Ref, id: "type" }],
          },
          cases: {
            // Image Header
            IHDR: [
              { type: "uint", id: "width", length: 4 },
              { type: "uint", id: "height", length: 4 },
              { type: "uint", id: "bit_depth", length: 1 },
              { type: "uint", id: "color_type", length: 1 },
              { type: "uint", id: "compression_method", length: 1 },
              { type: "uint", id: "filter_method", length: 1 },
              { type: "uint", id: "interlace_method", length: 1 },
            ],
            // Palette
            PLTE: [
              {
                type: "list",
                id: "palette",
                items: [
                  { type: "uint", id: "r", length: 1 },
                  { type: "uint", id: "g", length: 1 },
                  { type: "uint", id: "b", length: 1 },
                ],
                count: {
                  type: ExpressionType.Expression,
                  expr: [
                    { type: ExpressionType.Ref, id: "length" },
                    { type: ExpressionType.Operator, value: "/" },
                    { type: ExpressionType.UintLiteral, value: 3 },
                  ],
                },
              },
            ],
            // Physical pixel dimensions
            pHYs: [
              { type: "uint", id: "pixels_per_unit_x", length: 4 },
              { type: "uint", id: "pixels_per_unit_y", length: 4 },
              { type: "uint", id: "unit_specifier", length: 1 },
            ],
            // Textual data (Latin-1, keyword\0text)
            tEXt: [
              {
                type: "bytes",
                id: "data",
                length: {
                  type: ExpressionType.Expression,
                  expr: [{ type: ExpressionType.Ref, id: "length" }],
                },
              },
            ],
            // Significant bits
            sBIT: [
              {
                type: "bytes",
                id: "data",
                length: {
                  type: ExpressionType.Expression,
                  expr: [{ type: ExpressionType.Ref, id: "length" }],
                },
              },
            ],
            // Default: read raw data
            default: [
              {
                type: "bytes",
                id: "data",
                length: {
                  type: ExpressionType.Expression,
                  expr: [{ type: ExpressionType.Ref, id: "length" }],
                },
              },
            ],
          },
        },
        // CRC (always 4 bytes)
        { type: "uint", id: "crc", length: 4 },
        // 无需额外节点，list.stop_when 已处理终止
      ],
      stop_when: {
        type: ExpressionType.Expression,
        expr: [
          { type: ExpressionType.Ref, id: "type" },
          { type: ExpressionType.Operator, value: "eq" },
          { type: ExpressionType.TextLiteral, value: "IEND" },
        ],
      },
    },
  ],
};
