import { ExpressionType } from "../../base";
import { ByteOrder, type ParseSchema } from "../../parse/type";

// PDF Delimiters and Whitespace Character Codes
const PDF_DELIMITERS = [
  0x28, 0x29, // ( )
  0x3c, 0x3e, // < >
  0x5b, 0x5d, // [ ]
  0x7b, 0x7d, // { }
  0x2f, // /
  0x25, // %
];

const PDF_WHITESPACE = [
  0x00, // NUL
  0x09, // HT
  0x0a, // LF
  0x0c, // FF
  0x0d, // CR
  0x20, // SP
];

const terminators = [...PDF_WHITESPACE, ...PDF_DELIMITERS];

// Sequence markers for various keywords
const SEQ_ENDOBJ = [0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]; // endobj
const SEQ_ENDSTREAM = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // endstream

export const pdf_ps: ParseSchema = {
  config: {
    byte_order: ByteOrder.BigEndian,
  },
  template: {
    // Main tokenizing template
    token: {
      params: [],
      spec: [
        { type: "skip_ws" },
        { type: "peek_bytes", id: "peek", length: { type: "uint_literal", value: 2 } },
        {
          type: "let",
          id: "b1",
          expr: {
            type: "expression",
            expr: [
              { type: "ref", id: "peek" },
              { type: "operator", value: "access" },
              { type: "uint_literal", value: 0 },
            ],
          },
        },
        {
          type: "switch",
          on: { type: "ref", id: "b1" },
          cases: {
            // Comment: % ... EOL
            "37": [{ type: "template_ref", id: "comment_token" }], // 0x25 = '%'
            // Name: /...
            "47": [{ type: "template_ref", id: "name_token" }], // 0x2F = '/'
            // String literal: (...)
            "40": [{ type: "template_ref", id: "string_literal_token" }], // 0x28 = '('
            // Hex string literal <...> OR dict start <<
            "60": [{ type: "template_ref", id: "lt_token" }], // 0x3C = '<'
            // Dict end: >>
            "62": [{ type: "template_ref", id: "gt_token" }], // 0x3E = '>'
            // Array start: [
            "91": [
              { type: "uint", id: "type", length: 1, emit: false }, // Consume '['
              { type: "set", id: "token_type", expr: { type: "text_literal", value: "array_start" } },
            ],
            // Array end: ]
            "93": [
              { type: "uint", id: "type", length: 1, emit: false },
              { type: "set", id: "token_type", expr: { type: "text_literal", value: "array_end" } },
            ],
            // Default: keyword or number
            "default": [{ type: "template_ref", id: "keyword_or_number_token" }],
          },
        },
      ],
    },
    comment_token: {
      params: [],
      spec: [
        { type: "uint", id: "_p", length: 1, emit: false }, // consume '%'
        {
          type: "ascii_until",
          id: "value",
          terminators: [0x0a, 0x0d], // LF, CR
          max_len: 2048,
        },
        { type: "set", id: "token_type", expr: { type: "text_literal", value: "comment" } },
      ],
    },
    name_token: {
      params: [],
      spec: [
        { type: "uint", id: "_p", length: 1, emit: false }, // consume '/'
        { type: "ascii_until", id: "value", terminators },
        { type: "set", id: "token_type", expr: { type: "text_literal", value: "name" } },
      ],
    },
    keyword_or_number_token: {
      params: [],
      spec: [
        { type: "ascii_until", id: "value", terminators },
        { type: "set", id: "token_type", expr: { type: "text_literal", value: "keyword_or_number" } },
      ],
    },
    lt_token: {
      params: [],
      spec: [
        {
          type: "let",
          id: "b2",
          expr: {
            type: "expression",
            expr: [
              { type: "ref", id: "peek" },
              { type: "operator", value: "access" },
              { type: "uint_literal", value: 1 },
            ],
          },
        },
        {
          type: "if",
          condition: {
            type: "expression",
            expr: [
              { type: "ref", id: "b2" },
              { type: "operator", value: "eq" },
              { type: "uint_literal", value: 60 }, // '<'
            ],
          },
          spec: [ // Dict start: <<
            { type: "uint", id: "_p", length: 2, emit: false },
            { type: "set", id: "token_type", expr: { type: "text_literal", value: "dict_start" } },
          ],
        },
        {
          type: "if",
          condition: {
            type: "expression",
            expr: [
              { type: "ref", id: "b2" },
              { type: "operator", value: "ne" },
              { type: "uint_literal", value: 60 },
            ],
          },
          spec: [ // Hex string: <...>
            { type: "uint", id: "_p", length: 1, emit: false }, // consume '<'
            { type: "ascii_until", id: "value", terminators: [0x3e] }, // read until '>'
            { type: "uint", id: "_p2", length: 1, emit: false }, // consume '>'
            { type: "set", id: "token_type", expr: { type: "text_literal", value: "hex_string" } },
          ],
        },
      ],
    },
    gt_token: {
      params: [],
      spec: [
        {
          type: "let",
          id: "b2",
          expr: {
            type: "expression",
            expr: [
              { type: "ref", id: "peek" },
              { type: "operator", value: "access" },
              { type: "uint_literal", value: 1 },
            ],
          },
        },
        {
          type: "if",
          condition: {
            type: "expression",
            expr: [
              { type: "ref", id: "b2" },
              { type: "operator", value: "eq" },
              { type: "uint_literal", value: 62 }, // '>'
            ],
          },
          spec: [ // Dict end: >>
            { type: "uint", id: "_p", length: 2, emit: false },
            { type: "set", id: "token_type", expr: { type: "text_literal", value: "dict_end" } },
          ],
        },
      ],
    },
    // String parsing is complex due to balanced parens and escapes.
    // We will read byte by byte and manage a nesting counter.
    string_literal_token: {
      params: [],
      spec: [
        { type: "uint", id: "_p", length: 1, emit: false }, // consume initial '('
        { type: "set", id: "token_type", expr: { type: "text_literal", value: "string" } },
        { type: "let", id: "nesting", expr: { type: "uint_literal", value: 1 } },
        {
          type: "list",
          id: "string_bytes",
          items: [
            { type: "peek_bytes", id: "char_peek", length: { type: "uint_literal", value: 1 } },
            { type: "let", id: "b", expr: {
              type: "expression",
              expr: [
                { type: "ref", id: "char_peek" },
                { type: "operator", value: "access" },
                { type: "uint_literal", value: 0 },
              ],
            }},
            // Handle escapes: read next two bytes if '\'
            {
              type: "if",
              condition: { type: "expression", expr: [{ type: "ref", id: "b" }, { type: "operator", value: "eq" }, { type: "uint_literal", value: 92 }] }, // '\'
              spec: [{ type: "uint", id: "value", length: 2 }],
            },
            // Handle non-escapes
            {
              type: "if",
              condition: { type: "expression", expr: [{ type: "ref", id: "b" }, { type: "operator", value: "ne" }, { type: "uint_literal", value: 92 }] },
              spec: [
                { type: "uint", id: "value", length: 1 },
                {
                  type: "if",
                  condition: { type: "expression", expr: [{ type: "ref", id: "b" }, { type: "operator", value: "eq" }, { type: "uint_literal", value: 40 }] }, // '('
                  spec: [{ type: "set", id: "nesting", expr: { type: "expression", expr: [{ type: "ref", id: "nesting" }, { type: "operator", value: "+" }, { type: "uint_literal", value: 1 }] } }],
                },
                {
                  type: "if",
                  condition: { type: "expression", expr: [{ type: "ref", id: "b" }, { type: "operator", value: "eq" }, { type: "uint_literal", value: 41 }] }, // ')'
                  spec: [{ type: "set", id: "nesting", expr: { type: "expression", expr: [{ type: "ref", id: "nesting" }, { type: "operator", value: "-" }, { type: "uint_literal", value: 1 }] } }],
                },
              ],
            },
          ],
          stop_when: {
            type: "expression",
            expr: [
              { type: "ref", id: "nesting" },
              { type: "operator", value: "eq" },
              { type: "uint_literal", value: 0 },
            ],
          },
        },
      ],
    },
  },
  spec: [
    {
      type: "list",
      id: "tokens",
      items: [{ type: "template_ref", id: "token" }],
      stop_when: {
        type: "expression",
        expr: [
          { type: "ref", id: "$.__offset__" },
          { type: "operator", value: "ge" },
          { type: "ref", id: "__input_length__" },
        ],
      },
    },
  ],
};


