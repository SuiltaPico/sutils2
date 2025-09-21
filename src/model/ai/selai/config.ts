export type SelaiConfig = {
  vocabSize: number;
  maxSeqLen: number;
  embedDim: number;
  numHeads: number;
  numLayers: number;
  ffHiddenDim: number;
  dropout: number;
  layerNormEps: number;
  useRMSNorm?: boolean;
  // RoPE 相关
  useRoPE?: boolean;
  ropeBase?: number; // 通常为 10000
  rotaryDim?: number; // 若为 0 或未设置，默认等于 headDim
};

export const defaultConfig: SelaiConfig = {
  vocabSize: 1024, // 请在实例化时根据分词器覆盖
  maxSeqLen: 328,
  embedDim: 128,
  numHeads: 8,
  numLayers: 2,
  ffHiddenDim: 256,
  dropout: 0.0, // 浏览器端默认关闭dropout，推理一致
  layerNormEps: 1e-5,
  useRMSNorm: true,
  useRoPE: true,
  ropeBase: 10000,
  rotaryDim: 0,
};
