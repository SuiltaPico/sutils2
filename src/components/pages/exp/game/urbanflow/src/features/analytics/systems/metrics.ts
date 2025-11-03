export type MetricsSnapshot = {
  rendererP50?: number;
  rendererP95?: number;
  simP50?: number;
  simP95?: number;
  rendererCount: number;
  simCount: number;
  simAvgMs?: number;
};

function percentile(arr: number[], p: number): number | undefined {
  if (arr.length === 0) return undefined;
  const cp = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(cp.length - 1, Math.max(0, Math.floor((p / 100) * (cp.length - 1))));
  return cp[idx];
}

export class MetricsAggregator {
  private rendererSamples: number[] = [];
  private simSamples: number[] = [];

  addRenderer(ms: number) {
    if (Number.isFinite(ms)) this.rendererSamples.push(ms);
  }

  addSim(ms: number) {
    if (Number.isFinite(ms)) this.simSamples.push(ms);
  }

  flush(): MetricsSnapshot {
    const snap: MetricsSnapshot = {
      rendererP50: percentile(this.rendererSamples, 50),
      rendererP95: percentile(this.rendererSamples, 95),
      simP50: percentile(this.simSamples, 50),
      simP95: percentile(this.simSamples, 95),
      rendererCount: this.rendererSamples.length,
      simCount: this.simSamples.length,
      simAvgMs: this.simSamples.length > 0
        ? this.simSamples.reduce((a, b) => a + b, 0) / this.simSamples.length
        : undefined,
    };
    this.rendererSamples.length = 0;
    this.simSamples.length = 0;
    return snap;
  }
}


