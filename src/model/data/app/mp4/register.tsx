import { registerFunction } from "../../display/renderer";

const type_to_cn_name_map: Record<string, string> = {
  "2dqr": "2D 区域质量排名",
  "2dss": "2D 源空间关系",
  ainf: "用于识别、许可和播放资产信息",
  assp: "替代启动序列属性",
  auxi: "辅助轨道类型信息",
  iods: "对象描述符容器",
  ftyp: "文件类型",
  moov: "影片",
  mvhd: "影片标头",
  trak: "分轨",
  tkhd: "分轨标头",
  edts: "剪辑",
  elst: "剪辑列表",
  mdia: "媒体",
  mdhd: "媒体标头",
  hdlr: "处理器引用",
  minf: "媒体信息",
  vmhd: "视频媒体标头",
  dinf: "数据信息",
  sbgp: "采样至组",
  sgpd: "采样组定义",
  smhd: "声音媒体标头",
  stbl: "采样表",
  stsd: "采样描述",
  stts: "解码时间至采样",
  stss: "关键帧",
  ctts: "合成时间至采样",
  stsc: "采样至块",
  stsz: "采样大小",
  stco: "块偏移",
  co64: "块偏移64",
  udta: "用户数据",
  free: "空白",
  mdat: "媒体数据",
  mvex: "影片扩展",
  meta: "元数据",
  dref: "数据引用",
  ilst: "项目列表",
  keys: "键组",
};

export function register_mp4() {
  // 将 raw 的兼容品牌字节转为品牌数组（每 4 字节）
  registerFunction(
    "mp4::parse_compatible_brands",
    (raw: Uint8Array | number[]) => {
      let data: Uint8Array;
      if (raw instanceof Uint8Array) data = raw;
      else if (Array.isArray(raw)) data = Uint8Array.from(raw);
      else data = new Uint8Array(0);
      const brands: string[] = [];
      for (let i = 0; i + 3 < data.length; i += 4) {
        brands.push(
          String.fromCharCode(data[i], data[i + 1], data[i + 2], data[i + 3])
        );
      }
      return brands;
    }
  );

  // 盒类型中文名称映射
  registerFunction("mp4::box_name_zh", (type: string): string => {
    const t = String(type || "");
    return type_to_cn_name_map[t] || "未知";
  });

  // 将 8 字节无符号大端整数转为 JS Number（可能丢精度，但常用场景足够）
  registerFunction(
    "mp4::u64_to_number",
    (raw: Uint8Array | number[]): number => {
      let data: Uint8Array;
      if (raw instanceof Uint8Array) data = raw;
      else if (Array.isArray(raw)) data = Uint8Array.from(raw);
      else return 0;
      if (data.length < 8) return 0;
      let n = 0;
      for (let i = 0; i < 8; i++) {
        n = n * 256 + data[i];
      }
      return n;
    }
  );

  // 根据 timescale 计算秒数，duration 可为 number 或 8 字节数组
  registerFunction(
    "mp4::seconds_from_timescale",
    (duration: number | Uint8Array | number[], timescale: number): number => {
      let dur = 0;
      if (typeof duration === "number") dur = duration;
      else
        dur = (globalThis as any)["mp4::u64_to_number"]
          ? (globalThis as any)["mp4::u64_to_number"](duration as any)
          : Array.isArray(duration)
          ? duration.reduce((a: number, b: number) => a * 256 + b, 0)
          : Array.from(duration as Uint8Array).reduce((a, b) => a * 256 + b, 0);
      const ts = Number(timescale) || 1;
      return dur / ts;
    }
  );

  // 32-bit 16.16 固定小数转浮点
  registerFunction("mp4::fixed1616_to_float", (u32: number): number => {
    const v = Number(u32) >>> 0;
    const intPart = (v >>> 16) & 0xffff;
    const fracPart = v & 0xffff;
    return intPart + fracPart / 65536;
  });

  // 16-bit 8.8 固定小数转浮点（音量）
  registerFunction("mp4::fixed88_to_float", (u16: number): number => {
    const v = Number(u16) >>> 0;
    const intPart = (v >>> 8) & 0xff;
    const fracPart = v & 0xff;
    return intPart + fracPart / 256;
  });

  // MP4/MPEG-4 时间戳（自 1904-01-01 UTC 起的秒）转 ISO 字符串
  registerFunction(
    "mp4::mp4_time_to_iso",
    (ts: number | Uint8Array | number[]): string => {
      let seconds = 0;
      if (typeof ts === "number") seconds = ts;
      else
        seconds = (globalThis as any)["mp4::u64_to_number"]
          ? (globalThis as any)["mp4::u64_to_number"](ts as any)
          : Array.isArray(ts)
          ? ts.reduce((a: number, b: number) => a * 256 + b, 0)
          : Array.from(ts as Uint8Array).reduce((a, b) => a * 256 + b, 0);
      // MP4 epoch (1904-01-01) to Unix epoch offset in seconds
      const MP4_TO_UNIX_OFFSET = 2082844800;
      const unixSeconds = seconds - MP4_TO_UNIX_OFFSET;
      const ms = unixSeconds * 1000;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return "无效时间";
      return d.toISOString();
    }
  );

  // tkhd 的矩阵缩放（a,d 为 16.16）可以近似给出宽高比旋转等，但我们这里只用于显示宽高
  registerFunction("mp4::dim_from_fixed1616", (u32: number): number => {
    return Math.round((Number(u32) >>> 0) / 65536);
  });

  // mdhd 语言码（15-bit）转三字母代码
  registerFunction("mp4::mdhd_lang_code", (lang: number): string => {
    const v = Number(lang) >>> 0;
    const c1 = ((v >> 10) & 0x1f) + 0x60;
    const c2 = ((v >> 5) & 0x1f) + 0x60;
    const c3 = (v & 0x1f) + 0x60;
    return String.fromCharCode(c1, c2, c3);
  });

  // handler 类型中文
  registerFunction("mp4::handler_name_zh", (t: string): string => {
    const map: Record<string, string> = {
      vide: "视频",
      soun: "音频",
      hint: "提示",
      meta: "元数据",
      subt: "字幕",
      text: "文本",
    } as any;
    return map[String(t || "")] || "未知";
  });
}
