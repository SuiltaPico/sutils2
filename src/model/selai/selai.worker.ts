/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { SelaiTokenizer, specialTokens } from './tokenizer';
import { SelaiModel } from './model';
import type { SelaiConfig } from './config';

type WeightPayload = { data: Float32Array; shape: number[]; dtype: 'float32' };

type TrainStats = {
  trajectories: number;
  avgReturn: number;
  posCount: number;
  negCount: number;
};

type TrainMessage = {
  type: 'train';
  growthLog: number[];
};

type SleepTrainMessage = {
  type: 'sleepTrain';
  growthLog: number[];
  config: SelaiConfig;
  weights: WeightPayload[];
  steps?: number; // mirror steps
  ppoSteps?: number; // rl steps
};

type DoneMessage = {
  type: 'done';
  stats: TrainStats;
};

type SleepDoneMessage = {
  type: 'sleep_done';
  stats: TrainStats;
  weights: WeightPayload[];
};

type ProgressMessage = {
  type: 'progress';
  phase: 'mirror' | 'ppo';
  step: number;
  total: number;
};

type ErrorMessage = { type: 'error'; error: string };

declare const self: DedicatedWorkerGlobalScope;

const tokenizer = new SelaiTokenizer();

// 推断byteOffset（利用 'A' -> 0x41）
const inferByteOffset = (): number => {
  const ids = tokenizer.encode('A');
  return ids[0] - 0x41;
};

const idMap = (() => {
  const m = new Map<string, number>();
  m.set('BOT', tokenizer.encode(specialTokens.begin_of_turn)[0]);
  m.set('EOT', tokenizer.encode(specialTokens.end_of_turn)[0]);
  m.set('USR', tokenizer.encode(specialTokens.user)[0]);
  m.set('AST', tokenizer.encode(specialTokens.assistant)[0]);
  m.set('STOP', tokenizer.encode(specialTokens.stop_generation)[0]);
  const rewards = new Map<number, number>();
  const penalties = new Map<number, number>();
  for (const v of [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0]) {
    rewards.set(v, tokenizer.encode(specialTokens.reward(v.toFixed(1)))[0]);
    penalties.set(v, tokenizer.encode(specialTokens.penalty(v.toFixed(1)))[0]);
  }
  return { m, rewards, penalties, byteOffset: inferByteOffset() };
})();

function isByteId(id: number): boolean {
  return id >= idMap.byteOffset && id < idMap.byteOffset + 256;
}

// 直接在id序列上切分轨迹，返回内容的原始id（仅字节token）与回报
function segmentTrajectoriesByIds(ids: number[]) {
  type Traj = { who: 'user' | 'assistant'; ids: number[]; R: number };
  const results: Traj[] = [];
  const BOT = idMap.m.get('BOT')!;
  const EOT = idMap.m.get('EOT')!;
  const USR = idMap.m.get('USR')!;
  const AST = idMap.m.get('AST')!;

  let i = 0;
  while (i < ids.length) {
    if (ids[i] === BOT && (ids[i+1] === USR || ids[i+1] === AST)) {
      const who: 'user' | 'assistant' = ids[i+1] === AST ? 'assistant' : 'user';
      i += 2;
      const content: number[] = [];
      // 收集到 EOT 或 奖惩 之前的字节id
      while (i < ids.length && ids[i] !== EOT) {
        // 碰到任何奖励/惩罚就停（回合内部奖励）
        let isRewardPenalty = false;
        for (const v of idMap.rewards.values()) { if (ids[i] === v) { isRewardPenalty = true; break; } }
        if (!isRewardPenalty) for (const v of idMap.penalties.values()) { if (ids[i] === v) { isRewardPenalty = true; break; } }
        if (isRewardPenalty) break;
        if (isByteId(ids[i])) content.push(ids[i]);
        i++;
      }
      // 查找紧随其后的奖励/惩罚：允许在 EOT 之后直到下一个 BOT 之间出现
      let R = 0;
      let j = i;
      // 如果当前位置是 EOT，先越过它
      if (j < ids.length && ids[j] === EOT) j++;
      while (j < ids.length && ids[j] !== BOT) {
        let matched = false;
        for (const [v, rid] of idMap.rewards.entries()) { if (ids[j] === rid) { R = v; matched = true; break; } }
        if (!matched) for (const [v, pid] of idMap.penalties.entries()) { if (ids[j] === pid) { R = -v; matched = true; break; } }
        if (matched) break;
        j++;
      }
      results.push({ who, ids: content, R: who === 'assistant' ? R : 0 });
      // 将 i 移动到 j，以避免在本回合奖励位置重复解析
      i = j;
    } else {
      i++;
    }
  }
  return results;
}

