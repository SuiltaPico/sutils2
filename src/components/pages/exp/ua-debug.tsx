import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

const UA_FIELD_GROUPS = [
  {
    key: "basic",
    name: "基础信息",
    description: "浏览器提供的传统 User-Agent 字段",
  },
  {
    key: "environment",
    name: "运行环境",
    description: "运行环境与能力相关字段",
  },
  {
    key: "clientHints",
    name: "Client Hints",
    description: "navigator.userAgentData 提供的低熵字段",
  },
  {
    key: "highEntropy",
    name: "高熵字段",
    description: "需要显式请求的高熵 UA 字段",
  },
  {
    key: "display",
    name: "显示与屏幕",
    description: "屏幕、窗口和显示相关的信息",
  },
  {
    key: "capabilities",
    name: "能力与权限",
    description: "浏览器 API、特性支持和权限状态",
  },
  {
    key: "localization",
    name: "语言与区域",
    description: "时区、语言环境等本地化信息",
  },
  {
    key: "personalization",
    name: "个性化与字体",
    description: "字体支持等个性化设置",
  },
] as const;

type UAFieldGroupKey = (typeof UA_FIELD_GROUPS)[number]["key"];

type UAFieldDefinition = {
  key: string;
  name: string;
  label: string;
  group: UAFieldGroupKey;
  path?: string;
  resolve?: (nav: Navigator) => unknown | Promise<unknown>;
  fallback?: unknown;
  renderChildrenOnly?: boolean;
  children?: readonly UAFieldChildDefinition[];
};

type UAFieldRecord = {
  key: string;
  name: string;
  label: string;
  definition: UAFieldDefinition;
  value: unknown;
  children?: readonly UAFieldChildRecord[];
};

type UAFieldChildDefinition = {
  key: string;
  name: string;
  label?: string;
  path?: string;
  resolve?: (options: {
    parent: unknown;
    nav: Navigator;
  }) => unknown | Promise<unknown>;
  fallback?: unknown;
  renderChildrenOnly?: boolean;
  children?: readonly UAFieldChildDefinition[];
};

type UAFieldChildRecord = {
  key: string;
  name: string;
  label?: string;
  definition: UAFieldChildDefinition;
  value: unknown;
  children?: readonly UAFieldChildRecord[];
};

const HIGH_ENTROPY_HINTS = [
  "architecture",
  "bitness",
  "model",
  "platform",
  "platformVersion",
  "uaFullVersion",
] as const;

const SERIALIZATION_MAX_DEPTH = 4;
const SERIALIZATION_MAX_ARRAY_LENGTH = 64;
const SERIALIZATION_MAX_ENTRIES = 64;
const SERIALIZATION_MAX_PROTOTYPE_DEPTH = 3;
const KEY_VALUE_PREVIEW_MAX_ENTRIES = 16;

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

type KeyValuePreviewItem = {
  key: string;
  value: string;
};

type KeyValuePreview = {
  items: KeyValuePreviewItem[];
  truncated: boolean;
};

type SerializationResult = {
  value: SerializableValue;
  preview: KeyValuePreview | null;
};

type DisplayValue = {
  formatted: string;
  block: boolean;
  preview: KeyValuePreview | null;
};

function estimateRefreshRate(samples = 20): Promise<number | string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      return resolve("N/A");
    }

    const timestamps: number[] = [];
    let frameCount = 0;

    const tick = (timestamp: number) => {
      timestamps.push(timestamp);
      frameCount++;
      if (frameCount < samples) {
        requestAnimationFrame(tick);
      } else {
        const deltas = [];
        for (let i = 1; i < timestamps.length; i++) {
          deltas.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        if (avgDelta > 0) {
          const refreshRate = 1000 / avgDelta;
          resolve(Math.round(refreshRate));
        } else {
          resolve("Could not calculate");
        }
      }
    };

    requestAnimationFrame(tick);
  });
}

const FONT_GROUPS_TO_CHECK = [
  {
    name: "Windows 字体",
    fonts: [
      "Arial",
      "Courier New",
      "Georgia",
      "Times New Roman",
      "Trebuchet MS",
      "Verdana",
      "Segoe UI",
      "Segoe UI Variable",
      "Segoe Print",
      "Segoe Script",
    ],
  },
  {
    name: "macOS 字体",
    fonts: [
      "Helvetica",
      "Menlo",
      "Geneva",
      "San Francisco",
      "SF Pro Text",
      "SF Pro Display",
    ],
  },
  {
    name: "Linux 字体",
    fonts: [
      "DejaVu Sans",
      "Ubuntu",
      "Cantarell",
      "Liberation Sans",
      "Liberation Serif",
      "Liberation Mono",
      "WenQuanYi Micro Hei",
      "WenQuanYi Zen Hei",
      "Droid Sans Fallback",
    ],
  },
  {
    name: "iOS 字体",
    fonts: ["San Francisco", "Helvetica Neue", "Heiti SC"],
  },
  {
    name: "Android 字体",
    fonts: ["Roboto", "Droid Sans", "Droid Serif", "Noto Sans", "Noto Serif"],
  },
  {
    name: "中/日/韩字体",
    fonts: [
      "Hiragino Sans",
      "Meiryo",
      "Noto Sans CJK JP",
      "Noto Sans CJK KR",
      "Noto Serif CJK JP",
      "Noto Serif CJK KR",
      "Noto Sans JP",
      "Noto Sans KR",
      "Malgun Gothic",
      "Apple SD Gothic Neo",
    ],
  },
  {
    name: "中文字体",
    fonts: [
      "PingFang SC",
      "Microsoft YaHei",
      "微软雅黑",
      "Microsoft JhengHei",
      "微软正黑体",
      "SimSun",
      "宋体",
      "NSimSun",
      "新宋体",
      "SimHei",
      "黑体",
      "KaiTi",
      "楷体",
      "FangSong",
      "仿宋",
      "STSong",
      "华文宋体",
      "STHeiti",
      "华文黑体",
      "华文细黑",
      "华文楷体",
      "华文行楷",
      "华文仿宋",
      "华文中宋",
      "华文彩云",
      "华文琥珀",
      "华文隶书",
      "华文新魏",
      "隶书",
      "幼圆",
      "方正舒体",
      "方正姚体",
      "Noto Sans CJK SC",
      "思源黑体",
      "Noto Serif CJK SC",
      "思源等宽",
      "鸿蒙字体",
    ],
  },
  {
    name: "繁体中文字体",
    fonts: ["PMingLiU", "MingLiU", "DFKai-SB", "Microsoft JhengHei UI"],
  },
  {
    name: "日文字体",
    fonts: [
      "Hiragino Kaku Gothic ProN",
      "Hiragino Mincho ProN",
      "Yu Gothic",
      "Yu Mincho",
      "MS Gothic",
      "MS Mincho",
      "Yu Gothic UI",
    ],
  },
  {
    name: "韩文字体",
    fonts: ["Nanum Gothic", "Nanum Myeongjo", "Batang", "Gulim", "Dotum"],
  },
  {
    name: "编程字体",
    fonts: [
      "Fira Code",
      "Consolas",
      "JetBrains Mono",
      "Cascadia Code",
      "Cascadia Mono",
      "Source Code Pro",
      "Operator Mono",
      "Dank Mono",
      "Hack",
      "DejaVu Sans Mono",
      "Ubuntu Mono",
      "Monaco",
      "Space Mono",
      "Roboto Mono",
      "IBM Plex Mono",
      "Iosevka",
      "Input Mono",
      "PragmataPro",
      "SF Mono",
      "Hasklig",
      "Inconsolata",
      "PT Mono",
      "Anonymous Pro",
    ],
  },
  {
    name: "Office 字体",
    fonts: [
      "Calibri",
      "Cambria",
      "Candara",
      "Constantia",
      "Corbel",
      "Gill Sans MT",
      "Arial Narrow",
    ],
  },
  {
    name: "设计常用字体",
    fonts: [
      "Inter",
      "Open Sans",
      "Montserrat",
      "Poppins",
      "Raleway",
      "Source Sans 3",
      "Source Serif 4",
      "Roboto Slab",
      "Lato",
    ],
  },
  {
    name: "系统 Emoji/符号",
    fonts: [
      "Segoe UI Emoji",
      "Segoe UI Symbol",
      "Apple Color Emoji",
      "Noto Color Emoji",
      "Symbola",
    ],
  },
  {
    name: "游戏机字体",
    fonts: [
      "SST", // PlayStation 4/5
      "SCE-PS3", // PlayStation 3
      "Convection", // Xbox 360
      "Xbox", // Original Xbox
      "UD Shin Go NT", // Nintendo Switch
      "Rodin", // Nintendo 3DS
      "Wii", // Nintendo Wii
    ],
  },
  {
    name: "智能电视/流媒体设备字体",
    fonts: [
      "SamsungOne", // Samsung Tizen
      "TizenSans", // Samsung Tizen
      "LG Smart UI", // LG WebOS
      "LG Display", // LG WebOS
      "Amazon Ember", // Amazon Fire TV
      "Sharp Sans", // Roku
    ],
  },
];

function isFontSupported(font: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }

  const testText = "abcdefghijklmnopqrstuvwxyz0123456789";

  context.font = "72px monospace";
  const baselineWidth = context.measureText(testText).width;

  context.font = `72px "${font}", monospace`;
  const fontWidth = context.measureText(testText).width;

  return baselineWidth !== fontWidth;
}

