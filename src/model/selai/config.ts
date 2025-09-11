export type SelaiConfig = {
  vocabSize: number;
  maxSeqLen: number;
  embedDim: number;
  numHeads: number;
  numLayers: number;
  ffHiddenDim: number;
  dropout: number;
  layerNormEps: number;
};

export const defaultConfig: SelaiConfig = {
  vocabSize: 1024, // 请在实例化时根据分词器覆盖
  maxSeqLen: 160,
  embedDim: 64,
  numHeads: 4,
  numLayers: 2,
  ffHiddenDim: 128,
  dropout: 0.0, // 浏览器端默认关闭dropout，推理一致
  layerNormEps: 1e-5,
};
