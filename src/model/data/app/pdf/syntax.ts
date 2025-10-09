// src/model/app/pdf/syntax.ts
// PDF Syntax Parser: Consumes a token stream from the lexical schema and builds a structured model.

type Token = {
  token_type: string;
  value?: any;
  string_bytes?: Array<{ value: number }>;
  __start_offset__: number;
  __end_offset__: number;
};

class TokenStream {
  private tokens: Token[];
  private cursor = 0;

  constructor(lexicalResult: any) {
    this.tokens = (lexicalResult?.tokens || []).filter(
      (t: Token) => t.token_type !== "comment" && t.token_type !== undefined
    );
  }

  getCursor(): number {
    return this.cursor;
  }

  peek(offset = 0): Token | null {
    if (this.cursor + offset >= this.tokens.length) return null;
    return this.tokens[this.cursor + offset];
  }

  consume(): Token | null {
    const token = this.peek();
    if (token) this.cursor++;
    return token;
  }

  expectValue(type?: string): string {
    const token = this.peek();
    if (type && token?.token_type !== type) {
      throw new Error(`Expected token type ${type}, but got ${token?.token_type}`);
    }
    return token?.value ?? "";
  }

  expectAndConsume(type: string): Token {
    const token = this.consume();
    if (!token || token.token_type !== type) {
      const C = this.cursor;
      const prev = this.tokens.slice(Math.max(0, C-3), C).map(t => t.value || t.token_type).join(' ');
      const next = this.tokens.slice(C, C+3).map(t => t.value || t.token_type).join(' ');
      throw new Error(`Expected token type ${type}, but got ${token?.token_type} at cursor ${C}. Context: ...${prev} <|> ${next}...`);
    }
    return token;
  }
}

function parsePdfObject(stream: TokenStream): any {
  const token = stream.peek();
  if (!token) return null;

  switch (token.token_type) {
    case "keyword_or_number": {
      stream.consume();
      const v = token.value;
      if (v === "true") return true;
      if (v === "false") return false;
      if (v === "null") return null;
      if (/^-?\d+$/.test(v)) return parseInt(v, 10);
      if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
      // It might be an indirect reference (e.g., "1 0 R") that got split.
      const next1 = stream.peek(0);
      const next2 = stream.peek(1);
      if (
        next1?.token_type === "keyword_or_number" &&
        next2?.token_type === "keyword_or_number" &&
        next2.value === "R"
      ) {
        stream.consume(); // gen
        stream.consume(); // R
        return { type: "ref", num: parseInt(v, 10), gen: parseInt(next1.value, 10) };
      }
      return v; // Return as a plain keyword string
    }
    case "name":
      stream.consume();
      return `/${token.value}`;
    case "string": {
      stream.consume();
      const bytes = (token.string_bytes || []).map(item => item.value);
      // Basic escape sequence handling
      const decoded = [];
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x5c) { // '\'
          i++;
          if (i >= bytes.length) break;
          const char = String.fromCharCode(bytes[i]);
          switch (char) {
            case 'n': decoded.push(0x0a); break;
            case 'r': decoded.push(0x0d); break;
            case 't': decoded.push(0x09); break;
            case 'b': decoded.push(0x08); break;
            case 'f': decoded.push(0x0c); break;
            case '(': decoded.push(0x28); break;
            case ')': decoded.push(0x29); break;
            case '\\': decoded.push(0x5c); break;
            // TODO: Octal escapes
            default: decoded.push(bytes[i]); break;
          }
        } else {
          decoded.push(bytes[i]);
        }
      }
      return { type: "string", bytes: new Uint8Array(decoded) };
    }
    case "hex_string":
      stream.consume();
      // Hex string content needs to be converted to bytes
      const hex = (token.value || "").replace(/\s/g, "");
      const bytes = [];
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return { type: "hex_string", bytes: new Uint8Array(bytes) };
    case "array_start": {
      stream.expectAndConsume("array_start");
      const arr = [];
      while (stream.peek()?.token_type !== "array_end") {
        const elem = parsePdfObject(stream);
        if (elem) arr.push(elem);
        else break;
      }
      stream.expectAndConsume("array_end");
      return arr;
    }
    case "dict_start": {
      stream.expectAndConsume("dict_start");
      const dict = new Map();
      while (stream.peek()?.token_type !== "dict_end") {
        const keyToken = parsePdfObject(stream);
        if (typeof keyToken !== 'string' || !keyToken.startsWith('/')) {
            // Invalid key, stop parsing dict
            break;
        }
        const val = parsePdfObject(stream);
        dict.set(keyToken.slice(1), val);
      }
      stream.expectAndConsume("dict_end");
      return Object.fromEntries(dict);
    }
    default:
      // Consume the unknown token to prevent infinite loops
      stream.consume();
      return null;
  }
}

