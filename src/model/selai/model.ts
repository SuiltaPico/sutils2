import * as tf from '@tensorflow/tfjs';
import type { SelaiConfig } from './config';

function shapeAssert(x: tf.Tensor, dims: number[]) {
  if (x.shape.length !== dims.length) throw new Error(`Expected rank ${dims.length} got ${x.shape.length}`);
  for (let i = 0; i < dims.length; i++) {
    if (dims[i] !== -1 && x.shape[i] !== dims[i]) {
      throw new Error(`Shape mismatch at dim ${i}: expected ${dims[i]} got ${x.shape[i]}`);
    }
  }
}

function matMul3D2D(x: tf.Tensor3D, W: tf.Tensor2D): tf.Tensor3D {
  const [B, T, C] = x.shape;
  const x2 = x.reshape([B * T, C]);
  const y2 = x2.matMul(W);
  return y2.reshape([B, T, W.shape[1]]);
}

class LayerNorm {
  private gamma: tf.Variable; // scale
  private beta: tf.Variable; // bias
  private eps: number;

  constructor(hiddenSize: number, eps: number) {
    this.gamma = tf.variable(tf.ones([hiddenSize]));
    this.beta = tf.variable(tf.zeros([hiddenSize]));
    this.eps = eps;
  }

  apply(x: tf.Tensor2D | tf.Tensor3D) {
    const mean = tf.mean(x, -1, true);
    const variance = tf.mean(tf.square(tf.sub(x, mean)), -1, true);
    const norm = tf.div(tf.sub(x, mean), tf.sqrt(tf.add(variance, this.eps)));
    return tf.add(tf.mul(norm as any, this.gamma as any), this.beta as any) as typeof x;
  }

  getWeights() {
    return [this.gamma, this.beta];
  }
}

class RMSNorm {
  private gamma: tf.Variable; // scale only
  private eps: number;

  constructor(hiddenSize: number, eps: number) {
    this.gamma = tf.variable(tf.ones([hiddenSize]));
    this.eps = eps;
  }

  apply(x: tf.Tensor2D | tf.Tensor3D) {
    // RMSNorm: x / rms(x) * gamma; rms(x) = sqrt(mean(x^2))
    const meanSquare = tf.mean(tf.square(x), -1, true);
    const invRms = tf.rsqrt(tf.add(meanSquare, this.eps));
    const norm = tf.mul(x as any, invRms as any);
    return tf.mul(norm as any, this.gamma as any) as typeof x;
  }

  getWeights() {
    return [this.gamma];
  }
}

// RoPE helpers
function buildRotaryEmbeddings(T: number, dim: number, base: number) {
  // 返回 cos, sin: [1, 1, T, dim]
  const invFreq: number[] = [];
  for (let i = 0; i < dim; i += 2) {
    invFreq.push(1 / Math.pow(base, i / dim));
  }
  const time = tf.range(0, T, 1, 'float32'); // [T]
  const inv = tf.tensor1d(invFreq, 'float32'); // [dim/2]
  const freqs = tf.mul(time.expandDims(1), inv.expandDims(0)); // [T, dim/2]
  const emb = tf.concat([freqs, freqs], 1); // [T, dim]
  const cos = tf.cos(emb).expandDims(0).expandDims(0); // [1,1,T,dim]
  const sin = tf.sin(emb).expandDims(0).expandDims(0);
  return { cos, sin };
}

