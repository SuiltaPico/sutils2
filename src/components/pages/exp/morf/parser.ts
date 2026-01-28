import { Lexer, Token, TokenType } from './lexer';
import { MorfInterner } from './interner';
import { hashString, mix } from './hashing';
import { hashFunctionStructural } from './ast-hashing';
import type { 
  Statement, Expression, 
  LetStatement, ExpressionStatement,
  NamespaceLiteral, NamespaceEntry,
  Parameter
} from './ast';

// ============================================================================
// Parser (Compiler Phase)
// ============================================================================

export class Parser {
  private lexer: Lexer;
  private currentToken: Token;
  private ctx: MorfInterner; // Compilation Context (for interning literals/keys)
  private input: string;

  // Parser 不再持有运行时 Env，只负责源码 -> AST
  constructor(input: string, ctx: MorfInterner) {
    this.input = input;
    this.lexer = new Lexer(input);
    this.ctx = ctx;
    this.currentToken = this.lexer.nextToken();
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private eat(type: TokenType): Token {
    if (this.currentToken.type === type) {
      const token = this.currentToken;
      this.currentToken = this.lexer.nextToken();
      return token;
    }
    throw new Error(`Expected ${type}, got ${this.currentToken.type} at ${this.currentToken.line}:${this.currentToken.col}`);
  }

  private matches(type: TokenType): boolean {
    return this.currentToken.type === type;
  }

  // --------------------------------------------------------------------------
  // Grammar Rules
  // --------------------------------------------------------------------------

  public parseProgram(): Statement[] {
    const stmts: Statement[] = [];
    while (!this.matches('EOF')) {
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  private parseStatement(): Statement {
    if (this.matches('Let')) {
      return this.parseLetStatement();
    } else {
      return {
        kind: 'ExprStmt',
        expr: this.parseExpression()
      };
    }
  }

  private parseLetStatement(): LetStatement {
    this.eat('Let');
    const name = this.eat('Identifier').value;
    this.eat('Eq');
    const value = this.parseExpression();
    return {
      kind: 'Let',
      name,
      value
    };
  }

  public parseExpression(): Expression {
    return this.parseLogicalOr();
  }

  // --------------------------------------------------------------------------
  // Precedence Levels (Recursive Descent)
  // --------------------------------------------------------------------------

  private parseLogicalOr(): Expression {
    let left = this.parseLogicalAnd();
    while (this.matches('DoubleOr')) {
      this.eat('DoubleOr');
      const right = this.parseLogicalAnd();
      left = { kind: 'Binary', op: 'DoubleOr', left, right };
    }
    return left;
  }

  private parseLogicalAnd(): Expression {
    let left = this.parseUnion();
    while (this.matches('DoubleAnd')) {
      this.eat('DoubleAnd');
      const right = this.parseUnion();
      left = { kind: 'Binary', op: 'DoubleAnd', left, right };
    }
    return left;
  }

  private parseUnion(): Expression {
    let left = this.parseIntersection();
    while (this.matches('Pipe')) {
      this.eat('Pipe');
      const right = this.parseIntersection();
      left = { kind: 'Binary', op: 'Union', left, right };
    }
    return left;
  }

  private parseIntersection(): Expression {
    let left = this.parseEquality();
    while (this.matches('Ampersand')) {
      this.eat('Ampersand');
      const right = this.parseEquality();
      left = { kind: 'Binary', op: 'Intersection', left, right };
    }
    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();
    while (this.matches('DoubleEq') || this.matches('BangEq')) {
      const op = this.currentToken.type as 'DoubleEq' | 'BangEq';
      this.eat(op);
      const right = this.parseComparison();
      left = { kind: 'Binary', op, left, right };
    }
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseAddition();
    while (
      this.matches('Lt') || this.matches('Gt') || 
      this.matches('LtEq') || this.matches('GtEq')
    ) {
      const op = this.currentToken.type as 'Lt' | 'Gt' | 'LtEq' | 'GtEq';
      this.eat(op);
      const right = this.parseAddition();
      left = { kind: 'Binary', op, left, right };
    }
    return left;
  }

  private parseAddition(): Expression {
    let left = this.parseMultiplication();
    while (this.matches('Plus') || this.matches('Minus')) {
      const op = this.currentToken.type as 'Plus' | 'Minus';
      this.eat(op);
      const right = this.parseMultiplication();
      left = { kind: 'Binary', op, left, right };
    }
    return left;
  }

  private parseMultiplication(): Expression {
    let left = this.parseUnary();
    while (this.matches('Star') || this.matches('Slash') || this.matches('Percent')) {
      const op = this.currentToken.type as 'Star' | 'Slash' | 'Percent';
      this.eat(op);
      const right = this.parseUnary();
      left = { kind: 'Binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.matches('Bang') || this.matches('Minus')) {
      const op = this.currentToken.type as 'Bang' | 'Minus';
      this.eat(op);
      const arg = this.parseUnary();
      return { kind: 'Unary', op, argument: arg };
    }
    return this.parseCallAndMemberExpr();
  }

  /**
   * CallAndMemberExpr -> PrimaryExpr ( 
   *    '(' ArgList ')' 
   *  | '{' NamespaceEntries '}' 
   *  | '.' Identifier 
   * )*
   */
  private parseCallAndMemberExpr(): Expression {
    let left = this.parsePrimaryExpr();

    while (true) {
      if (this.matches('LBrace')) {
        // Function Application via Namespace Syntax: Fn { A, B }
        // 关键点：{...} 调用的参数本质是一个 Namespace（可包含 ...P 这种运行时展开）。
        // 旧实现是在运行时把 Namespace 的 values() 取出来当作位置参数传给 invoke。
        // 因此这里不能在编译期强行展开，而是保留整个 NamespaceLiteral 到 AST。

        const argNs = this.parseNamespaceLiteral();

        left = {
          kind: 'Call',
          style: 'Brace',
          func: left,
          argNamespace: argNs
        };
        
      } else if (this.matches('LParen')) {
        // Standard Call: f(a, b)
        this.eat('LParen');
        const args: Expression[] = [];
        if (!this.matches('RParen')) {
          do {
            args.push(this.parseExpression());
          } while (this.matches('Comma') && this.eat('Comma'));
        }
        this.eat('RParen');
        
        left = {
          kind: 'Call',
          style: 'Paren',
          func: left,
          args
        };
        
      } else if (this.matches('Dot')) {
        // Member Access: obj.prop
        this.eat('Dot');
        const propName = this.matches('Identifier')
          ? this.eat('Identifier').value
          : this.eat('Number').value;
        const key = this.ctx.key(propName); // Intern Key now

        left = {
          kind: 'Member',
          target: left,
          key
        };
        
      } else {
        break;
      }
    }

    return left;
  }

  private parsePrimaryExpr(): Expression {
    if (this.matches('Identifier')) {
      const name = this.eat('Identifier').value;
      return { kind: 'Var', name };
    }

    if (this.matches('Number')) {
      const numStr = this.eat('Number').value;
      const parts = numStr.split('.');
      let pivot;
      if (parts.length === 1) {
         pivot = { kind: 'Rat', n: BigInt(parts[0]), d: 1n } as const;
      } else {
         const fraction = parts[1];
         const denominator = 10n ** BigInt(fraction.length);
         const numerator = BigInt(parts[0] + fraction);
         pivot = { kind: 'Rat', n: numerator, d: denominator } as const;
      }
      // Ordinal Number
      const val = this.ctx.internNamespace(new Map(), pivot);
      return { kind: 'Literal', value: val };
    }

    if (this.matches('String')) {
      const val = this.eat('String').value;
      return { kind: 'Literal', value: this.ctx.internPrimitive(val) };
    }

    if (this.matches('ExactNumber')) {
      const numStr = this.eat('ExactNumber').value;
      const nominalKey = this.ctx.key('__nominal__');
      const idKey = this.ctx.internKey({ kind: 'Nominal', id: '#' + numStr });
      const proof = this.ctx.internPrimitive('NominalProof');
      const innerNs = this.ctx.internNamespace(new Map([[idKey, proof]]));
      const val = this.ctx.internNamespace(new Map([[nominalKey, innerNs]]));
      return { kind: 'Literal', value: val };
    }

    if (this.matches('ExactIdent')) {
      const name = this.eat('ExactIdent').value;
      const nominalKey = this.ctx.key('__nominal__');
      const idKey = this.ctx.internKey({ kind: 'Nominal', id: '#' + name });
      const proof = this.ctx.internPrimitive('NominalProof');
      const innerNs = this.ctx.internNamespace(new Map([[idKey, proof]]));
      const val = this.ctx.internNamespace(new Map([[nominalKey, innerNs]]));
      return { kind: 'Literal', value: val };
    }

    if (this.matches('LBrace')) {
      return this.parseNamespaceLiteral();
    }

    if (this.matches('HashLBrace')) {
      return this.parseUnionLiteral();
    }

    if (this.matches('LBracket')) {
      return this.parseTupleLiteral();
    }
    
    if (this.matches('Directly')) {
      return this.parseDirectlyExpression();
    }

    if (this.matches('LParen')) {
      const sig = this.tryParseFunctionSignature();
      if (sig) {
         return this.parseFunctionDefinition(sig.params, sig.isVariadic);
      }

      // Check if it's a Block Expression (contains semicolons or multiple statements)
      // or just a grouped expression.
      return this.parseParenOrBlockExpression();
    }

    throw new Error(`Unexpected token: ${this.currentToken.type}`);
  }

  private parseDirectlyExpression(): Expression {
    this.eat('Directly');
    this.eat('LBrace');
    const expr = this.parseExpression();
    this.eat('RBrace');
    return { kind: 'Directly', expression: expr };
  }

  private parseParenOrBlockExpression(): Expression {
    this.eat('LParen');
    
    // 如果紧接着是 RParen，就是一个空的 Block
    if (this.matches('RParen')) {
      this.eat('RParen');
      return { kind: 'Block', statements: [] };
    }

    const stmts: Statement[] = [];
    while (!this.matches('RParen') && !this.matches('EOF')) {
      stmts.push(this.parseStatement());
      if (this.matches('Semicolon')) {
        this.eat('Semicolon');
      }
    }
    
    this.eat('RParen');

    // 优化：如果只有一个 ExprStmt 且没有分号，它可能只是一个普通的分组表达式
    // 但为了保持语义一致性，统一返回 Block 或者在 Evaluator 中处理。
    // 根据 Spec，( let a = 1; a ) 是 Block。
    if (stmts.length === 1 && stmts[0].kind === 'ExprStmt') {
       // 这里可以保留为 Block，或者如果是纯表达式则解包
       // 但为了支持 (stmt; stmt)，返回 Block 更通用
    }

    return { kind: 'Block', statements: stmts };
  }

  private parseNamespaceLiteral(): NamespaceLiteral {
    this.eat('LBrace');
    const entries: NamespaceEntry[] = [];
    let autoKeyIndex = 0;

    if (!this.matches('RBrace')) {
      do {
        if (this.matches('Ellipsis')) {
          this.eat('Ellipsis');
          const name = this.eat('Identifier').value;
          entries.push({ kind: 'Spread', name });
          continue;
        }

        if (this.currentToken.type === 'Identifier') {
           const idToken = this.eat('Identifier');
           const id = idToken.value;
           
           if (this.matches('Colon')) {
             // Named property: id : expr
             this.eat('Colon');
             const val = this.parseExpression();
             const key = this.ctx.key(id);
             entries.push({ kind: 'Entry', key, value: val });
           } else {
             // Positional starting with var
             let expr: Expression = { kind: 'Var', name: id };
             // Parse suffix
             expr = this.parseCallAndMemberExprSuffix(expr);
             
             const key = this.ctx.key(autoKeyIndex.toString());
             autoKeyIndex++;
             entries.push({ kind: 'Entry', key, value: expr });
           }
        } else {
          // Positional
          const val = this.parseExpression();
          const key = this.ctx.key(autoKeyIndex.toString());
          autoKeyIndex++;
          entries.push({ kind: 'Entry', key, value: val });
        }
        
      } while (this.matches('Comma') && this.eat('Comma'));
    }
    
    this.eat('RBrace');
    return { kind: 'NamespaceLiteral', entries };
  }

  // Helper for mixed parsing (already consumed start of expression)
  private parseCallAndMemberExprSuffix(left: Expression): Expression {
    while (true) {
      if (this.matches('LBrace')) {
         // See logic in parseCallAndMemberExpr
         const argNs = this.parseNamespaceLiteral();
         left = { kind: 'Call', style: 'Brace', func: left, argNamespace: argNs };
      } else if (this.matches('LParen')) {
         this.eat('LParen');
         const args: Expression[] = [];
         if (!this.matches('RParen')) {
           do {
             args.push(this.parseExpression());
           } while (this.matches('Comma') && this.eat('Comma'));
         }
         this.eat('RParen');
         left = { kind: 'Call', style: 'Paren', func: left, args };
      } else if (this.matches('Dot')) {
         this.eat('Dot');
         const propName = this.matches('Identifier')
           ? this.eat('Identifier').value
           : this.eat('Number').value;
         const key = this.ctx.key(propName);
         left = { kind: 'Member', target: left, key };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnionLiteral(): Expression {
    this.eat('HashLBrace');
    const elements: Expression[] = [];
    if (!this.matches('RBrace')) {
      do {
        elements.push(this.parseExpression());
      } while (this.matches('Comma') && this.eat('Comma'));
    }
    this.eat('RBrace');
    return { kind: 'UnionLiteral', elements };
  }

  private parseTupleLiteral(): Expression {
    this.eat('LBracket');
    const elements: Expression[] = [];
    if (!this.matches('RBracket')) {
      do {
        elements.push(this.parseExpression());
      } while (this.matches('Comma') && this.eat('Comma'));
    }
    this.eat('RBracket');
    return { kind: 'TupleLiteral', elements };
  }

  private tryParseFunctionSignature(): { params: Parameter[], isVariadic: boolean } | null {
    const savedState = this.lexer.save();
    const savedToken = this.currentToken;
    
    try {
       this.eat('LParen');
       const params: Parameter[] = [];
       let isVariadic = false;
       
       if (!this.matches('RParen')) {
         while(true) {
           if (this.matches('Ellipsis')) {
             this.eat('Ellipsis');
             if (this.matches('Identifier')) {
                 const name = this.eat('Identifier').value;
                 params.push({ name });
             } else {
                 throw new Error("Expected identifier after ...");
             }
             isVariadic = true;
             // Must be last
             if (this.matches('Comma')) throw new Error("Rest arg must be last");
             break;
           }
           
           let modifier: 'wrap' | undefined;
           if (this.matches('Wrap')) {
             this.eat('Wrap');
             modifier = 'wrap';
           }

           if (this.matches('Identifier')) {
              const name = this.eat('Identifier').value;
              params.push({ name, modifier });
           } else {
              throw new Error("Expected identifier");
           }
           
           if (this.matches('Comma')) {
             this.eat('Comma');
           } else {
             break;
           }
         }
       }
       this.eat('RParen');
       
       if (this.matches('LBrace')) {
          return { params, isVariadic };
       }
       
       throw new Error("Not a function");
       
    } catch (e) {
       this.lexer.restore(savedState);
       this.currentToken = savedToken;
       return null;
    }
  }

  private parseFunctionDefinition(params: Parameter[], isVariadic: boolean): Expression {
    // 1. Consume LBrace
    const startToken = this.eat('LBrace');
    
    // 2. Parse Body AST
    // 注意：这里我们递归调用 parseProgram 来解析 Block 内的语句
    // 但我们需要知道 Block 什么时候结束。
    // parseProgram 是 parse until EOF。
    // 我们需要一个 parseBlock 逻辑，它 parse until RBrace。
    
    const body: Statement[] = [];
    
    // The previous manual matching logic was for skipping execution.
    // Now we actually parse it.
    
    while (!this.matches('RBrace') && !this.matches('EOF')) {
      body.push(this.parseStatement());
    }
    
    const endToken = this.eat('RBrace');
    
    // 3. Calculate Hash
    // TODO: update hashFunctionStructural to accept Parameter[]
    const h = hashFunctionStructural(params.map(p => p.name), isVariadic, body);
    
    return {
      kind: 'Function',
      params,
      isVariadic,
      body,
      hash: h
    };
  }
}
