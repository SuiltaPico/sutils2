export type Clock = {
  start(): void;
  stop(): void;
  onTick(handler: (dtSec: number) => void): () => void;
  setHz(hz: number): void;
};

/**
 * 最小固定步长时钟：默认 10Hz。受 paused/scale 影响。
 * scale 仅影响模拟时间步长（dtSec × scale），不影响 tick 频率（Hz）。
 */
export function createClock(opts: {
  getPaused: () => boolean;
  getScale: () => number; // 0.5|1|2|4|8 等
  hz?: number; // 默认 10
}): Clock {
  let running = false;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let targetHz = Math.max(1, Math.min(120, Math.floor(opts.hz ?? 10)));
  let stepMs = 1000 / targetHz;
  const handlers = new Set<(dtSec: number) => void>();

  function loop(ts: number) {
    if (!running) return;
    const realDt = ts - last;
    last = ts;
    acc += realDt;
    while (acc >= stepMs) {
      acc -= stepMs;
      if (!opts.getPaused()) {
        const scale = opts.getScale() || 1;
        const dtSec = (stepMs / 1000) * scale;
        for (const h of handlers) h(dtSec);
      }
    }
    raf = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    },
    onTick(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    setHz(hz: number) {
      targetHz = Math.max(1, Math.min(120, Math.floor(hz)));
      stepMs = 1000 / targetHz;
    },
  };
}