// Helper to decode string-like objects from PDF
function decodePdfString(pdfString: any): string {
    if (!pdfString) return "";
    if (typeof pdfString === 'string') return pdfString; // Already decoded
    if (pdfString.bytes instanceof Uint8Array) {
        // Attempt to decode as PDFDocEncoding, falling back to latin1.
        // A full implementation would be more robust here.
        try {
            return new TextDecoder("windows-1252").decode(pdfString.bytes);
        } catch {
            return String.fromCharCode(...pdfString.bytes);
        }
    }
    return String(pdfString);
}


// Main entry point for syntactic analysis
export function buildPdfModel(lexicalResult: any, fileBuffer: ArrayBuffer) {
  const allTokens = (lexicalResult?.tokens || []).filter(
    (t: Token) => t.token_type !== "comment" && t.token_type !== undefined
  );

  // Pass 1: Find all objects and their byte boundaries
  const objects = new Map<string, any>();
  for (let i = 0; i < allTokens.length - 2; i++) {
    const t0 = allTokens[i];
    const t1 = allTokens[i+1];
    const t2 = allTokens[i+2];

    if (t0.token_type === 'keyword_or_number' && t1.token_type === 'keyword_or_number' && t2.value === 'obj') {
      const num = parseInt(t0.value, 10);
      const gen = parseInt(t1.value, 10);
      if (isNaN(num) || isNaN(gen)) continue;

      const objKey = `${num}_${gen}`;
      const stream = new TokenStream({ tokens: allTokens.slice(i + 3) });
      const dict = parsePdfObject(stream);
      
      const obj: any = { num, gen, dict, is_stream: false };
      
      const nextTokenAfterDict = stream.peek(0);
      if (nextTokenAfterDict?.value === 'stream') {
        obj.is_stream = true;
        const streamStartToken = stream.peek(1); // Token after 'stream' keyword
        if(streamStartToken) {
           // Find 'endstream'
           let endStreamToken = null;
           for(let j = stream.getCursor() + 1; j < allTokens.length; j++) {
              if(allTokens[j].value === 'endstream') {
                endStreamToken = allTokens[j];
                break;
              }
           }
           if(endStreamToken) {
              // The stream data is between the end of the 'stream' keyword (and its trailing newline)
              // and the start of the 'endstream' keyword.
              // A robust implementation respects the EOL marker after 'stream'.
              let streamStartOffset = stream.peek(0)!.__end_offset__;
              const b = new Uint8Array(fileBuffer, streamStartOffset, 2);
              if (b[0] === 0x0D && b[1] === 0x0A) streamStartOffset += 2; // CR+LF
              else if (b[0] === 0x0A || b[0] === 0x0D) streamStartOffset += 1; // LF or CR

              const streamEndOffset = endStreamToken.__start_offset__;
              obj.stream_bytes = new Uint8Array(fileBuffer.slice(streamStartOffset, streamEndOffset));
              obj.stream_length = obj.stream_bytes.length;
              obj.stream_hex_preview = Array.from(obj.stream_bytes.slice(0, 32)).map((b: any) => b.toString(16).padStart(2, '0')).join(' ');
           }
        }
      }
      
      // Add display-friendly previews
      if (obj.dict) {
         obj.dict_text_preview = Object.entries(obj.dict)
            .map(([k,v]) => `/${k} ${JSON.stringify(v, null, 2)}`)
            .join('\n');
         if(obj.dict.Subtype === '/Image') {
           obj.is_image = true;
         }
      }
      objects.set(objKey, obj);
    }
  }

  // Pass 2: Find trailer and build document structure
  let trailer = null;
  for (let i = allTokens.length - 1; i >= 0; i--) {
      if(allTokens[i].value === 'trailer') {
          const stream = new TokenStream({ tokens: allTokens.slice(i+1)});
          trailer = parsePdfObject(stream);
          break;
      }
  }

  // Pass 3: Resolve info and root
  const info_rows = [];
  if (trailer?.Info?.type === 'ref') {
    const infoObj = objects.get(`${trailer.Info.num}_${trailer.Info.gen}`);
    if (infoObj?.dict) {
      for (const [key, val] of Object.entries(infoObj.dict)) {
        info_rows.push({ key, value: decodePdfString(val) });
      }
    }
  }
  
  const startxrefToken = allTokens.find((t: Token) => t.value === 'startxref');
  const startxref = startxrefToken ? parseInt(allTokens[allTokens.indexOf(startxrefToken) + 1]?.value, 10) : undefined;
  
  const headerToken = allTokens.find((t: Token) => t.token_type === 'comment' && t.value?.startsWith('PDF-'));
  const version = headerToken?.value?.match(/PDF-(\d\.\d)/)?.[1] || 'Unknown';

  const model = {
    version,
    objects: Array.from(objects.values()),
    trailer,
    info_rows,
    startxref,
  };
  
  return model;
}
