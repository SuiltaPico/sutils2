export const specialTokens = {
  begin_of_turn: '<|begin_of_turn|>',
  end_of_turn: '<|end_of_turn|>',
  user: '<|user|>',
  assistant: '<|assistant|>',
  stop_generation: '<|stop_generation|>',
  reward: (v: string) => `<|reward:${v}|>`,
  penalty: (v: string) => `<|penalty:${v}|>`,
  pad: '<|pad|>',
};

type Vocab = Map<string, number>;

type Id2Token = Map<number, string>;

// 字节级分词器：
// - 所有特殊Token各占用一个ID
// - 普通文本使用UTF-8编码到字节数组，每个字节映射到一个固定ID（0..255偏移）
export class SelaiTokenizer {
  private vocab: Vocab;
  private id2token: Id2Token;
  private specialList: string[]; // 按注册顺序存储的特殊token列表
  private byteOffset: number; // 字节token的起始ID
  private encoder: TextEncoder;
  private decoder: TextDecoder;

  constructor() {
    this.vocab = new Map();
    this.id2token = new Map();
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();

    // 注册特殊token（固定顺序，保证ID稳定）
    const specials: string[] = [];
    specials.push(specialTokens.begin_of_turn);
    specials.push(specialTokens.end_of_turn);
    specials.push(specialTokens.user);
    specials.push(specialTokens.assistant);
    specials.push(specialTokens.stop_generation);
    // pad 专用
    specials.push(specialTokens.pad);
    // also support 0.05 explicitly
    specials.push(specialTokens.reward('0.05'));
    specials.push(specialTokens.penalty('0.05'));
    for (const v of [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0]) {
      specials.push(specialTokens.reward(v.toFixed(1)));
      specials.push(specialTokens.penalty(v.toFixed(1)));
    }
    this.specialList = specials;

    let idx = 0;
    for (const tok of specials) {
      this.vocab.set(tok, idx);
      this.id2token.set(idx, tok);
      idx += 1;
    }

    // 字节token的基址
    this.byteOffset = idx;

    // 为0..255每个字节保留一个ID（无需字符串名称）
    for (let b = 0; b < 256; b++) {
      this.id2token.set(this.byteOffset + b, `BYTE_${b}`);
    }
  }

  get vocabSize() { return this.byteOffset + 256; }

  // 将输入字符串编码为token ID数组：
  // - 优先贪婪匹配特殊token
  // - 否则把连续的普通文本段按UTF-8编码为字节序列并映射到ID
  encode(text: string): number[] {
    const ids: number[] = [];
    let i = 0;

    // 为贪婪匹配准备：按长度降序排序的特殊token列表
    const sortedSpecials = [...this.specialList].sort((a, b) => b.length - a.length);

    while (i < text.length) {
      let matched = false;
      for (const s of sortedSpecials) {
        if (text.startsWith(s, i)) {
          ids.push(this.vocab.get(s)!);
          i += s.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 收集到下一个特殊token开始之前的普通文本片段
      let j = i;
      while (j < text.length) {
        let m = false;
        for (const s of sortedSpecials) {
          if (text.startsWith(s, j)) { m = true; break; }
        }
        if (m) break;
        j++;
      }
      const segment = text.slice(i, j);
      if (segment.length > 0) {
        const bytes = this.encoder.encode(segment);
        for (let k = 0; k < bytes.length; k++) {
          ids.push(this.byteOffset + bytes[k]);
        }
      }
      i = j;
    }

    return ids;
  }

  // 将token ID数组还原为字符串：
  // - 遇到特殊token ID，直接拼接对应字符串
  // - 遇到字节ID，累积到缓冲区，按UTF-8一次性解码
  decode(ids: number[]): string {
    let out = '';
    const bytes: number[] = [];

    const flushBytes = () => {
      if (bytes.length > 0) {
        out += this.decoder.decode(new Uint8Array(bytes));
        bytes.length = 0;
      }
    };

    for (const id of ids) {
      if (id < this.byteOffset) {
        // 特殊token（解码时一般不应出现pad，若出现则忽略）
        if (this.id2token.get(id) === specialTokens.pad) continue;
        flushBytes();
        const tok = this.id2token.get(id);
        if (tok != null) out += tok;
      } else {
        // 字节token
        const b = id - this.byteOffset;
        if (b >= 0 && b <= 255) bytes.push(b);
      }
    }
    flushBytes();
    return out;
  }
}
