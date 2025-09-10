import { registerFunction } from "../../display/renderer";

export function register_wav() {
  // 常用辅助函数
  registerFunction("wav::format_name", (fmt: number): string => {
    const m = Number(fmt) >>> 0;
    const map: Record<number, string> = {
      0x0001: "PCM",
      0x0003: "IEEE Float",
      0x0006: "A-Law",
      0x0007: "Mu-Law",
      0xfffe: "Extensible",
    } as any;
    return map[m] || `0x${m.toString(16).toUpperCase().padStart(4, "0")}`;
  });
}


