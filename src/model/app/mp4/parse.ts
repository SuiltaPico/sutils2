import { ExpressionType } from "../../base";
import { type ParseSchema, ByteOrder } from "../../parse/type";

// 最小可用 MP4 (ISO BMFF) 解析：仅读取首个 box（通常为 ftyp）
// 规范：
// - box: size(4) + type(4) + payload(size-8)
// - ftyp: major_brand(4), minor_version(4), compatible_brands(余下，每 4 字节一个)
export const mp4_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.BigEndian,
  },
  template: {
    // ---- Box Payloads as Templates ----
    ftyp_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "ascii", id: "major_brand", length: 4 },
        { type: "uint", id: "minor_version", length: 4 },
        {
          type: "bytes",
          id: "compatible_brands_raw",
          length: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -16 }, // size - (8 header + 8 fields)
            ],
          },
        },
      ],
    },
    container_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        {
          type: "template_ref",
          id: "children_boxes",
          params: {
            payload_len: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "box_size" },
                { type: ExpressionType.Operator, value: "+" },
                { type: ExpressionType.UintLiteral, value: -8 },
              ],
            },
          },
        },
      ],
    },
    unknown_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        {
          type: "bytes",
          id: "data",
          length: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -8 },
            ],
          },
        },
      ],
    },

    // ---- FullBox Payloads as Templates ----
    meta_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        {
          type: "template_ref",
          id: "children_boxes",
          params: {
            payload_len: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "box_size" },
                { type: ExpressionType.Operator, value: "+" },
                { type: ExpressionType.UintLiteral, value: -12 },
              ],
            },
          },
        },
      ],
    },
    mvhd_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 1 },
            ],
          },
          spec: [
            {
              type: "bytes",
              id: "creation_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
            {
              type: "bytes",
              id: "modification_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [
            { type: "uint", id: "creation_time", length: 4 },
            { type: "uint", id: "modification_time", length: 4 },
          ],
        },
        { type: "uint", id: "timescale", length: 4 },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 1 },
            ],
          },
          spec: [
            {
              type: "bytes",
              id: "duration_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [{ type: "uint", id: "duration", length: 4 }],
        },
        { type: "uint", id: "rate", length: 4 },
        { type: "uint", id: "volume", length: 2 },
        { type: "skip", length: 10 }, // reserved(16) + reserved(32)[2]
        { type: "skip", length: 36 }, // matrix[9]
        { type: "skip", length: 24 }, // pre_defined[6]
        { type: "uint", id: "next_track_id", length: 4 },
      ],
    },
    tkhd_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 1 },
            ],
          },
          spec: [
            {
              type: "bytes",
              id: "creation_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
              emit: true,
            },
            {
              type: "bytes",
              id: "modification_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
              emit: true,
            },
            { type: "uint", id: "track_id", length: 4 },
            { type: "uint", id: "reserved1", length: 4, emit: true },
            {
              type: "assert",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "reserved1" },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 0 },
                ],
              },
              message: "tkhd.reserved1 必须为 0",
            },
            {
              type: "bytes",
              id: "duration_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [
            { type: "uint", id: "creation_time", length: 4 },
            { type: "uint", id: "modification_time", length: 4 },
            { type: "uint", id: "track_id", length: 4 },
            { type: "uint", id: "reserved1", length: 4, emit: true },
            {
              type: "assert",
              condition: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "reserved1" },
                  { type: ExpressionType.Operator, value: "eq" },
                  { type: ExpressionType.UintLiteral, value: 0 },
                ],
              },
              message: "tkhd.reserved1 必须为 0",
            },
            { type: "uint", id: "duration", length: 4 },
          ],
        },
        { type: "uint", id: "reserved2a", length: 4, emit: true },
        { type: "uint", id: "reserved2b", length: 4, emit: true },
        {
          type: "assert",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "reserved2a" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          message: "tkhd.reserved2a 必须为 0",
        },
        {
          type: "assert",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "reserved2b" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          message: "tkhd.reserved2b 必须为 0",
        },
        { type: "int", id: "layer", length: 2 },
        { type: "int", id: "alternate_group", length: 2 },
        { type: "int", id: "volume", length: 2 },
        { type: "uint", id: "reserved3", length: 2, emit: true },
        {
          type: "assert",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "reserved3" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          message: "tkhd.reserved3 必须为 0",
        },
        // matrix (9 * 4bytes) 其中 a,b,u,c,d,v,x,y,w
        { type: "int", id: "matrix_a", length: 4 },
        { type: "int", id: "matrix_b", length: 4 },
        { type: "int", id: "matrix_u", length: 4 },
        { type: "int", id: "matrix_c", length: 4 },
        { type: "int", id: "matrix_d", length: 4 },
        { type: "int", id: "matrix_v", length: 4 },
        { type: "int", id: "matrix_x", length: 4 },
        { type: "int", id: "matrix_y", length: 4 },
        { type: "int", id: "matrix_w", length: 4 },
        { type: "uint", id: "width", length: 4 },
        { type: "uint", id: "height", length: 4 },
      ],
    },
    mdhd_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 1 },
            ],
          },
          spec: [
            {
              type: "bytes",
              id: "creation_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
            {
              type: "bytes",
              id: "modification_time_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [
            { type: "uint", id: "creation_time", length: 4 },
            { type: "uint", id: "modification_time", length: 4 },
          ],
        },
        { type: "uint", id: "timescale", length: 4 },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 1 },
            ],
          },
          spec: [
            {
              type: "bytes",
              id: "duration_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
        },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "version" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [{ type: "uint", id: "duration", length: 4 }],
        },
        { type: "uint", id: "language", length: 2 },
        { type: "skip", length: 2 },
      ],
    },
    hdlr_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "pre_defined", length: 4 },
        { type: "ascii", id: "handler_type", length: 4 },
        { type: "skip", length: 12 },
        {
          type: "bytes",
          id: "name_raw",
          length: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -32 },
            ],
          },
        },
      ],
    },
    dref_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "bounded",
          id: "entries",
          length_expr: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -16 },
            ],
          },
          spec: [
            { type: "uint", id: "entry_size", length: 4 },
            { type: "ascii", id: "type", length: 4 },
            {
              type: "bytes",
              id: "payload",
              length: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "entry_size" },
                  { type: ExpressionType.Operator, value: "+" },
                  { type: ExpressionType.UintLiteral, value: -8 },
                ],
              },
            },
          ],
        },
      ],
    },
    stsd_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "bounded",
          id: "entries",
          length_expr: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -16 },
            ],
          },
          spec: [
            // sample entry
            { type: "uint", id: "entry_size", length: 4 },
            { type: "ascii", id: "format", length: 4 },
            { type: "skip", length: 6 },
            { type: "uint", id: "data_reference_index", length: 2 },
            {
              type: "bytes",
              id: "payload",
              length: {
                type: ExpressionType.Expression,
                expr: [
                  { type: ExpressionType.Ref, id: "entry_size" },
                  { type: ExpressionType.Operator, value: "+" },
                  { type: ExpressionType.UintLiteral, value: -16 },
                ],
              },
            },
          ],
        },
      ],
    },
    stts_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "list",
          id: "entries",
          items: [
            { type: "uint", id: "sample_count", length: 4 },
            { type: "uint", id: "sample_delta", length: 4 },
          ],
          count: { type: ExpressionType.Ref, id: "entry_count" },
        },
      ],
    },
    stsc_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "list",
          id: "entries",
          items: [
            { type: "uint", id: "first_chunk", length: 4 },
            { type: "uint", id: "samples_per_chunk", length: 4 },
            {
              type: "uint",
              id: "sample_description_index",
              length: 4,
            },
          ],
          count: { type: ExpressionType.Ref, id: "entry_count" },
        },
      ],
    },
    stsz_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "sample_size", length: 4 },
        { type: "uint", id: "sample_count", length: 4 },
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "sample_size" },
              { type: ExpressionType.Operator, value: "eq" },
              { type: ExpressionType.UintLiteral, value: 0 },
            ],
          },
          spec: [
            {
              type: "list",
              id: "entry_sizes",
              items: [{ type: "uint", id: "size", length: 4 }],
              count: { type: ExpressionType.Ref, id: "sample_count" },
            },
          ],
        },
      ],
    },
    stco_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "list",
          id: "chunk_offsets",
          items: [{ type: "uint", id: "offset", length: 4 }],
          count: { type: ExpressionType.Ref, id: "entry_count" },
        },
      ],
    },
    co64_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "entry_count", length: 4 },
        {
          type: "list",
          id: "chunk_offsets",
          items: [
            {
              type: "bytes",
              id: "offset_bytes",
              length: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.UintLiteral, value: 8 }],
              },
            },
          ],
          count: { type: ExpressionType.Ref, id: "entry_count" },
        },
      ],
    },
    vmhd_box: {
      params: [{ type: "param", id: "box_size" }],
      spec: [
        { type: "template_ref", id: "fullbox_header" },
        { type: "uint", id: "graphicsmode", length: 2 },
        { type: "uint", id: "opcolor_r", length: 2 },
        { type: "uint", id: "opcolor_g", length: 2 },
        { type: "uint", id: "opcolor_b", length: 2 },
      ],
    },

    // FullBox 通用头：version(1) + flags(3)
    fullbox_header: {
      params: [],
      spec: [
        { type: "uint", id: "version", length: 1 },
        { type: "uint", id: "flags", length: 3 },
      ],
    },
    // 容器盒：读取剩余 payload 为子盒列表
    children_boxes: {
      params: [{ type: "param", id: "payload_len" }],
      spec: [
        {
          type: "bounded",
          id: "children",
          length_expr: { type: ExpressionType.Ref, id: "payload_len" },
          spec: [{ type: "template_ref", id: "box" }],
        },
      ],
    },
    // 解析通用 box 头与载荷，支持容器盒递归
    box: {
      params: [],
      spec: [
        { type: "uint", id: "box_size", length: 4 },
        { type: "ascii", id: "box_type", length: 4 },
        // 仅在 box_size >= 8 时生效
        {
          type: "if",
          condition: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "box_size" },
              { type: ExpressionType.Operator, value: "ge" },
              { type: ExpressionType.UintLiteral, value: 8 },
            ],
          },
          spec: [
            {
              type: "switch",
              on: {
                type: ExpressionType.Expression,
                expr: [{ type: ExpressionType.Ref, id: "box_type" }],
              },
              cases: {
                // File Type Box
                ftyp: [
                  {
                    type: "template_ref",
                    id: "ftyp_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                // Container Boxes
                moov: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                edts: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                dinf: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                mvex: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                udta: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                trak: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                mdia: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                minf: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stbl: [
                  {
                    type: "template_ref",
                    id: "container_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                meta: [
                  {
                    type: "template_ref",
                    id: "meta_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                // ---- Full Boxes with key fields ----
                mvhd: [
                  {
                    type: "template_ref",
                    id: "mvhd_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                tkhd: [
                  {
                    type: "template_ref",
                    id: "tkhd_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                mdhd: [
                  {
                    type: "template_ref",
                    id: "mdhd_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                hdlr: [
                  {
                    type: "template_ref",
                    id: "hdlr_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                // dref: 数据引用表（dinf 子盒内）
                dref: [
                  {
                    type: "template_ref",
                    id: "dref_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stsd: [
                  {
                    type: "template_ref",
                    id: "stsd_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stts: [
                  {
                    type: "template_ref",
                    id: "stts_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stsc: [
                  {
                    type: "template_ref",
                    id: "stsc_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stsz: [
                  {
                    type: "template_ref",
                    id: "stsz_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                stco: [
                  {
                    type: "template_ref",
                    id: "stco_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                co64: [
                  {
                    type: "template_ref",
                    id: "co64_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                vmhd: [
                  {
                    type: "template_ref",
                    id: "vmhd_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
                // 其他未知类型：按原始字节读取
                default: [
                  {
                    type: "template_ref",
                    id: "unknown_box",
                    params: {
                      box_size: { type: ExpressionType.Ref, id: "box_size" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  spec: [
    // 读取到文件末尾的盒列表
    {
      type: "bounded",
      id: "boxes",
      length_expr: { type: ExpressionType.Ref, id: "__input_length__" },
      spec: [{ type: "template_ref", id: "box" }],
    },
  ],
};
