import type { Node, Statement, Expression, NamespaceEntry } from './ast';
import { Hash, hashString, mix, mixAll, hashNumber, hashBigInt, hashPivot } from './hashing';

export function hashNode(node: Node): Hash {
  switch (node.kind) {
    // Statements
    case 'Let':
      return mixAll(hashString('Let'), hashString(node.name), hashNode(node.value));
    case 'ExprStmt':
      return mix(hashString('ExprStmt'), hashNode(node.expr));

    // Expressions
    case 'Literal':
      // MorfType has a hash property
      return mix(hashString('Literal'), node.value.hash);
    case 'Var':
      return mix(hashString('Var'), hashString(node.name));
    case 'Binary':
      return mixAll(hashString('Binary'), hashString(node.op), hashNode(node.left), hashNode(node.right));
    case 'Unary':
      return mixAll(hashString('Unary'), hashString(node.op), hashNode(node.argument));
    case 'Call':
      if (node.style === 'Paren') {
        let h = mixAll(hashString('CallParen'), hashNode(node.func));
        for (const arg of node.args) {
          h = mix(h, hashNode(arg));
        }
        return h;
      } else {
        return mixAll(hashString('CallBrace'), hashNode(node.func), hashNode(node.argNamespace));
      }
    case 'Member':
      return mixAll(hashString('Member'), hashNode(node.target), node.key.hash);
    case 'Function':
      return hashFunctionStructural(node.params, node.isVariadic, node.body);
    case 'NamespaceLiteral':
      let nsH = hashString('NamespaceLiteral');
      for (const entry of node.entries) {
        nsH = mix(nsH, hashNamespaceEntry(entry));
      }
      return nsH;
    case 'UnionLiteral':
      let unionH = hashString('UnionLiteral');
      for (const el of node.elements) {
        unionH = mix(unionH, hashNode(el));
      }
      return unionH;
    case 'TupleLiteral':
      let tupleH = hashString('TupleLiteral');
      for (const el of node.elements) {
        tupleH = mix(tupleH, hashNode(el));
      }
      return tupleH;
    default:
      throw new Error(`Unknown node kind: ${(node as any).kind}`);
  }
}

function hashNamespaceEntry(entry: NamespaceEntry): Hash {
  if (entry.kind === 'Entry') {
    return mixAll(hashString('Entry'), entry.key.hash, hashNode(entry.value));
  } else {
    return mix(hashString('Spread'), hashString(entry.name));
  }
}

export function hashFunctionStructural(params: string[], isVariadic: boolean, body: Statement[]): Hash {
  let h = mix(hashString('TypeFunction'), isVariadic ? 1 : 0);
  for (const p of params) {
    h = mix(h, hashString(p));
  }
  for (const stmt of body) {
    h = mix(h, hashNode(stmt));
  }
  return h;
}