function getWebGLContextInfo(contextType: "webgl" | "webgl2") {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext(contextType) as WebGL2RenderingContext;
    if (!gl) {
      return { renderer: "Not supported" };
    }
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : "N/A",
      unmaskedRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : "N/A",
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function detectAdBlock(): Promise<{
  detected: boolean;
  hiddenByCss: string[];
}> {
  if (typeof document === "undefined") {
    return { detected: false, hiddenByCss: [] };
  }
  try {
    const container = document.createElement("div");
    container.setAttribute(
      "style",
      "position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;"
    );
    const baits: Array<{ id?: string; className?: string; label: string }> = [
      { id: "ads", className: "adsbox", label: "#ads.adsbox" },
      { className: "ad adsbox ad-banner", label: ".ad.adsbox.ad-banner" },
      { className: "ad-container", label: ".ad-container" },
      { className: "advertisement", label: ".advertisement" },
      { id: "adsbygoogle", className: "adsbygoogle", label: "#adsbygoogle.adsbygoogle" },
      { className: "dfp-ad", label: ".dfp-ad" },
      { className: "sponsor", label: ".sponsor" },
    ];
    const elements: HTMLElement[] = [];
    for (const bait of baits) {
      const el = document.createElement("div");
      if (bait.id) el.id = bait.id;
      if (bait.className) el.className = bait.className;
      el.textContent = "ad";
      el.setAttribute(
        "style",
        "width:1px;height:1px;border:1px solid transparent;position:absolute;"
      );
      container.appendChild(el);
      elements.push(el);
    }
    document.body.appendChild(container);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const hiddenByCss: string[] = [];
    for (let i = 0; i < elements.length; i += 1) {
      const el = elements[i];
      const style = window.getComputedStyle(el);
      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        el.clientHeight === 0 ||
        el.clientWidth === 0 ||
        el.offsetParent === null;
      if (hidden) {
        hiddenByCss.push(baits[i].label);
      }
    }
    container.remove();
    return { detected: hiddenByCss.length > 0, hiddenByCss };
  } catch (e) {
    return { detected: false, hiddenByCss: [] };
  }
}

function getWebGLParameters(contextType: "webgl" | "webgl2") {
  if (typeof document === "undefined") {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext(contextType) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) {
      return { supported: false };
    }
    const attrs = gl.getContextAttributes?.() ?? null;
    const parameters: Record<string, unknown> = {};
    const pushParam = (name: number, key: string) => {
      try {
        const value = gl.getParameter(name);
        parameters[key] = ArrayBuffer.isView(value) ? Array.from(value as any) : value;
      } catch (e) {
        parameters[key] = "N/A";
      }
    };

    // WebGL1 常见参数
    pushParam((gl as any).MAX_TEXTURE_SIZE, "MAX_TEXTURE_SIZE");
    pushParam((gl as any).MAX_CUBE_MAP_TEXTURE_SIZE, "MAX_CUBE_MAP_TEXTURE_SIZE");
    pushParam((gl as any).MAX_RENDERBUFFER_SIZE, "MAX_RENDERBUFFER_SIZE");
    pushParam((gl as any).MAX_TEXTURE_IMAGE_UNITS, "MAX_TEXTURE_IMAGE_UNITS");
    pushParam((gl as any).MAX_VERTEX_ATTRIBS, "MAX_VERTEX_ATTRIBS");
    pushParam((gl as any).MAX_VERTEX_TEXTURE_IMAGE_UNITS, "MAX_VERTEX_TEXTURE_IMAGE_UNITS");
    pushParam((gl as any).MAX_VARYING_VECTORS, "MAX_VARYING_VECTORS");
    pushParam((gl as any).MAX_VERTEX_UNIFORM_VECTORS, "MAX_VERTEX_UNIFORM_VECTORS");
    pushParam((gl as any).MAX_FRAGMENT_UNIFORM_VECTORS, "MAX_FRAGMENT_UNIFORM_VECTORS");
    pushParam((gl as any).ALIASED_LINE_WIDTH_RANGE, "ALIASED_LINE_WIDTH_RANGE");
    pushParam((gl as any).ALIASED_POINT_SIZE_RANGE, "ALIASED_POINT_SIZE_RANGE");
    pushParam((gl as any).MAX_VIEWPORT_DIMS, "MAX_VIEWPORT_DIMS");

    let webgl2: Record<string, unknown> | null = null;
    const isWebGL2 =
      contextType === "webgl2" &&
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext;
    if (isWebGL2) {
      webgl2 = {};
      const push2 = (name: number, key: string) => {
        try {
          const value = (gl as WebGL2RenderingContext).getParameter(name);
          (webgl2 as any)[key] = ArrayBuffer.isView(value) ? Array.from(value as any) : value;
        } catch (e) {
          (webgl2 as any)[key] = "N/A";
        }
      };
      push2((gl as any).MAX_3D_TEXTURE_SIZE, "MAX_3D_TEXTURE_SIZE");
      push2((gl as any).MAX_ARRAY_TEXTURE_LAYERS, "MAX_ARRAY_TEXTURE_LAYERS");
      push2((gl as any).MAX_DRAW_BUFFERS, "MAX_DRAW_BUFFERS");
      push2((gl as any).MAX_COLOR_ATTACHMENTS, "MAX_COLOR_ATTACHMENTS");
      push2((gl as any).MAX_FRAGMENT_UNIFORM_BLOCKS, "MAX_FRAGMENT_UNIFORM_BLOCKS");
      push2((gl as any).MAX_VERTEX_UNIFORM_BLOCKS, "MAX_VERTEX_UNIFORM_BLOCKS");
    }

    return {
      supported: true,
      attributes: attrs
        ? {
            alpha: attrs.alpha,
            depth: attrs.depth,
            stencil: attrs.stencil,
            antialias: attrs.antialias,
            premultipliedAlpha: attrs.premultipliedAlpha,
            preserveDrawingBuffer: attrs.preserveDrawingBuffer,
            powerPreference: (attrs as any).powerPreference ?? null,
            desynchronized: (attrs as any).desynchronized ?? null,
            xrCompatible: (attrs as any).xrCompatible ?? null,
          }
        : null,
      parameters,
      webgl2,
    };
  } catch (e) {
    return { supported: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function describeValue(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (
    typeof value === "object" &&
    "constructor" in value &&
    value.constructor &&
    typeof (value as { constructor: { name?: string } }).constructor.name ===
      "string"
  ) {
    const name = (value as { constructor: { name?: string } }).constructor.name;
    if (name && name !== "Object") {
      return name;
    }
  }
  return Object.prototype.toString.call(value).slice(8, -1);
}

function formatSymbolKey(symbol: symbol, index: number): string {
  const description = symbol.description;
  if (description && description.length > 0) {
    return `symbol:${description}`;
  }
  return `symbol:#${index}`;
}

function collectPropertyKeys(target: object): {
  stringKeys: string[];
  symbolKeys: symbol[];
} {
  const stringKeys: string[] = [];
  const symbolKeys: symbol[] = [];
  const visitedStrings = new Set<string>();
  const visitedSymbols = new Set<symbol>();
  let current: object | null = target;
  let depth = 0;
  while (
    current &&
    current !== Object.prototype &&
    depth < SERIALIZATION_MAX_PROTOTYPE_DEPTH
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor" || visitedStrings.has(key)) {
        continue;
      }
      visitedStrings.add(key);
      stringKeys.push(key);
    }
    for (const symbol of Object.getOwnPropertySymbols(current)) {
      if (visitedSymbols.has(symbol)) {
        continue;
      }
      visitedSymbols.add(symbol);
      symbolKeys.push(symbol);
    }
    current = Object.getPrototypeOf(current);
    depth += 1;
  }
  return { stringKeys, symbolKeys };
}

function extractSerializableProperties(
  source: unknown
): Record<string, unknown> | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  const { stringKeys, symbolKeys } = collectPropertyKeys(source as object);
  const result: Record<string, unknown> = {};
  let count = 0;

  for (const key of stringKeys) {
    let propertyValue: unknown;
    try {
      propertyValue = (source as Record<string, unknown>)[key];
    } catch (error) {
      propertyValue = error instanceof Error ? error.message : String(error);
    }
    if (typeof propertyValue === "function") {
      continue;
    }
    result[key] = propertyValue;
    count += 1;
  }

  for (let index = 0; index < symbolKeys.length; index += 1) {
    const symbol = symbolKeys[index];
    let propertyValue: unknown;
    try {
      propertyValue = Reflect.get(source as object, symbol);
    } catch (error) {
      propertyValue = error instanceof Error ? error.message : String(error);
    }
    if (typeof propertyValue === "function") {
      continue;
    }
    result[formatSymbolKey(symbol, index)] = propertyValue;
    count += 1;
  }

  return count > 0 ? result : null;
}