function applyRoPEHalf(x: tf.Tensor4D, cosHalf: tf.Tensor4D, sinHalf: tf.Tensor4D) {
  // x: [B,H,T,2K]，cos/sin: [1,1,T,K]
  // 仅使用 3D/4D 张量避免 WebGL 生成 5D 坐标的 shader
  const [B, H, T, D] = x.shape;
  const K = Math.floor(D / 2);
  return tf.tidy(() => {
    // 将最后一维拆成成对的 (even, odd)
    const flatBHT = B * H * T;
    const x3 = x.reshape([flatBHT, K, 2]) as tf.Tensor3D; // [BHT, K, 2]
    const x0 = x3.slice([0, 0, 0], [flatBHT, K, 1]).squeeze([2]) as tf.Tensor2D; // [BHT,K]
    const x1 = x3.slice([0, 0, 1], [flatBHT, K, 1]).squeeze([2]) as tf.Tensor2D; // [BHT,K]

    // cos/sin: [1,1,T,K] -> [T,K] -> tile 到 [BHT,K]
    const cos2 = (cosHalf.squeeze([0, 1]) as tf.Tensor2D); // [T,K]
    const sin2 = (sinHalf.squeeze([0, 1]) as tf.Tensor2D); // [T,K]
    const cosFlat = cos2.tile([B * H, 1]) as tf.Tensor2D; // [BHT,K]
    const sinFlat = sin2.tile([B * H, 1]) as tf.Tensor2D; // [BHT,K]

    const a = x0.mul(cosFlat).sub(x1.mul(sinFlat)); // [BHT,K]
    const b = x1.mul(cosFlat).add(x0.mul(sinFlat)); // [BHT,K]

    const y3 = tf.stack([a, b], 2) as tf.Tensor3D; // [BHT,K,2]
    const y = y3.reshape([B, H, T, D]) as tf.Tensor4D; // [B,H,T,2K]
    return y as tf.Tensor4D;
  });
}

class MultiHeadSelfAttention {
  private wq: tf.Variable;
  private wk: tf.Variable;
  private wv: tf.Variable;
  private wo: tf.Variable;
  private numHeads: number;
  private headDim: number;
  private ropeCos: tf.Tensor4D | null = null;
  private ropeSin: tf.Tensor4D | null = null;
  private useRoPE: boolean;
  private rotaryDim: number;
  private ropeBase: number;

  constructor(embedDim: number, numHeads: number, cfg: SelaiConfig) {
    if (embedDim % numHeads !== 0) throw new Error('embedDim must be divisible by numHeads');
    this.numHeads = numHeads;
    this.headDim = Math.floor(embedDim / numHeads);

    const glorot = (inDim: number, outDim: number) => tf.randomUniform([inDim, outDim], -Math.sqrt(6 / (inDim + outDim)), Math.sqrt(6 / (inDim + outDim)));

    this.wq = tf.variable(glorot(embedDim, embedDim));
    this.wk = tf.variable(glorot(embedDim, embedDim));
    this.wv = tf.variable(glorot(embedDim, embedDim));
    this.wo = tf.variable(glorot(embedDim, embedDim));

    this.useRoPE = !!cfg.useRoPE;
    this.ropeBase = cfg.ropeBase ?? 10000;
    const rd = cfg.rotaryDim ?? 0;
    this.rotaryDim = rd && rd > 0 ? rd : this.headDim; // 默认对整头维度应用
  }

  private splitHeads(x: tf.Tensor3D): tf.Tensor4D {
    const [B, T, C] = x.shape;
    const H = this.numHeads;
    const D = this.headDim;
    return x.reshape([B, T, H, D]).transpose([0, 2, 1, 3]); // [B, H, T, D]
  }

  private combineHeads(x: tf.Tensor4D): tf.Tensor3D {
    const [B, H, T, D] = x.shape;
    return x.transpose([0, 2, 1, 3]).reshape([B, T, H * D]); // [B, T, C]
  }

  private ensureRoPECache(T: number) {
    if (!this.useRoPE) return;
    if (this.ropeCos && this.ropeCos.shape[2] >= T) return;
    if (this.ropeCos) { this.ropeCos.dispose(); this.ropeCos = null; }
    if (this.ropeSin) { this.ropeSin.dispose(); this.ropeSin = null; }
    const { cos, sin } = buildRotaryEmbeddings(T, this.rotaryDim, this.ropeBase);
    // 防止被外层 tf.tidy 自动回收
    this.ropeCos = tf.keep(cos) as tf.Tensor4D;
    this.ropeSin = tf.keep(sin) as tf.Tensor4D;
  }

