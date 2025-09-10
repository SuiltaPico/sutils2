import { registerFunction } from "../../display/renderer";
import { registerDisplayNodeRenderer, evalExpression, evalTerm, type EvalContext } from "../../display/renderer";

function toU8(x: Uint8Array | number[] | undefined): Uint8Array {
  if (!x) return new Uint8Array(0);
  if (x instanceof Uint8Array) return x;
  if (Array.isArray(x)) return Uint8Array.from(x);
  return new Uint8Array(0);
}

function decodeLatin1(u8: Uint8Array): string {
  try {
    return new TextDecoder("latin1").decode(u8);
    } catch {
    // Node 环境不支持 latin1 时尝试手动
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
}

function sanitizePreview(s: string, max = 160): string {
  const compact = s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (compact.length <= max) return compact;
  return compact.slice(0, max) + "…";
}

export function register_pdf() {
  registerFunction("pdf::parse_header", (root: any) => {
    const head = toU8(root?.header_probe);
    const text = decodeLatin1(head);
    // %PDF-1.7 或更长，读取到第一个换行/回车
    const firstLine = text.split(/\r?\n|\r/)[0] || text;
    const m = firstLine.match(/%PDF-\s*(\d+\.\d+)/);
    return {
      is_pdf: Boolean(m),
      version: m ? m[1] : undefined,
      header_line: firstLine,
    };
  });

  registerFunction("pdf::analyze", (root: any) => {
    const head = toU8(root?.header_probe);
    const rest = toU8(root?.rest);
    const full = new Uint8Array(head.length + rest.length);
    full.set(head, 0);
    full.set(rest, head.length);
    const text = decodeLatin1(full);

    // 对象扫描（简易版，忽略对象流、压缩流等复杂情况）
    const objects: Array<{
      obj_num: number;
      gen: number;
      type?: string;
      is_image?: boolean;
      width?: number;
      height?: number;
      color_space?: string;
      filter?: string;
      has_stream: boolean;
      stream_length?: number | string;
      stream_offset?: number; // 在 full 中的字节起点（不含前导空白）
      stream_length_bytes?: number; // 字节数
      preview: string;
      kv_rows?: Array<{ key: string; value: string }>;
      stream_preview_hex?: string;
    }> = [];
    const objRe = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj/g;
    let m: RegExpExecArray | null;
    while ((m = objRe.exec(text)) != null) {
      const objNum = Number(m[1]);
      const gen = Number(m[2]);
      const body = m[3] || "";
      const hasStream = /\bstream\b[\s\S]*?\bendstream\b/.test(body);

      let dictBody = body;
      if (hasStream) {
        const streamIndex = body.indexOf("stream");
        if (streamIndex !== -1) {
            dictBody = body.substring(0, streamIndex);
        }
      }

      let type: string | undefined = undefined;
      const tm = dictBody.match(/\/Type\s*\/([A-Za-z0-9_]+)/);
      if (tm) type = tm[1];
      // 图片判定与元数据
      const isImage = /\/Subtype\s*\/Image\b/.test(dictBody);
      const widthM = dictBody.match(/\/Width\s+(\d+)/);
      const heightM = dictBody.match(/\/Height\s+(\d+)/);
      const csM = dictBody.match(/\/ColorSpace\s*(\[[^\]]+\]|\/[A-Za-z0-9\-]+)/);
      const filtM = dictBody.match(/\/Filter\s*(\[[^\]]+\]|\/[A-Za-z0-9]+)/);
      const colorSpace = csM ? csM[1].replace(/[\[\]\s]/g, "") : undefined;
      const filter = filtM ? filtM[1].replace(/[\[\]\s]/g, "") : undefined;
      let streamLen: number | string | undefined = undefined;
      const lm = dictBody.match(/\/Length\s+(\d+)/);
      if (lm) streamLen = Number(lm[1]);
      else if (/\/Length\s+\d+\s+0\s+R/.test(dictBody)) streamLen = "indirect";
      // 计算流在全文中的字节偏移（仅当为内联 Length 数字时可靠）
      let streamOffset: number | undefined = undefined;
      let streamBytesLen: number | undefined = undefined;
      if (hasStream) {
        const bodyStart = m.index + (m[0].indexOf(body) >= 0 ? m[0].indexOf(body) : 0);
        const sRel = body.indexOf("stream");
        const eRel = body.lastIndexOf("endstream");
        if (sRel >= 0 && eRel > sRel) {
          // 跳过 "stream" 令牌与后续空白（空格/\r/\n）
          let contentRel = sRel + "stream".length;
          while (contentRel < body.length) {
            const ch = body.charCodeAt(contentRel);
            if (ch === 0x20 || ch === 0x0d || ch === 0x0a || ch === 0x09) contentRel++;
            else break;
          }
          const absStart = bodyStart + contentRel;
          const absEnd = bodyStart + eRel;
          if (absEnd > absStart) {
            streamOffset = absStart;
            streamBytesLen = absEnd - absStart;
          }
        }
      }
      // 提取字典键值
      const kvRows: Array<{ key: string; value: string }> = [];
      const dictContentMatch = dictBody.match(/^\s*<<([\s\S]*)>>\s*$/);
      if (dictContentMatch) {
          let content = dictContentMatch[1];
          let cursor = 0;
          const skipWhitespace = () => {
              while (cursor < content.length && (content[cursor] === ' ' || content[cursor] === '\n' || content[cursor] === '\r' || content[cursor] === '\t')) {
                  cursor++;
              }
          };
          const parseValue = (): string => {
              skipWhitespace();
              const start = cursor;
              if (start >= content.length) return "";
              const char = content[cursor];
              let end = cursor;
              if (char === '<' && content[cursor + 1] === '<') {
                  let depth = 1;
                  cursor += 2;
                  while (cursor < content.length && depth > 0) {
                      if (content[cursor] === '<' && content[cursor + 1] === '<') { depth++; cursor += 2; }
                      else if (content[cursor] === '>' && content[cursor + 1] === '>') { depth--; cursor += 2; }
                      else { cursor++; }
                  }
                  end = cursor;
              } else if (char === '[') {
                  let depth = 1;
                  cursor++;
                  while (cursor < content.length && depth > 0) {
                      if (content[cursor] === '[') depth++;
                      else if (content[cursor] === ']') depth--;
                      cursor++;
                  }
                  end = cursor;
              } else if (char === '(') {
                  let depth = 1;
                  cursor++;
                  while (cursor < content.length && depth > 0) {
                      if (content[cursor] === '\\') { cursor += 2; continue; }
                      if (content[cursor] === '(') depth++;
                      else if (content[cursor] === ')') depth--;
                      cursor++;
                  }
                  end = cursor;
              } else if (char === '<') {
                  const endHex = content.indexOf('>', cursor + 1);
                  end = endHex !== -1 ? endHex + 1 : content.length;
                  cursor = end;
              } else {
                  const potentialRef = content.substring(start).match(/^\s*\d+\s+\d+\s+R\b/);
                  if (potentialRef) {
                      end = start + potentialRef[0].length;
                  } else {
                      let tempCursor = start;
                      while (tempCursor < content.length && !/[\s/<>()\[\]%]/.test(content[tempCursor])) {
                          tempCursor++;
                      }
                      end = tempCursor;
                  }
                  cursor = end;
              }
              return content.substring(start, end).trim();
          };
          while (cursor < content.length) {
              skipWhitespace();
              if (cursor >= content.length || content[cursor] !== '/') break;
              cursor++; 
              const keyStart = cursor;
              while (cursor < content.length && !/[\s/<>()\[\]%]/.test(content[cursor])) {
                  cursor++;
              }
              const key = content.substring(keyStart, cursor);
              if (!key) break;
              const value = parseValue();
              kvRows.push({ key, value });
          }
      }

      let stream_preview_hex: string | undefined = undefined;
      if (hasStream && Number.isFinite(streamOffset) && streamBytesLen! > 0) {
          const streamSlice = full.subarray(streamOffset!, streamOffset! + Math.min(streamBytesLen!, 16));
          stream_preview_hex = Array.from(streamSlice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      }

      objects.push({
        obj_num: objNum,
        gen,
        type,
        is_image: isImage || undefined,
        width: widthM ? Number(widthM[1]) : undefined,
        height: heightM ? Number(heightM[1]) : undefined,
        color_space: colorSpace,
        filter,
        has_stream: hasStream,
        stream_length: streamLen,
        stream_offset: streamOffset,
        stream_length_bytes: streamBytesLen,
        preview: sanitizePreview(dictBody),
        kv_rows: kvRows,
        stream_preview_hex,
      });
    }

    // xref 扫描（经典表）
    type XrefEntry = { offset: number; gen: number; in_use: boolean };
    const xrefs: Array<{ start: number; count: number; entries: XrefEntry[] }> = [];
    const xrefBlockRe = /\bxref\b\s*([\s\S]*?)\btrailer\b/g;
    let xb: RegExpExecArray | null;
    while ((xb = xrefBlockRe.exec(text)) != null) {
      const block = xb[1] || "";
      const lines = block.split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);
      const entries: XrefEntry[] = [];
      let start = 0;
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        const hdr = lines[i].match(/^(\d+)\s+(\d+)$/);
        if (!hdr) continue;
        start = Number(hdr[1]);
        count = Number(hdr[2]);
        for (let j = 0; j < count && i + 1 + j < lines.length; j++) {
          const lm = lines[i + 1 + j].match(/^(\d{10})\s+(\d{5})\s+([fn])/);
          if (!lm) break;
          entries.push({
            offset: Number(lm[1]),
            gen: Number(lm[2]),
            in_use: lm[3] === "n",
          });
        }
        i += count;
      }
      xrefs.push({ start, count, entries });
    }

    // trailer 扫描
    const trailers: Array<Record<string, any>> = [];
    const trailerRe = /\btrailer\b\s*<<([\s\S]*?)>>/g;
    let tt: RegExpExecArray | null;
    while ((tt = trailerRe.exec(text)) != null) {
      const dict = tt[1] || "";
      const kv: Record<string, any> = {};
      const sizeM = dict.match(/\/Size\s+(\d+)/);
      if (sizeM) kv.Size = Number(sizeM[1]);
      const rootM = dict.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
      if (rootM) kv.Root = `${rootM[1]} ${rootM[2]} R`;
      const infoM = dict.match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
      if (infoM) kv.Info = `${infoM[1]} ${infoM[2]} R`;
      const prevM = dict.match(/\/Prev\s+(\d+)/);
      if (prevM) kv.Prev = Number(prevM[1]);
      const idM = dict.match(/\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\]/);
      if (idM) kv.ID = [idM[1], idM[2]];
      trailers.push(kv);
    }

    const startxrefM = text.match(/\bstartxref\b\s*(\d+)/);
    const startxref = startxrefM ? Number(startxrefM[1]) : undefined;

    // 头信息
    const header = ((): any => {
      const firstLine = text.split(/\r?\n|\r/)[0] || "";
      const m = firstLine.match(/%PDF-\s*(\d+\.\d+)/);
      return { is_pdf: Boolean(m), version: m ? m[1] : undefined, header_line: firstLine };
    })();

    // Info 字典解析
    const info_rows: Array<{ key: string; value: string }> = [];
    const pickInfoDictText = (): string | undefined => {
      const lastTrailerWithInfo = [...trailers].reverse().find((t) => t && t.Info);
      if (lastTrailerWithInfo && typeof lastTrailerWithInfo.Info === "string") {
        const mRef = lastTrailerWithInfo.Info.match(/(\d+)\s+(\d+)\s+R/);
        if (mRef) {
          const on = mRef[1];
          const og = mRef[2];
          const mm = new RegExp(`${on}\\s+${og}\\s+obj\\b([\\s\\S]*?)\\bendobj`);
          const hit = text.match(mm);
          if (hit) return hit[1];
        }
      }
      return undefined;
    };
    const infoDictText = pickInfoDictText() || "";
    if (infoDictText) {
      const keys = [
        "Title",
        "Author",
        "Subject",
        "Keywords",
        "Creator",
        "Producer",
        "CreationDate",
        "ModDate",
        "Company",
        "Comments",
      ];
      for (const k of keys) {
        const r = new RegExp(`/${k}\\s*\\(([^\\)]*)\\)`);
        const mm = infoDictText.match(r);
        if (mm) info_rows.push({ key: k, value: mm[1] });
      }
    }

    // Metadata(XML) 解析
    const metadata_list: Array<{ ref: string; length?: number; xml_text?: string }> = [];
    for (const o of objects) {
      if ((o.type === "Metadata" || /\/Type\s*\/Metadata\b/.test(o.preview)) && /\/Subtype\s*\/XML\b/.test(o.preview)) {
        const off = Number(o.stream_offset);
        const len = Number(o.stream_length_bytes);
        let xml_text: string | undefined = undefined;
        if (o.has_stream && Number.isFinite(off) && Number.isFinite(len) && len > 0) {
          try {
            const slice = full.subarray(off, off + len);
            // 去除可能尾部换行
            let end = slice.length;
            while (end > 0 && (slice[end - 1] === 0x0a || slice[end - 1] === 0x0d)) end--;
            const trimmed = slice.subarray(0, end);
            xml_text = new TextDecoder("utf-8").decode(trimmed);
          } catch {}
        }
        metadata_list.push({ ref: `${o.obj_num} ${o.gen} R`, length: Number.isFinite(len) ? len : undefined, xml_text });
      }
    }

    // 构建 Pages 树（简化：匹配字典文本，不解引用资源）
    const getObjBodyByRef = (ref: string): string | undefined => {
      const mRef = ref.match(/(\d+)\s+(\d+)\s+R/);
      if (!mRef) return undefined;
      const on = mRef[1];
      const og = mRef[2];
      const mm = new RegExp(`${on}\\s+${og}\\s+obj\\b([\\s\\S]*?)\\bendobj`);
      const hit = text.match(mm);
      return hit ? hit[1] : undefined;
    };
    const findRootRef = (): string | undefined => {
      const last = [...trailers].reverse().find((t) => t && t.Root);
      return last?.Root as string | undefined;
    };
    const parseKidsRefs = (body: string | undefined): string[] => {
      if (!body) return [];
      const m = body.match(/\/Kids\s*\[([^\]]+)\]/);
      if (!m) return [];
      const content = m[1];
      const refs = [...content.matchAll(/(\d+)\s+(\d+)\s+R/g)].map((mm) => `${mm[1]} ${mm[2]} R`);
      return refs;
    };
    const getDictValue = (body: string | undefined, key: string): string | undefined => {
      if (!body) return undefined;
      const r = new RegExp(`/${key}\\s*([^/\\s][^/>]*)`);
      const m = body.match(r);
      return m ? m[1].trim() : undefined;
    };
    const parseMediaBox = (body: string | undefined): string | undefined => {
      if (!body) return undefined;
      const m = body.match(/\/MediaBox\s*\[([^\]]+)\]/);
      return m ? m[1].trim() : undefined;
    };
    const summarizeResources = (body: string | undefined): any => {
      if (!body) return {};
      const fontBlock = body.match(/\/Font\s*<<([\s\S]*?)>>/);
      const xobjBlock = body.match(/\/XObject\s*<<([\s\S]*?)>>/);
      const fonts = fontBlock ? [...fontBlock[1].matchAll(/\/[A-Za-z0-9#]+\s+(\d+)\s+(\d+)\s+R/g)].length : 0;
      const xobjects = xobjBlock ? [...xobjBlock[1].matchAll(/\/[A-Za-z0-9#]+\s+(\d+)\s+(\d+)\s+R/g)].length : 0;
      const images = (body.match(/\/Subtype\s*\/Image/g) || []).length;
      return { fonts, xobjects, images };
    };
    type PageNode = {
      ref: string;
      type: string;
      count?: number;
      media_box?: string;
      rotate?: number;
      resources?: { fonts?: number; xobjects?: number; images?: number };
      children?: PageNode[];
    };
    const buildPagesTree = (): PageNode | undefined => {
      const rootRef = findRootRef();
      if (!rootRef) return undefined;
      const rootBody = getObjBodyByRef(rootRef) || "";
      const pagesRefM = rootBody.match(/\/Pages\s+(\d+)\s+(\d+)\s+R/);
      if (!pagesRefM) return undefined;
      const pagesRef = `${pagesRefM[1]} ${pagesRefM[2]} R`;
      const dfs = (ref: string): PageNode | undefined => {
        const body = getObjBodyByRef(ref);
        if (!body) return undefined;
        const tpM = body.match(/\/Type\s*\/([A-Za-z0-9]+)/);
        const tp = tpM ? tpM[1] : "";
        const node: PageNode = {
          ref,
          type: tp,
        };
        if (tp === "Pages") {
          const cntM = body.match(/\/Count\s+(\d+)/);
          node.count = cntM ? Number(cntM[1]) : undefined;
          const kids = parseKidsRefs(body);
          node.children = kids.map((k) => dfs(k)).filter(Boolean) as PageNode[];
        } else if (tp === "Page") {
          node.media_box = parseMediaBox(body);
          const rotM = body.match(/\/Rotate\s+(-?\d+)/);
          node.rotate = rotM ? Number(rotM[1]) : undefined;
          node.resources = summarizeResources(body);
        }
        return node;
      };
      return dfs(pagesRef);
    };
    const pages_tree = buildPagesTree();

    return {
      header,
      objects,
      xrefs,
      trailers,
      startxref,
      object_count: objects.length >>> 0,
      info_rows,
      metadata_list,
      pages_tree,
    };
  });

  // 将对象的图像流转换为 data URL（仅支持 DCTDecode/JPXDecode）。
  const u8ToBase64 = (u8: Uint8Array): string => {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      const sub = u8.subarray(i, i + chunk);
      binary += String.fromCharCode(...sub);
    }
    // btoa 期望二进制字符串
    return btoa(binary);
  };

  registerFunction("pdf::object_image_data_url", (root: any, objOrNum: any, gen?: number) => {
    const head = toU8(root?.header_probe);
    const rest = toU8(root?.rest);
    const full = new Uint8Array(head.length + rest.length);
    full.set(head, 0);
    full.set(rest, head.length);
    // 调用已注册的 analyze 函数
    const analyzeFn = (root as any)["pdf::analyze"] || (globalThis as any)["pdf::analyze"];
    const analyze = typeof analyzeFn === "function" ? analyzeFn(root) : null;
    if (!analyze) return undefined;
    let target: any = undefined;
    if (objOrNum && typeof objOrNum === "object" && ("obj_num" in objOrNum)) {
      target = objOrNum;
    } else {
      const objNum = Number(objOrNum);
      target = (analyze.objects || []).find((o: any) => Number(o.obj_num) === objNum && (gen == null || Number(o.gen) === Number(gen)));
    }
    if (!target || !target.is_image || !target.has_stream) return undefined;
    const filt = String(target.filter || "");
    // 仅支持 DCTDecode/JPXDecode 的直出显示
    let mime = "";
    if (/DCTDecode/i.test(filt)) mime = "image/jpeg";
    else if (/JPXDecode/i.test(filt)) mime = "image/jpx";
    else return undefined;
    const off = Number(target.stream_offset);
    const len = Number(target.stream_length_bytes);
    if (!Number.isFinite(off) || !Number.isFinite(len) || len <= 0) return undefined;
    const slice = full.subarray(off, off + len);
    const b64 = u8ToBase64(slice);
    return `data:${mime};base64,${b64}`;
  });

  // 注册一个简单的 <img> 渲染节点
  registerDisplayNodeRenderer("pdf_image_map", (node: any, ctx: EvalContext) => {
    // 计算 url：支持表达式或字面量
    let url: any = undefined;
    const prov = node.url_provider;
    if (prov) {
      url = prov.type === "expr" ? evalExpression(ctx, prov.expr) : evalTerm(ctx, prov);
    } else {
      url = node.url;
    }
    if (!url) return undefined;
    const style = node.style as string | undefined;
    return <img src={String(url)} style={style ?? "max-width: 480px; border: 1px solid #eee; border-radius: 6px;"} />;
  });
}


