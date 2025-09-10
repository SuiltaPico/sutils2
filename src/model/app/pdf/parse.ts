import { ExpressionType } from "../../base";
import { ByteOrder, type ParseSchema } from "../../parse/type";

// 最小可用 PDF schema：
// - 读取开头一行 %PDF-x.y（最多 16 字节，宽松读取到换行或回车）
// - 读取剩余字节为 body（不在解析层做复杂语义，交由显示层函数完成）
export const pdf_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.BigEndian,
  },
  template: {},
  spec: [
    // 尝试读取前 16 字节用于检测签名（宽松，避免越界）
    {
      type: "bytes_lenient",
      id: "header_probe",
      length: { type: ExpressionType.UintLiteral, value: 16 },
    },
    // 将输入总长度注入根作用域后，在显示层做进一步解释
    // 这里把剩余内容也读出来（宽松），便于分析函数扫描对象与交叉引用
    {
      type: "bytes_lenient",
      id: "rest",
      length: {
        type: ExpressionType.Expression,
        expr: [
          { type: ExpressionType.Ref, id: "__input_length__" },
          { type: ExpressionType.Operator, value: "-" },
          // 当前 offset 已经推进 16（或更少），直接用剩余长度读宽松字节
          { type: ExpressionType.UintLiteral, value: 16 },
        ],
      },
    },
  ],
};


