import { registerFunction } from "../../display/renderer";

export function register_jpeg() {
  // 读取 APP0 标识是否为 JFIF
  registerFunction("jpeg::is_jfif", (seg: any) => {
    const id = seg?.identifier;
    return id === "JFIF\u0000";
  });
  registerFunction("jpeg::to_hex", (n: number, pad: number = 2) => {
    const v = Number(n) >>> 0;
    return "0x" + v.toString(16).toUpperCase().padStart(pad, "0");
  });
  registerFunction(
    "jpeg::marker_name",
    (marker: number): string => {
      const m = Number(marker) >>> 0;
      const map: Record<number, string> = {
        0xC0: "SOF0 (Baseline)",
        0xC1: "SOF1 (Extended)",
        0xC2: "SOF2 (Progressive)",
        0xC3: "SOF3 (Lossless)",
        0xC4: "DHT",
        0xC8: "JPG",
        0xC9: "SOF9 (Extended)",
        0xCA: "SOF10 (Progressive)",
        0xCB: "SOF11 (Lossless)",
        0xCC: "DAC",
        0xD0: "RST0",
        0xD1: "RST1",
        0xD2: "RST2",
        0xD3: "RST3",
        0xD4: "RST4",
        0xD5: "RST5",
        0xD6: "RST6",
        0xD7: "RST7",
        0xD8: "SOI",
        0xD9: "EOI",
        0xDA: "SOS",
        0xDB: "DQT",
        0xDC: "DNL",
        0xDD: "DRI",
        0xDE: "DHP",
        0xDF: "EXP",
        0xE0: "APP0",
        0xE1: "APP1",
        0xE2: "APP2",
        0xE3: "APP3",
        0xE4: "APP4",
        0xE5: "APP5",
        0xE6: "APP6",
        0xE7: "APP7",
        0xE8: "APP8",
        0xE9: "APP9",
        0xEA: "APP10",
        0xEB: "APP11",
        0xEC: "APP12",
        0xED: "APP13",
        0xEE: "APP14",
        0xEF: "APP15",
        0xFE: "COM",
      } as any;
      return map[m] || "UNKNOWN";
    }
  );

  // 将 payload（可能是 Uint8Array 或 {b:number}[]）统一转换为字节数组
  const toBytes = (payload: any): number[] => {
    if (!payload) return [];
    if (payload instanceof Uint8Array) return Array.from(payload);
    if (Array.isArray(payload)) {
      const out: number[] = [];
      for (const it of payload) {
        if (typeof it === "number") {
          out.push(Number(it) >>> 0);
          continue;
        }
        if (it && typeof it === "object") {
          // 常见字段：payload[{b}], DQT.values[{v}], DHT.counts[{c}]
          const v =
            typeof (it as any).b === "number"
              ? (it as any).b
              : typeof (it as any).v === "number"
              ? (it as any).v
              : typeof (it as any).c === "number"
              ? (it as any).c
              : undefined;
          if (v != null) {
            out.push(Number(v) >>> 0);
          }
        }
      }
      return out;
    }
    return [];
  };

  registerFunction("jpeg::payload_len", (payload: any): number => {
    if (!payload) return 0;
    if (payload instanceof Uint8Array) return payload.length >>> 0;
    if (Array.isArray(payload)) return payload.length >>> 0;
    return 0;
  });

  registerFunction("jpeg::icc_version_str", (raw: number): string => {
    const v = Number(raw) >>> 0;
    // ICC version: BCD-like e.g. 0x04200000 -> 4.2.0
    const major = (v >>> 24) & 0xff;
    const minor = (v >>> 20) & 0x0f;
    const bugfix = (v >>> 16) & 0x0f;
    return `${major}.${minor}.${bugfix}`;
  });

  registerFunction(
    "jpeg::bytes_preview_hex",
    (payload: any, max: number = 32): string => {
      const bytes = toBytes(payload);
      const n = Math.max(0, Math.min(bytes.length, Number(max) >>> 0));
      const shown = bytes.slice(0, n).map((x) => (x & 0xff).toString(16).toUpperCase().padStart(2, "0"));
      const suffix = bytes.length > n ? " …" : "";
      return `${shown.join(" ")}${suffix}`;
    }
  );

  registerFunction(
    "jpeg::bytes_preview_ascii",
    (payload: any, max: number = 64): string => {
      const bytes = toBytes(payload);
      const n = Math.max(0, Math.min(bytes.length, Number(max) >>> 0));
      const chars = bytes.slice(0, n).map((x) => {
        const c = x & 0xff;
        return c >= 32 && c <= 126 ? String.fromCharCode(c) : ".";
      });
      const suffix = bytes.length > n ? " …" : "";
      return `${chars.join("")}${suffix}`;
    }
  );

  registerFunction("jpeg::is_generic_app", (seg: any): boolean => {
    const marker = Number(seg?.marker) >>> 0;
    // APP0, APP1 are specially handled. Others can get a generic preview.
    return marker >= 0xe2 && marker <= 0xef;
  });

  registerFunction("jpeg::bytes_to_ascii", (payload: any): string => {
    const bytes = toBytes(payload);
    const chars = bytes.map((x) => {
      const c = x & 0xff;
      // 保留可打印字符、换行和回车
      return (c >= 32 && c <= 126) || c === 10 || c === 13
        ? String.fromCharCode(c)
        : ".";
    });
    return chars.join("");
  });

  // 返回使用指定量化表 ID 的组件列表（基于最近一次 SOF 段）
  registerFunction(
    "jpeg::components_using_qtbl",
    (segments: any[], tableId: number): string => {
      if (!Array.isArray(segments)) return "未知";
      // 找到最后一个 SOF0/SOF2 段（通常 SOF 只出现一次）
      const sof = [...segments].reverse().find((seg) => {
        const m = Number(seg?.marker) >>> 0;
        return m === 0xc0 || m === 0xc2;
      });
      if (!sof || !Array.isArray(sof.components)) return "未知";
      const id = Number(tableId) >>> 0;
      const nameOf = (cid: number) => (cid === 1 ? "Y" : cid === 2 ? "Cb" : cid === 3 ? "Cr" : `C${cid}`);
      const hits = sof.components
        .filter((c: any) => Number(c?.quant_table_id) === id)
        .map((c: any) => `${nameOf(Number(c?.component_id) >>> 0)}(${Number(c?.component_id) >>> 0})`);
      return hits.length > 0 ? hits.join(", ") : "无";
    }
  );

  // 组件 ID 到常见名称的映射
  registerFunction("jpeg::component_name", (componentId: number): string => {
    const cid = Number(componentId) >>> 0;
    if (cid === 1) return "Y";
    if (cid === 2) return "Cb";
    if (cid === 3) return "Cr";
    return `C${cid}`;
  });

  // 生成哈夫曼码表：根据 counts(16) 和 values 列表，按 JPEG 规范构造码字
  registerFunction("jpeg::generate_huffman_codes", (tbl: any): any[] => {
    if (!tbl) return [];
    const counts: number[] = toBytes((tbl as any).counts);
    const values: number[] = toBytes((tbl as any).values);
    const tableClass = Number((tbl as any).table_class) >>> 0; // 0: DC, 1: AC
    const BITS: number[] = new Array(17).fill(0);
    for (let i = 1; i <= 16; i++) BITS[i] = counts[i - 1] >>> 0;
    // 生成码字
    let code = 0;
    let k = 0;
    const rows: any[] = [];
    for (let i = 1; i <= 16; i++) {
      const numCodes = BITS[i] >>> 0;
      for (let j = 0; j < numCodes; j++) {
        const sym = values[k] >>> 0;
        const codeStr = code.toString(2).padStart(i, "0");
        const symbolHex = `0x${sym.toString(16).toUpperCase().padStart(2, "0")}`;
        let meaning = "";
        if (tableClass === 0) {
          // DC: 符号即类别（后随类别个比特）
          const cat = sym;
          meaning = cat === 0 ? "DC 差值=0 (无附加比特)" : `幅度类别=${cat} (随后 ${cat} 比特)`;
        } else {
          // AC: 符号高 4 位=零游程 Run，低 4 位=尺寸 Size
          const run = (sym >>> 4) & 0x0f;
          const size = sym & 0x0f;
          if (sym === 0x00) meaning = "EOB（块尾，余下系数为 0）";
          else if (sym === 0xF0) meaning = "ZRL（连续 16 个 0）";
          else meaning = `Run=${run}, Size=${size} (随后 ${size} 比特)`;
        }
        rows.push({ length: i, code: codeStr, symbol_hex: symbolHex, meaning });
        code += 1;
        k += 1;
      }
      code <<= 1; // 增加码长
    }
    return rows;
  });

  // 将 ZigZag 顺序的一维 64 长度数组还原为 8x8 矩阵
  registerFunction("jpeg::dezigzag", (values: any): number[][] => {
    const bytes = toBytes(values); // 可能是 8/16-bit，这里按 number 接收
    const out: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
    const order: number[] = [
      0, 1, 8, 16, 9, 2, 3, 10,
      17, 24, 32, 25, 18, 11, 4, 5,
      12, 19, 26, 33, 40, 48, 41, 34,
      27, 20, 13, 6, 7, 14, 21, 28,
      35, 42, 49, 56, 57, 50, 43, 36,
      29, 22, 15, 23, 30, 37, 44, 51,
      58, 59, 52, 45, 38, 31, 39, 46,
      53, 60, 61, 54, 47, 55, 62, 63,
    ];
    for (let k = 0; k < 64; k++) {
      const pos = order[k] >>> 0;
      const r = (pos / 8) | 0;
      const c = pos % 8;
      const v = bytes[k] != null ? Number(bytes[k]) : 0;
      out[r][c] = v >>> 0;
    }
    return out;
  });
}


