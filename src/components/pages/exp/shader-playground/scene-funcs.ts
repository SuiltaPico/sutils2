export type SceneFuncItem = {
  name: string;
  category: "数学" | "向量/几何" | "插值/阈值" | "反射/折射";
  signatureGL?: string;
  signatureWGSL?: string;
  description: string;
};

export const SCENE_FUNC_ITEMS: SceneFuncItem[] = [
  {
    name: "dot",
    category: "向量/几何",
    signatureGL: "float dot(vecN a, vecN b)",
    signatureWGSL: "fn dot(a: vecN<f32>, b: vecN<f32>) -> f32",
    description: "点积，衡量方向相似度。",
  },
  {
    name: "normalize",
    category: "向量/几何",
    signatureGL: "vecN normalize(vecN v)",
    signatureWGSL: "fn normalize(v: vecN<f32>) -> vecN<f32>",
    description: "归一化向量，保持方向，长度为 1。",
  },
  {
    name: "length",
    category: "向量/几何",
    signatureGL: "float length(vecN v)",
    signatureWGSL: "fn length(v: vecN<f32>) -> f32",
    description: "向量长度（欧几里得范数）。",
  },
  {
    name: "distance",
    category: "向量/几何",
    signatureGL: "float distance(vecN a, vecN b)",
    signatureWGSL: "fn distance(a: vecN<f32>, b: vecN<f32>) -> f32",
    description: "两点距离。",
  },
  {
    name: "clamp",
    category: "数学",
    signatureGL: "T clamp(T x, T minVal, T maxVal)",
    signatureWGSL: "fn clamp<T: num>(x: T, low: T, high: T) -> T",
    description: "区间裁剪，保证结果在 [min,max]。",
  },
  {
    name: "mix",
    category: "插值/阈值",
    signatureGL: "T mix(T x, T y, T a)",
    signatureWGSL: "fn mix<T: f32|vecN<f32>>(x: T, y: T, a: T) -> T",
    description: "线性插值：x*(1-a)+y*a。",
  },
  {
    name: "smoothstep",
    category: "插值/阈值",
    signatureGL: "T smoothstep(T edge0, T edge1, T x)",
    signatureWGSL: "fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32",
    description: "平滑插值（S 形过渡）。",
  },
  {
    name: "step",
    category: "插值/阈值",
    signatureGL: "T step(T edge, T x)",
    signatureWGSL: "fn step(edge: f32, x: f32) -> f32",
    description: "台阶函数：x<edge 为 0，否则为 1。",
  },
  {
    name: "fract",
    category: "数学",
    signatureGL: "T fract(T x)",
    signatureWGSL: "fn fract(x: f32|vecN<f32>) -> same",
    description: "小数部分（x-floor(x)）。",
  },
  {
    name: "mod",
    category: "数学",
    signatureGL: "T mod(T x, T y)",
    signatureWGSL: "fn mod(x: f32|vecN<f32>, y: f32|vecN<f32>) -> same",
    description: "取模，常用于平铺与周期效果。",
  },
  {
    name: "reflect",
    category: "反射/折射",
    signatureGL: "vecN reflect(vecN I, vecN N)",
    signatureWGSL: "fn reflect(I: vecN<f32>, N: vecN<f32>) -> vecN<f32>",
    description: "入射向量 I 相对法线 N 的反射方向。",
  },
  {
    name: "refract",
    category: "反射/折射",
    signatureGL: "vecN refract(vecN I, vecN N, float eta)",
    signatureWGSL: "fn refract(I: vecN<f32>, N: vecN<f32>, eta: f32) -> vecN<f32>",
    description: "折射方向，eta 为折射率比。",
  },
];