async function getEncodingInfo(
  nav: Navigator,
  config: Omit<MediaEncodingConfiguration, "type">
) {
  const mediaCapabilities = (nav as any).mediaCapabilities;
  if (!mediaCapabilities?.encodingInfo) {
    return { error: "API not supported" };
  }

  const typesToTry: MediaEncodingType[] = [
    "record",
    "webrtc",
    "transmission" as any,
  ];

  for (const type of typesToTry) {
    try {
      const result = await mediaCapabilities.encodingInfo({ ...config, type });
      return {
        type,
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient,
      };
    } catch (e) {
      if (
        e instanceof TypeError &&
        (e.message.includes("enum value") ||
          e.message.includes("MediaEncodingType"))
      ) {
        continue; // Try next type
      }
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { error: "No supported encoding type found for this configuration" };
}

function formatPreviewValue(value: SerializableValue): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function formatSerializedValue(value: SerializableValue): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function shouldRenderAsBlockFromSerialized(value: SerializableValue): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.includes("\n");
  }
  if (Array.isArray(value)) {
    return true;
  }
  return typeof value === "object";
}

function serializeForDisplay(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): SerializationResult {
  if (value == null) {
    return { value: null, preview: null };
  }
  if (typeof value === "string") {
    return { value, preview: null };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { value, preview: null };
  }
  if (typeof value === "bigint") {
    return { value: `${value.toString()}n`, preview: null };
  }
  if (typeof value === "symbol") {
    return { value: value.toString(), preview: null };
  }
  if (typeof value === "function") {
    const name = value.name && value.name.length > 0 ? value.name : "anonymous";
    return { value: `[Function ${name}]`, preview: null };
  }
  if (value instanceof Date) {
    return { value: value.toISOString(), preview: null };
  }
  if (value instanceof RegExp) {
    return { value: value.toString(), preview: null };
  }
  if (value instanceof Error) {
    return {
      value: {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null,
      },
      preview: null,
    };
  }
  if (depth >= SERIALIZATION_MAX_DEPTH) {
    return { value: `[${describeValue(value)} 深度超过限制]`, preview: null };
  }
  if (Array.isArray(value)) {
    const normalized: SerializableValue[] = [];
    const limit = Math.min(value.length, SERIALIZATION_MAX_ARRAY_LENGTH);
    for (let index = 0; index < limit; index += 1) {
      normalized.push(serializeForDisplay(value[index], depth + 1, seen).value);
    }
    if (value.length > limit) {
      normalized.push(`[...] 剩余 ${value.length - limit} 项`);
    }
    return { value: normalized, preview: null };
  }
  if (typeof value === "object") {
    const objectValue = value as object;
    if (seen.has(objectValue)) {
      return { value: "[Circular]", preview: null };
    }
    seen.add(objectValue);

    if (objectValue instanceof Map) {
      const entries: SerializableValue[] = [];
      let index = 0;
      for (const [mapKey, mapValue] of objectValue.entries()) {
        if (index >= SERIALIZATION_MAX_ENTRIES) {
          entries.push(`[...] 剩余 ${objectValue.size - index} 项`);
          break;
        }
        entries.push({
          key: serializeForDisplay(mapKey, depth + 1, seen).value,
          value: serializeForDisplay(mapValue, depth + 1, seen).value,
        });
        index += 1;
      }
      const preview: KeyValuePreviewItem[] = [];
      index = 0;
      for (const [mapKey, mapValue] of objectValue.entries()) {
        if (index >= KEY_VALUE_PREVIEW_MAX_ENTRIES) {
          break;
        }
        const keyResult = serializeForDisplay(mapKey, depth + 1, seen);
        const valueResult = serializeForDisplay(mapValue, depth + 1, seen);
        preview.push({
          key: formatPreviewValue(keyResult.value),
          value: formatPreviewValue(valueResult.value),
        });
        index += 1;
      }
      return {
        value: entries,
        preview: preview.length
          ? {
              items: preview,
              truncated: objectValue.size > preview.length ? true : false,
            }
          : null,
      };
    }

    if (objectValue instanceof Set) {
      const items: SerializableValue[] = [];
      let index = 0;
      for (const item of objectValue.values()) {
        if (index >= SERIALIZATION_MAX_ENTRIES) {
          items.push(`[...] 剩余 ${objectValue.size - index} 项`);
          break;
        }
        items.push(serializeForDisplay(item, depth + 1, seen).value);
        index += 1;
      }
      return { value: items, preview: null };
    }

    if (ArrayBuffer.isView(value)) {
      const bufferView = value as ArrayBufferView & { length?: number };
      const length = bufferView.length ?? 0;
      const limit = Math.min(length, SERIALIZATION_MAX_ARRAY_LENGTH);
      const sample: SerializableValue[] = [];
      for (let index = 0; index < limit; index += 1) {
        // @ts-expect-error Typed arrays index signature
        sample.push(bufferView[index] as SerializableValue);
      }
      if (length > limit) {
        sample.push(`[...] 剩余 ${length - limit} 项`);
      }
      return {
        value: {
          type: describeValue(value),
          length,
          values: sample,
        },
        preview: null,
      };
    }

    if (value instanceof ArrayBuffer) {
      return {
        value: {
          type: "ArrayBuffer",
          byteLength: value.byteLength,
        },
        preview: null,
      };
    }

    const { stringKeys, symbolKeys } = collectPropertyKeys(objectValue);
    const result: Record<string, SerializableValue> = {};
    let processed = 0;
    const preview: KeyValuePreviewItem[] = [];

    for (const key of stringKeys) {
      let propertyValue: unknown;
      try {
        propertyValue = (objectValue as Record<string, unknown>)[key];
      } catch (error) {
        propertyValue = error instanceof Error ? error.message : String(error);
      }
      if (typeof propertyValue === "function") {
        continue;
      }
      if (processed < SERIALIZATION_MAX_ENTRIES) {
        const serialized = serializeForDisplay(propertyValue, depth + 1, seen);
        result[key] = serialized.value;
        if (preview.length < KEY_VALUE_PREVIEW_MAX_ENTRIES) {
          preview.push({
            key,
            value: formatPreviewValue(serialized.value),
          });
        }
      }
      processed += 1;
    }

    for (let index = 0; index < symbolKeys.length; index += 1) {
      const symbol = symbolKeys[index];
      let propertyValue: unknown;
      try {
        propertyValue = Reflect.get(objectValue, symbol);
      } catch (error) {
        propertyValue = error instanceof Error ? error.message : String(error);
      }
      if (typeof propertyValue === "function") {
        continue;
      }
      if (processed < SERIALIZATION_MAX_ENTRIES) {
        const key = formatSymbolKey(symbol, index);
        const serialized = serializeForDisplay(propertyValue, depth + 1, seen);
        result[key] = serialized.value;
        if (preview.length < KEY_VALUE_PREVIEW_MAX_ENTRIES) {
          preview.push({
            key,
            value: formatPreviewValue(serialized.value),
          });
        }
      }
      processed += 1;
    }

    if (Object.keys(result).length === 0) {
      return {
        value: `[${describeValue(value)} 无可序列化属性]`,
        preview: null,
      };
    }

    const totalAvailable = stringKeys.length + symbolKeys.length;
    if (processed > SERIALIZATION_MAX_ENTRIES) {
      result["__剩余属性__"] = `还有 ${
        totalAvailable - SERIALIZATION_MAX_ENTRIES
      } 个属性未展示`;
    }

    return {
      value: result,
      preview: preview.length
        ? {
            items: preview,
            truncated:
              stringKeys.length + symbolKeys.length > preview.length
                ? true
                : false,
          }
        : null,
    };
  }

  return { value: String(value), preview: null };
}