function serializeWeights(tensors: tf.Tensor[]): WeightPayload[] {
  return tensors.map((t) => {
    const arr = t.dataSync() as Float32Array;
    const copy = new Float32Array(arr.length);
    copy.set(arr);
    return { data: copy, shape: t.shape.slice(), dtype: 'float32' };
  });
}

function deserializeWeights(payloads: WeightPayload[]): tf.Tensor[] {
  return payloads.map((w) => tf.tensor(w.data, w.shape as number[], w.dtype));
}

const PAD_ID = new SelaiTokenizer().encode(specialTokens.pad)[0];

function leftPadTo(ids: number[], targetLen: number, padId: number): number[] {
  if (ids.length >= targetLen) return ids.slice(ids.length - targetLen);
  const padCount = targetLen - ids.length;
  return new Array(padCount).fill(padId).concat(ids);
}

function buildUserNextTokenDatasetByIds(trajs: { who: 'user' | 'assistant'; ids: number[] }[], maxSeqLen: number): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];
  for (const t of trajs) {
    if (t.who !== 'user') continue;
    const ids = t.ids;
    if (ids.length < 2) continue;
    const inSeq = ids.slice(0, -1);
    const tgtSeq = ids.slice(1);
    const inFixed = leftPadTo(inSeq, maxSeqLen, PAD_ID);
    const tgtFixed = leftPadTo(tgtSeq, maxSeqLen, PAD_ID);
    const mask = tgtFixed.map((x) => (x === PAD_ID ? 0 : 1));
    inputs.push(inFixed);
    targets.push(tgtFixed);
    masks.push(mask);
  }
  return { inputs, targets, masks };
}

// 助手回合的监督数据集（可选：仅使用正反馈样本）
function buildAssistantNextTokenDatasetByIds(
  trajs: { who: 'user' | 'assistant'; ids: number[]; R?: number }[],
  maxSeqLen: number,
  posOnly: boolean = true,
): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];
  const BOT = idMap.m.get('BOT')!;
  const AST = idMap.m.get('AST')!;
  for (const t of trajs) {
    if (t.who !== 'assistant') continue;
    const rewardVal = (t as any).R ?? 0;
    if (posOnly && rewardVal <= 0) continue; // 只用正反馈样本进行镜像
    const ids = t.ids;
    if (ids.length < 2) continue;
    // 带上回合前缀以模拟真实条件：<BOT><AST> + 内容
    const seq = [BOT, AST, ...ids];
    const inSeq = seq.slice(0, -1);
    const tgtSeq = seq.slice(1);
    const inFixed = leftPadTo(inSeq, maxSeqLen, PAD_ID);
    const tgtFixed = leftPadTo(tgtSeq, maxSeqLen, PAD_ID);
    const mask = tgtFixed.map((x) => (x === PAD_ID ? 0 : 1));
    inputs.push(inFixed);
    targets.push(tgtFixed);
    masks.push(mask);
  }
  return { inputs, targets, masks };
}

