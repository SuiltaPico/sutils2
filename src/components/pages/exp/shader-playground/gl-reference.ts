export type GLRefItem = {
  name: string;
  type: string;
  stage: "顶点" | "片元" | "通用";
  version: "WebGL1" | "WebGL2" | "两者" | "自定义";
  description: string;
  deprecated?: boolean;
  note?: string;
};

export const WEBGL_REF_ITEMS: GLRefItem[] = [
  {
    name: "gl_Position",
    type: "vec4",
    stage: "顶点",
    version: "两者",
    description: "裁剪空间位置，顶点着色器必须写入。",
  },
  {
    name: "gl_PointSize",
    type: "float",
    stage: "顶点",
    version: "两者",
    description: "点精灵大小（像素）。",
  },
  {
    name: "gl_FragColor",
    type: "vec4",
    stage: "片元",
    version: "WebGL1",
    description: "片元着色器输出颜色。WebGL2 中已弃用，使用自定义 out 变量。",
    deprecated: true,
    note: "WebGL2 示例：#version 300 es\nlayout(location=0) out vec4 outColor;",
  },
  {
    name: "gl_FragCoord",
    type: "vec4",
    stage: "片元",
    version: "两者",
    description: "窗口坐标：xy 为像素坐标，z 为深度，w 为 1/wc。",
  },
  {
    name: "gl_FragDepth",
    type: "float",
    stage: "片元",
    version: "两者",
    description: "覆盖深度输出。WebGL1 需扩展 EXT_frag_depth（变量名 gl_FragDepthEXT）。",
  },
  {
    name: "gl_PointCoord",
    type: "vec2",
    stage: "片元",
    version: "两者",
    description: "点精灵内插坐标（0..1）。",
  },
  {
    name: "gl_VertexID",
    type: "int",
    stage: "顶点",
    version: "WebGL2",
    description: "当前顶点索引（从 0 开始）。",
  },
  {
    name: "u_time",
    type: "float",
    stage: "通用",
    version: "自定义",
    description: "从开始运行起的秒数，已考虑 UI 的时间倍率。",
  },
  {
    name: "u_resolution",
    type: "vec2",
    stage: "通用",
    version: "自定义",
    description: "画布像素尺寸 (width, height)。",
  },
  {
    name: "u_mouse",
    type: "vec2",
    stage: "通用",
    version: "自定义",
    description: "鼠标位置（像素），原点在左下角。",
  },
];


