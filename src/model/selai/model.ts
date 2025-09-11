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

class MultiHeadSelfAttention {
  private wq: tf.Variable;
  private wk: tf.Variable;
  private wv: tf.Variable;
  private wo: tf.Variable;
  private numHeads: number;
  private headDim: number;

  constructor(embedDim: number, numHeads: number) {
    if (embedDim % numHeads !== 0) throw new Error('embedDim must be divisible by numHeads');
    this.numHeads = numHeads;
    this.headDim = Math.floor(embedDim / numHeads);

    const glorot = (inDim: number, outDim: number) => tf.randomUniform([inDim, outDim], -Math.sqrt(6 / (inDim + outDim)), Math.sqrt(6 / (inDim + outDim)));

    this.wq = tf.variable(glorot(embedDim, embedDim));
    this.wk = tf.variable(glorot(embedDim, embedDim));
    this.wv = tf.variable(glorot(embedDim, embedDim));
    this.wo = tf.variable(glorot(embedDim, embedDim));
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

  apply(x: tf.Tensor3D, causalMask: tf.Tensor3D) {
    // projections: use 3D->2D matmul to keep gradients well-shaped
    const Q = matMul3D2D(x, this.wq as unknown as tf.Tensor2D);
    const K = matMul3D2D(x, this.wk as unknown as tf.Tensor2D);
    const V = matMul3D2D(x, this.wv as unknown as tf.Tensor2D);

    const Qh = this.splitHeads(Q);
    const Kh = this.splitHeads(K);
    const Vh = this.splitHeads(V);

    // scaled dot-product attention
    const scale = 1 / Math.sqrt(this.headDim);
    let att = Qh.matMul(Kh.transpose([0, 1, 3, 2])).mul(scale); // [B, H, T, T]

    // causal mask: provided as [B, T, T], expand to [B, 1, T, T]
    const mask = causalMask.expandDims(1); // [B,1,T,T]
    const veryNegative = tf.scalar(-1e9);
    att = tf.add(att, tf.mul(tf.sub(tf.onesLike(mask), mask), veryNegative));

    const attProb = tf.softmax(att, -1);
    const out = this.combineHeads(attProb.matMul(Vh)); // [B, T, C]

    const proj = matMul3D2D(out, this.wo as unknown as tf.Tensor2D);
    return proj;
  }

  getWeights() {
    return [this.wq, this.wk, this.wv, this.wo];
  }
}

class FeedForward {
  private w1: tf.Variable;
  private b1: tf.Variable;
  private w2: tf.Variable;
  private b2: tf.Variable;

  constructor(embedDim: number, hiddenDim: number) {
    const glorot = (inDim: number, outDim: number) => tf.randomUniform([inDim, outDim], -Math.sqrt(6 / (inDim + outDim)), Math.sqrt(6 / (inDim + outDim)));
    this.w1 = tf.variable(glorot(embedDim, hiddenDim));
    this.b1 = tf.variable(tf.zeros([hiddenDim]));
    this.w2 = tf.variable(glorot(hiddenDim, embedDim));
    this.b2 = tf.variable(tf.zeros([embedDim]));
  }

  apply(x: tf.Tensor3D) {
    const h = tf.relu(matMul3D2D(x, this.w1 as unknown as tf.Tensor2D).add(this.b1 as unknown as tf.Tensor1D));
    return matMul3D2D(h as tf.Tensor3D, this.w2 as unknown as tf.Tensor2D).add(this.b2 as unknown as tf.Tensor1D);
  }

  getWeights() {
    return [this.w1, this.b1, this.w2, this.b2];
  }
}

class TransformerBlock {
  private ln1: LayerNorm;
  private attn: MultiHeadSelfAttention;
  private ln2: LayerNorm;
  private ff: FeedForward;

  constructor(cfg: SelaiConfig) {
    this.ln1 = new LayerNorm(cfg.embedDim, cfg.layerNormEps);
    this.attn = new MultiHeadSelfAttention(cfg.embedDim, cfg.numHeads);
    this.ln2 = new LayerNorm(cfg.embedDim, cfg.layerNormEps);
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
    return [...this.ln1.getWeights(), ...this.attn.getWeights(), ...this.ln2.getWeights(), ...this.ff.getWeights()];
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
  private posEmbedding: tf.Variable; // [maxT, C]
  private blocks: TransformerBlock[];
  private lnFinal: LayerNorm;
  private lmHead: tf.Variable; // [C, vocab]

  constructor(cfg: SelaiConfig) {
    this.cfg = cfg;
    this.tokenEmbedding = tf.variable(tf.randomNormal([cfg.vocabSize, cfg.embedDim], 0, 0.02));
    this.posEmbedding = tf.variable(tf.randomNormal([cfg.maxSeqLen, cfg.embedDim], 0, 0.02));
    this.blocks = Array.from({ length: cfg.numLayers }, () => new TransformerBlock(cfg));
    this.lnFinal = new LayerNorm(cfg.embedDim, cfg.layerNormEps);
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
    const posSlice = (this.posEmbedding as unknown as tf.Tensor2D).slice([0, 0], [T, -1]);
    const pos = tf.tile(posSlice.expandDims(0), [B, 1, 1]);
    let x = tf.add(tok, pos) as tf.Tensor3D;

    const mask = this.buildCausalMask(B, T);
    for (const block of this.blocks) {
      x = block.apply(x, mask);
    }

    x = this.lnFinal.apply(x) as tf.Tensor3D;
    const logits = matMul3D2D(x, this.lmHead as unknown as tf.Tensor2D); // [B, T, vocab]
    return logits;
  }

  getWeights() {
    const weights: tf.Variable[] = [this.tokenEmbedding, this.posEmbedding, this.lmHead];
    for (const block of this.blocks) weights.push(...block.getWeights() as any);
    weights.push(...this.lnFinal.getWeights() as any);
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