  apply(x: tf.Tensor3D, causalMask: tf.Tensor3D) {
    const Q = matMul3D2D(x, this.wq as unknown as tf.Tensor2D);
    const K = matMul3D2D(x, this.wk as unknown as tf.Tensor2D);
    const V = matMul3D2D(x, this.wv as unknown as tf.Tensor2D);

    let Qh = this.splitHeads(Q);
    let Kh = this.splitHeads(K);
    const Vh = this.splitHeads(V);

    // RoPE on Q/K
    if (this.useRoPE) {
      const T = Qh.shape[2];
      this.ensureRoPECache(T);
      const D = this.headDim;
      const dim = this.rotaryDim;
      const [Qh2, Kh2] = tf.tidy(() => {
        const q1 = Qh.slice([0,0,0,0],[Qh.shape[0],Qh.shape[1],Qh.shape[2],dim]);
        const q2 = Qh.slice([0,0,0,dim],[Qh.shape[0],Qh.shape[1],Qh.shape[2],D-dim]);
        const k1 = Kh.slice([0,0,0,0],[Kh.shape[0],Kh.shape[1],Kh.shape[2],dim]);
        const k2 = Kh.slice([0,0,0,dim],[Kh.shape[0],Kh.shape[1],Kh.shape[2],D-dim]);
        const half = Math.floor(dim/2);
        const cosHalf = this.ropeCos!.slice([0,0,0,0],[1,1,T,half]);
        const sinHalf = this.ropeSin!.slice([0,0,0,0],[1,1,T,half]);
        const q1r = applyRoPEHalf(q1 as tf.Tensor4D, cosHalf as tf.Tensor4D, sinHalf as tf.Tensor4D);
        const k1r = applyRoPEHalf(k1 as tf.Tensor4D, cosHalf as tf.Tensor4D, sinHalf as tf.Tensor4D);
        const Qout = tf.concat([q1r, q2], -1) as tf.Tensor4D;
        const Kout = tf.concat([k1r, k2], -1) as tf.Tensor4D;
        return [Qout, Kout];
      });
      Qh = Qh2; Kh = Kh2;
    }

    // scaled dot-product attention
    const scale = 1 / Math.sqrt(this.headDim);
    let att = Qh.matMul(Kh.transpose([0, 1, 3, 2])).mul(scale); // [B, H, T, T]

    // causal mask: provided as [B, T, T], expand to [B, 1, T, T]
    const mask = causalMask.expandDims(1); // [B,1,T,T]
    const veryNegative = tf.scalar(-1e9);
    att = tf.add(att, tf.mul(tf.sub(tf.onesLike(mask), mask), veryNegative));

    const attProb = tf.softmax(att, -1);
    const out = this.combineHeads(attProb.matMul(Vh) as unknown as tf.Tensor4D); // [B, T, C]

    const proj = matMul3D2D(out, this.wo as unknown as tf.Tensor2D);
    return proj;
  }

  getWeights() {
    return [this.wq, this.wk, this.wv, this.wo];
  }
}

class FeedForward {
  private w1: tf.Variable;
  private w3: tf.Variable; // gate for SwiGLU
  private w2: tf.Variable;

  constructor(embedDim: number, hiddenDim: number) {
    const glorot = (inDim: number, outDim: number) => tf.randomUniform([inDim, outDim], -Math.sqrt(6 / (inDim + outDim)), Math.sqrt(6 / (inDim + outDim)));
    this.w1 = tf.variable(glorot(embedDim, hiddenDim));
    this.w3 = tf.variable(glorot(embedDim, hiddenDim));
    this.w2 = tf.variable(glorot(hiddenDim, embedDim));
  }

