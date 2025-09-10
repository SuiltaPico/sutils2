import { ExpressionType } from "../../base";
import type { DisplaySchema, Template } from "../../display/type";

const leaf_element_content: Template["spec"] = [
  {
    type: "row",
    children: [
      {
        type: "text",
        value: "{",
      },
      {
        type: "if",
        condition: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::element_type" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.id" }],
                },
              ],
            },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.TextLiteral, value: "u" },
          ],
        },
        children: [
          {
            type: "text_map",
            provider: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::as_uint" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.payload" }],
                },
              ],
            },
          },
        ],
      },
      {
        type: "if",
        condition: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::element_type" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.id" }],
                },
              ],
            },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.TextLiteral, value: "f" },
          ],
        },
        children: [
          {
            type: "text_map",
            provider: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::as_float" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.payload" }],
                },
              ],
            },
          },
        ],
      },
      {
        type: "if",
        condition: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::element_type" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.id" }],
                },
              ],
            },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.TextLiteral, value: "s" },
          ],
        },
        children: [
          {
            type: "text_map",
            provider: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::as_utf8" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.payload" }],
                },
              ],
            },
          },
        ],
      },
      {
        type: "if",
        condition: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::element_type" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.id" }],
                },
              ],
            },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.TextLiteral, value: "8" },
          ],
        },
        children: [
          {
            type: "text_map",
            provider: {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::as_utf8" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.payload" }],
                },
              ],
            },
          },
        ],
      },
      {
        type: "if",
        condition: {
          type: ExpressionType.Expression,
          expr: [
            {
              type: ExpressionType.Expression,
              expr: [
                { type: ExpressionType.Ref, id: "mkv::element_type" },
                {
                  type: ExpressionType.Call,
                  children: [{ type: ExpressionType.Ref, id: "item.id" }],
                },
              ],
            },
            { type: ExpressionType.Operator, value: "eq" },
            { type: ExpressionType.TextLiteral, value: "b" },
          ],
        },
        children: [{ type: "text", value: "(binary data)" }],
      },
      {
        type: "text",
        value: "}",
      },
    ],
  },
];

const element_item: Template = {
  params: [{ type: "param", id: "item" }],
  spec: [
    {
      type: "row",
      children: [
        {
          type: "text_map",
          class: "font-bold",
          provider: {
            type: ExpressionType.Expression,
            expr: [
              { type: ExpressionType.Ref, id: "mkv::element_name_zh" },
              {
                type: ExpressionType.Call,
                children: [{ type: ExpressionType.Ref, id: "item.id" }],
              },
            ],
          },
        },
        // { type: "text", class: "text-xs text-gray-500", value: "(" },
        // {
        //   type: "text_map",
        //   class: "text-xs text-gray-500",
        //   provider: {
        //     type: ExpressionType.Expression,
        //     expr: [
        //       { type: ExpressionType.Ref, id: "mkv::element_name" },
        //       {
        //         type: ExpressionType.Call,
        //         children: [{ type: ExpressionType.Ref, id: "item.id" }],
        //       },
        //     ],
        //   },
        // },
        // { type: "text", class: "text-xs text-gray-500", value: ")" },
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
              class: "flex flex-col gap-1 pl-4",
              children: [
                {
                  type: "list_map",
                  provider: { type: ExpressionType.Ref, id: "item.children" },
                  item_param: "child",
                  children: [
                    {
                      type: "template_ref",
                      id: "element_item",
                      params: {
                        item: { type: ExpressionType.Ref, id: "child" },
                      },
                    },
                  ],
                },
                {
                  type: "if",
                  condition: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "item.payload" },
                      { type: ExpressionType.Operator, value: "ne" },
                      { type: ExpressionType.NilLiteral },
                    ],
                  },
                  children: [
                    {
                      type: "template_ref",
                      id: "leaf_element_content",
                      params: {
                        item: { type: ExpressionType.Ref, id: "item" },
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

export const mkv_ds: DisplaySchema = {
  template: {
    element_item: element_item,
    leaf_element_content: {
      params: [{ type: "param", id: "item" }],
      spec: leaf_element_content,
    },
  },
  nodes: [
    {
      type: "list_map",
      provider: { type: ExpressionType.Ref, id: "input.elements" },
      item_param: "item",
      children: [
        {
          type: "template_ref",
          id: "element_item",
          params: { item: { type: ExpressionType.Ref, id: "item" } },
        },
      ],
    },
  ],
};