// 基于完整growthLog构造“带用户上下文的助手SFT”样本
function buildAssistantNextTokenDatasetWithContext(
  growthLog: number[],
  maxSeqLen: number,
  posOnly: boolean = true,
): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];
  const BOT = idMap.m.get('BOT')!;
  const EOT = idMap.m.get('EOT')!;
  const USR = idMap.m.get('USR')!;
  const AST = idMap.m.get('AST')!;
  const STOP = idMap.m.get('STOP')!;

  const rewardIdSet = new Set<number>([...idMap.rewards.values(), ...idMap.penalties.values()]);

  let i = 0;
  while (i < growthLog.length) {
    if (growthLog[i] === BOT && growthLog[i+1] === USR) {
      // 抽取用户片段
      i += 2;
      const userBytes: number[] = [];
      while (i < growthLog.length && growthLog[i] !== EOT) {
        if (isByteId(growthLog[i])) userBytes.push(growthLog[i]);
        i++;
      }
      // 跳过EOT
      if (i < growthLog.length && growthLog[i] === EOT) i++;

      // 查找随后是否有助手回合
      if (i < growthLog.length && growthLog[i] === BOT && growthLog[i+1] === AST) {
        i += 2;
        const astIds: number[] = [];
        while (i < growthLog.length && growthLog[i] !== STOP && growthLog[i] !== EOT) {
          astIds.push(growthLog[i]);
          i++;
        }
        // 跳过STOP（如果存在）
        if (i < growthLog.length && growthLog[i] === STOP) i++;
        // 读取奖励（直到下一个BOT或EOT）
        let R = 0;
        let j = i;
        while (j < growthLog.length && growthLog[j] !== BOT && growthLog[j] !== EOT) {
          const tok = growthLog[j];
          let matched = false;
          for (const [v, rid] of idMap.rewards.entries()) { if (tok === rid) { R = v; matched = true; break; } }
          if (!matched) for (const [v, pid] of idMap.penalties.entries()) { if (tok === pid) { R = -v; matched = true; break; } }
          if (matched) break;
          j++;
        }
        // 跳过到EOT（如果当前在EOT之前）
        while (i < growthLog.length && growthLog[i] !== EOT && growthLog[i] !== BOT) i++;
        if (i < growthLog.length && growthLog[i] === EOT) i++;

        if (!posOnly || R > 0) {
          // 输入：<BOT><USR> userBytes <EOT> <BOT><AST> ...astIds[:-1]
          // 目标：对齐下一token（仅在助手段内计算loss）
          const prefix = [BOT, USR, ...userBytes, EOT, BOT, AST];
          const full = [...prefix, ...astIds];
          if (astIds.length >= 1) {
            const inSeq = full.slice(0, -1);
            const tgtSeq = full.slice(1);
            const inFixed = leftPadTo(inSeq, maxSeqLen, PAD_ID);
            const tgtFixed = leftPadTo(tgtSeq, maxSeqLen, PAD_ID);
            // 仅在助手内容区域打mask=1
            const assistantStartInFull = prefix.length; // full中助手首token索引
            const assistantStartInTgt = assistantStartInFull - 1; // 在tgtSeq中的起点
            const shift = maxSeqLen - tgtSeq.length;
            const mask = tgtFixed.map((tok, idx) => {
              if (tok === PAD_ID) return 0;
              const posInTgt = idx - shift; // 0..tgtSeq.length-1
              return posInTgt >= assistantStartInTgt ? 1 : 0;
            });
            inputs.push(inFixed);
            targets.push(tgtFixed);
            masks.push(mask);
          }
        }
      }
    } else {
      i++;
    }
  }
  return { inputs, targets, masks };
}

function concatDatasets(
  a: { inputs: number[][]; targets: number[][]; masks: number[][] },
  b: { inputs: number[][]; targets: number[][]; masks: number[][] },
): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  return {
    inputs: a.inputs.concat(b.inputs),
    targets: a.targets.concat(b.targets),
    masks: a.masks.concat(b.masks),
  };
}

async function runMirrorTraining(model: SelaiModel, data: { inputs: number[][]; targets: number[][]; masks: number[][] }, steps: number, onProgress?: (step: number, total: number) => void) {
  const { inputs, targets, masks } = data;
  if (inputs.length === 0 || steps <= 0) return;
  const optimizer = tf.train.adam(1e-3);
  const vars = model.getWeights() as tf.Variable[];

  for (let s = 0; s < steps; s++) {
    const idx = Math.floor(Math.random() * inputs.length);
    const xIds = inputs[idx];
    const yIds = targets[idx];
    const mIds = masks[idx];

    optimizer.minimize(() => {
      const x = tf.tensor2d([xIds], [1, xIds.length], 'int32');
      const logits = model.apply(x) as tf.Tensor3D; // [1, T, V]
      const T = xIds.length;
      const V = logits.shape[2];
      const logits2d = logits.reshape([T, V]);
      const target = tf.tensor1d(yIds, 'int32');
      const targetOH = tf.oneHot(target, V).toFloat();
      const mask = tf.tensor1d(mIds, 'float32');
      const perToken = tf.losses.softmaxCrossEntropy(targetOH, logits2d, undefined) as tf.Tensor1D; // [T]
      const masked = perToken.mul(mask);
      const loss = masked.sum().div(mask.sum().add(1e-8)) as tf.Scalar;
      return loss;
    }, false, vars);

    if (onProgress) onProgress(s + 1, steps);
    await tf.nextFrame();
  }
}

