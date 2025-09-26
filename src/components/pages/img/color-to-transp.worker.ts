// Web Worker: 接收 ImageData 与目标背景色，计算透明通道后回传

type RgbColor = { r: number; g: number; b: number };

type ProcessMessage = {
  type: "process";
  width: number;
  height: number;
  buffer: ArrayBuffer; // Uint8ClampedArray buffer
  target: RgbColor;
};

type DoneMessage = {
  type: "done";
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

self.onmessage = (ev: MessageEvent<ProcessMessage>) => {
  const msg = ev.data;
  if (!msg || msg.type !== "process") return;

  const { width, height, buffer, target } = msg;
  const data = new Uint8ClampedArray(buffer);

  const rbg = target.r;
  const gbg = target.g;
  const bbg = target.b;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const rin = data[i] / 255;
    const gin = data[i + 1] / 255;
    const bin = data[i + 2] / 255;

    let aR = 0;
    if (rbg < 1) {
      const t = (rin - rbg) / (1 - rbg);
      if (t > aR) aR = t;
    }
    if (rbg > 0) {
      const t = (rbg - rin) / rbg;
      if (t > aR) aR = t;
    }

    let aG = 0;
    if (gbg < 1) {
      const t = (gin - gbg) / (1 - gbg);
      if (t > aG) aG = t;
    }
    if (gbg > 0) {
      const t = (gbg - gin) / gbg;
      if (t > aG) aG = t;
    }

    let aB = 0;
    if (bbg < 1) {
      const t = (bin - bbg) / (1 - bbg);
      if (t > aB) aB = t;
    }
    if (bbg > 0) {
      const t = (bbg - bin) / bbg;
      if (t > aB) aB = t;
    }

    let a = aR;
    if (aG > a) a = aG;
    if (aB > a) a = aB;
    if (a < 0) a = 0;
    if (a > 1) a = 1;

    if (a < 1e-6) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }

    const inv = 1 - a;
    let rout = (rin - rbg * inv) / a;
    let gout = (gin - gbg * inv) / a;
    let bout = (bin - bbg * inv) / a;

    let r255 = rout * 255;
    let g255 = gout * 255;
    let b255 = bout * 255;
    if (r255 < 0) r255 = 0; else if (r255 > 255) r255 = 255;
    if (g255 < 0) g255 = 0; else if (g255 > 255) g255 = 255;
    if (b255 < 0) b255 = 0; else if (b255 > 255) b255 = 255;

    data[i] = r255 | 0;
    data[i + 1] = g255 | 0;
    data[i + 2] = b255 | 0;
    data[i + 3] = (a * 255) | 0;
  }

  const done: DoneMessage = { type: "done", width, height, buffer: data.buffer };
  // 传输数组缓冲区，避免拷贝
  (self as unknown as Worker).postMessage(done, [done.buffer]);
};


