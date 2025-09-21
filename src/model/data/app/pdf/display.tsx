import { ExpressionType } from "../../base";
import type { DisplaySchema } from "../../display/type";

export const pdf_ds: DisplaySchema = {
  template: {
    object_view: {
      params: [
        { type: "param", id: "obj" },
      ],
      spec: [
        {
          type: "column",
          class: "flex flex-col gap-2 border p-2 rounded",
          children: [
            {
              type: "row",
              class: "flex flex-wrap gap-2 items-center bg-gray-50 p-1 rounded",
              children: [
                { type: "text", class: "font-mono text-sm", value: "#" },
                { type: "text_map", class: "font-mono text-sm font-semibold", provider: { type: ExpressionType.Ref, id: "obj.num" } },
                { type: "text", class: "font-mono text-sm", value: "gen" },
                { type: "text_map", class: "font-mono text-sm font-semibold", provider: { type: ExpressionType.Ref, id: "obj.gen" } },
                {
                  type: "if",
                  condition: { type: ExpressionType.Ref, id: "obj.is_stream" },
                  children: [
                     { type: "text", class: "text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800", value: "Stream" },
                  ]
                },
                {
                  type: "if",
                  condition: {
                    type: ExpressionType.Expression,
                    expr: [
                      { type: ExpressionType.Ref, id: "obj.dict.Type" },
                      { type: ExpressionType.Operator, value: "ne" },
                      { type: ExpressionType.NilLiteral },
                    ]
                  },
                  children: [
                    { type: "text", value: "/Type =" },
                    { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.dict.Type" } },
                  ]
                }
              ]
            },
            {
              type: "if",
              condition: { type: ExpressionType.Ref, id: "obj.is_image" },
              children: [
                {
                  type: "column",
                  class: "gap-1",
                  children: [
                    { type: "text", class: "font-semibold", value: "Image Preview" },
                    {
                      type: "pdf_image_map",
                      url_provider: {
                        type: ExpressionType.Expression,
                        expr: [
                          { type: ExpressionType.Ref, id: "pdf::build_image_data_url" },
                          { type: ExpressionType.Call, children: [ { type: ExpressionType.Ref, id: "obj" } ]}
                        ]
                      }
                    } as any,
                  ]
                }
              ]
            },
            {
              type: "collapse",
              title: "Dictionary Contents",
              default_open: false,
              summary: [{ type: "text", value: "Show dictionary key-value pairs" }],
              details: [
                 { type: "pre_block_map", provider: { type: ExpressionType.Ref, id: "obj.dict_text_preview" } }
              ]
            },
            {
              type: "if",
              condition: { type: ExpressionType.Ref, id: "obj.is_stream" },
              children: [
                {
                  type: "collapse",
                  title: "Stream Content",
                  default_open: false,
                  summary: [
                    {
                      type: "row",
                      children: [
                        { type: "text", value: "Length: "},
                        { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.stream_length" }},
                        { type: "text", value: " bytes. Filter: "},
                        { type: "text_map", provider: { type: ExpressionType.Ref, id: "obj.dict.Filter" }},
                      ]
                    }
                  ],
                  details: [
                    { type: "pre_block_map", provider: { type: ExpressionType.Ref, id: "obj.stream_hex_preview" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  nodes: [
    {
      type: "column",
      children: [
        {
          type: "column",
          class: "flex flex-col gap-2 flex-shrink-0 flex-wrap border border-gray-300 p-2 rounded",
          children: [
            { type: "text", class: "font-bold", value: "PDF Document Info" },
            {
              type: "row",
              children: [
                { type: "text", value: "Version: " },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "input.version" } },
              ],
            },
            {
              type: "row",
              children: [
                { type: "text", value: "Object Count: " },
                { type: "text_map", provider: { type: ExpressionType.Expression, expr: [{type: ExpressionType.Ref, id: "input.objects"}, {type: ExpressionType.Operator, value: "access"}, {type: ExpressionType.TextLiteral, value: "length"}] } },
              ],
            },
             {
              type: "row",
              children: [
                { type: "text", value: "StartXRef: " },
                { type: "text_map", provider: { type: ExpressionType.Ref, id: "input.startxref" } },
              ],
            },
          ],
        },
        {
          type: "collapse",
          title: "Document Catalog & Info",
          default_open: true,
          summary: [ { type: "text", value: "Root object, document info dictionary, and page tree." }],
          details: [
            {
              type: "table_of_rows",
              provider: { type: ExpressionType.Ref, id: "input.info_rows" },
              columns: [
                { key: "key", title: "Key", width: "180px" },
                { key: "value", title: "Value" },
              ]
            }
          ]
        },
        {
          type: "collapse",
          title: "Object List",
          default_open: true,
          summary: [ { type: "text", value: "List of all objects found in the file." }],
          details: [
            {
              type: "list_map",
              provider: { type: ExpressionType.Ref, id: "input.objects" },
              item_param: "obj",
              children: [
                { type: "template_ref", id: "object_view", params: { obj: { type: ExpressionType.Ref, id: "obj" } } }
              ]
            }
          ]
        }
      ],
    },
  ],
};