type RLSample = {
  inputIds: number[];
  targetId: number;
  advantage: number;
  logp_old: number;
};

function buildAssistantRLSamplesByIds(trajs: { who: 'user' | 'assistant'; ids: number[]; R: number }[], maxSeqLen: number, maxSamplesPerTraj = 4): { flat: { inputIds: number[]; targetId: number; advantage: number; }[] } {
  const flat: { inputIds: number[]; targetId: number; advantage: number; }[] = [];
  const BOT = idMap.m.get('BOT')!;
  const AST = idMap.m.get('AST')!;
  for (const t of trajs) {
    if (t.who !== 'assistant') continue;
    const ids = t.ids;
    if (ids.length < 2) continue;
    const seq = [BOT, AST, ...ids];
    // 仅在内容区域采样目标（跳过前缀两位）
    const L = seq.length - 1;
    const picks: number[] = [];
    for (let k = 2; k <= L; k++) picks.push(k);
    if (picks.length > maxSamplesPerTraj) {
      const stride = Math.ceil(picks.length / maxSamplesPerTraj);
      const reduced: number[] = [];
      for (let i = 2 + stride - 1; i <= L && reduced.length < maxSamplesPerTraj; i += stride) reduced.push(i);
      picks.splice(0, picks.length, ...reduced);
    }
    for (const pos of picks) {
      const start = Math.max(0, pos - maxSeqLen);
      const inputIds = seq.slice(start, pos);
      const fixed = leftPadTo(inputIds, maxSeqLen, PAD_ID);
      const targetId = seq[pos];
      flat.push({ inputIds: fixed, targetId, advantage: t.R });
    }
  }
  return { flat };
}

function computeLogProb(model: SelaiModel, inputIds: number[], targetId: number): number {
  return tf.tidy(() => {
    const x = tf.tensor2d([inputIds], [1, inputIds.length], 'int32');
    const logits = model.apply(x) as tf.Tensor3D; // [1, T, V]
    const V = logits.shape[2];
    const last = logits.slice([0, logits.shape[1] - 1, 0], [1, 1, V]).reshape([V]);
    const logProbs = tf.logSoftmax(last) as tf.Tensor1D;
    const lp = (logProbs.gather(tf.tensor1d([targetId], 'int32')) as tf.Tensor1D).asScalar();
    const val = lp.dataSync()[0] as number;
    x.dispose(); logits.dispose(); logProbs.dispose(); lp.dispose();
    return val;
  });
}

async function runPPO(modelNew: SelaiModel, modelOld: SelaiModel, samples: RLSample[], steps: number, clipEps = 0.2, onProgress?: (step: number, total: number) => void) {
  if (samples.length === 0 || steps <= 0) return;
  const optimizer = tf.train.adam(5e-4);
  const vars = modelNew.getWeights() as tf.Variable[];

  for (let s = 0; s < steps; s++) {
    const ex = samples[Math.floor(Math.random() * samples.length)];
    const { inputIds, targetId, advantage, logp_old } = ex;

    optimizer.minimize(() => {
      const x = tf.tensor2d([inputIds], [1, inputIds.length], 'int32');
      const logits = modelNew.apply(x) as tf.Tensor3D;
      const V = logits.shape[2];
      const last = logits.slice([0, logits.shape[1] - 1, 0], [1, 1, V]).reshape([V]);
      const logProbs = tf.logSoftmax(last) as tf.Tensor1D;
      const logpNewScalar = (logProbs.gather(tf.tensor1d([targetId], 'int32')) as tf.Tensor1D).asScalar();

      const adv = tf.scalar(advantage);
      const logpOld = tf.scalar(logp_old);
      const ratio = tf.exp(tf.sub(logpNewScalar, logpOld));
      const unclipped = tf.mul(ratio, adv);
      const clippedRatio = tf.clipByValue(ratio, 1 - clipEps, 1 + clipEps);
      const clipped = tf.mul(clippedRatio, adv);
      const surrogate = tf.neg(tf.minimum(unclipped, clipped)) as tf.Scalar;

      // 熵正则，避免策略坍缩
      const probs = tf.softmax(last) as tf.Tensor1D;
      const entropy = tf.sum(tf.mul(probs, tf.neg(logProbs))) as tf.Scalar; // -sum p log p
      const entCoef = 0.01;
      const loss = tf.sub(surrogate, tf.mul(tf.scalar(entCoef), entropy)) as tf.Scalar;

      return loss as tf.Scalar;
    }, false, vars);

    if (onProgress) onProgress(s + 1, steps);
    await tf.nextFrame();
  }
}