  apply(x: tf.Tensor3D) {
    // SwiGLU: silu(x @ w1) * (x @ w3) @ w2
    const val = matMul3D2D(x, this.w1 as unknown as tf.Tensor2D);
    const gate = matMul3D2D(x, this.w3 as unknown as tf.Tensor2D);
    const h = tf.mul(tf.mul(val, tf.sigmoid(val)), gate); // silu(val) * gate
    return matMul3D2D(h as tf.Tensor3D, this.w2 as unknown as tf.Tensor2D);
  }

  getWeights() {
    return [this.w1, this.w3, this.w2];
  }
}

class TransformerBlock {
  private ln1: LayerNorm | RMSNorm;
  private attn: MultiHeadSelfAttention;
  private ln2: LayerNorm | RMSNorm;
  private ff: FeedForward;

  constructor(cfg: SelaiConfig) {
    this.ln1 = cfg.useRMSNorm ? new RMSNorm(cfg.embedDim, cfg.layerNormEps) : new LayerNorm(cfg.embedDim, cfg.layerNormEps);
    this.attn = new MultiHeadSelfAttention(cfg.embedDim, cfg.numHeads, cfg);
    this.ln2 = cfg.useRMSNorm ? new RMSNorm(cfg.embedDim, cfg.layerNormEps) : new LayerNorm(cfg.embedDim, cfg.layerNormEps);
    this.ff = new FeedForward(cfg.embedDim, cfg.ffHiddenDim);
  }

  apply(x: tf.Tensor3D, causalMask: tf.Tensor3D) {
    const h1 = this.ln1.apply(x) as tf.Tensor3D;
    const a = this.attn.apply(h1, causalMask);
    const x2 = tf.add(x, a) as tf.Tensor3D;
    const h2 = this.ln2.apply(x2) as tf.Tensor3D;
    const f = this.ff.apply(h2);
    return tf.add(x2, f) as tf.Tensor3D;
  }

  getWeights() {
    return [...(this.ln1 as any).getWeights(), ...this.attn.getWeights(), ...(this.ln2 as any).getWeights(), ...this.ff.getWeights()];
  }
}

function gatherEmbedding(params: tf.Tensor2D, indices2d: tf.Tensor2D): tf.Tensor3D {
  // params: [vocab, C], indices2d: [B, T]
  const [B, T] = indices2d.shape;
  const flat = indices2d.reshape([B * T]) as tf.Tensor1D;
  const flatInt = flat.dtype === 'int32' ? flat : (flat.cast('int32') as tf.Tensor1D);
  const gathered = tf.gather(params, flatInt) as tf.Tensor2D; // [B*T, C]
  return gathered.reshape([B, T, params.shape[1]]);
}

export class SelaiModel {
  private cfg: SelaiConfig;
  private tokenEmbedding: tf.Variable; // [vocab, C]
  private posEmbedding: tf.Variable | null; // [maxT, C] when used
  private blocks: TransformerBlock[];
  private lnFinal: LayerNorm | RMSNorm;
  private lmHead: tf.Variable; // [C, vocab]

  constructor(cfg: SelaiConfig) {
    this.cfg = cfg;
    this.tokenEmbedding = tf.variable(tf.randomNormal([cfg.vocabSize, cfg.embedDim], 0, 0.02));
    this.posEmbedding = cfg.useRoPE ? null : tf.variable(tf.randomNormal([cfg.maxSeqLen, cfg.embedDim], 0, 0.02));
    this.blocks = Array.from({ length: cfg.numLayers }, () => new TransformerBlock(cfg));
    this.lnFinal = cfg.useRMSNorm ? new RMSNorm(cfg.embedDim, cfg.layerNormEps) : new LayerNorm(cfg.embedDim, cfg.layerNormEps);
    this.lmHead = tf.variable(tf.randomNormal([cfg.embedDim, cfg.vocabSize], 0, 0.02));
  }

