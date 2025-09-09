import { ExpressionType } from "../../base";
import { type ParseSchema, ByteOrder } from "../../parse/type";

export const jpeg_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.BigEndian,
  },
  template: {
    // SOF 组件条目（3 字节）
    sof_component: {
      params: [],
      spec: [
        { type: "uint", id: "component_id", length: 1 },
        {
          type: "bitfield",
          id: "sampling_bits",
          spec: [
            { type: "uint", id: "h_sampling", length: 4 },
            { type: "uint", id: "v_sampling", length: 4 },
          ],
        },
        { type: "uint", id: "quant_table_id", length: 1 },
      ],
    },
    // DQT 量化表
    dqt_table: {
      params: [],
      spec: [
        {
          type: "bitfield",
          id: "dqt_header",
          spec: [
            { type: "uint", id: "precision", length: 4 }, // 0: 8-bit, 1: 16-bit
            { type: "uint", id: "table_id", length: 4 },
          ],
        },
        {
          type: "list",
          id: "values",
          items: [
            // 根据精度决定是读 8-bit 还是 16-bit 值
            // 这里简化为统一读 8-bit，因为 16-bit 不常用且需改动较多
            { type: "uint", id: "v", length: 1 },
          ],
          count: {
            type: ExpressionType.Expression,
            expr: [{ type: ExpressionType.UintLiteral, value: 64 }],
          },
        },
      ],
    },
    // DHT 哈夫曼表
    dht_table: {
      params: [],
      spec: [
        {
          type: "bitfield",
          id: "dht_header",
          spec: [
            { type: "skip", length: 3 },
            { type: "uint", id: "table_class", length: 1 }, // 0: DC, 1: AC
            { type: "uint", id: "table_id", length: 4 },
          ],
        },
        {
          type: "list",
          id: "counts",
          items: [{ type: "uint", id: "c", length: 1 }],
          count: {
            type: ExpressionType.Expression,
            expr: [{ type: ExpressionType.UintLiteral, value: 16 }],
          },
        },
        // 根据 counts 的总和决定 values 长度
        {
          type: "list",
          id: "values",
          items: [{ type: "uint", id: "v", length: 1 }],
          count: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "list::sum" },
              { type: ExpressionType.Call, children: [
                { type: ExpressionType.Ref, id: "$.counts" },
                { type: ExpressionType.TextLiteral, value: "c" },
              ] },
            ],
          },
        },
      ],
    },
    // SOF 公共头（不含 marker 与首 0xFF）
    sof_common: {
      params: [],
      spec: [
        { type: "uint", id: "length", length: 2 },
        { type: "uint", id: "precision", length: 1 },
        { type: "uint", id: "height", length: 2 },
        { type: "uint", id: "width", length: 2 },
        { type: "uint", id: "num_components", length: 1 },
        {
          type: "list",
          id: "components",
          items: [{ type: "template_ref", id: "sof_component" } as any],
          count: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "length" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -8 },
              { type: ExpressionType.Operator, value: "/" },
              { type: ExpressionType.UintLiteral, value: 3 },
            ],
          },
        },
      ],
    },
    // 通用：根据段长度消费剩余 payload（length 包含自身 2 字节）
    raw_payload: {
      params: [{ type: "param", id: "payload_length" }],
      spec: [
        {
          type: "list",
          id: "payload",
          items: [{ type: "uint", id: "b", length: 1 }],
          count: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "payload_length" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -2 },
            ],
          },
        },
      ],
    },
    // ICC Profile (APP2) 简要头解析模板（大端）
    icc_header: {
      params: [{ type: "param", id: "payload_length" }],
      spec: [
        // ICC header 固定长度 128 字节
        { type: "uint", id: "profile_size", length: 4 },
        { type: "ascii", id: "preferred_cmm", length: 4 },
        { type: "uint", id: "profile_version_raw", length: 4 },
        { type: "ascii", id: "device_class", length: 4 },
        { type: "ascii", id: "color_space", length: 4 },
        { type: "ascii", id: "pcs", length: 4 },
        // 日期时间 (year,month,day,hour,minute,second)
        { type: "uint", id: "date_year", length: 2 },
        { type: "uint", id: "date_month", length: 2 },
        { type: "uint", id: "date_day", length: 2 },
        { type: "uint", id: "date_hour", length: 2 },
        { type: "uint", id: "date_minute", length: 2 },
        { type: "uint", id: "date_second", length: 2 },
        { type: "ascii", id: "magic", length: 4 }, // "acsp"
        { type: "ascii", id: "platform", length: 4 },
        { type: "uint", id: "flags", length: 4 },
        { type: "ascii", id: "manufacturer", length: 4 },
        { type: "ascii", id: "model", length: 4 },
        { type: "uint", id: "attributes_hi", length: 4 },
        { type: "uint", id: "attributes_lo", length: 4 },
        { type: "uint", id: "rendering_intent", length: 4 },
        { type: "uint", id: "illuminant_x", length: 4 },
        { type: "uint", id: "illuminant_y", length: 4 },
        { type: "uint", id: "illuminant_z", length: 4 },
        { type: "ascii", id: "creator", length: 4 },
        // 余下作为 payload（若 APP2 长度不足 128+，本模板只读能读到的部分）
        {
          type: "list",
          id: "rest",
          items: [{ type: "uint", id: "b", length: 1 }],
          count: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "payload_length" },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -2 },
              { type: ExpressionType.Operator, value: "+" },
              { type: ExpressionType.UintLiteral, value: -128 },
            ],
          },
        },
      ],
    },
  },
  spec: [
    // SOI: FFD8
    { type: "uint", id: "soi_ff", length: 1 },
    { type: "uint", id: "soi_d8", length: 1 },
    {
      type: "loop_list",
      id: "segments",
      // 仅在成功读取了 marker 且 marker 非 0 的情况下收集该段
      // （prefix!=0xFF 时不会读取 marker；marker==0 表示 0xFF00 的 stuffed 字节，不收集）
      push_condition: {
        type: ExpressionType.Expression,
        expr: [{ type: ExpressionType.Ref, id: "length" }],
      },
      spec: [
        // 读取前缀，只有等于 0xFF 才继续读取 marker，否则本轮跳过（用于容错/对齐）
        { type: "uint", id: "prefix", length: 1 },
        {
          type: "switch",
          on: { type: ExpressionType.Ref, id: "prefix" },
          cases: {
            0xff: [
              { type: "uint", id: "marker", length: 1 },
              {
                type: "switch",
                on: { type: ExpressionType.Ref, id: "marker" },
                cases: {
                  // EOI: FFD9 -> 停止
                  0xd9: [{ type: "break_loop" }],
                  // Stuffed: FF00，忽略本项，不作为段
                  0x00: [],
                  // RSTn: FFD0..FFD7，无长度，忽略（在扫描区内被 read_until_marker 吞噬）
                  0xd0: [],
                  0xd1: [],
                  0xd2: [],
                  0xd3: [],
                  0xd4: [],
                  0xd5: [],
                  0xd6: [],
                  0xd7: [],
                  // SOF0（Baseline DCT）
                  0xc0: [{ type: "template_ref", id: "sof_common" }],
                  // SOF2（Progressive DCT）
                  0xc2: [{ type: "template_ref", id: "sof_common" }],
                  // DHT (Define Huffman Table) - 支持按段长度解析多表
                  0xc4: [
                    { type: "uint", id: "length", length: 2 },
                    {
                      type: "loop_until_consumed",
                      id: "tables",
                      length_expr: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "length" },
                          { type: ExpressionType.Operator, value: "+" },
                          { type: ExpressionType.UintLiteral, value: -2 },
                        ],
                      },
                      spec: [
                        { type: "template_ref", id: "dht_table" },
                      ],
                    },
                  ],
                  // DQT (Define Quantization Table) - 支持按段长度解析多表（暂按 8-bit 值读取）
                  0xdb: [
                    { type: "uint", id: "length", length: 2 },
                    {
                      type: "loop_until_consumed",
                      id: "tables",
                      length_expr: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "length" },
                          { type: ExpressionType.Operator, value: "+" },
                          { type: ExpressionType.UintLiteral, value: -2 },
                        ],
                      },
                      spec: [
                        { type: "template_ref", id: "dqt_table" },
                      ],
                    },
                  ],
                  // SOS（扫描数据起始）：读取 SOS 头部（length-2），随后读取扫描数据直到下一个真正的段标记
                  0xda: [
                    { type: "uint", id: "length", length: 2 },
                    {
                      type: "template_ref",
                      id: "raw_payload",
                      params: {
                        payload_length: {
                          type: ExpressionType.Ref,
                          id: "length",
                        },
                      },
                    },
                    {
                      type: "read_until_prefixed",
                      id: "scan_data",
                      prefix: 0xff,
                      next_passthrough_values: [0x00],
                      next_passthrough_ranges: [{ from: 0xd0, to: 0xd7 }],
                    },
                  ],
                  // APP0（常见为 JFIF\0）
                  0xe0: [
                    { type: "uint", id: "length", length: 2 },
                    { type: "ascii", id: "identifier", length: 5 },
                    // 若为 JFIF 结构，解析其 header
                    { type: "uint", id: "version_major", length: 1 },
                    { type: "uint", id: "version_minor", length: 1 },
                    { type: "uint", id: "density_units", length: 1 },
                    { type: "uint", id: "x_density", length: 2 },
                    { type: "uint", id: "y_density", length: 2 },
                    { type: "uint", id: "x_thumbnail", length: 1 },
                    { type: "uint", id: "y_thumbnail", length: 1 },
                    // 读取剩余 payload（包括缩略图）
                    {
                      type: "list",
                      id: "payload",
                      items: [{ type: "uint", id: "b", length: 1 }],
                      count: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "length" },
                          { type: ExpressionType.Operator, value: "+" },
                          // 减去已读字段：length(2) + id(5) + ver(2) + density(1) + xd(2) + yd(2) + xt(1) + yt(1) = 16 (length 字段自身不计入后续剩余)
                          { type: ExpressionType.UintLiteral, value: -16 },
                        ],
                      },
                    },
                  ],
                  // APP1（常见为 Exif\0\0）
                  0xe1: [
                    { type: "uint", id: "length", length: 2 },
                    { type: "ascii", id: "identifier", length: 6 },
                    // 简要解析 TIFF 头（字节序、魔数、IFD0 偏移）
                    { type: "ascii", id: "tiff_endian", length: 2 },
                    { type: "uint", id: "tiff_magic", length: 2 },
                    { type: "uint", id: "tiff_ifd0_offset", length: 4 },
                    // 余下作为原始 payload（可后续扩展 EXIF IFD）
                    {
                      type: "list",
                      id: "payload",
                      items: [{ type: "uint", id: "b", length: 1 }],
                      count: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "length" },
                          { type: ExpressionType.Operator, value: "+" },
                          // 减去已读字段：length(2) + id(6) + tiff(8) = 16
                          { type: ExpressionType.UintLiteral, value: -16 },
                        ],
                      },
                    },
                  ],
                  // APP2（ICC Profile 分片）
                  0xe2: [
                    { type: "uint", id: "length", length: 2 },
                    { type: "ascii", id: "identifier", length: 12 }, // "ICC_PROFILE\0"
                    { type: "uint", id: "icc_seq_no", length: 1 },
                    { type: "uint", id: "icc_chunks", length: 1 },
                    // 若是单分片（或我们仅预览首片），尝试解析 ICC Header（128 字节）
                    {
                      type: "if",
                      condition: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "icc_chunks" },
                          { type: ExpressionType.Operator, value: "eq" },
                          { type: ExpressionType.UintLiteral, value: 1 },
                        ],
                      },
                      spec: [
                        {
                          type: "template_ref",
                          id: "icc_header",
                          params: {
                            payload_length: { type: ExpressionType.Ref, id: "length" },
                          },
                        },
                      ],
                    },
                    // 否则或余下：回退到原始 payload 以便预览
                    {
                      type: "template_ref",
                      id: "raw_payload",
                      params: {
                        payload_length: { type: ExpressionType.Ref, id: "length" },
                      },
                    },
                  ],
                  // 默认：读取 length 并消费 payload
                  default: [
                    { type: "uint", id: "length", length: 2 },
                    {
                      type: "template_ref",
                      id: "raw_payload",
                      params: {
                        payload_length: {
                          type: ExpressionType.Ref,
                          id: "length",
                        },
                      },
                    },
                  ],
                },
              },
            ],
            // 非 0xFF 前缀：本轮不读取 marker，直接进入下一轮扫描
            default: [],
          },
        },
      ],
    },
  ],
};
