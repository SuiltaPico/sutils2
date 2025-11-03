export type FeaturesManifest = {
  [featureName: string]: boolean;
};

// 初版清单：仅启用 world 模块，其余暂不装配
export const featuresManifest: FeaturesManifest = {
  world: true,
  editor: true,
  blocks: true,
  roads: true,
  intersections: true,
  traffic: true,
  incidents: true,
  // roads: false,
  // intersections: false,
};


