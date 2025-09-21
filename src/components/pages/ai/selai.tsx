import { createSignal, For, onMount } from "solid-js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgpu";
import { SelaiModel } from "../../../model/ai/selai/model";
import { defaultConfig } from "../../../model/ai/selai/config";
import {
  SelaiTokenizer,
  specialTokens,
} from "../../../model/ai/selai/tokenizer";
import { loadWeightsFromDB, saveWeightsToDB } from "../../../model/ai/selai/db";
import { Message, presetConversations } from "../../../model/ai/selai/data";

const MAX_GEN_LEN = 128;

type SleepProgress = {
  phase: "mirror" | "ppo";
  step: number;
  total: number;
};

type GenMetrics = { validPct: number; asciiPct: number };

type ModelInfo = {
  params: number;
  paramsHuman: string;
  vocabSize: number;
  embedDim: number;
  numHeads: number;
  numLayers: number;
  ffHiddenDim: number;
  maxSeqLen: number;
  backend: string;
};

export default function SelaiPage() {
  const [status, setStatus] = createSignal<"Awake" | "Thinking" | "Learning">(
    "Awake"
  );
  const [conversation, setConversation] = createSignal<Message[]>([]);
  const [userInput, setUserInput] = createSignal("");

  // 这是“成长日志”的占位符，将来会存储Token ID
  const [growthLog, setGrowthLog] = createSignal<number[]>([]);
  const [stopRequested, setStopRequested] = createSignal(false);
  const [sleepProgress, setSleepProgress] = createSignal<SleepProgress | null>(
    null
  );
  const [trainLoss, setTrainLoss] = createSignal<number | null>(null);
  const [lastGenMetrics, setLastGenMetrics] = createSignal<GenMetrics | null>(
    null
  );
  const [modelInfo, setModelInfo] = createSignal<ModelInfo | null>(null);
  const [showHex, setShowHex] = createSignal(false);
  const [trainBackend, setTrainBackend] = createSignal<string | null>(null);
  const [genSpeed, setGenSpeed] = createSignal<number | null>(null);
  const [isInitialTraining, setIsInitialTraining] = createSignal(false);

  let model: SelaiModel | undefined;
  let tokenizer: SelaiTokenizer | undefined;
  let bannedTokenIds: number[] = [];
  let worker: Worker | undefined;
  let byteOffset: number | undefined;
  let modelConfigUsed = { ...defaultConfig };

  const encoder = new TextEncoder();
  const bytesToHex = (arr: Uint8Array | number[]) =>
    Array.from(arr as any, (b: number) => b.toString(16).padStart(2, "0")).join(
      " "
    );
  const humanParams = (n: number) =>
    n >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : n >= 1e3
      ? `${(n / 1e3).toFixed(2)}K`
      : `${n}`;

  const ensureInit = async () => {
    await tf.setBackend("webgpu");

    if (!tokenizer) {
      tokenizer = new SelaiTokenizer();
    }
    if (!model) {
      modelConfigUsed = { ...defaultConfig, vocabSize: tokenizer.vocabSize };
      model = new SelaiModel(modelConfigUsed);

      // 尝试从 IndexedDB 加载权重
      try {
        const savedWeights = await loadWeightsFromDB("selai-weights");
        if (savedWeights) {
          console.log("加载已缓存的权重。");
          const tensors = savedWeights.map((w: any) =>
            tf.tensor(w.data, w.shape, w.dtype)
          );
          model.setWeights(tensors);
          tensors.forEach((t: any) => t.dispose());
        } else {
          console.log("未找到缓存的权重，使用初始权重。");
        }
      } catch (e) {
        console.error("加载权重失败:", e);
      }

      // 计算参数量并展示
      const vars = model.getWeights();
      let params = 0;
      for (const v of vars)
        params += v.shape.reduce((a: number, b: number) => a * b, 1);
      setModelInfo({
        params,
        paramsHuman: humanParams(params),
        vocabSize: modelConfigUsed.vocabSize,
        embedDim: modelConfigUsed.embedDim,
        numHeads: modelConfigUsed.numHeads,
        numLayers: modelConfigUsed.numLayers,
        ffHiddenDim: modelConfigUsed.ffHiddenDim,
        maxSeqLen: modelConfigUsed.maxSeqLen,
        backend: tf.getBackend(),
      });
    }
    if (byteOffset == null) {
      const probe = tokenizer.encode("A");
      if (probe.length > 0) byteOffset = probe[0] - 65;
    }
    if (bannedTokenIds.length === 0) {
      // 禁止生成的特殊token集合
      const specials: string[] = [
        specialTokens.begin_of_turn,
        specialTokens.end_of_turn,
        specialTokens.user,
        specialTokens.assistant,
        // specialTokens.stop_generation, // 允许模型自己停止
        specialTokens.pad,
      ];
      // include 0.05 as well
      specials.push(specialTokens.reward("0.05"));
      specials.push(specialTokens.penalty("0.05"));
      for (const v of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
        specials.push(specialTokens.reward(v.toFixed(1)));
        specials.push(specialTokens.penalty(v.toFixed(1)));
      }
      bannedTokenIds = specials
        .map((s) => tokenizer!.encode(s)[0])
        .filter((id) => typeof id === "number");
    }
  };

  const serializeWeights = async (): Promise<
    { data: Float32Array; shape: number[]; dtype: "float32" }[]
  > => {
    const vars = model!.getWeights();
    const out: { data: Float32Array; shape: number[]; dtype: "float32" }[] = [];
    for (const v of vars) {
      const data = (await v.data()) as Float32Array | Uint8Array;
      const f32 =
        data instanceof Float32Array ? data : new Float32Array(data.buffer);
      const copy = new Float32Array(f32.length);
      copy.set(f32);
      out.push({ data: copy, shape: v.shape.slice(), dtype: "float32" });
    }
    return out;
  };

  const ensureWorker = () => {
    if (!worker) {
      worker = new Worker(
        new URL("../../../model/ai/selai/selai.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.onmessage = async (ev: MessageEvent<any>) => {
        const data = ev.data;
        if (!data) return;
        if (data.type === "progress") {
          setSleepProgress({
            phase: data.phase,
            step: data.step,
            total: data.total,
          });
          if (data.trainBackend) setTrainBackend(String(data.trainBackend));
          if (typeof data.loss === "number") setTrainLoss(data.loss);
          return;
        }
        if (data.type === "done") {
          const { trajectories, avgReturn, posCount, negCount } = data.stats;
          setConversation((c) => [
            ...c,
            {
              sender: "assistant",
              text: `学习完成：轨迹=${trajectories}，均值=${avgReturn.toFixed(
                2
              )}，好=${posCount}，坏=${negCount}`,
            },
          ]);
          setGrowthLog([]);
          setStatus("Awake");
          setSleepProgress(null);
          setTrainLoss(null);
        } else if (data.type === "sleep_done") {
          const { trajectories, avgReturn, posCount, negCount } = data.stats;
          if (data.trainBackend) setTrainBackend(String(data.trainBackend));
          const localVars = model!.getWeights();
          if (localVars.length !== data.weights.length) {
            setConversation((c) => [
              ...c,
              {
                sender: "assistant",
                text: `学习失败：权重数量不匹配 (${data.weights.length} vs ${localVars.length})`,
              },
            ]);
            setStatus("Awake");
            setSleepProgress(null);
            setTrainLoss(null);
            return;
          }
          const tensors = data.weights.map((w: any, i: number) => {
            const expectedShape = localVars[i].shape;
            const sameShape =
              expectedShape.length === w.shape.length &&
              expectedShape.every(
                (v: number, idx: number) => v === w.shape[idx]
              );
            if (!sameShape)
              throw new Error(
                `权重形状不匹配 at ${i}: ${JSON.stringify(
                  w.shape
                )} vs ${JSON.stringify(expectedShape)}`
              );
            const f32 = w.data as Float32Array;
            return tf.tensor(f32, w.shape as number[], w.dtype);
          });
          model!.setWeights(tensors);
          tensors.forEach((t: tf.Tensor) => t.dispose());

          // 将新权重保存到 IndexedDB
          try {
            await saveWeightsToDB("selai-weights", data.weights);
            console.log("模型权重已更新并缓存。");
          } catch (e) {
            console.error("缓存权重失败:", e);
          }

          if (isInitialTraining()) {
            setIsInitialTraining(false);
          } else {
            setConversation((c) => [
              ...c,
              {
                sender: "assistant",
                text: `睡眠学习完成（镜像+PPO）：轨迹=${trajectories}，均值=${avgReturn.toFixed(
                  2
                )}，好=${posCount}，坏=${negCount}`,
              },
            ]);
          }
          setGrowthLog([]);
          setStatus("Awake");
          setSleepProgress(null);
          setTrainLoss(null);
        } else if (data.type === "error") {
          setConversation((c) => [
            ...c,
            { sender: "assistant", text: `学习失败：${data.error}` },
          ]);
          setStatus("Awake");
          setSleepProgress(null);
          setTrainLoss(null);
        }
      };
    }
  };

  // UTF-8 约束采样辅助
  type Utf8State = { need: number; firstRange: [number, number] | null };
  const utf8AllowedForNext = (state: Utf8State): boolean[] => {
    const allowed = new Array(256).fill(false);
    if (state.need > 0) {
      if (state.firstRange) {
        const [lo, hi] = state.firstRange;
        for (let b = lo; b <= hi; b++) allowed[b] = true;
      } else {
        for (let b = 0x80; b <= 0xbf; b++) allowed[b] = true;
      }
      return allowed;
    }
    // leading bytes
    for (let b = 0x00; b <= 0x7f; b++) allowed[b] = true;
    for (let b = 0xc2; b <= 0xdf; b++) allowed[b] = true;
    for (let b = 0xe0; b <= 0xef; b++) allowed[b] = true;
    for (let b = 0xf0; b <= 0xf4; b++) allowed[b] = true;
    return allowed;
  };
  const utf8AdvanceState = (state: Utf8State, byte: number): Utf8State => {
    if (state.need > 0) {
      // consuming continuation
      if (state.firstRange) {
        return { need: state.need - 1, firstRange: null };
      }
      return { need: state.need - 1, firstRange: null };
    }
    // leading byte
    if (byte <= 0x7f) return { need: 0, firstRange: null };
    if (byte >= 0xc2 && byte <= 0xdf) return { need: 1, firstRange: null };
    if (byte === 0xe0) return { need: 2, firstRange: [0xa0, 0xbf] };
    if ((byte >= 0xe1 && byte <= 0xec) || (byte >= 0xee && byte <= 0xef))
      return { need: 2, firstRange: [0x80, 0xbf] };
    if (byte === 0xed) return { need: 2, firstRange: [0x80, 0x9f] };
    if (byte === 0xf0) return { need: 3, firstRange: [0x90, 0xbf] };
    if (byte >= 0xf1 && byte <= 0xf3)
      return { need: 3, firstRange: [0x80, 0xbf] };
    if (byte === 0xf4) return { need: 3, firstRange: [0x80, 0x8f] };
    // invalid leading -> fallback to ASCII space
    return { need: 0, firstRange: null };
  };

  const sampleTopP = (probs: Float32Array, p: number): number => {
    const idx = probs.map((v, i) => i);
    idx.sort((a, b) => probs[b] - probs[a]);
    let cum = 0;
    const picked: number[] = [];
    for (const i of idx) {
      picked.push(i);
      cum += probs[i];
      if (cum >= p) break;
    }
    let sum = 0;
    for (const i of picked) sum += probs[i];
    let r = Math.random() * (sum || 1);
    for (const i of picked) {
      r -= probs[i];
      if (r <= 0) return i;
    }
    return picked[picked.length - 1] ?? 0;
  };

  const computeUtf8Metrics = (bytes: number[]): GenMetrics => {
    let valid = 0,
      total = bytes.length,
      ascii = 0;
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      if (b <= 0x7f) {
        valid++;
        ascii++;
        i++;
        continue;
      }
      if (b >= 0xc2 && b <= 0xdf) {
        if (
          i + 1 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf
        ) {
          valid += 2;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (b === 0xe0) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0xa0 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        i++;
        continue;
      }
      if ((b >= 0xe1 && b <= 0xec) || (b >= 0xee && b <= 0xef)) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        i++;
        continue;
      }
      if (b === 0xed) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0x9f &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        i++;
        continue;
      }
      if (b === 0xf0) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x90 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        i++;
        continue;
      }
      if (b >= 0xf1 && b <= 0xf3) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        i++;
        continue;
      }
      if (b === 0xf4) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0x8f &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        i++;
        continue;
      }
      i++;
    }
    return {
      validPct: total ? valid / total : 0,
      asciiPct: total ? ascii / total : 0,
    };
  };

  // 计算UTF-8前缀中“完整可解码”的有效字节长度
  const utf8ValidLength = (bytes: number[]): number => {
    let valid = 0;
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      if (b <= 0x7f) {
        valid++;
        i++;
        continue;
      }
      if (b >= 0xc2 && b <= 0xdf) {
        if (
          i + 1 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf
        ) {
          valid += 2;
          i += 2;
          continue;
        }
        break;
      }
      if (b === 0xe0) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0xa0 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        break;
      }
      if ((b >= 0xe1 && b <= 0xec) || (b >= 0xee && b <= 0xef)) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        break;
      }
      if (b === 0xed) {
        if (
          i + 2 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0x9f &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          valid += 3;
          i += 3;
          continue;
        }
        break;
      }
      if (b === 0xf0) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x90 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        break;
      }
      if (b >= 0xf1 && b <= 0xf3) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        break;
      }
      if (b === 0xf4) {
        if (
          i + 3 < bytes.length &&
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0x8f &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          valid += 4;
          i += 4;
          continue;
        }
        break;
      }
      break;
    }
    return valid;
  };

  const handleSend = async () => {
    if (!userInput().trim() || status() !== "Awake") return;

    ensureInit();

    const userBytes = encoder.encode(userInput());
    const userMessage: Message = {
      sender: "user",
      text: userInput(),
      hex: bytesToHex(userBytes),
    };
    setConversation([...conversation(), userMessage]);

    const userTurn = `${specialTokens.begin_of_turn}${
      specialTokens.user
    }${userInput()}${specialTokens.end_of_turn}`;
    const userTurnTokens = tokenizer!.encode(userTurn);
    setGrowthLog([...growthLog(), ...userTurnTokens]);

    setUserInput("");

    setStatus("Thinking");
    setStopRequested(false);
    setGenSpeed(0);
    const startTime = performance.now();

    const assistantTurnPrefix = `${specialTokens.begin_of_turn}${specialTokens.assistant}`;
    const prefixTokens = tokenizer!.encode(assistantTurnPrefix);

    let generatedTokens = [...prefixTokens];
    let currentText = "";

    const temperature = 0.6;
    const topP = 0.9;
    let utf8: Utf8State = { need: 0, firstRange: null };
    const stopTokId = tokenizer!.encode(specialTokens.stop_generation)[0];

    for (let i = 0; i < MAX_GEN_LEN; i++) {
      if (stopRequested()) break;

      const context = growthLog();
      const seq = [...context, ...generatedTokens];
      const inputIds = seq.slice(-defaultConfig.maxSeqLen);

      const nextToken = tf.tidy(() => {
        const inputTensor = tf.tensor2d(
          [inputIds],
          [1, inputIds.length],
          "int32"
        );
        const logits = model!.apply(inputTensor) as tf.Tensor3D; // [1, T, V]
        const lastLogits = logits
          .slice([0, logits.shape[1] - 1, 0], [1, 1, logits.shape[2]])
          .reshape([logits.shape[2]]) as tf.Tensor1D;

        // 基础屏蔽：特殊token
        let masked = lastLogits as tf.Tensor1D;
        if (bannedTokenIds.length > 0) {
          const idx = tf.tensor2d(
            bannedTokenIds.map((i) => [i]),
            [bannedTokenIds.length, 1],
            "int32"
          );
          const upd = tf.fill([bannedTokenIds.length], -1e9);
          const mask = tf.scatterND(idx, upd, [masked.shape[0]]);
          masked = masked.add(mask) as tf.Tensor1D;
        }

        // UTF-8 约束屏蔽
        if (byteOffset != null) {
          const allow = utf8AllowedForNext(utf8);
          const disallowed: number[] = [];
          for (let b = 0; b < 256; b++) {
            const id = byteOffset + b;
            if (!allow[b]) disallowed.push(id);
          }
          if (disallowed.length > 0) {
            const idx2 = tf.tensor2d(
              disallowed.map((i) => [i]),
              [disallowed.length, 1],
              "int32"
            );
            const upd2 = tf.fill([disallowed.length], -1e9);
            const mask2 = tf.scatterND(idx2, upd2, [masked.shape[0]]);
            masked = masked.add(mask2) as tf.Tensor1D;
          }
        }

        // 温度与 softmax
        const probs = tf.softmax(masked.div(temperature)) as tf.Tensor1D;
        const probsArr = probs.dataSync() as Float32Array;
        const chosen = sampleTopP(probsArr, topP);

        logits.dispose();
        lastLogits.dispose();
        inputTensor.dispose();
        probs.dispose();
        if (masked !== lastLogits) (masked as tf.Tensor).dispose?.();
        return chosen as number;
      });

      if (nextToken === stopTokId) {
        break; // 模型决定停止
      }

      // 安全检查：若仍是特殊token则跳过
      if (bannedTokenIds.includes(nextToken)) {
        if ((i + 1) % 3 === 0) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
        }
        continue;
      }

      // UTF-8 状态推进（只跟踪字节id）
      if (
        byteOffset != null &&
        nextToken >= byteOffset &&
        nextToken < byteOffset + 256
      ) {
        const b = nextToken - byteOffset;
        utf8 = utf8AdvanceState(utf8, b);
      }

      generatedTokens.push(nextToken);

      const tokensSoFar = i + 1;
      const elapsedSeconds = (performance.now() - startTime) / 1000;
      if (elapsedSeconds > 0) setGenSpeed(tokensSoFar / elapsedSeconds);

      currentText = tokenizer!.decode(
        generatedTokens.slice(prefixTokens.length)
      );
      setConversation((conv) => {
        const last = conv.at(-1);
        if (last?.sender === "assistant") {
          return [...conv.slice(0, -1), { ...last, text: currentText }];
        }
        return [...conv, { sender: "assistant", text: currentText }];
      });

      if ((i + 1) % 3 === 0) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
      }
    }

    // 如果模型自己没有生成stop，在日志中补上
    if (generatedTokens.at(-1) !== stopTokId) {
      generatedTokens.push(stopTokId);
    }

    const finalIds = generatedTokens.slice(
      prefixTokens.length,
      generatedTokens.at(-1) === stopTokId ? -1 : undefined
    );
    let aiBytesHex = "";
    const bytes: number[] = [];
    if (byteOffset != null) {
      for (const id of finalIds) {
        const b = id - byteOffset;
        if (b >= 0 && b <= 255) bytes.push(b);
      }
      aiBytesHex = bytesToHex(bytes);
    }

    const metrics = computeUtf8Metrics(bytes);
    setLastGenMetrics(metrics);

    // 若结尾包含不完整的UTF-8序列，裁剪掉尾部无效字节
    let trimmedIds = finalIds;
    if (byteOffset != null && bytes.length > 0) {
      const validLen = utf8ValidLength(bytes);
      if (validLen < bytes.length) {
        let toDrop = bytes.length - validLen;
        const arr = [...finalIds];
        for (let p = arr.length - 1; p >= 0 && toDrop > 0; p--) {
          const id = arr[p];
          if (id >= byteOffset && id < byteOffset + 256) {
            arr.splice(p, 1);
            toDrop--;
          }
        }
        trimmedIds = arr;
      }
    }

    const finalAiText = tokenizer!.decode(trimmedIds);

    // 在同一assistant回合内部注入奖励/惩罚，再闭合 end_of_turn
    const rewardTokens: number[] = [];
    /*
    if (metrics.validPct >= 0.9) {
      rewardTokens.push(...tokenizer!.encode(specialTokens.reward("0.05")));
      setConversation((c) => [
        ...c,
        {
          sender: "user",
          text: `(系统评价: 可解码 ${(metrics.validPct * 100).toFixed(
            0
          )}% → +0.05)`,
        },
      ]);
    } else if (metrics.validPct < 0.5) {
      rewardTokens.push(...tokenizer!.encode(specialTokens.penalty("0.8")));
      setConversation((c) => [
        ...c,
        {
          sender: "user",
          text: `(系统评价: 可解码 ${(metrics.validPct * 100).toFixed(
            0
          )}% → -0.8)`,
        },
      ]);
    }
    */

    // 更新对话记录和成长日志（奖励在 end_of_turn 之前）
    const assistantTurnCoreTokens = [...prefixTokens, ...trimmedIds, stopTokId];
    const endTokens = tokenizer!.encode(specialTokens.end_of_turn);
    setGrowthLog([
      ...growthLog(),
      ...assistantTurnCoreTokens,
      ...rewardTokens,
      ...endTokens,
    ]);

    // 更新最后一个助手消息，填充最终文本与HEX，避免重复气泡
    setConversation((conv) => {
      const idx = (() => {
        for (let i = conv.length - 1; i >= 0; i--)
          if (conv[i].sender === "assistant") return i;
        return -1;
      })();
      if (idx >= 0) {
        const updated = conv.slice();
        updated[idx] = { ...updated[idx], text: finalAiText, hex: aiBytesHex };
        return updated;
      }
      return [
        ...conv,
        { sender: "assistant", text: finalAiText, hex: aiBytesHex },
      ];
    });

    setStatus("Awake");
  };

  const handleReward = (value: number) => {
    // 奖励机制已暂时禁用
  };

  const handleSleep = async (initialLogs?: number[][]) => {
    if (status() !== "Awake") return;
    ensureInit();
    ensureWorker();
    setStatus("Learning");
    setSleepProgress({ phase: "mirror", step: 0, total: 1 });
    setTrainLoss(null);

    if (initialLogs) {
      // 初始学习
      const payload = await serializeWeights();
      const cfg = { ...defaultConfig, vocabSize: tokenizer!.vocabSize };
      worker!.postMessage({
        type: "sleepTrain",
        growthLogs: initialLogs,
        config: cfg,
        weights: payload,
        steps: 512,
        ppoSteps: 0,
      });
    } else {
      // 用户触发的交互式学习
      const log = growthLog();
      if (!log.length) {
        setConversation((c) => [
          ...c,
          { sender: "assistant", text: "成长日志为空，暂不学习。" },
        ]);
        setStatus("Awake");
        setSleepProgress(null);
        return;
      }
      const payload = await serializeWeights();
      const cfg = { ...defaultConfig, vocabSize: tokenizer!.vocabSize };
      worker!.postMessage({
        type: "sleepTrain",
        growthLog: log,
        config: cfg,
        weights: payload,
        steps: 512,
        ppoSteps: 0,
      });
    }
  };

  onMount(async () => {
    // 确保 tokenizer 和模型初始化，并尝试加载缓存权重
    await ensureInit();

    // 检查是否已有缓存权重，若无则自动进行后台学习
    try {
      const savedWeights = await loadWeightsFromDB("selai-weights");
      if (!savedWeights) {
        console.log("未找到缓存权重，开始首次后台学习。");
        setIsInitialTraining(true);

        // 从预设对话生成训练数据
        if (!tokenizer) tokenizer = new SelaiTokenizer();
        const initialLogs: number[][] = [];
        const shuffledConversations = [...presetConversations].sort(
          () => Math.random() - 0.5
        );
        for (const conversation of shuffledConversations) {
          const conversationTokens: number[] = [];
          for (const msg of conversation) {
            const prefix =
              msg.sender === "user"
                ? `${specialTokens.begin_of_turn}${specialTokens.user}`
                : `${specialTokens.begin_of_turn}${specialTokens.assistant}`;
            const suffix = specialTokens.end_of_turn;
            const text = msg.text;
            const tokens = tokenizer.encode(`${prefix}${text}${suffix}`);
            conversationTokens.push(...tokens);
          }
          initialLogs.push(conversationTokens);
        }

        handleSleep(initialLogs);
      } else {
        console.log("已加载缓存权重，跳过首次学习。");
      }
    } catch (e) {
      console.error("检查缓存权重时出错:", e);
      // 出错时也启动一次学习
      // handleSleep();
    }
  });

  return (
    <div class="p-4 font-sans bg-gray-50 min-h-screen text-gray-800 flex flex-col">
      <div class="text-center mb-6">
        <h1 class="text-4xl font-bold text-gray-900">SELAI</h1>
      </div>

      <div class="w-3xl mx-auto bg-white p-4 rounded-lg shadow-lg flex-grow flex flex-col mb-8">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-semibold">智能体状态:</span>
            <span
              class={`px-3 py-1 rounded-full text-sm font-medium ${
                status() === "Awake"
                  ? "bg-green-100 text-green-800"
                  : status() === "Thinking"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-yellow-100 text-yellow-800 animate-pulse"
              }`}
            >
              {status() === "Awake"
                ? "清醒"
                : status() === "Thinking"
                ? "思考中..."
                : "学习中..."}
            </span>
            {status() === "Thinking" && genSpeed() != null && (
              <div class="text-sm text-gray-800 font-mono">
                {genSpeed()!.toFixed(1)} tok/s
              </div>
            )}
          </div>
          <div class="text-xs text-gray-600 text-right">
            {lastGenMetrics() && (
              <div>
                有效UTF-8: {(lastGenMetrics()!.validPct * 100).toFixed(0)}% ·
                ASCII: {(lastGenMetrics()!.asciiPct * 100).toFixed(0)}%
              </div>
            )}
            {modelInfo() && (
              <div>
                参数: {modelInfo()!.paramsHuman} · 词表:{" "}
                {modelInfo()!.vocabSize} · d:{modelInfo()!.embedDim} h:
                {modelInfo()!.numHeads} L:{modelInfo()!.numLayers} ff:
                {modelInfo()!.ffHiddenDim} · ctx:{modelInfo()!.maxSeqLen} ·
                推理后端:{modelInfo()!.backend}
                {trainBackend() ? ` · 训练后端:${trainBackend()}` : ""}
              </div>
            )}
            <label class="inline-flex items-center gap-1 mt-1">
              <input
                type="checkbox"
                checked={showHex()}
                onChange={(e) => setShowHex(e.currentTarget.checked)}
              />
              <span>显示原始 token (HEX)</span>
            </label>
          </div>
        </div>

        {status() === "Learning" && sleepProgress() && (
          <div class="mb-4">
            <div class="flex justify-between text-sm text-gray-600 mb-1">
              <span>
                {sleepProgress()!.phase === "mirror" ? "镜像训练" : "PPO 强化"}
              </span>
              <span>
                {sleepProgress()!.step}/{sleepProgress()!.total}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded h-2 overflow-hidden">
              <div
                class="bg-blue-500 h-2"
                style={{
                  width: `${Math.round(
                    (sleepProgress()!.step /
                      Math.max(1, sleepProgress()!.total)) *
                      100
                  )}%`,
                }}
              />
            </div>
            <div class="mt-1 text-xs text-gray-700">
              loss: {trainLoss() != null ? trainLoss()!.toFixed(4) : "..."}
            </div>
          </div>
        )}

        <div class="h-96 overflow-y-auto border rounded-md p-3 mb-4 bg-gray-50 flex flex-col flex-grow gap-3">
          <For each={conversation()}>
            {(message) => (
              <div
                class={`flex items-end ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  class={`p-3 rounded-lg max-w-[80%] break-words ${
                    message.sender === "user"
                      ? "bg-blue-500 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                  style={
                    message.text.startsWith("(")
                      ? { "font-style": "italic", opacity: "0.7" }
                      : {}
                  }
                >
                  {message.text}
                  {showHex() && message.hex && (
                    <div class="mt-1 text-xs text-gray-600 font-mono break-all">
                      {message.hex}
                    </div>
                  )}
                  {/* {message.sender === "assistant" && (
                    <div class="mt-2 flex gap-2">
                      <button
                        onClick={() => handleReward(1.0)}
                        class="text-xs bg-green-500 text-white px-2 py-0.5 rounded hover:bg-green-600 disabled:bg-gray-400"
                        disabled={status() !== "Awake"}
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleReward(-0.8)}
                        class="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 disabled:bg-gray-400"
                        disabled={status() !== "Awake"}
                      >
                        👎
                      </button>
                    </div>
                  )} */}
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="flex items-center">
          <input
            type="text"
            class="flex-grow border-gray-300 border rounded-l-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            placeholder="和智能体对话..."
            value={userInput()}
            onInput={(e) => setUserInput(e.currentTarget.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            disabled={status() !== "Awake"}
          />
          <button
            onClick={handleSend}
            class="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            disabled={status() !== "Awake"}
          >
            发送
          </button>
          <button
            onClick={() => setStopRequested(true)}
            class="ml-2 bg-red-500 text-white px-3 py-2 rounded-md hover:bg-red-600 disabled:bg-gray-300 disabled:text-gray-600 transition"
            disabled={status() !== "Thinking"}
          >
            闭嘴
          </button>
          <button
            onClick={() => handleSleep()}
            class="ml-2 bg-yellow-500 text-white px-3 py-2 rounded-md hover:bg-yellow-600 disabled:bg-gray-300 disabled:text-gray-600 transition"
            disabled={status() !== "Awake"}
          >
            睡觉
          </button>
        </div>

        {/* <div class="mt-4 text-center">
          <p class="text-sm text-gray-500 mb-2">评价智能体的上一次回应</p>
          <div class="flex justify-center gap-2">
            <button
              onClick={() => handleReward(1.0)}
              class="bg-green-500 text-white px-4 py-1 rounded-full hover:bg-green-600 transition disabled:bg-gray-400"
              disabled={status() !== "Awake"}
            >
              👍 鼓励 (+1.0)
            </button>
            <button
              onClick={() => handleReward(0.2)}
              class="bg-gray-400 text-white px-4 py-1 rounded-full hover:bg-gray-500 transition disabled:bg-gray-400"
              disabled={status() !== "Awake"}
            >
              🤔 一般 (+0.2)
            </button>
            <button
              onClick={() => handleReward(-0.8)}
              class="bg-red-500 text-white px-4 py-1 rounded-full hover:bg-red-600 transition disabled:bg-gray-400"
              disabled={status() !== "Awake"}
            >
              👎 惩罚 (-0.8)
            </button>
          </div>
        </div> */}
      </div>
    </div>
  );
}
