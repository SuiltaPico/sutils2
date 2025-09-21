import { ExpressionType } from "../../base";
import { type ParseSchema, type SpecNode, ByteOrder } from "../../parse/type";
import { masterElementIds } from "./constants";

// 使用通用 ParseSchema 定义 EBML Header 的最小解析流程
// 通过自定义节点 ebml_vint_id/ebml_vint_size 接入 VINT 读取

const child_spec = [
  {
    type: "bounded",
    id: "children",
    length_expr: { type: ExpressionType.Ref, id: "size" },
    spec: [{ type: "template_ref", id: "element" }],
  },
] as SpecNode[];

export const mkv_ps: ParseSchema = {
  config: { byte_order: ByteOrder.BigEndian },
  template: {
    element: {
      params: [],
      spec: [
        { type: "ebml_vint_id", id: "id" },
        { type: "ebml_vint_size", id: "size" },
        {
          type: "switch",
          on: { type: ExpressionType.Ref, id: "id" },
          cases: Object.fromEntries([
            ...Array.from(masterElementIds).map((id) => [
              String(id),
              child_spec,
            ]),
            [
              "default",
              [
                {
                  type: "bytes_lenient",
                  id: "payload",
                  length: { type: ExpressionType.Ref, id: "size" },
                },
              ],
            ],
          ]),
        },
      ],
    },
  },
  spec: [
    // 顶层读取文件中的所有元素
    {
      type: "bounded",
      id: "elements",
      length_expr: { type: ExpressionType.Ref, id: "__input_length__" },
      spec: [{ type: "template_ref", id: "element" }],
    },
  ],
};

export default mkv_ps;