  private buildCausalMask(batchSize: number, seqLen: number): tf.Tensor3D {
    const mask = tf.buffer([batchSize, seqLen, seqLen]);
    for (let b = 0; b < batchSize; b++) {
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j <= i; j++) {
          mask.set(1, b, i, j);
        }
      }
    }
    return mask.toTensor() as tf.Tensor3D;
  }

  apply(inputIds: tf.Tensor2D): tf.Tensor3D {
    // inputIds: [B, T]
    const [B, T] = inputIds.shape;
    if (T > this.cfg.maxSeqLen) throw new Error('input length exceeds maxSeqLen');

    const tok = gatherEmbedding(this.tokenEmbedding as unknown as tf.Tensor2D, inputIds); // [B, T, C]
    let x = tok as tf.Tensor3D;

    // 绝对位置嵌入仅在未启用 RoPE 时添加
    if (!this.cfg.useRoPE && this.posEmbedding) {
      const posSlice = (this.posEmbedding as unknown as tf.Tensor2D).slice([0, 0], [T, -1]);
      const pos = tf.tile(posSlice.expandDims(0), [B, 1, 1]);
      x = tf.add(tok, pos) as tf.Tensor3D;
    }

    const mask = this.buildCausalMask(B, T);
    for (const block of this.blocks) {
      x = block.apply(x, mask);
    }

    x = this.lnFinal.apply(x) as tf.Tensor3D;
    const logits = matMul3D2D(x, this.lmHead as unknown as tf.Tensor2D); // [B, T, vocab]
    return logits;
  }

  // 支持外部提供的填充掩码（padMask: [B, T]，1=有效，0=PAD），用于训练时屏蔽被右填充的位置
  applyWithPadMask(inputIds: tf.Tensor2D, padMask: tf.Tensor2D): tf.Tensor3D {
    const [B, T] = inputIds.shape;
    if (T > this.cfg.maxSeqLen) throw new Error('input length exceeds maxSeqLen');

    const tok = gatherEmbedding(this.tokenEmbedding as unknown as tf.Tensor2D, inputIds); // [B, T, C]
    let x = tok as tf.Tensor3D;

    // 绝对位置嵌入仅在未启用 RoPE 时添加
    if (!this.cfg.useRoPE && this.posEmbedding) {
      const posSlice = (this.posEmbedding as unknown as tf.Tensor2D).slice([0, 0], [T, -1]);
      const pos = tf.tile(posSlice.expandDims(0), [B, 1, 1]);
      x = tf.add(tok, pos) as tf.Tensor3D;
    }

    // 构造带 PAD 的因果掩码：attnMask[b,i,j] = 1 当且仅当 j<=i 且 padMask[b,i]==1 且 padMask[b,j]==1
    const causal = this.buildCausalMask(B, T); // [B,T,T]
    const pm = padMask as tf.Tensor2D; // [B,T]
    const keyMask3D = pm.expandDims(1).tile([1, T, 1]); // [B,T,T] over keys j
    const queryMask3D = pm.expandDims(2).tile([1, 1, T]); // [B,T,T] over queries i
    const combinedMask = tf.mul(tf.mul(causal, keyMask3D), queryMask3D) as tf.Tensor3D; // [B,T,T]

    for (const block of this.blocks) {
      x = block.apply(x, combinedMask);
    }

    x = this.lnFinal.apply(x) as tf.Tensor3D;
    const logits = matMul3D2D(x, this.lmHead as unknown as tf.Tensor2D); // [B, T, vocab]
    return logits;
  }

  getWeights() {
    const weights: tf.Variable[] = [this.tokenEmbedding, this.lmHead];
    if (this.posEmbedding) weights.splice(1, 0, this.posEmbedding as tf.Variable);
    for (const block of this.blocks) weights.push(...(block.getWeights() as any));
    weights.push(...(this.lnFinal as any).getWeights() as any);
    return weights;
  }

  setWeights(newWeights: tf.Tensor[]) {
    const variables = this.getWeights();
    if (variables.length !== newWeights.length) throw new Error('weights length mismatch');
    for (let i = 0; i < variables.length; i++) {
      variables[i].assign(newWeights[i] as any);
    }
  }
}
