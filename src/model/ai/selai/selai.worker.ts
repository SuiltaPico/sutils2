/// <reference lib="webworker" />

import * as tf from "@tensorflow/tfjs";
// import "@tensorflow/tfjs-backend-webgpu";
import "@tensorflow/tfjs-backend-webgl";
import { SelaiTokenizer, specialTokens } from "./tokenizer";
import { SelaiModel } from "./model";
import type { SelaiConfig } from "./config";

// const is_webgl_available = await tf.setBackend("webgl");
// if (!is_webgl_available) {
//   console.error("WebGL backend is not available");
//   throw new Error("WebGL backend is not available");
// }

type WeightPayload = { data: Float32Array; shape: number[]; dtype: "float32" };

type TrainStats = {
  trajectories: number;
  avgReturn: number;
  posCount: number;
  negCount: number;
};

type TrainMessage = {
  type: "train";
  growthLog: number[];
};

type SleepTrainMessage = {
  type: "sleepTrain";
  growthLog?: number[];
  growthLogs?: number[][];
  config: SelaiConfig;
  weights: WeightPayload[];
  steps?: number; // mirror steps
  ppoSteps?: number; // rl steps
  perDialogChunkSize?: number; // optional: force fixed steps per dialog
};

type DoneMessage = {
  type: "done";
  stats: TrainStats;
};

type SleepDoneMessage = {
  type: "sleep_done";
  stats: TrainStats;
  weights: WeightPayload[];
};

type ProgressMessage = {
  type: "progress";
  phase: "mirror" | "ppo";
  step: number;
  total: number;
};

type DatasetStatsMessage = {
  type: "dataset_stats";
  mirror: {
    samples: number;
    assistantTurns: number;
    totalTurns: number;
    avgInLen: number;
    avgTgtLen: number;
    avgMaskOnes: number;
    maxInLen: number;
    maxTgtLen: number;
    violations: number;
    previewLoss?: number;
  };
  rl?: {
    samples: number;
  };
  trainBackend: string;
};

type ErrorMessage = { type: "error"; error: string };

declare const self: DedicatedWorkerGlobalScope;

const tokenizer = new SelaiTokenizer();

// 推断byteOffset（利用 'A' -> 0x41）
const inferByteOffset = (): number => {
  const ids = tokenizer.encode("A");
  return ids[0] - 0x41;
};

