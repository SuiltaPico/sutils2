// ============================================================================
// Token Definitions
// ============================================================================

export type TokenType =
  | 'Identifier'
  | 'Number'
  | 'ExactNumber' // #3
  | 'ExactIdent'  // #Pi / #Physical
  | 'String'
  | 'LBrace' | 'RBrace'   // { }
  | 'LBracket' | 'RBracket' // [ ]
  | 'LParen' | 'RParen'   // ( )
  | 'HashLBrace'          // #{ (Union)
  | 'Colon'               // :
  | 'Comma'               // ,
  | 'Eq'                  // =
  | 'Dot'                 // .
  | 'Let'                 // let
  | 'Fn'                  // fn
  | 'Arrow'               // =>
  | 'Ellipsis'            // ...
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  start: number;
  end: number;
}

// ============================================================================
// Lexer
// ============================================================================

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private advance(): string {
    const char = this.peek();
    if (char === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
    return char;
  }

  private match(str: string): boolean {
    if (this.input.startsWith(str, this.pos)) {
      for (let i = 0; i < str.length; i++) this.advance();
      return true;
    }
    return false;
  }

  private isSpace(char: string): boolean {
    return /\s/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  nextToken(): Token {
    this.skipWhitespace();

    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    
    const char = this.peek();

    if (char === '') {
      return this.makeToken('EOF', '', start, startLine, startCol);
    }

    // Identifiers & Keywords
    if (this.isAlpha(char)) {
      let value = '';
      while (this.isAlpha(this.peek()) || this.isDigit(this.peek())) {
        value += this.advance();
      }
      
      if (value === 'let') return this.makeToken('Let', value, start, startLine, startCol);
      if (value === 'fn') return this.makeToken('Fn', value, start, startLine, startCol);
      return this.makeToken('Identifier', value, start, startLine, startCol);
    }

    // Numbers
    if (this.isDigit(char)) {
      let value = '';
      while (this.isDigit(this.peek()) || this.peek() === '.') { 
        value += this.advance();
      }
      return this.makeToken('Number', value, start, startLine, startCol);
    }

    // String Literal (Simple "..." support)
    if (char === '"') {
      this.advance(); // skip opening "
      let value = '';
      while (this.peek() !== '"' && this.peek() !== '') {
        value += this.advance();
      }
      if (this.peek() === '"') {
        this.advance(); // skip closing "
        return this.makeToken('String', value, start, startLine, startCol);
      } else {
        throw new Error(`Unterminated string at ${startLine}:${startCol}`);
      }
    }

    // Symbols
    if (char === '#') {
      this.advance();
      if (this.peek() === '{') {
        this.advance();
        return this.makeToken('HashLBrace', '#{', start, startLine, startCol);
      }
      if (this.isDigit(this.peek())) {
        let value = '';
        while (this.isDigit(this.peek()) || this.peek() === '.') { 
          value += this.advance();
        }
        return this.makeToken('ExactNumber', value, start, startLine, startCol);
      }
      // Exact Symbol: #Pi / #Physical
      if (this.isAlpha(this.peek())) {
        let value = '';
        while (this.isAlpha(this.peek()) || this.isDigit(this.peek())) {
          value += this.advance();
        }
        return this.makeToken('ExactIdent', value, start, startLine, startCol);
      }
    }

    if (char === '{') { this.advance(); return this.makeToken('LBrace', '{', start, startLine, startCol); }
    if (char === '}') { this.advance(); return this.makeToken('RBrace', '}', start, startLine, startCol); }
    if (char === '[') { this.advance(); return this.makeToken('LBracket', '[', start, startLine, startCol); }
    if (char === ']') { this.advance(); return this.makeToken('RBracket', ']', start, startLine, startCol); }
    if (char === '(') { this.advance(); return this.makeToken('LParen', '(', start, startLine, startCol); }
    if (char === ')') { this.advance(); return this.makeToken('RParen', ')', start, startLine, startCol); }
    if (char === ':') { this.advance(); return this.makeToken('Colon', ':', start, startLine, startCol); }
    if (char === ',') { this.advance(); return this.makeToken('Comma', ',', start, startLine, startCol); }
    if (char === '=') { 
      this.advance(); 
      if (this.peek() === '>') {
        this.advance();
        return this.makeToken('Arrow', '=>', start, startLine, startCol);
      }
      return this.makeToken('Eq', '=', start, startLine, startCol); 
    }
    if (char === '.') { 
      // Check for Ellipsis ...
      // Need exactly "..." from current position.
      if (this.input[this.pos + 1] === '.' && this.input[this.pos + 2] === '.') {
        this.advance(); // consume 1st .
        this.advance(); // consume 2nd .
        this.advance(); // consume 3rd .
        return this.makeToken('Ellipsis', '...', start, startLine, startCol);
      }
      this.advance(); 
      return this.makeToken('Dot', '.', start, startLine, startCol); 
    }

    // Unexpected
    // Instead of returning EOF, throw Error to be helpful
    throw new Error(`Unexpected character '${char}' at ${startLine}:${startCol}`);
  }

  private skipWhitespace() {
    while (this.isSpace(this.peek())) {
      this.advance();
    }
    // Skip comments
    if (this.input.startsWith('//', this.pos)) {
      while (this.peek() !== '\n' && this.peek() !== '') {
        this.advance();
      }
      this.skipWhitespace();
    }
  }

  makeToken(type: TokenType, value: string, start: number, line: number, col: number): Token {
    return { type, value, start, end: this.pos, line, col };
  }

  save(): { pos: number, line: number, col: number } {
    return { pos: this.pos, line: this.line, col: this.col };
  }

  restore(state: { pos: number, line: number, col: number }) {
    this.pos = state.pos;
    this.line = state.line;
    this.col = state.col;
  }
}