export const UA_FIELD_DEFINITIONS: readonly UAFieldDefinition[] = [
  {
    key: "appCodeName",
    name: "浏览器代号",
    label: "navigator.appCodeName",
    group: "basic",
    path: "appCodeName",
  },
  {
    key: "appName",
    name: "浏览器名称",
    label: "navigator.appName",
    group: "basic",
    path: "appName",
  },
  {
    key: "appVersion",
    name: "浏览器版本字符串",
    label: "navigator.appVersion",
    group: "basic",
    path: "appVersion",
  },
  {
    key: "platform",
    name: "平台",
    label: "navigator.platform",
    group: "environment",
    path: "platform",
  },
  {
    key: "userAgent",
    name: "User-Agent",
    label: "navigator.userAgent",
    group: "basic",
    path: "userAgent",
  },
  {
    key: "vendor",
    name: "浏览器供应商",
    label: "navigator.vendor",
    group: "basic",
    path: "vendor",
  },
  {
    key: "vendorSub",
    name: "供应商子标识",
    label: "navigator.vendorSub",
    group: "basic",
    path: "vendorSub",
  },
  {
    key: "product",
    name: "产品标识",
    label: "navigator.product",
    group: "basic",
    path: "product",
  },
  {
    key: "productSub",
    name: "产品子标识",
    label: "navigator.productSub",
    group: "basic",
    path: "productSub",
  },
  {
    key: "language",
    name: "首选语言",
    label: "navigator.language",
    group: "environment",
    path: "language",
  },
  {
    key: "languages",
    name: "语言列表",
    label: "navigator.languages",
    group: "environment",
    path: "languages",
  },
  {
    key: "onLine",
    name: "在线状态",
    label: "navigator.onLine",
    group: "environment",
    path: "onLine",
  },
  {
    key: "cookieEnabled",
    name: "Cookie 可用",
    label: "navigator.cookieEnabled",
    group: "environment",
    path: "cookieEnabled",
  },
  {
    key: "hardwareConcurrency",
    name: "硬件线程数",
    label: "navigator.hardwareConcurrency",
    group: "environment",
    path: "hardwareConcurrency",
  },
  {
    key: "deviceMemory",
    name: "设备内存 (GB)",
    label: "navigator.deviceMemory",
    group: "environment",
    path: "deviceMemory",
  },
  {
    key: "maxTouchPoints",
    name: "最大触摸点数",
    label: "navigator.maxTouchPoints",
    group: "environment",
    path: "maxTouchPoints",
  },
  {
    key: "webdriver",
    name: "正在使用 WebDriver",
    label: "navigator.webdriver",
    group: "environment",
    path: "webdriver",
  },
  {
    key: "oscpu",
    name: "操作系统 CPU",
    label: "navigator.oscpu",
    group: "environment",
    path: "oscpu",
  },
  {
    key: "storage",
    name: "存储管理器",
    label: "navigator.storage.estimate()",
    group: "environment",
    renderChildrenOnly: true,
    resolve: async (nav) => {
      if (!nav.storage?.estimate) {
        return null;
      }
      try {
        return await nav.storage.estimate();
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    children: [
      { key: "quota", name: "配额 (bytes)", path: "quota" },
      { key: "usage", name: "用量 (bytes)", path: "usage" },
      { key: "usageDetails", name: "用量详情", path: "usageDetails" },
    ],
  },
  {
    key: "battery",
    name: "电池状态",
    label: "navigator.getBattery()",
    group: "environment",
    renderChildrenOnly: true,
    resolve: async (nav: Navigator & { getBattery?: () => Promise<any> }) => {
      if (!nav.getBattery) {
        return null;
      }
      try {
        return await nav.getBattery();
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    children: [
      { key: "charging", name: "充电中", path: "charging" },
      {
        key: "level",
        name: "电量",
        resolve: ({ parent }) => {
          const level = (parent as { level?: number })?.level;
          if (typeof level === "number") {
            return `${(level * 100).toFixed(0)}%`;
          }
          return level;
        },
      },
      { key: "chargingTime", name: "充满电时间 (秒)", path: "chargingTime" },
      {
        key: "dischargingTime",
        name: "可用时间 (秒)",
        path: "dischargingTime",
      },
    ],
  },
  {
    key: "gamepads",
    name: "游戏手柄",
    label: "navigator.getGamepads()",
    group: "environment",
    resolve: (nav) => {
      if (!nav.getGamepads) {
        return null;
      }
      try {
        return Array.from(nav.getGamepads());
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  {
    key: "plugins",
    name: "浏览器插件",
    label: "navigator.plugins",
    group: "environment",
    resolve: (nav) => {
      if (!nav.plugins) {
        return null;
      }
      try {
        return Array.from(nav.plugins).map((plugin) => ({
          name: plugin.name,
          description: plugin.description,
          filename: plugin.filename,
        }));
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  {
    key: "mediaDevices",
    name: "媒体设备",
    label: "navigator.mediaDevices.enumerateDevices()",
    group: "environment",
    resolve: async (nav) => {
      if (!nav.mediaDevices?.enumerateDevices) {
        return null;
      }
      try {
        return await nav.mediaDevices.enumerateDevices();
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  {
    key: "mediaCapabilities",
    name: "媒体能力",
    label: "navigator.mediaCapabilities",
    group: "environment",
    renderChildrenOnly: true,
    resolve: (nav) => !!nav.mediaCapabilities,
    children: [
      {
        key: "decodingInfo",
        name: "解码能力测试",
        renderChildrenOnly: true,
        resolve: () => true,
        children: [
          {
            key: "vid-h264-mp4",
            name: "视频: H.264 MP4",
            resolve: async ({ nav }) => {
              if (!nav.mediaCapabilities?.decodingInfo) return "Not supported";
              try {
                const result = await nav.mediaCapabilities.decodingInfo({
                  type: "file",
                  video: {
                    contentType: 'video/mp4; codecs="avc1.42E01E"',
                    width: 1920,
                    height: 1080,
                    bitrate: 8000000,
                    framerate: 30,
                  },
                });
                return {
                  supported: result.supported,
                  smooth: result.smooth,
                  powerEfficient: result.powerEfficient,
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
              }
            },
          },
          {
            key: "vid-vp9-webm",
            name: "视频: VP9 WebM",
            resolve: async ({ nav }) => {
              if (!nav.mediaCapabilities?.decodingInfo) return "Not supported";
              try {
                const result = await nav.mediaCapabilities.decodingInfo({
                  type: "file",
                  video: {
                    contentType: 'video/webm; codecs="vp9"',
                    width: 1920,
                    height: 1080,
                    bitrate: 8000000,
                    framerate: 30,
                  },
                });
                return {
                  supported: result.supported,
                  smooth: result.smooth,
                  powerEfficient: result.powerEfficient,
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
              }
            },
          },
          {
            key: "aud-aac-mp4",
            name: "音频: AAC MP4",
            resolve: async ({ nav }) => {
              if (!nav.mediaCapabilities?.decodingInfo) return "Not supported";
              try {
                const result = await nav.mediaCapabilities.decodingInfo({
                  type: "file",
                  audio: {
                    contentType: 'audio/mp4; codecs="mp4a.40.2"',
                    bitrate: 128000,
                    samplerate: 44100,
                  },
                });
                return {
                  supported: result.supported,
                  smooth: result.smooth,
                  powerEfficient: result.powerEfficient,
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
              }
            },
          },
          {
            key: "aud-opus-webm",
            name: "音频: Opus WebM",
            resolve: async ({ nav }) => {
              if (!nav.mediaCapabilities?.decodingInfo) return "Not supported";
              try {
                const result = await nav.mediaCapabilities.decodingInfo({
                  type: "file",
                  audio: {
                    contentType: 'audio/webm; codecs="opus"',
                    bitrate: 128000,
                    samplerate: 48000,
                  },
                });
                return {
                  supported: result.supported,
                  smooth: result.smooth,
                  powerEfficient: result.powerEfficient,
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
              }
            },
          },
        ],
      },
      {
        key: "encodingInfo",
        name: "编码能力测试",
        renderChildrenOnly: true,
        resolve: () => true,
        children: [
          {
            key: "vid-h264-mp4",
            name: "视频: H.264 MP4",
            resolve: ({ nav }) =>
              getEncodingInfo(nav, {
                video: {
                  contentType: 'video/mp4; codecs="avc1.42E01E"',
                  width: 1920,
                  height: 1080,
                  bitrate: 8000000,
                  framerate: 30,
                },
              }),
          },
          {
            key: "vid-vp9-webm",
            name: "视频: VP9 WebM",
            resolve: ({ nav }) =>
              getEncodingInfo(nav, {
                video: {
                  contentType: 'video/webm; codecs="vp9"',
                  width: 1920,
                  height: 1080,
                  bitrate: 8000000,
                  framerate: 30,
                },
              }),
          },
          {
            key: "aud-opus-webm",
            name: "音频: Opus WebM",
            resolve: ({ nav }) =>
              getEncodingInfo(nav, {
                audio: {
                  contentType: 'audio/webm; codecs="opus"',
                  bitrate: 128000,
                  samplerate: 48000,
                },
              }),
          },
        ],
      },
    ],
  },
  {
    key: "userAgentData.brands",
    name: "UA 品牌信息",
    label: "navigator.userAgentData.brands",
    group: "clientHints",
    resolve: (nav) => (nav as any).userAgentData?.brands ?? null,
  },
  {
    key: "userAgentData.mobile",
    name: "移动端标识",
    label: "navigator.userAgentData.mobile",
    group: "clientHints",
    path: "userAgentData.mobile",
  },
  {
    key: "userAgentData.platform",
    name: "UA 平台",
    label: "navigator.userAgentData.platform",
    group: "clientHints",
    path: "userAgentData.platform",
  },
  {
    key: "connection",
    name: "网络连接信息",
    label: "navigator.connection",
    group: "environment",
    resolve: (nav) =>
      (nav as Navigator & { connection?: unknown }).connection ?? null,
    children: [
      { key: "downlink", name: "下行速度 (Mbps)", path: "downlink" },
      { key: "effectiveType", name: "有效连接类型", path: "effectiveType" },
      { key: "rtt", name: "往返时间 (ms)", path: "rtt" },
      { key: "saveData", name: "省流模式", path: "saveData" },
      { key: "type", name: "连接类型", path: "type" },
    ],
  },
  {
    key: "gpuAdapter",
    name: "GPU 适配器",
    label: "navigator.gpu.requestAdapter()",
    group: "environment",
    children: [
      {
        key: "isFallbackAdapter",
        name: "回退适配器",
        path: "isFallbackAdapter",
      },
      {
        key: "features",
        name: "功能",
        path: "features",
      },
      {
        key: "info",
        name: "信息",
        path: "info",
        renderChildrenOnly: true,
        children: [
          { key: "vendor", name: "供应商", path: "vendor" },
          { key: "architecture", name: "架构", path: "architecture" },
          { key: "device", name: "设备", path: "device" },
          { key: "description", name: "描述", path: "description" },
        ],
      },
      {
        key: "limits",
        name: "限制",
        path: "limits",
        renderChildrenOnly: true,
        children: [
          {
            key: "maxTextureDimension1D",
            name: "最大 1D 纹理尺寸",
            path: "maxTextureDimension1D",
          },
          {
            key: "maxTextureDimension2D",
            name: "最大 2D 纹理尺寸",
            path: "maxTextureDimension2D",
          },
          {
            key: "maxTextureDimension3D",
            name: "最大 3D 纹理尺寸",
            path: "maxTextureDimension3D",
          },
          {
            key: "maxTextureArrayLayers",
            name: "最大纹理数组层数",
            path: "maxTextureArrayLayers",
          },
          { key: "maxBindGroups", name: "最大绑定组", path: "maxBindGroups" },
          {
            key: "maxBindGroupsPlusVertexBuffers",
            name: "最大绑定组+顶点缓冲区",
            path: "maxBindGroupsPlusVertexBuffers",
          },
          {
            key: "maxBindingsPerBindGroup",
            name: "每绑定组最大绑定数",
            path: "maxBindingsPerBindGroup",
          },
          {
            key: "maxDynamicUniformBuffersPerPipelineLayout",
            name: "每管线布局最大动态统一缓冲区",
            path: "maxDynamicUniformBuffersPerPipelineLayout",
          },
          {
            key: "maxDynamicStorageBuffersPerPipelineLayout",
            name: "每管线布局最大动态存储缓冲区",
            path: "maxDynamicStorageBuffersPerPipelineLayout",
          },
          {
            key: "maxSampledTexturesPerShaderStage",
            name: "每着色器阶段最大采样纹理数",
            path: "maxSampledTexturesPerShaderStage",
          },
          {
            key: "maxSamplersPerShaderStage",
            name: "每着色器阶段最大采样器数",
            path: "maxSamplersPerShaderStage",
          },
          {
            key: "maxStorageBuffersPerShaderStage",
            name: "每着色器阶段最大存储缓冲区数",
            path: "maxStorageBuffersPerShaderStage",
          },
          {
            key: "maxStorageTexturesPerShaderStage",
            name: "每着色器阶段最大存储纹理数",
            path: "maxStorageTexturesPerShaderStage",
          },
          {
            key: "maxUniformBuffersPerShaderStage",
            name: "每着色器阶段最大统一缓冲区数",
            path: "maxUniformBuffersPerShaderStage",
          },
          {
            key: "maxUniformBufferBindingSize",
            name: "最大统一缓冲区绑定大小",
            path: "maxUniformBufferBindingSize",
          },
          {
            key: "maxStorageBufferBindingSize",
            name: "最大存储缓冲区绑定大小",
            path: "maxStorageBufferBindingSize",
          },
          {
            key: "minUniformBufferOffsetAlignment",
            name: "最小统一缓冲区偏移对齐",
            path: "minUniformBufferOffsetAlignment",
          },
          {
            key: "minStorageBufferOffsetAlignment",
            name: "最小存储缓冲区偏移对齐",
            path: "minStorageBufferOffsetAlignment",
          },
          {
            key: "maxVertexBuffers",
            name: "最大顶点缓冲区数",
            path: "maxVertexBuffers",
          },
          {
            key: "maxBufferSize",
            name: "最大缓冲区大小",
            path: "maxBufferSize",
          },
          {
            key: "maxVertexAttributes",
            name: "最大顶点属性数",
            path: "maxVertexAttributes",
          },
          {
            key: "maxVertexBufferArrayStride",
            name: "最大顶点缓冲区数组步幅",
            path: "maxVertexBufferArrayStride",
          },
          {
            key: "maxInterStageShaderVariables",
            name: "最大阶段间着色器变量",
            path: "maxInterStageShaderVariables",
          },
          {
            key: "maxColorAttachments",
            name: "最大颜色附件数",
            path: "maxColorAttachments",
          },
          {
            key: "maxColorAttachmentBytesPerSample",
            name: "每样本最大颜色附件字节数",
            path: "maxColorAttachmentBytesPerSample",
          },
          {
            key: "maxComputeWorkgroupStorageSize",
            name: "最大计算工作组存储大小",
            path: "maxComputeWorkgroupStorageSize",
          },
          {
            key: "maxComputeInvocationsPerWorkgroup",
            name: "每工作组最大计算调用",
            path: "maxComputeInvocationsPerWorkgroup",
          },
          {
            key: "maxComputeWorkgroupSizeX",
            name: "最大计算工作组大小 X",
            path: "maxComputeWorkgroupSizeX",
          },
          {
            key: "maxComputeWorkgroupSizeY",
            name: "最大计算工作组大小 Y",
            path: "maxComputeWorkgroupSizeY",
          },
          {
            key: "maxComputeWorkgroupSizeZ",
            name: "最大计算工作组大小 Z",
            path: "maxComputeWorkgroupSizeZ",
          },
          {
            key: "maxComputeWorkgroupsPerDimension",
            name: "每维度最大计算工作组",
            path: "maxComputeWorkgroupsPerDimension",
          },
        ],
      },
    ],
    resolve: async (nav) => {
      const gpu = (
        nav as Navigator & {
          gpu?: {
            requestAdapter?: (options?: unknown) => Promise<unknown>;
          };
        }
      ).gpu;
      if (!gpu?.requestAdapter) {
        return null;
      }
      try {
        const adapter = await gpu.requestAdapter();
        if (!adapter || typeof adapter !== "object") {
          return null;
        }
        const adapterRecord = adapter as unknown as Record<string, unknown> & {
          features?: {
            values?: () => IterableIterator<unknown>;
            keys?: () => IterableIterator<unknown>;
          };
          limits?: unknown;
          requestAdapterInfo?: () => Promise<unknown>;
          isFallbackAdapter?: boolean;
        };

        let features: string[] = [];
        const featureSource = adapterRecord.features;
        if (featureSource) {
          const iterator =
            typeof featureSource.values === "function"
              ? featureSource.values()
              : typeof featureSource.keys === "function"
              ? featureSource.keys()
              : null;
          if (iterator) {
            features = Array.from(iterator, (item) => String(item));
          }
        }

        let info: unknown = null;
        if (typeof adapterRecord.requestAdapterInfo === "function") {
          try {
            const adapterInfo = await adapterRecord.requestAdapterInfo();
            info = extractSerializableProperties(adapterInfo) ?? adapterInfo;
          } catch (error) {
            info = {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        } else if (
          "info" in adapterRecord &&
          adapterRecord.info !== undefined
        ) {
          const rawInfo = adapterRecord.info;
          info = extractSerializableProperties(rawInfo) ?? rawInfo;
        }

        const limits = extractSerializableProperties(adapterRecord.limits);

        const payload: Record<string, unknown> = {
          features,
        };

        if (typeof adapterRecord.isFallbackAdapter === "boolean") {
          payload.isFallbackAdapter = adapterRecord.isFallbackAdapter;
        }

        if (info != null) {
          payload.info = info;
        }

        if (limits != null) {
          payload.limits = limits;
        }

        if (
          !features.length &&
          (payload.info == null || payload.info === null) &&
          (payload.limits == null || payload.limits === null)
        ) {
          return {
            message: "适配器可用，但未获取到公开字段",
          };
        }

        return payload;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  {
    key: "pdfViewerEnabled",
    name: "PDF 查看器可用",
    label: "navigator.pdfViewerEnabled",
    group: "environment",
    path: "pdfViewerEnabled",
  },
  {
    key: "uaHighEntropyValues",
    name: "高熵 UA 字段",
    label: "navigator.userAgentData.getHighEntropyValues",
    group: "highEntropy",
    renderChildrenOnly: true,
    resolve: async (nav) => {
      const uaData = (nav as any).userAgentData;
      if (!uaData?.getHighEntropyValues) {
        return null;
      }
      try {
        return await uaData.getHighEntropyValues([...HIGH_ENTROPY_HINTS]);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    children: [
      { key: "architecture", name: "架构", path: "architecture" },
      { key: "bitness", name: "位数", path: "bitness" },
      { key: "model", name: "设备型号", path: "model" },
      { key: "platform", name: "平台", path: "platform" },
      { key: "platformVersion", name: "平台版本", path: "platformVersion" },
      { key: "uaFullVersion", name: "完整 UA 版本", path: "uaFullVersion" },
      {
        key: "fullVersionList",
        name: "品牌完整版本列表",
        path: "fullVersionList",
      },
    ],
  },
  {
    key: "screen",
    name: "屏幕信息",
    label: "window.screen",
    group: "display",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined" ? window.screen : null),
    children: [
      { key: "width", name: "宽度", path: "width" },
      { key: "height", name: "高度", path: "height" },
      { key: "availWidth", name: "可用宽度", path: "availWidth" },
      { key: "availHeight", name: "可用高度", path: "availHeight" },
      { key: "colorDepth", name: "颜色深度", path: "colorDepth" },
      { key: "pixelDepth", name: "像素深度", path: "pixelDepth" },
      { key: "orientation", name: "屏幕方向", path: "orientation.type" },
    ],
  },
  {
    key: "devicePixelRatio",
    name: "设备像素比",
    label: "window.devicePixelRatio",
    group: "display",
    resolve: () =>
      typeof window !== "undefined" ? window.devicePixelRatio : null,
  },
  {
    key: "prefersColorScheme",
    name: "颜色模式偏好",
    label: "window.matchMedia('(prefers-color-scheme: dark)')",
    group: "display",
    resolve: () => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return "N/A";
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "Dark";
      }
      if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "Light";
      }
      return "No preference";
    },
  },
  {
    key: "refreshRate",
    name: "估算刷新率 (Hz)",
    label: "requestAnimationFrame",
    group: "display",
    resolve: () => estimateRefreshRate(),
  },
  {
    key: "audioContext",
    name: "音频上下文",
    label: "AudioContext",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => {
      if (typeof window === "undefined") return null;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      try {
        const ctx = new Ctx();
        const info = {
          sampleRate: ctx.sampleRate,
          baseLatency: ctx.baseLatency,
          outputLatency: ctx.outputLatency,
          state: ctx.state,
        };
        ctx.close();
        return info;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    children: [
      { key: "sampleRate", name: "采样率 (Hz)", path: "sampleRate" },
      { key: "baseLatency", name: "基础延迟 (s)", path: "baseLatency" },
      { key: "outputLatency", name: "输出延迟 (s)", path: "outputLatency" },
      { key: "state", name: "状态", path: "state" },
    ],
  },
  {
    key: "wasm",
    name: "WebAssembly 支持",
    label: "WebAssembly",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => typeof WebAssembly !== "undefined",
    children: [
      {
        key: "supported",
        name: "基本支持",
        resolve: ({ parent }) => (parent ? "Supported" : "Not supported"),
      },
      {
        key: "simd",
        name: "SIMD 支持",
        resolve: () => {
          if (typeof WebAssembly === "undefined") return "Not supported";
          try {
            const moduleBytes = new Uint8Array([
              0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
              10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 11, 11,
            ]);
            return WebAssembly.validate(moduleBytes)
              ? "Supported"
              : "Not supported";
          } catch (e) {
            return "Not supported";
          }
        },
      },
    ],
  },
  {
    key: "permissions",
    name: "权限状态",
    label: "navigator.permissions",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: (nav) => !!nav.permissions,
    children: [
      {
        key: "geolocation",
        name: "地理位置",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({ name: "geolocation" });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        key: "notifications",
        name: "通知",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({
              name: "notifications",
            });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        key: "camera",
        name: "摄像头",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({
              name: "camera" as PermissionName,
            });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        key: "microphone",
        name: "麦克风",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({
              name: "microphone" as PermissionName,
            });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        key: "clipboard-read",
        name: "剪贴板读取",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({
              name: "clipboard-read" as PermissionName,
            });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
      {
        key: "clipboard-write",
        name: "剪贴板写入",
        resolve: async ({ nav }) => {
          if (!nav.permissions?.query) return "N/A";
          try {
            const status = await nav.permissions.query({
              name: "clipboard-write" as PermissionName,
            });
            return status.state;
          } catch (e) {
            return e instanceof Error ? e.message : String(e);
          }
        },
      },
    ],
  },
  {
    key: "indexedDB",
    name: "IndexedDB",
    label: "window.indexedDB",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => typeof indexedDB !== "undefined",
    children: [
      {
        key: "supported",
        name: "基本支持",
        resolve: ({ parent }) => (parent ? "Supported" : "Not supported"),
      },
      {
        key: "databases",
        name: "数据库列表",
        resolve: async () => {
          if (
            typeof indexedDB === "undefined" ||
            !(indexedDB as any).databases
          ) {
            return "API not supported";
          }
          try {
            const dbs = await (indexedDB as any).databases();
            if (!dbs || dbs.length === 0) {
              return "No databases found";
            }
            return dbs.map((db: any) => ({
              name: db.name,
              version: db.version,
            }));
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  {
    key: "timezone",
    name: "时区信息",
    label: "Intl.DateTimeFormat().resolvedOptions()",
    group: "localization",
    renderChildrenOnly: true,
    resolve: () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions();
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    children: [
      { key: "timeZone", name: "时区", path: "timeZone" },
      { key: "locale", name: "语言环境", path: "locale" },
      { key: "timeZoneName", name: "时区名称", path: "timeZoneName" },
      { key: "hourCycle", name: "小时周期", path: "hourCycle" },
      { key: "numberingSystem", name: "数字系统", path: "numberingSystem" },
      { key: "calendar", name: "日历", path: "calendar" },
    ],
  },
  {
    key: "speechVoices",
    name: "语音合成声音",
    label: "speechSynthesis.getVoices()",
    group: "capabilities",
    resolve: () =>
      new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          return resolve(null);
        }
        let voices = window.speechSynthesis.getVoices();
        if (voices.length) {
          return resolve(
            voices.map((v) => ({
              name: v.name,
              lang: v.lang,
              default: v.default,
              localService: v.localService,
              voiceURI: v.voiceURI,
            }))
          );
        }
        window.speechSynthesis.onvoiceschanged = () => {
          voices = window.speechSynthesis.getVoices();
          resolve(
            voices.map((v) => ({
              name: v.name,
              lang: v.lang,
              default: v.default,
              localService: v.localService,
              voiceURI: v.voiceURI,
            }))
          );
        };
      }),
  },
  {
    key: "webgl",
    name: "WebGL 渲染器",
    label: "WebGL",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => getWebGLContextInfo("webgl"),
    children: [
      { key: "vendor", name: "供应商", path: "vendor" },
      { key: "renderer", name: "渲染器", path: "renderer" },
      { key: "unmaskedVendor", name: "未伪装供应商", path: "unmaskedVendor" },
      {
        key: "unmaskedRenderer",
        name: "未伪装渲染器",
        path: "unmaskedRenderer",
      },
      { key: "version", name: "版本", path: "version" },
      {
        key: "shadingLanguageVersion",
        name: "着色器语言版本",
        path: "shadingLanguageVersion",
      },
    ],
  },
  {
    key: "webgl2",
    name: "WebGL 2 渲染器",
    label: "WebGL 2",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => getWebGLContextInfo("webgl2"),
    children: [
      { key: "vendor", name: "供应商", path: "vendor" },
      { key: "renderer", name: "渲染器", path: "renderer" },
      { key: "unmaskedVendor", name: "未伪装供应商", path: "unmaskedVendor" },
      {
        key: "unmaskedRenderer",
        name: "未伪装渲染器",
        path: "unmaskedRenderer",
      },
      { key: "version", name: "版本", path: "version" },
      {
        key: "shadingLanguageVersion",
        name: "着色器语言版本",
        path: "shadingLanguageVersion",
      },
    ],
  },
  {
    key: "webglParameters",
    name: "WebGL 参数",
    label: "gl.getParameter",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => getWebGLParameters("webgl"),
    children: [
      { key: "attributes", name: "上下文属性", path: "attributes" },
      { key: "parameters", name: "参数", path: "parameters" },
    ],
  },
  {
    key: "webgl2Parameters",
    name: "WebGL2 参数",
    label: "gl2.getParameter",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => getWebGLParameters("webgl2"),
    children: [
      { key: "attributes", name: "上下文属性", path: "attributes" },
      { key: "parameters", name: "参数", path: "parameters" },
      { key: "webgl2", name: "WebGL2 专属", path: "webgl2" },
    ],
  },
  {
    key: "doNotTrack",
    name: "Do Not Track",
    label: "navigator.doNotTrack / window.doNotTrack",
    group: "environment",
    resolve: () => {
      try {
        const values = [
          (navigator as any).doNotTrack,
          (window as any).doNotTrack,
          (navigator as any).msDoNotTrack,
        ].filter((v) => v != null);
        if (values.length === 0) return "N/A";
        // 标准约定: "1" 表示开启 DNT，"0" 表示关闭
        return values[0];
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    key: "adblock",
    name: "广告拦截",
    label: "常见规则拦截检测",
    group: "environment",
    renderChildrenOnly: true,
    resolve: () => detectAdBlock(),
    children: [
      { key: "detected", name: "是否检测到", path: "detected" },
      { key: "hiddenByCss", name: "命中诱饵选择器", path: "hiddenByCss" },
    ],
  },
  {
    key: "fontSupport",
    name: "字体支持",
    label: "Canvas font rendering",
    group: "personalization",
    renderChildrenOnly: true,
    resolve: () => {
      if (typeof document === "undefined") return null;
      return true; // Just a placeholder for children
    },
    children: FONT_GROUPS_TO_CHECK.reduce<UAFieldChildDefinition[]>(
      (acc, group) => {
        const supportedFonts = group.fonts.filter(isFontSupported);
        if (supportedFonts.length > 0) {
          acc.push({
            key: group.name.toLowerCase().replace(/\s/g, "-"),
            name: group.name,
            renderChildrenOnly: true,
            resolve: () => true,
            children: supportedFonts.map((font) => ({
              key: font.toLowerCase().replace(/\s/g, "-"),
              name: font,
              resolve: () => "Supported",
            })),
          });
        }
        return acc;
      },
      []
    ),
  },
  // ---------- 环境：安全与隔离 ----------
  {
    key: "security",
    name: "安全与隔离",
    label: "window.isSecureContext / crossOriginIsolated",
    group: "environment",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined" ? true : null),
    children: [
      {
        key: "isSecureContext",
        name: "安全上下文",
        resolve: () =>
          typeof window !== "undefined" ? window.isSecureContext : "N/A",
      },
      {
        key: "crossOriginIsolated",
        name: "跨源隔离",
        resolve: () =>
          typeof window !== "undefined"
            ? (window as any).crossOriginIsolated ?? false
            : "N/A",
      },
      {
        key: "sharedArrayBuffer",
        name: "SharedArrayBuffer",
        resolve: () =>
          typeof SharedArrayBuffer !== "undefined" ? "Available" : "Unavailable",
      },
    ],
  },
  // ---------- 环境：存储持久化 ----------
  {
    key: "storage.persisted",
    name: "持久化存储",
    label: "navigator.storage.persisted()",
    group: "environment",
    resolve: async (nav) => {
      if (!nav.storage?.persisted) return null;
      try {
        return await nav.storage.persisted();
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  // ---------- 环境：Performance ----------
  {
    key: "performance",
    name: "性能概览",
    label: "performance.*",
    group: "environment",
    renderChildrenOnly: true,
    resolve: () => (typeof performance !== "undefined"),
    children: [
      {
        key: "memory",
        name: "内存 (Chrome)",
        resolve: () => {
          try {
            const mem = (performance as any).memory;
            if (!mem) return "N/A";
            return {
              jsHeapSizeLimit: mem.jsHeapSizeLimit,
              totalJSHeapSize: mem.totalJSHeapSize,
              usedJSHeapSize: mem.usedJSHeapSize,
            };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "navigation",
        name: "导航计时",
        resolve: () => {
          try {
            const entries = performance.getEntriesByType("navigation");
            if (!entries || entries.length === 0) return "N/A";
            const entry = entries[0] as any;
            const shallow: Record<string, unknown> = {};
            for (const k of Object.getOwnPropertyNames(entry)) {
              const v = (entry as any)[k];
              if (typeof v === "function") continue;
              if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
                shallow[k] = v;
              }
            }
            return shallow;
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 显示：更多偏好/色域/HDR ----------
  {
    key: "displayPreferences",
    name: "显示偏好",
    label: "matchMedia",
    group: "display",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined" && typeof window.matchMedia === "function") ? true : "N/A",
    children: [
      {
        key: "prefersReducedMotion",
        name: "减少动态",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          return window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "reduce"
            : window.matchMedia("(prefers-reduced-motion: no-preference)").matches
            ? "no-preference"
            : "unknown";
        },
      },
      {
        key: "prefersContrast",
        name: "对比度偏好",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          if (window.matchMedia("(prefers-contrast: more)").matches) return "more";
          if (window.matchMedia("(prefers-contrast: less)").matches) return "less";
          if (window.matchMedia("(prefers-contrast: custom)").matches) return "custom";
          if (window.matchMedia("(prefers-contrast: no-preference)").matches) return "no-preference";
          return "unknown";
        },
      },
      {
        key: "forcedColors",
        name: "强制颜色",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          return window.matchMedia("(forced-colors: active)").matches ? "active" : "none";
        },
      },
      {
        key: "colorGamut",
        name: "色域",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          if (window.matchMedia("(color-gamut: rec2020)").matches) return "rec2020";
          if (window.matchMedia("(color-gamut: p3)").matches) return "p3";
          if (window.matchMedia("(color-gamut: srgb)").matches) return "srgb";
          return "unknown";
        },
      },
      {
        key: "hdr",
        name: "HDR 动态范围",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          return window.matchMedia("(dynamic-range: high)").matches ? "high" : "standard";
        },
      },
      {
        key: "reducedData",
        name: "减少数据",
        resolve: () => {
          if (typeof window === "undefined" || !window.matchMedia) return "N/A";
          return window.matchMedia("(prefers-reduced-data: reduce)").matches ? "reduce" : "no-preference";
        },
      },
    ],
  },
  // ---------- 能力：WebRTC ----------
  {
    key: "webrtc",
    name: "WebRTC 能力",
    label: "RTCPeerConnection / MediaDevices",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined"),
    children: [
      {
        key: "supported",
        name: "基本支持",
        resolve: () => (typeof window !== "undefined" && "RTCPeerConnection" in window) ? "Supported" : "Not supported",
      },
      {
        key: "supportedConstraints",
        name: "约束支持",
        resolve: (/* ctx */ { nav }) => {
          try {
            return nav.mediaDevices?.getSupportedConstraints?.() ?? "N/A";
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "videoCodecs",
        name: "视频编解码",
        resolve: () => {
          try {
            const Sender = (window as any).RTCRtpSender;
            const caps = Sender?.getCapabilities?.("video");
            return caps?.codecs ?? "N/A";
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "audioCodecs",
        name: "音频编解码",
        resolve: () => {
          try {
            const Sender = (window as any).RTCRtpSender;
            const caps = Sender?.getCapabilities?.("audio");
            return caps?.codecs ?? "N/A";
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 能力：WebAuthn ----------
  {
    key: "webauthn",
    name: "WebAuthn",
    label: "PublicKeyCredential",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined" && (window as any).PublicKeyCredential ? true : "Not supported"),
    children: [
      {
        key: "platformAuthenticator",
        name: "平台验证器可用",
        resolve: async () => {
          try {
            const PKC = (window as any).PublicKeyCredential;
            if (!PKC?.isUserVerifyingPlatformAuthenticatorAvailable) return "N/A";
            const ok = await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
            return ok;
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "conditionalMediation",
        name: "条件中介可用",
        resolve: async () => {
          try {
            const PKC = (window as any).PublicKeyCredential;
            if (!PKC?.isConditionalMediationAvailable) return "N/A";
            const ok = await PKC.isConditionalMediationAvailable();
            return ok;
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 能力：WebXR ----------
  {
    key: "webxr",
    name: "WebXR",
    label: "navigator.xr",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: (nav) => ((nav as any).xr ? true : "Not supported"),
    children: [
      {
        key: "immersive-vr",
        name: "沉浸式 VR",
        resolve: async ({ nav }) => {
          try {
            const xr = (nav as any).xr;
            if (!xr?.isSessionSupported) return "N/A";
            return await xr.isSessionSupported("immersive-vr");
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "immersive-ar",
        name: "沉浸式 AR",
        resolve: async ({ nav }) => {
          try {
            const xr = (nav as any).xr;
            if (!xr?.isSessionSupported) return "N/A";
            return await xr.isSessionSupported("immersive-ar");
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 能力：WebCodecs ----------
  {
    key: "webcodecs",
    name: "WebCodecs",
    label: "VideoDecoder/AudioDecoder",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => (typeof window !== "undefined" && ((window as any).VideoDecoder || (window as any).AudioDecoder) ? true : "Not supported"),
    children: [
      {
        key: "video-h264",
        name: "视频: H.264",
        resolve: async () => {
          try {
            const VD = (window as any).VideoDecoder;
            if (!VD?.isConfigSupported) return "Not supported";
            const res = await VD.isConfigSupported({
              codec: "avc1.42E01E",
              codedWidth: 1920,
              codedHeight: 1080,
              bitrate: 8000000,
              framerate: 30,
              hardwareAcceleration: "no-preference",
            });
            return { supported: res.supported };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "video-vp9",
        name: "视频: VP9",
        resolve: async () => {
          try {
            const VD = (window as any).VideoDecoder;
            if (!VD?.isConfigSupported) return "Not supported";
            const res = await VD.isConfigSupported({
              codec: "vp09.00.10.08",
              codedWidth: 1920,
              codedHeight: 1080,
              bitrate: 8000000,
              framerate: 30,
              hardwareAcceleration: "no-preference",
            });
            return { supported: res.supported };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "audio-opus",
        name: "音频: Opus",
        resolve: async () => {
          try {
            const AD = (window as any).AudioDecoder;
            if (!AD?.isConfigSupported) return "Not supported";
            const res = await AD.isConfigSupported({
              codec: "opus",
              sampleRate: 48000,
              numberOfChannels: 2,
            });
            return { supported: res.supported };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "audio-aac",
        name: "音频: AAC",
        resolve: async () => {
          try {
            const AD = (window as any).AudioDecoder;
            if (!AD?.isConfigSupported) return "Not supported";
            const res = await AD.isConfigSupported({
              codec: "mp4a.40.2",
              sampleRate: 44100,
              numberOfChannels: 2,
            });
            return { supported: res.supported };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 能力：EME DRM ----------
  {
    key: "eme",
    name: "加密媒体扩展",
    label: "navigator.requestMediaKeySystemAccess",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: (nav) => ((nav as any).requestMediaKeySystemAccess ? true : "Not supported"),
    children: [
      {
        key: "widevine",
        name: "Widevine",
        resolve: async ({ nav }) => {
          try {
            const req = (nav as any).requestMediaKeySystemAccess;
            if (!req) return "Not supported";
            await req("com.widevine.alpha", [
              {
                initDataTypes: ["cenc"],
                videoCapabilities: [
                  { contentType: 'video/mp4; codecs="avc1.42E01E"' },
                ],
              },
            ]);
            return "Supported";
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // 常见为 NotSupportedError / NotAllowedError
            if (/NotSupportedError/i.test(msg)) return "Not supported";
            return { error: msg };
          }
        },
      },
    ],
  },
  // ---------- 能力：剪贴板 ----------
  {
    key: "clipboard",
    name: "剪贴板 API",
    label: "navigator.clipboard",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: (nav) => ((nav as any).clipboard ? true : "Not supported"),
    children: [
      {
        key: "readText",
        name: "readText",
        resolve: ({ nav }) => {
          const cb = (nav as any).clipboard;
          return cb && typeof cb.readText === "function" ? "Available" : "Unavailable";
        },
      },
      {
        key: "writeText",
        name: "writeText",
        resolve: ({ nav }) => {
          const cb = (nav as any).clipboard;
          return cb && typeof cb.writeText === "function" ? "Available" : "Unavailable";
        },
      },
    ],
  },
  // ---------- 能力：OffscreenCanvas ----------
  {
    key: "offscreenCanvas",
    name: "OffscreenCanvas",
    label: "OffscreenCanvas",
    group: "capabilities",
    resolve: () => {
      try {
        const supported = !!(window as any)?.OffscreenCanvas;
        const transferable = typeof HTMLCanvasElement !== "undefined" &&
          !!(HTMLCanvasElement.prototype as any).transferControlToOffscreen;
        return { supported, transferable };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  // ---------- 能力：设备接口可用性 ----------
  {
    key: "deviceInterfaces",
    name: "设备接口",
    label: "USB/HID/Serial/Bluetooth/MIDI",
    group: "capabilities",
    renderChildrenOnly: true,
    resolve: () => true,
    children: [
      {
        key: "usb",
        name: "WebUSB",
        resolve: async () => {
          try {
            const usb = (navigator as any).usb;
            if (!usb) return "Not supported";
            if (!usb.getDevices) return "Supported";
            const devices = await usb.getDevices();
            return { supported: true, grantedDevices: devices.length };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "hid",
        name: "WebHID",
        resolve: async () => {
          try {
            const hid = (navigator as any).hid;
            if (!hid) return "Not supported";
            if (!hid.getDevices) return "Supported";
            const devices = await hid.getDevices();
            return { supported: true, grantedDevices: devices.length };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "serial",
        name: "Web Serial",
        resolve: async () => {
          try {
            const serial = (navigator as any).serial;
            if (!serial) return "Not supported";
            if (!serial.getPorts) return "Supported";
            const ports = await serial.getPorts();
            return { supported: true, grantedPorts: ports.length };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "bluetooth",
        name: "Web Bluetooth",
        resolve: async () => {
          try {
            const bt = (navigator as any).bluetooth;
            if (!bt) return "Not supported";
            if (!bt.getAvailability) return "Supported";
            const available = await bt.getAvailability();
            return { supported: true, available };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        key: "midi",
        name: "Web MIDI",
        resolve: () => {
          try {
            const has = !!(navigator as any).requestMIDIAccess;
            return has ? "Supported" : "Not supported";
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ],
  },
  // ---------- 能力：WebGL 扩展列表 ----------
  {
    key: "webglExtensions",
    name: "WebGL 扩展",
    label: "gl.getSupportedExtensions()",
    group: "capabilities",
    resolve: () => {
      try {
        if (typeof document === "undefined") return "N/A";
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl");
        if (!gl) return "Not supported";
        const exts = gl.getSupportedExtensions() || [];
        return exts.slice(0, 128);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
];

function readFromPath(root: unknown, path?: string): unknown {
  if (!path || root == null) {
    return undefined;
  }
  const segments = path.split(".");
  let current: unknown = root as Record<string, unknown>;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    if (typeof current === "object" || typeof current === "function") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

async function resolveDefinition(
  definition: UAFieldDefinition,
  nav: Navigator
): Promise<UAFieldRecord> {
  const source = definition.resolve
    ? definition.resolve(nav)
    : readFromPath(nav, definition.path);
  let value = await Promise.resolve(source);
  if (value === undefined && definition.fallback !== undefined) {
    value = definition.fallback;
  }
  let children: UAFieldChildRecord[] | undefined;
  if (definition.children && definition.children.length > 0) {
    children = await Promise.all(
      definition.children.map((child) =>
        resolveChildDefinition(child, nav, value)
      )
    );
  }
  return {
    key: definition.key,
    name: definition.name,
    label: definition.label,
    definition,
    value,
    children,
  };
}

async function resolveChildDefinition(
  definition: UAFieldChildDefinition,
  nav: Navigator,
  parentValue: unknown
): Promise<UAFieldChildRecord> {
  const source = definition.resolve
    ? definition.resolve({ parent: parentValue, nav })
    : definition.path
    ? readFromPath(parentValue, definition.path)
    : undefined;
  let value = await Promise.resolve(source);
  if (value === undefined && definition.fallback !== undefined) {
    value = definition.fallback;
  }
  let children: UAFieldChildRecord[] | undefined;
  if (definition.children && definition.children.length > 0) {
    children = await Promise.all(
      definition.children.map((child) =>
        resolveChildDefinition(child, nav, value)
      )
    );
  }
  return {
    key: definition.key,
    name: definition.name,
    label: definition.label,
    definition,
    value,
    children,
  };
}

function buildDisplayValue(value: unknown): DisplayValue {
  if (value == null) {
    return {
      formatted: "未提供",
      block: false,
      preview: null,
    };
  }
  if (typeof value === "string") {
    return {
      formatted: value,
      block: value.includes("\n"),
      preview: null,
    };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return {
      formatted: String(value),
      block: false,
      preview: null,
    };
  }
  const serialized = serializeForDisplay(value);
  return {
    formatted: formatSerializedValue(serialized.value),
    block: shouldRenderAsBlockFromSerialized(serialized.value),
    preview: serialized.preview,
  };
}

function renderValueDisplay(display: DisplayValue) {
  if (display.block) {
    return (
      <pre class="max-h-56 overflow-auto rounded-md bg-slate-900/95 px-3 py-2 font-mono text-xs text-slate-100 whitespace-pre-wrap">
        {display.formatted}
      </pre>
    );
  }
  return (
    <code class="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 whitespace-pre-wrap">
      {display.formatted}
    </code>
  );
}

function renderChildEntries(
  children: readonly UAFieldChildRecord[] | undefined
) {
  if (!children || children.length === 0) {
    return null;
  }
  return (
    <dl class="mt-2 space-y-2 border-l border-slate-200 pl-4">
      <For each={children}>{renderFieldEntry}</For>
    </dl>
  );
}

function renderFieldEntry(entry: UAFieldRecord | UAFieldChildRecord) {
  const display = buildDisplayValue(entry.value);
  const hasChildren = entry.children && entry.children.length > 0;
  const onlyChildren = entry.definition.renderChildrenOnly === true;
  const shouldRenderHeader = !onlyChildren || hasChildren;
  return (
    <div class="space-y-2">
      {shouldRenderHeader ? (
        <div
          class="grid grid-cols-1 gap-2 sm:items-start sm:gap-4"
          classList={{ "sm:grid-cols-[200px_minmax(0,1fr)]": !hasChildren }}
        >
          <dt
            class="text-sm font-medium text-slate-600"
            title={"label" in entry && entry.label ? entry.label : undefined}
          >
            {entry.name}
          </dt>
          {!hasChildren && !onlyChildren ? (
            <dd class="text-sm text-slate-900">
              {renderValueDisplay(display)}
            </dd>
          ) : null}
        </div>
      ) : null}
      {hasChildren ? renderChildEntries(entry.children) : null}
    </div>
  );
}

export default function UADebug() {
  const [entries, setEntries] = createSignal<UAFieldRecord[]>([]);
  const [error, setError] = createSignal<Error | null>(null);

  const entriesAsObject = createMemo(() => {
    return entries().reduce<Record<string, unknown>>((accumulator, entry) => {
      accumulator[entry.key] = entry.value;
      return accumulator;
    }, {});
  });

  const jsonText = createMemo(() => JSON.stringify(entriesAsObject(), null, 2));

  const groupedEntries = createMemo(() => {
    return UA_FIELD_GROUPS.map((group) => {
      return {
        ...group,
        items: entries().filter(
          (entry) => entry.definition.group === group.key
        ),
      };
    });
  });

  onMount(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    const nav = navigator;

    const loadEntries = () => {
      Promise.all(
        UA_FIELD_DEFINITIONS.map((definition) =>
          resolveDefinition(definition, nav)
        )
      )
        .then((resolved) => {
          setEntries(resolved);
          setError(null);
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        });
    };

    loadEntries();

    const connection = (
      nav as Navigator & {
        connection?: { onchange: ((event: Event) => void) | null };
      }
    ).connection;

    if (connection) {
      const connectionChangeHandler = () => {
        loadEntries();
      };
      const previousOnchange = connection.onchange ?? null;
      connection.onchange = connectionChangeHandler;
      onCleanup(() => {
        if (connection.onchange === connectionChangeHandler) {
          connection.onchange = previousOnchange;
        }
      });
    }
  });

  return (
    <div class="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div class="mx-auto w-full max-w-4xl space-y-6">
        <header class="border-b border-slate-200 pb-4">
          <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
            UA 调试信息
          </h1>
          <p class="mt-1 text-sm text-slate-500">
            页面仅在浏览器环境下收集数据，字段定义可在代码中扩展。
          </p>
        </header>
        <Show
          when={!error()}
          fallback={
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error()!.message}
            </div>
          }
        >
          <Show
            when={entries().length > 0}
            fallback={
              <div class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">
                正在读取 UA 信息...
              </div>
            }
          >
            <div class="space-y-8">
              <For each={groupedEntries()}>
                {(group) => (
                  <Show when={group.items.length > 0}>
                    <section class="space-y-3">
                      <header class="space-y-1">
                        <h2 class="text-lg font-semibold text-slate-900">
                          {group.name}
                        </h2>
                        <p class="text-sm text-slate-500">
                          {group.description}
                        </p>
                      </header>
                      <dl class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <For each={group.items}>
                          {(entry) => {
                            return (
                              <div class="border-b border-slate-200 px-4 py-3 last:border-b-0">
                                {renderFieldEntry(entry)}
                              </div>
                            );
                          }}
                        </For>
                      </dl>
                    </section>
                  </Show>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
