export type Ref = { type: "ref"; id: string };
export type UintLiteral = { type: "uint_literal"; value: number };
export type TextLiteral = { type: "text_literal"; value: string };
export type BooleanLiteral = { type: "boolean_literal"; value: boolean };
export type Operator = {
  type: "op";
  value: "pow" | "+" | "eq" | "access" | "*";
};
export type Call = { type: "call"; children: ExpressionTerm[] };
export type MatchCase = { type: "case"; item: ExpressionTerm; children: ExpressionTerm };
export type MatchExpr = { type: "match"; condition: ExpressionTerm; cases: MatchCase[] };
export type ExpressionTerm =
  | Ref
  | UintLiteral
  | TextLiteral
  | BooleanLiteral
  | Operator
  | Expression
  | Call
  | MatchExpr
  | MatchCase;
export type Expression = { type: "expr"; expr: ExpressionTerm[] };