const idMap = (() => {
  const m = new Map<string, number>();
  m.set("BOT", tokenizer.encode(specialTokens.begin_of_turn)[0]);
  m.set("EOT", tokenizer.encode(specialTokens.end_of_turn)[0]);
  m.set("USR", tokenizer.encode(specialTokens.user)[0]);
  m.set("AST", tokenizer.encode(specialTokens.assistant)[0]);
  m.set("STOP", tokenizer.encode(specialTokens.stop_generation)[0]);
  const rewards = new Map<number, number>();
  const penalties = new Map<number, number>();
  // support 0.05 explicitly
  rewards.set(0.05, tokenizer.encode(specialTokens.reward("0.05"))[0]);
  penalties.set(0.05, tokenizer.encode(specialTokens.penalty("0.05"))[0]);
  for (const v of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
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
  type Traj = { who: "user" | "assistant"; ids: number[]; R: number };
  const results: Traj[] = [];
  const BOT = idMap.m.get("BOT")!;
  const EOT = idMap.m.get("EOT")!;
  const USR = idMap.m.get("USR")!;
  const AST = idMap.m.get("AST")!;

  let i = 0;
  while (i < ids.length) {
    if (ids[i] === BOT && (ids[i + 1] === USR || ids[i + 1] === AST)) {
      const who: "user" | "assistant" =
        ids[i + 1] === AST ? "assistant" : "user";
      i += 2;
      const content: number[] = [];
      // 收集到 EOT 或 奖惩 之前的字节id
      while (i < ids.length && ids[i] !== EOT) {
        // 碰到任何奖励/惩罚就停（回合内部奖励）
        let isRewardPenalty = false;
        for (const v of idMap.rewards.values()) {
          if (ids[i] === v) {
            isRewardPenalty = true;
            break;
          }
        }
        if (!isRewardPenalty)
          for (const v of idMap.penalties.values()) {
            if (ids[i] === v) {
              isRewardPenalty = true;
              break;
            }
          }
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
        for (const [v, rid] of idMap.rewards.entries()) {
          if (ids[j] === rid) {
            R = v;
            matched = true;
            break;
          }
        }
        if (!matched)
          for (const [v, pid] of idMap.penalties.entries()) {
            if (ids[j] === pid) {
              R = -v;
              matched = true;
              break;
            }
          }
        if (matched) break;
        j++;
      }
      results.push({ who, ids: content, R: who === "assistant" ? R : 0 });
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
    return { data: copy, shape: t.shape.slice(), dtype: "float32" };
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

function buildAssistantMirrorMultiTurnDataset(
  growthLog: number[],
  maxSeqLen: number
): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];

  const BOT = idMap.m.get("BOT")!;
  const EOT = idMap.m.get("EOT")!;
  const USR = idMap.m.get("USR")!;
  const AST = idMap.m.get("AST")!;

  const allTurns: { who: "user" | "assistant"; tokens: number[] }[] = [];
  let i = 0;
  while (i < growthLog.length) {
    if (
      growthLog[i] === BOT &&
      (growthLog[i + 1] === USR || growthLog[i + 1] === AST)
    ) {
      const who = growthLog[i + 1] === USR ? "user" : "assistant";
      const turnStartIdx = i;

      let turnEndIdx = i + 2;
      while (turnEndIdx < growthLog.length && growthLog[turnEndIdx] !== EOT) {
        turnEndIdx++;
      }
      if (turnEndIdx < growthLog.length && growthLog[turnEndIdx] === EOT) {
        turnEndIdx++;
      }

      const turnTokens = growthLog.slice(turnStartIdx, turnEndIdx);
      allTurns.push({ who, tokens: turnTokens });
      i = turnEndIdx;
    } else {
      i++;
    }
  }

  let context: number[] = [];
  for (const turn of allTurns) {
    if (turn.who === "assistant") {
      const stopTokId = idMap.m.get("STOP")!;
      // 仅保留助手回合中的字节内容，去除已有的 STOP/奖励/惩罚等特殊符号
      const raw = turn.tokens.slice(
        2,
        turn.tokens.at(-1) === EOT ? -1 : undefined
      );
      let assistantContent = raw.filter((tid) => isByteId(tid));

      // 统一在末尾追加一个 STOP，让模型学会停止（避免重复 STOP）
      assistantContent.push(stopTokId);

      if (assistantContent.length < 1) {
        context.push(...turn.tokens);
        continue;
      }

      const prefix = [...context, BOT, AST];
      const trainingSequence = [...prefix, ...assistantContent];

      const fullLen = trainingSequence.length;
      if (fullLen < 2) continue;

      const start = Math.max(0, fullLen - maxSeqLen);
      const inSeq = trainingSequence.slice(start, fullLen - 1);
      const tgtSeq = trainingSequence.slice(start + 1);

      const assistantPartStartInFull = prefix.length;
      const assistantPartStartInTgt = assistantPartStartInFull - (start + 1);

      const maskStartIdx = Math.max(0, assistantPartStartInTgt);

      const mask = tgtSeq.map((_, idx) => (idx >= maskStartIdx ? 1 : 0));

      inputs.push(inSeq);
      targets.push(tgtSeq);
      masks.push(mask);
    }

    context.push(...turn.tokens);
    // 限制上下文长度，避免无限增长导致的截断问题
    const maxContextLen = maxSeqLen * 4;
    if (context.length > maxContextLen) {
      context = context.slice(context.length - maxContextLen);
    }
  }

  return { inputs, targets, masks };
}

function validateAndSummarizeMirrorDataset(
  ds: { inputs: number[][]; targets: number[][]; masks: number[][] },
  assistantTurns: number,
  totalTurns: number
) {
  let violations = 0;
  let sumIn = 0,
    sumTgt = 0,
    sumMaskOnes = 0;
  let maxIn = 0,
    maxTgt = 0;
  const STOP = idMap.m.get("STOP")!;
  for (let i = 0; i < ds.inputs.length; i++) {
    const x = ds.inputs[i];
    const y = ds.targets[i];
    const m = ds.masks[i];
    if (x.length !== y.length || y.length !== m.length) violations++;
    // 掩码应为“前0后1”的单调序列
    let seenOne = false;
    for (let k = 0; k < m.length; k++) {
      const mk = m[k];
      if (mk !== 0 && mk !== 1) {
        violations++;
        break;
      }
      if (seenOne && mk === 0) {
        violations++;
        break;
      }
      if (mk === 1 && !seenOne) seenOne = true;
    }
    // 掩码覆盖区域的目标应为字节或 STOP
    for (let k = 0; k < m.length; k++) {
      if (m[k] === 1) {
        const tid = y[k];
        if (!(isByteId(tid) || tid === STOP)) {
          violations++;
          break;
        }
      }
    }
    sumIn += x.length;
    sumTgt += y.length;
    maxIn = Math.max(maxIn, x.length);
    maxTgt = Math.max(maxTgt, y.length);
    for (let k = 0; k < m.length; k++) if (m[k] === 1) sumMaskOnes++;
  }
  const n = ds.inputs.length || 1;
  return {
    samples: ds.inputs.length,
    assistantTurns,
    totalTurns,
    avgInLen: sumIn / n,
    avgTgtLen: sumTgt / n,
    avgMaskOnes: sumMaskOnes / n,
    maxInLen: maxIn,
    maxTgtLen: maxTgt,
    violations,
  };
}

function buildAssistantImitateUserAfterAssistant(
  growthLog: number[],
  maxSeqLen: number
): { inputs: number[][]; targets: number[][]; masks: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];
  const BOT = idMap.m.get("BOT")!;
  const EOT = idMap.m.get("EOT")!;
  const USR = idMap.m.get("USR")!;
  const AST = idMap.m.get("AST")!;
  const STOP = idMap.m.get("STOP")!;

  // 场景一：对话开头即用户发言，视为 A为空，助手需在看到 <BOT><AST> 时复述用户 B
  {
    let i0 = 0;
    if (growthLog.length >= 2 && growthLog[0] === BOT && growthLog[1] === USR) {
      i0 = 2;
      const userBytes: number[] = [];
      while (i0 < growthLog.length && growthLog[i0] !== EOT) {
        if (isByteId(growthLog[i0])) userBytes.push(growthLog[i0]);
        i0++;
      }
      // 跳过EOT
      if (i0 < growthLog.length && growthLog[i0] === EOT) i0++;

      if (userBytes.length >= 1) {
        const prefix = [BOT, AST];
        const full = [...prefix, ...userBytes];
        const fullLen = full.length;
        const start = Math.max(0, fullLen - maxSeqLen);
        const inSeq = full.slice(start, fullLen - 1);
        const tgtSeq = full.slice(start + 1);
        const inFixed = inSeq;
        const tgtFixed = tgtSeq;
        const assistantStartInFull = prefix.length;
        const assistantStartInTgt = assistantStartInFull - (start + 1);
        const startIdx = Math.max(0, assistantStartInTgt);
        const mask = tgtFixed.map((_, idx) => (idx >= startIdx ? 1 : 0));
        inputs.push(inFixed);
        targets.push(tgtFixed);
        masks.push(mask);
      }
    }
  }

  let i = 0;
  while (i < growthLog.length) {
    if (growthLog[i] === BOT && growthLog[i + 1] === AST) {
      // 抽取助手段 A
      i += 2;
      const astBytes: number[] = [];
      while (
        i < growthLog.length &&
        growthLog[i] !== EOT &&
        growthLog[i] !== STOP
      ) {
        if (isByteId(growthLog[i])) astBytes.push(growthLog[i]);
        i++;
      }
      // 跳过 STOP（若存在）
      if (i < growthLog.length && growthLog[i] === STOP) i++;
      // 跳过到 EOT
      if (i < growthLog.length && growthLog[i] === EOT) i++;

      // 随后若出现用户段 B，则构造“看到 A，助手学会说 B”的样本
      if (
        i < growthLog.length &&
        growthLog[i] === BOT &&
        growthLog[i + 1] === USR
      ) {
        i += 2;
        const userBytes: number[] = [];
        while (i < growthLog.length && growthLog[i] !== EOT) {
          if (isByteId(growthLog[i])) userBytes.push(growthLog[i]);
          i++;
        }
        if (i < growthLog.length && growthLog[i] === EOT) i++;

        if (astBytes.length >= 1 && userBytes.length >= 1) {
          // 输入：<BOT><AST> A <EOT> <BOT><AST>
          // 目标：B（作为助手回复）
          const prefix = [BOT, AST, ...astBytes, EOT, BOT, AST];
          const full = [...prefix, ...userBytes];
          const fullLen = full.length;
          const start = Math.max(0, fullLen - maxSeqLen);
          const inSeq = full.slice(start, fullLen - 1);
          const tgtSeq = full.slice(start + 1);
          const inFixed = inSeq;
          const tgtFixed = tgtSeq;
          // 仅在“助手模仿用户的回复”区间计算 loss
          const assistantStartInFull = prefix.length;
          const assistantStartInTgt = assistantStartInFull - (start + 1);
          const startIdx = Math.max(0, assistantStartInTgt);
          const mask = tgtFixed.map((_, idx) => (idx >= startIdx ? 1 : 0));
          inputs.push(inFixed);
          targets.push(tgtFixed);
          masks.push(mask);
        }
      }
    } else {
      i++;
    }
  }

  return { inputs, targets, masks };
}

async function runMirrorTraining(
  model: SelaiModel,
  data: { inputs: number[][]; targets: number[][]; masks: number[][] },
  steps: number,
  onProgress?: (step: number, total: number, loss?: number) => void,
  batchSize: number = 1,
  lr: number = 1e-4,
  teacher?: SelaiModel,
  klCoef: number = 0.02,
  clipNorm: number = 1.0,
) {
  const { inputs, targets, masks } = data;
  if (inputs.length === 0 || steps <= 0) return;
  const vars = model.getWeights() as tf.Variable[];
  const optimizer = tf.train.adam(lr);

  const pickBatchIndices = (n: number, size: number) => {
    const idx: number[] = [];
    for (let i = 0; i < size; i++) idx.push(Math.floor(Math.random() * n));
    return idx;
  };

  for (let s = 0; s < steps; s++) {
    const batchIdx = pickBatchIndices(inputs.length, batchSize);
    const xList = batchIdx.map((i) => inputs[i]);
    const yList = batchIdx.map((i) => targets[i]);
    const mList = batchIdx.map((i) => masks[i]);
    const maxT = Math.max(...xList.map((a) => a.length));

    const padRight = (arr: number[], T: number, padVal: number) => {
      if (arr.length >= T) return arr.slice(0, T);
      const out = arr.slice();
      while (out.length < T) out.push(padVal);
      return out;
    };

    const lossVal = tf.tidy(() => {
      const xPad = xList.map((a) => padRight(a, maxT, PAD_ID));
      const yPad = yList.map((a) => padRight(a, maxT, PAD_ID));
      const mPad = mList.map((a) => padRight(a, maxT, 0));

      const lossAndGrads = tf.variableGrads(() => {
        const x = tf.tensor2d(xPad, [xPad.length, maxT], "int32");
        // padMask: 1 for non-PAD, 0 for PAD
        const padMask = tf
          .notEqual(x, tf.scalar(PAD_ID, "int32") as any)
          .toFloat() as tf.Tensor2D;
        let logitsNew = model.applyWithPadMask(x, padMask) as tf.Tensor3D; // [B, T, V]
        const V = logitsNew.shape[2];
        let logits2dNew = logitsNew.reshape([xPad.length * maxT, V]);
        // 数值稳定：裁剪 logits，避免极端值导致 NaN
        logits2dNew = tf.clipByValue(logits2dNew, -20, 20) as tf.Tensor2D;

        const yFlat = yPad.flat();
        const target = tf.tensor1d(yFlat, "int32");
        const targetOH = tf.oneHot(target, V).toFloat();
        const perTokenCE = tf.losses.softmaxCrossEntropy(
          targetOH,
          logits2dNew,
          undefined
        ) as tf.Tensor1D; // [B*T]

        const mFlat = mPad.flat();
        const mask = tf.tensor1d(mFlat, "float32");

        // KL 正则（teacher 为冻结旧模型）
        let totalLoss = perTokenCE.mul(mask).sum().div(mask.sum().add(1e-8)) as tf.Scalar;
        if (teacher && klCoef > 0) {
          const xT = tf.tensor2d(xPad, [xPad.length, maxT], "int32");
          const padMaskT = tf
            .notEqual(xT, tf.scalar(PAD_ID, "int32") as any)
            .toFloat() as tf.Tensor2D;
          let logitsOld = teacher.applyWithPadMask(xT, padMaskT) as tf.Tensor3D;
          let logits2dOld = logitsOld.reshape([xPad.length * maxT, V]);
          logits2dOld = tf.clipByValue(logits2dOld, -20, 20) as tf.Tensor2D;
          const logpNew = tf.logSoftmax(logits2dNew) as tf.Tensor2D; // [B*T,V]
          const logpOld = tf.logSoftmax(logits2dOld) as tf.Tensor2D;
          const pOld = tf.softmax(logits2dOld) as tf.Tensor2D;
          // KL(old || new) = sum p_old * (logp_old - logp_new)
          const klPerTok = tf.sum(pOld.mul(logpOld.sub(logpNew)), 1) as tf.Tensor1D;
          const klMasked = klPerTok.mul(mask);
          const klMean = klMasked.sum().div(mask.sum().add(1e-8)) as tf.Scalar;
          totalLoss = totalLoss.add(klMean.mul(klCoef)) as tf.Scalar;
        }
        return totalLoss;
      }, vars);

      const lossNum = (lossAndGrads.value as tf.Scalar).dataSync()[0] as number;

      // 如果 loss 非数，跳过本次更新，避免污染权重
      const isFiniteLoss = Number.isFinite(lossNum);
      if (isFiniteLoss) {
        // Gradient clipping by global norm + NaN 清理
        const gradsMap = lossAndGrads.grads as { [name: string]: tf.Tensor };
        const gradList = Object.values(gradsMap).map(g => {
          const finite = tf.where(tf.isFinite(g), g, tf.zerosLike(g));
          return finite as tf.Tensor;
        });
        const sumSq = gradList.reduce((acc, g) => acc.add(g.square().sum()), tf.scalar(0)) as tf.Scalar;
        const globalNorm = sumSq.sqrt();
        const scale = tf.minimum(tf.scalar(clipNorm).div(globalNorm.add(1e-6)), tf.scalar(1));
        const clipped: { [name: string]: tf.Tensor } = {};
        const keys = Object.keys(lossAndGrads.grads);
        for (let i = 0; i < keys.length; i++) {
          clipped[keys[i]] = gradList[i].mul(scale);
        }
        optimizer.applyGradients(clipped as any);
        // Dispose grads tensors
        gradList.forEach((g) => (g as any).dispose?.());
        Object.values(clipped).forEach((g) => (g as any).dispose?.());
        (sumSq as any).dispose?.();
        (globalNorm as any).dispose?.();
        (scale as any).dispose?.();
      }

      (lossAndGrads.value as any).dispose?.();
      return isFiniteLoss ? lossNum : 9.99;
    });

    if (onProgress) onProgress(s + 1, steps, lossVal);
    await tf.nextFrame();
  }
}

type RLSample = {
  inputIds: number[];
  targetId: number;
  advantage: number;
  logp_old: number;
};

function buildAssistantRLSamplesByIds(
  trajs: { who: "user" | "assistant"; ids: number[]; R: number }[],
  maxSeqLen: number,
  maxSamplesPerTraj = 4
): { flat: { inputIds: number[]; targetId: number; advantage: number }[] } {
  const flat: { inputIds: number[]; targetId: number; advantage: number }[] =
    [];
  const BOT = idMap.m.get("BOT")!;
  const AST = idMap.m.get("AST")!;
  for (const t of trajs) {
    if (t.who !== "assistant") continue;
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
      for (
        let i = 2 + stride - 1;
        i <= L && reduced.length < maxSamplesPerTraj;
        i += stride
      )
        reduced.push(i);
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

function computeLogProb(
  model: SelaiModel,
  inputIds: number[],
  targetId: number
): number {
  return tf.tidy(() => {
    const x = tf.tensor2d([inputIds], [1, inputIds.length], "int32");
    const padMask = tf
      .notEqual(x, tf.scalar(PAD_ID, "int32") as any)
      .toFloat() as tf.Tensor2D;
    const logits = model.applyWithPadMask(x, padMask) as tf.Tensor3D; // [1, T, V]
    const V = logits.shape[2];
    const last = logits
      .slice([0, logits.shape[1] - 1, 0], [1, 1, V])
      .reshape([V]);
    const logProbs = tf.logSoftmax(last) as tf.Tensor1D;
    const lp = (
      logProbs.gather(tf.tensor1d([targetId], "int32")) as tf.Tensor1D
    ).asScalar();
    const val = lp.dataSync()[0] as number;
    x.dispose();
    logits.dispose();
    logProbs.dispose();
    lp.dispose();
    return val;
  });
}

async function runPPO(
  modelNew: SelaiModel,
  modelOld: SelaiModel,
  samples: RLSample[],
  steps: number,
  clipEps = 0.2,
  onProgress?: (step: number, total: number, loss?: number) => void
) {
  if (samples.length === 0 || steps <= 0) return;
  const optimizer = tf.train.adam(3e-4);
  const vars = modelNew.getWeights() as tf.Variable[];

  for (let s = 0; s < steps; s++) {
    const ex = samples[Math.floor(Math.random() * samples.length)];
    const { inputIds, targetId, advantage, logp_old } = ex;

    const val = optimizer.minimize(
      () => {
        const x = tf.tensor2d([inputIds], [1, inputIds.length], "int32");
        const padMask = tf
          .notEqual(x, tf.scalar(PAD_ID, "int32") as any)
          .toFloat() as tf.Tensor2D;
        const logits = modelNew.applyWithPadMask(x, padMask) as tf.Tensor3D;
        const V = logits.shape[2];
        const last = logits
          .slice([0, logits.shape[1] - 1, 0], [1, 1, V])
          .reshape([V]);
        const logProbs = tf.logSoftmax(last) as tf.Tensor1D;
        const logpNewScalar = (
          logProbs.gather(tf.tensor1d([targetId], "int32")) as tf.Tensor1D
        ).asScalar();

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
        const loss = tf.sub(
          surrogate,
          tf.mul(tf.scalar(entCoef), entropy)
        ) as tf.Scalar;

        return loss as tf.Scalar;
      },
      false,
      vars
    ) as tf.Scalar | null;

    const lossNum = val ? (val.dataSync()[0] as number) : undefined;
    (val as any)?.dispose?.();
    if (onProgress) onProgress(s + 1, steps, lossNum);
    await tf.nextFrame();
  }
}

self.onmessage = async (ev: MessageEvent<TrainMessage | SleepTrainMessage>) => {
  const data = ev.data as any;
  try {
    if (data.type === "train") {
      const trajs = segmentTrajectoriesByIds(data.growthLog);
      const returns = trajs
        .filter((t) => t.who === "assistant")
        .map((t) => t.R);
      const sum = returns.reduce((a, b) => a + b, 0);
      const pos = returns.filter((r) => r > 0).length;
      const neg = returns.filter((r) => r < 0).length;
      const msg: DoneMessage = {
        type: "done",
        stats: {
          trajectories: trajs.length,
          avgReturn: trajs.length ? sum / trajs.length : 0,
          posCount: pos,
          negCount: neg,
        },
      };
      self.postMessage(msg);
      return;
    }

    if (data.type === "sleepTrain") {
      const {
        growthLog,
        growthLogs,
        config,
        weights,
        steps,
        ppoSteps,
        perDialogChunkSize,
      } = data as SleepTrainMessage;
      const modelNew = new SelaiModel(config);
      const modelOld = new SelaiModel(config);
      const tensors = deserializeWeights(weights);
      modelNew.setWeights(tensors);
      modelOld.setWeights(tensors);
      tensors.forEach((t) => t.dispose());

      const allLogs: number[][] = [];
      if (growthLogs) allLogs.push(...growthLogs);
      if (growthLog && growthLog.length > 0) allLogs.push(growthLog);

      if (allLogs.length === 0) {
        const msgDone: SleepDoneMessage = {
          type: "sleep_done",
          stats: { trajectories: 0, avgReturn: 0, posCount: 0, negCount: 0 },
          weights: data.weights,
        } as any;
        self.postMessage(msgDone);
        return;
      }

      // 聚合统计（逐对话累加，避免存大数组）
      let allTrajCount = 0;
      let sumReturn = 0;
      let posCount = 0;
      let negCount = 0;

      // 预先估计总训练步数
      const logsCount = allLogs.length;
      const totalMirrorStepsInput = steps ?? 24;
      const stepsPerLog = Math.max(
        1,
        perDialogChunkSize ??
          (Math.floor(totalMirrorStepsInput / logsCount) || 1)
      );
      const totalMirrorSteps = stepsPerLog * logsCount;
      let remainder = perDialogChunkSize
        ? 0
        : Math.max(0, totalMirrorStepsInput - stepsPerLog * logsCount);

      // 可选：先发送一次数据集规模预估
      try {
        let totalSamples = 0,
          astTurnsTot = 0,
          totalTurnsTot = 0;
        let sumIn = 0,
          sumTgt = 0,
          sumMaskOnes = 0;
        let maxIn = 0,
          maxTgt = 0;
        let violations = 0;
        for (const log of allLogs) {
          const trajs = segmentTrajectoriesByIds(log);
          allTrajCount += trajs.length;
          const returns = trajs
            .filter((t) => t.who === "assistant")
            .map((t) => t.R);
          sumReturn += returns.reduce((a, b) => a + b, 0);
          posCount += returns.filter((r) => r > 0).length;
          negCount += returns.filter((r) => r < 0).length;

          const ds = buildAssistantMirrorMultiTurnDataset(
            log,
            config.maxSeqLen
          );
          const stat = validateAndSummarizeMirrorDataset(
            ds,
            trajs.filter((t) => t.who === "assistant").length,
            trajs.length
          );
          totalSamples += stat.samples;
          astTurnsTot += stat.assistantTurns;
          totalTurnsTot += stat.totalTurns;
          sumIn += stat.avgInLen * Math.max(1, stat.samples);
          sumTgt += stat.avgTgtLen * Math.max(1, stat.samples);
          sumMaskOnes += stat.avgMaskOnes * Math.max(1, stat.samples);
          maxIn = Math.max(maxIn, stat.maxInLen);
          maxTgt = Math.max(maxTgt, stat.maxTgtLen);
          violations += stat.violations;
        }
        const n = Math.max(1, totalSamples);
        const msgStats: DatasetStatsMessage = {
          type: "dataset_stats",
          mirror: {
            samples: totalSamples,
            assistantTurns: astTurnsTot,
            totalTurns: totalTurnsTot,
            avgInLen: sumIn / n,
            avgTgtLen: sumTgt / n,
            avgMaskOnes: sumMaskOnes / n,
            maxInLen: maxIn,
            maxTgtLen: maxTgt,
            violations,
          },
          rl: { samples: 0 },
          trainBackend: tf.getBackend(),
        };
        self.postMessage(msgStats);
      } catch {}

      // 简单重放缓冲区，缓解灾难性遗忘
      const replayInputs: number[][] = [];
      const replayTargets: number[][] = [];
      const replayMasks: number[][] = [];
      const replayCap = 256;

      function sampleReplay(k: number) {
        const n = replayInputs.length;
        if (n === 0) return { inputs: [], targets: [], masks: [] };
        const outI: number[][] = [], outT: number[][] = [], outM: number[][] = [];
        for (let i = 0; i < k; i++) {
          const r = Math.floor(Math.random() * n);
          outI.push(replayInputs[r]);
          outT.push(replayTargets[r]);
          outM.push(replayMasks[r]);
        }
        return { inputs: outI, targets: outT, masks: outM };
      }

      // 按对话逐个训练，释放中间内存
      let globalStep = 0;
      for (let idx = 0; idx < allLogs.length; idx++) {
        const log = allLogs[idx];
        const ds = buildAssistantMirrorMultiTurnDataset(log, config.maxSeqLen);
        const stepsThisLog = stepsPerLog + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        if (ds.inputs.length > 0 && stepsThisLog > 0) {
          // 合并少量重放样本
          const replayK = Math.min(64, replayInputs.length);
          const batchReplay = sampleReplay(replayK);
          const merged = {
            inputs: ds.inputs.concat(batchReplay.inputs),
            targets: ds.targets.concat(batchReplay.targets),
            masks: ds.masks.concat(batchReplay.masks),
          };
          await runMirrorTraining(
            modelNew,
            merged,
            stepsThisLog,
            (step, _total, loss) => {
              const cur = Math.min(totalMirrorSteps, globalStep + step);
              const msg: ProgressMessage & {
                trainBackend: string;
                loss?: number;
              } = {
                type: "progress",
                phase: "mirror",
                step: cur,
                total: totalMirrorSteps,
                trainBackend: tf.getBackend(),
                loss,
              } as any;
              self.postMessage(msg);
            },
            1,
            1e-4,
            modelOld,
            0.02,
            1.0,
          );
          globalStep += stepsThisLog;
          // 将当前对话样本放入重放缓冲区（随机采样少量）
          const addCount = Math.min(64, ds.inputs.length);
          for (let t = 0; t < addCount; t++) {
            const r = Math.floor(Math.random() * ds.inputs.length);
            replayInputs.push(ds.inputs[r]);
            replayTargets.push(ds.targets[r]);
            replayMasks.push(ds.masks[r]);
            if (replayInputs.length > replayCap) {
              replayInputs.shift(); replayTargets.shift(); replayMasks.shift();
            }
          }
        }
        // 释放此对话的本地数组（交由 GC）
      }

      // RL 部分如需可按对话重建样本再训练；这里保持关闭

      const updated = modelNew.getWeights();
      const payload = serializeWeights(updated);

      const msgDone: SleepDoneMessage & { trainBackend: string } = {
        type: "sleep_done",
        stats: {
          trajectories: allTrajCount,
          avgReturn: allTrajCount ? sumReturn / allTrajCount : 0,
          posCount,
          negCount,
        },
        weights: payload,
        trainBackend: tf.getBackend(),
      } as any;
      self.postMessage(msgDone);
      return;
    }
  } catch (e: any) {
    const err: ErrorMessage = { type: "error", error: String(e?.message ?? e) };
    self.postMessage(err);
  }
};
