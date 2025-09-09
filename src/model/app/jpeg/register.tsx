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
}


