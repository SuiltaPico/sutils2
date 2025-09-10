import { registerFunction } from "../../display/renderer";
import { element_id_map, element_name_zh_map } from "./constants";

export function register_mkv() {
  const u8ToNum = (u8: Uint8Array | number[]): number => {
    const bytes = u8 instanceof Uint8Array ? u8 : Uint8Array.from(Array.isArray(u8) ? u8 : []);
    let v = 0;
    for (let i = 0; i < bytes.length; i++) v = (v << 8) | bytes[i];
    return v >>> 0;
  };

  const u8ToFloat = (u8: Uint8Array | number[]): number => {
    const bytes = u8 instanceof Uint8Array ? u8 : Uint8Array.from(Array.isArray(u8) ? u8 : []);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length === 4) return view.getFloat32(0);
    if (bytes.length === 8) return view.getFloat64(0);
    return NaN;
  };

  const decodeUtf8 = (u8: Uint8Array | number[]): string => {
    const bytes = u8 instanceof Uint8Array ? u8 : Uint8Array.from(Array.isArray(u8) ? u8 : []);
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "[解码失败]";
    }
  };

  registerFunction("mkv::element_name", (id: number) => {
    return element_id_map[id]?.name ?? "Unknown";
  });

  registerFunction("mkv::element_name_zh", (id: number) => {
    const name = element_id_map[id]?.name;
    if (!name) return "未知";
    return element_name_zh_map[name] ?? name;
  });

  registerFunction("mkv::element_type", (id: number) => {
    return element_id_map[id]?.type ?? "b";
  });

  registerFunction("mkv::as_uint", u8ToNum);
  registerFunction("mkv::as_float", u8ToFloat);
  registerFunction("mkv::as_utf8", decodeUtf8);
  registerFunction("mkv::format_id", (id: number) => "0x" + id.toString(16).toUpperCase());
}


