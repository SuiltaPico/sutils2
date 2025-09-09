export const enum ExpressionType {
  Ref = 0x0000,
  UintLiteral,
  TextLiteral,
  BooleanLiteral,
  Operator,
  Call,
  MatchExpr,
  MatchCase,
  Expression,
}

export type Ref = { type: ExpressionType.Ref; id: string };
export type UintLiteral = { type: ExpressionType.UintLiteral; value: number };
export type TextLiteral = { type: ExpressionType.TextLiteral; value: string };
export type BooleanLiteral = {
  type: ExpressionType.BooleanLiteral;
  value: boolean;
};
export type Operator = {
  type: ExpressionType.Operator;
  value: "pow" | "+" | "-" | "*" | "/" | "eq" | "gt" | "lt" | "ge" | "le" | "access";
};
export type Call = { type: ExpressionType.Call; children: ExpressionTerm[] };
export type MatchCase = {
  type: ExpressionType.MatchCase;
  item: ExpressionTerm;
  children: ExpressionTerm;
};
export type MatchExpr = {
  type: ExpressionType.MatchExpr;
  condition: ExpressionTerm;
  cases: MatchCase[];
};
export type Expression = {
  type: ExpressionType.Expression;
  expr: ExpressionTerm[];
};
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