self.onmessage = async (ev: MessageEvent<TrainMessage | SleepTrainMessage>) => {
  const data = ev.data as any;
  try {
    if (data.type === 'train') {
      const trajs = segmentTrajectoriesByIds(data.growthLog);
      const returns = trajs.filter(t => t.who === 'assistant').map((t) => t.R);
      const sum = returns.reduce((a, b) => a + b, 0);
      const pos = returns.filter((r) => r > 0).length;
      const neg = returns.filter((r) => r < 0).length;
      const msg: DoneMessage = { type: 'done', stats: { trajectories: trajs.length, avgReturn: trajs.length ? sum / trajs.length : 0, posCount: pos, negCount: neg } };
      self.postMessage(msg);
      return;
    }

    if (data.type === 'sleepTrain') {
      const { growthLog, config, weights, steps, ppoSteps } = data as SleepTrainMessage;
      const modelNew = new SelaiModel(config);
      const modelOld = new SelaiModel(config);
      const tensors = deserializeWeights(weights);
      modelNew.setWeights(tensors);
      modelOld.setWeights(tensors);
      tensors.forEach(t => t.dispose());

      const trajs = segmentTrajectoriesByIds(growthLog);

      const returns = trajs.filter(t => t.who === 'assistant').map((t) => t.R);
      const sum = returns.reduce((a, b) => a + b, 0);
      const pos = returns.filter((r) => r > 0).length;
      const neg = returns.filter((r) => r < 0).length;

      const stepsMirror = steps ?? 24;
      const stepsPPO = ppoSteps ?? 48;

      // 合并：用户镜像 + 正反馈助手镜像（带上下文）
      const sftUser = buildUserNextTokenDatasetByIds(trajs, config.maxSeqLen);
      const sftAstCtx = buildAssistantNextTokenDatasetWithContext(growthLog, config.maxSeqLen, true);
      const sftAll = concatDatasets(sftUser, sftAstCtx);
      await runMirrorTraining(modelNew, sftAll, stepsMirror, (step, total) => {
        const msg: ProgressMessage = { type: 'progress', phase: 'mirror', step, total };
        self.postMessage(msg);
      });

      const rlBuild = buildAssistantRLSamplesByIds(trajs, config.maxSeqLen, 4);
      const rlFlat = rlBuild.flat;

      // 优势归一化，稳定训练
      const advArr = rlFlat.map((x) => x.advantage);
      const mean = advArr.length ? advArr.reduce((a, b) => a + b, 0) / advArr.length : 0;
      const variance = advArr.length ? advArr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / advArr.length : 0;
      const std = Math.sqrt(variance) || 1;

      const rlSamples: RLSample[] = rlFlat
        .map((ex) => ({
          inputIds: ex.inputIds,
          targetId: ex.targetId,
          advantage: (ex.advantage - mean) / std,
          logp_old: computeLogProb(modelOld, ex.inputIds, ex.targetId),
        }))
        .filter((ex) => Math.abs(ex.advantage) > 1e-6);

      await runPPO(modelNew, modelOld, rlSamples, stepsPPO, 0.2, (step, total) => {
        const msg: ProgressMessage = { type: 'progress', phase: 'ppo', step, total };
        self.postMessage(msg);
      });

      const updated = modelNew.getWeights();
      const payload = serializeWeights(updated);

      const msg: SleepDoneMessage = { type: 'sleep_done', stats: { trajectories: trajs.length, avgReturn: trajs.length ? sum / trajs.length : 0, posCount: pos, negCount: neg }, weights: payload };
      self.postMessage(msg);
      return;
    }
  } catch (e: any) {
    const err: ErrorMessage = { type: 'error', error: String(e?.message ?? e) };
    self.postMessage(err);
  }
};
