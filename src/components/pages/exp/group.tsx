import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";

type InteractionCategory = "sameElement" | "inversePair" | "cayleyNeighbor";

interface AttractionControl {
  enabled: boolean;
  strength: number;
  exponent: number;
}

interface RepulsionControl {
  enabled: boolean;
  strength: number;
  exponent: number;
}

interface InteractionControl {
  label: string;
  attraction: AttractionControl;
  repulsion: RepulsionControl;
}

interface SimulationConfig {
  unitsPerElement: number;
  timeScale: number;
  globalForceMultiplier: number;
  collisionDistance: number;
  collisionMode: CollisionMode;
  collisionTemperature: number;
  interactions: Record<InteractionCategory, InteractionControl>;
}

type CollisionMode =
  | "product"
  | "conjugation"
  | "commutator"
  | "stochastic"
  | "conservative";

interface Vector2 {
  x: number;
  y: number;
}

interface Unit {
  id: number;
  element: string;
  position: Vector2;
  velocity: Vector2;
}

interface GroupPreset {
  id: string;
  name: string;
  description: string;
  elements: string[];
  identity: string;
  generators: string[];
  operationTable: Record<string, Record<string, string>>;
  displayNames?: Record<string, string>;
}

interface GroupRuntimeData {
  inverseMap: Record<string, string>;
  neighborMap: Record<string, Set<string>>;
  colorMap: Record<string, string>;
}

type QuaternionCoreEntry = {
  value: string;
  sign: number;
};

const GROUP_SIM_CONSTANTS = {
  canvas: {
    width: 960,
    height: 640,
    backgroundColor: "#04080f",
    gridColor: "rgba(255,255,255,0.07)",
    gridSpacing: 64,
  },
  physics: {
    fixedTimeStep: 1 / 120,
    maximumDeltaTime: 0.05,
    dampingFactor: 1,
    wallRestitution: 0.82,
    unitRadius: 14,
    collisionDistance: 28,
    minimumDistance: 0.5,
    spawnPadding: 96,
    initialSpeedLimit: 1,
    mass: 1,
  },
  rendering: {
    outlineWidth: 2,
    fontFamily: "system-ui, 'Segoe UI', sans-serif",
    fontSize: 14,
    textColor: "#f7f9fe",
    labelYOffset: 0,
    ghostAlpha: 0.9,
    panelBackground: "#111826",
    panelTextColor: "#d6dcf1",
    accentColor: "#4f8cff",
    tableBorderColor: "rgba(255,255,255,0.18)",
  },
  layout: {
    controlPanelWidth: "360px",
    gap: "24px",
    sectionGap: "18px",
    inputGap: "12px",
    tableCellPadding: "8px",
    buttonGap: "12px",
  },
  defaults: {
    unitsPerElement: 5,
    timeScale: 1,
    globalForceMultiplier: 1,
    collisionDistanceOverride: 28,
    interactionLabels: {
      sameElement: "同元素",
      inversePair: "逆元对",
      cayleyNeighbor: "凯莱邻居",
    } satisfies Record<InteractionCategory, string>,
    forceProfiles: {
      sameElement: {
        attraction: {
          enabled: false,
          strength: 220,
          exponent: 1.2,
        },
        repulsion: {
          enabled: true,
          strength: 740,
          exponent: 2,
        },
      },
      inversePair: {
        attraction: {
          enabled: false,
          strength: 500,
          exponent: 2,
        },
        repulsion: {
          enabled: true,
          strength: 800,
          exponent: 1,
        },
      },
      cayleyNeighbor: {
        attraction: {
          enabled: true,
          strength: 520,
          exponent: 4,
        },
        repulsion: {
          enabled: true,
          strength: 800,
          exponent: 1,
        },
      },
    } satisfies Record<
      InteractionCategory,
      {
        attraction: AttractionControl;
        repulsion: RepulsionControl;
      }
    >,
  },
  ranges: {
    unitsPerElement: { min: 1, max: 12, step: 1 },
    strength: { min: 0, max: 1500, step: 10 },
    exponent: { min: 0.5, max: 3.5, step: 0.05 },
    timeScale: { min: 0.25, max: 2.5, step: 0.05 },
    globalForceMultiplier: { min: 0, max: 3, step: 0.05 },
    collisionDistance: { min: 18, max: 80, step: 2 },
    collisionTemperature: { min: 0, max: 1, step: 0.01 },
  },
  colors: {
    hueMaxValue: 360,
    saturation: 68,
    lightness: 58,
    neutral: "#ccd2e3",
  },
  math: {
    two: 2,
    half: 0.5,
  },
} as const;

const INTERACTION_ORDER: InteractionCategory[] = [
  "sameElement",
  "inversePair",
  "cayleyNeighbor",
];

function createInitialInteractions(): Record<
  InteractionCategory,
  InteractionControl
> {
  return INTERACTION_ORDER.reduce<Record<InteractionCategory, InteractionControl>>(
    (acc, category) => {
      const profiles = GROUP_SIM_CONSTANTS.defaults.forceProfiles[category];
      const label = GROUP_SIM_CONSTANTS.defaults.interactionLabels[category];
      acc[category] = {
        label,
        attraction: { ...profiles.attraction },
        repulsion: { ...profiles.repulsion },
      };
      return acc;
    },
    {} as Record<InteractionCategory, InteractionControl>
  );
}

function createCyclicGroupPreset(
  modulus: number,
  id: string,
  name: string,
  generatorSymbol: string,
  description: string
): GroupPreset {
  const elements = Array.from({ length: modulus }, (_, index) => {
    if (index === 0) return "e";
    if (index === 1) return generatorSymbol;
    return `${generatorSymbol}^${index}`;
  });
  const operationTable: Record<string, Record<string, string>> = {};
  elements.forEach((a, ai) => {
    operationTable[a] = {};
    elements.forEach((b, bi) => {
      const result = elements[(ai + bi) % modulus];
      operationTable[a][b] = result;
    });
  });
  const displayNames: Record<string, string> = {};
  elements.forEach((elem) => {
    displayNames[elem] = elem;
  });
  return {
    id,
    name,
    description,
    elements,
    identity: "e",
    generators: [generatorSymbol],
    operationTable,
    displayNames,
  };
}

function createKleinFourPreset(): GroupPreset {
  const elements = ["e", "a", "b", "c"];
  const operationTable: Record<string, Record<string, string>> = {
    e: { e: "e", a: "a", b: "b", c: "c" },
    a: { e: "a", a: "e", b: "c", c: "b" },
    b: { e: "b", a: "c", b: "e", c: "a" },
    c: { e: "c", a: "b", b: "a", c: "e" },
  };
  const displayNames = {
    e: "e",
    a: "a",
    b: "b",
    c: "ab",
  };
  return {
    id: "klein-four",
    name: "克莱因四元群 V₄",
    description: "包含四个元素的阿贝尔群：e、a、b、ab，任一非单位元素的平方都是单位元。",
    elements,
    identity: "e",
    generators: ["a", "b"],
    operationTable,
    displayNames,
  };
}

function createS3Preset(): GroupPreset {
  const elements = ["e", "r", "r2", "s", "sr", "sr2"] as const;
  type S3Element = (typeof elements)[number];
  const rotationMap: Record<S3Element, number> = {
    e: 0,
    r: 1,
    r2: 2,
    s: 0,
    sr: 1,
    sr2: 2,
  };
  const isReflection = (element: S3Element) =>
    element === "s" || element === "sr" || element === "sr2";
  const toElement = (reflection: boolean, rotation: number): S3Element => {
    const normalized = ((rotation % elements.length) + elements.length) % 3;
    if (!reflection) {
      if (normalized === 0) return "e";
      if (normalized === 1) return "r";
      return "r2";
    }
    if (normalized === 0) return "s";
    if (normalized === 1) return "sr";
    return "sr2";
  };
  const multiply = (a: S3Element, b: S3Element): S3Element => {
    const aRef = isReflection(a);
    const bRef = isReflection(b);
    const aRot = rotationMap[a];
    const bRot = rotationMap[b];
    if (!aRef && !bRef) {
      return toElement(false, (aRot + bRot) % 3);
    }
    if (!aRef && bRef) {
      return toElement(true, (aRot + bRot) % 3);
    }
    if (aRef && !bRef) {
      return toElement(true, (aRot - bRot + 3) % 3);
    }
    return toElement(false, (bRot - aRot + 3) % 3);
  };
  const operationTable: Record<string, Record<string, string>> = {};
  elements.forEach((left) => {
    operationTable[left] = {} as Record<string, string>;
    elements.forEach((right) => {
      operationTable[left][right] = multiply(left, right);
    });
  });
  const displayNames: Record<string, string> = {
    e: "e",
    r: "r",
    r2: "r²",
    s: "s",
    sr: "sr",
    sr2: "sr²",
  };
  return {
    id: "s3",
    name: "对称群 S₃",
    description:
      "三角形的对称群，包含三个旋转与三个翻折：r 表示 120° 旋转，s 表示沿边翻折。",
    elements: [...elements],
    identity: "e",
    generators: ["r", "s"],
    operationTable,
    displayNames,
  };
}

function createQuaternionPreset(): GroupPreset {
  const elements = ["1", "-1", "i", "-i", "j", "-j", "k", "-k"];
  const core: Record<string, Record<string, QuaternionCoreEntry>> = {
    "1": {
      "1": { value: "1", sign: 1 },
      i: { value: "i", sign: 1 },
      j: { value: "j", sign: 1 },
      k: { value: "k", sign: 1 },
    },
    i: {
      "1": { value: "i", sign: 1 },
      i: { value: "1", sign: -1 },
      j: { value: "k", sign: 1 },
      k: { value: "j", sign: -1 },
    },
    j: {
      "1": { value: "j", sign: 1 },
      i: { value: "k", sign: -1 },
      j: { value: "1", sign: -1 },
      k: { value: "i", sign: 1 },
    },
    k: {
      "1": { value: "k", sign: 1 },
      i: { value: "j", sign: 1 },
      j: { value: "i", sign: -1 },
      k: { value: "1", sign: -1 },
    },
  };
  const multiply = (a: string, b: string): string => {
    const signA = a.startsWith("-") ? -1 : 1;
    const signB = b.startsWith("-") ? -1 : 1;
    const baseA = signA === -1 ? a.slice(1) : a;
    const baseB = signB === -1 ? b.slice(1) : b;
    const coreEntry = core[baseA][baseB];
    const totalSign = signA * signB * coreEntry.sign;
    const baseValue = coreEntry.value;
    if (baseValue === "1") {
      return totalSign === -1 ? "-1" : "1";
    }
    return totalSign === -1 ? `-${baseValue}` : baseValue;
  };
  const operationTable: Record<string, Record<string, string>> = {};
  elements.forEach((left) => {
    operationTable[left] = {} as Record<string, string>;
    elements.forEach((right) => {
      operationTable[left][right] = multiply(left, right);
    });
  });
  const displayNames: Record<string, string> = {
    "1": "1",
    "-1": "-1",
    i: "i",
    "-i": "-i",
    j: "j",
    "-j": "-j",
    k: "k",
    "-k": "-k",
  };
  return {
    id: "quaternion",
    name: "四元数群 Q₈",
    description:
      "单位四元数组成的非交换群：i² = j² = k² = ijk = -1。展示非交换乘法的碰撞结果。",
    elements,
    identity: "1",
    generators: ["i", "j"],
    operationTable,
    displayNames,
  };
}

const GROUP_PRESETS: GroupPreset[] = [
  createCyclicGroupPreset(
    2,
    "z2",
    "循环群 ℤ₂",
    "a",
    "最简单的非平凡群，单位元 e 与元素 a，满足 a² = e。"
  ),
  createCyclicGroupPreset(
    3,
    "z3",
    "循环群 ℤ₃",
    "a",
    "三个元素构成的循环群，a 的三次方回到单位元 e。"
  ),
  createCyclicGroupPreset(
    4,
    "z4",
    "循环群 ℤ₄",
    "a",
    "四阶循环群，可类比四分之一转的叠加。"
  ),
  createKleinFourPreset(),
  createS3Preset(),
  createQuaternionPreset(),
];

function multiplyElement(preset: GroupPreset, a: string, b: string): string {
  const table = preset.operationTable[a];
  if (!table) return preset.identity;
  return table[b] ?? preset.identity;
}

function computeInverseMap(preset: GroupPreset): Record<string, string> {
  const inverse: Record<string, string> = {};
  preset.elements.forEach((element) => {
    const tableRow = preset.operationTable[element];
    const found = preset.elements.find(
      (candidate) => tableRow?.[candidate] === preset.identity
    );
    inverse[element] = found ?? preset.identity;
  });
  return inverse;
}

function computeNeighborMap(
  preset: GroupPreset,
  inverseMap: Record<string, string>
): Record<string, Set<string>> {
  const neighbors: Record<string, Set<string>> = {};
  preset.elements.forEach((element) => {
    neighbors[element] = new Set<string>();
  });
  preset.elements.forEach((element) => {
    preset.generators.forEach((generator) => {
      const forward = multiplyElement(preset, element, generator);
      const backward = multiplyElement(
        preset,
        element,
        inverseMap[generator] ?? preset.identity
      );
      neighbors[element].add(forward);
      neighbors[element].add(backward);
      const leftForward = multiplyElement(preset, generator, element);
      const leftBackward = multiplyElement(
        preset,
        inverseMap[generator] ?? preset.identity,
        element
      );
      neighbors[element].add(leftForward);
      neighbors[element].add(leftBackward);
    });
  });
  return neighbors;
}

function computeColorMap(preset: GroupPreset): Record<string, string> {
  const map: Record<string, string> = {};
  const hueRange = GROUP_SIM_CONSTANTS.colors.hueMaxValue;
  const saturation = GROUP_SIM_CONSTANTS.colors.saturation;
  const lightness = GROUP_SIM_CONSTANTS.colors.lightness;
  const count = preset.elements.length || 1;
  const step = hueRange / count;
  preset.elements.forEach((element, index) => {
    const hue = index * step;
    map[element] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  });
  return map;
}

function multiplySequence(preset: GroupPreset, seq: string[]): string {
  if (seq.length === 0) return preset.identity;
  let result = seq[0];
  for (let i = 1; i < seq.length; i += 1) {
    result = multiplyElement(preset, result, seq[i]);
  }
  return result;
}

function applyCollision(
  preset: GroupPreset,
  runtime: GroupRuntimeData,
  a: string,
  b: string,
  mode: CollisionMode,
  temperature: number
): [string, string] {
  // product
  if (mode === "product") {
    const ab = multiplyElement(preset, a, b);
    const ba = multiplyElement(preset, b, a);
    return [ab, ba];
  }
  // conjugation
  if (mode === "conjugation") {
    const aInv = runtime.inverseMap[a] ?? preset.identity;
    const bInv = runtime.inverseMap[b] ?? preset.identity;
    const a_b = multiplyElement(preset, a, b);
    const abaInv = multiplyElement(preset, a_b, aInv);
    const b_a = multiplyElement(preset, b, a);
    const babInv = multiplyElement(preset, b_a, bInv);
    return [abaInv, babInv];
  }
  // commutator
  if (mode === "commutator") {
    const aInv = runtime.inverseMap[a] ?? preset.identity;
    const bInv = runtime.inverseMap[b] ?? preset.identity;
    const ab = multiplyElement(preset, a, b);
    const abaInv = multiplyElement(preset, ab, aInv);
    const commAB = multiplyElement(preset, abaInv, bInv); // a b a^-1 b^-1
    const ba = multiplyElement(preset, b, a);
    const babInv = multiplyElement(preset, ba, bInv);
    const commBA = multiplyElement(preset, babInv, aInv); // b a b^-1 a^-1
    return [commAB, commBA];
  }
  // stochastic: with probability temperature, do product; else keep original
  if (mode === "stochastic") {
    if (Math.random() < Math.max(0, Math.min(1, temperature))) {
      const ab = multiplyElement(preset, a, b);
      const ba = multiplyElement(preset, b, a);
      return [ab, ba];
    }
    return [a, b];
  }
  // conservative: do product, but if identity appears, replace with generator or its inverse
  if (mode === "conservative") {
    const ab = multiplyElement(preset, a, b);
    const ba = multiplyElement(preset, b, a);
    const identity = preset.identity;
    const gens = preset.generators.length > 0 ? preset.generators : [identity];
    const pick = () => gens[Math.floor(Math.random() * gens.length)] ?? identity;
    const maybeReplace = (val: string): string => {
      if (val !== identity) return val;
      const g = pick();
      const gInv = runtime.inverseMap[g] ?? identity;
      return Math.random() < 0.5 ? g : gInv;
    };
    return [maybeReplace(ab), maybeReplace(ba)];
  }
  // fallback
  const ab = multiplyElement(preset, a, b);
  const ba = multiplyElement(preset, b, a);
  return [ab, ba];
}

function evaluateAttraction(
  control: AttractionControl,
  distance: number,
  globalMultiplier: number
): number {
  if (!control.enabled) return 0;
  const safeDistance = Math.max(
    distance,
    GROUP_SIM_CONSTANTS.physics.minimumDistance
  );
  const magnitude =
    (control.strength / safeDistance ** control.exponent) * globalMultiplier;
  // 负号表示吸引（朝向彼此）
  return -magnitude;
}

function evaluateRepulsion(
  control: RepulsionControl,
  distance: number,
  globalMultiplier: number
): number {
  if (!control.enabled) return 0;
  const safeDistance = Math.max(
    distance,
    GROUP_SIM_CONSTANTS.physics.minimumDistance
  );
  const magnitude =
    (control.strength / safeDistance ** control.exponent) * globalMultiplier;
  // 正号表示排斥（远离彼此）
  return magnitude;
}

function gatherPairCategories(
  runtime: GroupRuntimeData,
  a: string,
  b: string
): InteractionCategory[] {
  const categories: InteractionCategory[] = [];
  const isSameElement = a === b;
  if (isSameElement) {
    categories.push("sameElement");
  }
  const isInversePair =
    !isSameElement &&
    (runtime.inverseMap[a] === b || runtime.inverseMap[b] === a);
  if (isInversePair) {
    categories.push("inversePair");
  }
  if (
    runtime.neighborMap[a]?.has(b) ||
    runtime.neighborMap[b]?.has(a)
  ) {
    categories.push("cayleyNeighbor");
  }
  return categories;
}

export default function GroupWorld() {
  const [selectedPresetId, setSelectedPresetId] = createSignal(
    GROUP_PRESETS[0]?.id ?? ""
  );
  const [isPaused, setIsPaused] = createSignal(false);
  const [units, setUnits] = createSignal<Unit[]>([]);

  const [config, setConfig] = createStore<SimulationConfig>({
    unitsPerElement: GROUP_SIM_CONSTANTS.defaults.unitsPerElement,
    timeScale: GROUP_SIM_CONSTANTS.defaults.timeScale,
    globalForceMultiplier: GROUP_SIM_CONSTANTS.defaults.globalForceMultiplier,
    collisionDistance: GROUP_SIM_CONSTANTS.defaults.collisionDistanceOverride,
    collisionMode: "product",
    collisionTemperature: 0.5,
    interactions: createInitialInteractions(),
  });

  const selectedPreset = createMemo<GroupPreset>(() => {
    return (
      GROUP_PRESETS.find((preset) => preset.id === selectedPresetId()) ??
      GROUP_PRESETS[0]
    );
  });

  const runtimeData = createMemo<GroupRuntimeData>(() => {
    const preset = selectedPreset();
    const inverse = computeInverseMap(preset);
    const neighborMap = computeNeighborMap(preset, inverse);
    const colorMap = computeColorMap(preset);
    return { inverseMap: inverse, neighborMap, colorMap };
  });

  const elementCounts = createMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    const preset = selectedPreset();
    preset.elements.forEach((element) => {
      counts[element] = 0;
    });
    units().forEach((unit) => {
      counts[unit.element] = (counts[unit.element] ?? 0) + 1;
    });
    return counts;
  });

  let canvasRef: HTMLCanvasElement | undefined;
  let animationFrameId: number | null = null;
  let previousTimestamp = 0;
  let accumulator = 0;
  let unitsState: Unit[] = [];

  function restartSimulation() {
    const preset = selectedPreset();
    const elementCount = preset.elements.length;
    const totalUnits = elementCount * config.unitsPerElement;
    const padding = GROUP_SIM_CONSTANTS.physics.spawnPadding;
    const width = GROUP_SIM_CONSTANTS.canvas.width;
    const height = GROUP_SIM_CONSTANTS.canvas.height;
    const velocityLimit = GROUP_SIM_CONSTANTS.physics.initialSpeedLimit;
    const randomSpan = GROUP_SIM_CONSTANTS.math.two;
    const randomHalf = GROUP_SIM_CONSTANTS.math.half;
    const newUnits: Unit[] = [];
    for (let index = 0; index < totalUnits; index += 1) {
      const element = preset.elements[index % elementCount];
      newUnits.push({
        id: index,
        element,
        position: {
          x:
            padding +
            Math.random() * (width - padding * randomSpan),
          y:
            padding +
            Math.random() * (height - padding * randomSpan),
        },
        velocity: {
          x:
            (Math.random() * randomSpan - randomSpan * randomHalf) *
            velocityLimit,
          y:
            (Math.random() * randomSpan - randomSpan * randomHalf) *
            velocityLimit,
        },
      });
    }
    unitsState = newUnits;
    setUnits(newUnits.slice());
  }

  function renderScene() {
    if (!canvasRef) return;
    const context = canvasRef.getContext("2d");
    if (!context) return;
    const preset = selectedPreset();
    const runtime = runtimeData();
    const width = GROUP_SIM_CONSTANTS.canvas.width;
    const height = GROUP_SIM_CONSTANTS.canvas.height;
    context.save();
    context.clearRect(0, 0, width, height);
    context.fillStyle = GROUP_SIM_CONSTANTS.canvas.backgroundColor;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = GROUP_SIM_CONSTANTS.canvas.gridColor;
    context.lineWidth = 1;
    const spacing = GROUP_SIM_CONSTANTS.canvas.gridSpacing;
    for (let x = 0; x <= width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${GROUP_SIM_CONSTANTS.rendering.fontSize}px ${GROUP_SIM_CONSTANTS.rendering.fontFamily}`;
    const radius = GROUP_SIM_CONSTANTS.physics.unitRadius;
    const outline = GROUP_SIM_CONSTANTS.rendering.outlineWidth;
    const fullCircle = Math.PI * GROUP_SIM_CONSTANTS.math.two;
    const fillAlpha = GROUP_SIM_CONSTANTS.rendering.ghostAlpha;
    unitsState.forEach((unit) => {
      const color =
        runtime.colorMap[unit.element] ?? GROUP_SIM_CONSTANTS.colors.neutral;
      context.globalAlpha = fillAlpha;
      context.beginPath();
      context.fillStyle = color;
      context.arc(unit.position.x, unit.position.y, radius, 0, fullCircle);
      context.fill();
      context.globalAlpha = 1;
      context.lineWidth = outline;
      context.strokeStyle = GROUP_SIM_CONSTANTS.rendering.panelBackground;
      context.stroke();
      context.fillStyle = GROUP_SIM_CONSTANTS.rendering.textColor;
      const label =
        preset.displayNames?.[unit.element] ?? unit.element;
      context.fillText(label, unit.position.x, unit.position.y);
    });
    context.restore();
  }

  function simulateStep(deltaTime: number) {
    const preset = selectedPreset();
    if (!preset) return;
    const runtime = runtimeData();
    const count = unitsState.length;
    if (count === 0) return;
    const forcesX = new Array<number>(count).fill(0);
    const forcesY = new Array<number>(count).fill(0);
    const collisionDistance = config.collisionDistance;
    const collisionDistanceSquared = collisionDistance * collisionDistance;
    const radius = GROUP_SIM_CONSTANTS.physics.unitRadius;
    const width = GROUP_SIM_CONSTANTS.canvas.width;
    const height = GROUP_SIM_CONSTANTS.canvas.height;
    const damping = GROUP_SIM_CONSTANTS.physics.dampingFactor;
    const restitution = GROUP_SIM_CONSTANTS.physics.wallRestitution;
    const mass = GROUP_SIM_CONSTANTS.physics.mass;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx =
          unitsState[j].position.x - unitsState[i].position.x;
        const dy =
          unitsState[j].position.y - unitsState[i].position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(
          Math.max(
            distanceSquared,
            GROUP_SIM_CONSTANTS.physics.minimumDistance
          )
        );
        if (distanceSquared <= collisionDistanceSquared) {
          const [nextA, nextB] = applyCollision(
            preset,
            runtime,
            unitsState[i].element,
            unitsState[j].element,
            config.collisionMode,
            config.collisionTemperature
          );
          unitsState[i].element = nextA;
          unitsState[j].element = nextB;
        }
        const categories = gatherPairCategories(
          runtime,
          unitsState[i].element,
          unitsState[j].element
        );
        if (categories.length === 0) {
          continue;
        }
        let pairForce = 0;
        categories.forEach((category) => {
          const controls = config.interactions[category];
          pairForce += evaluateAttraction(
            controls.attraction,
            distance,
            config.globalForceMultiplier
          );
          pairForce += evaluateRepulsion(
            controls.repulsion,
            distance,
            config.globalForceMultiplier
          );
        });
        const normalizedFactor =
          pairForce / Math.max(distance, GROUP_SIM_CONSTANTS.physics.minimumDistance);
        const fx = normalizedFactor * dx;
        const fy = normalizedFactor * dy;
        forcesX[i] -= fx;
        forcesY[i] -= fy;
        forcesX[j] += fx;
        forcesY[j] += fy;
      }
    }
    for (let index = 0; index < count; index += 1) {
      const unit = unitsState[index];
      const ax = forcesX[index] / mass;
      const ay = forcesY[index] / mass;
      unit.velocity.x = (unit.velocity.x + ax * deltaTime) * damping;
      unit.velocity.y = (unit.velocity.y + ay * deltaTime) * damping;
      unit.position.x += unit.velocity.x * deltaTime;
      unit.position.y += unit.velocity.y * deltaTime;
      if (unit.position.x < radius) {
        unit.position.x = radius;
        unit.velocity.x = -unit.velocity.x * restitution;
      } else if (unit.position.x > width - radius) {
        unit.position.x = width - radius;
        unit.velocity.x = -unit.velocity.x * restitution;
      }
      if (unit.position.y < radius) {
        unit.position.y = radius;
        unit.velocity.y = -unit.velocity.y * restitution;
      } else if (unit.position.y > height - radius) {
        unit.position.y = height - radius;
        unit.velocity.y = -unit.velocity.y * restitution;
      }
    }
    setUnits(unitsState.slice());
  }

  function animationLoop(timestamp: number) {
    if (!previousTimestamp) {
      previousTimestamp = timestamp;
    }
    const elapsedMs = timestamp - previousTimestamp;
    previousTimestamp = timestamp;
    const deltaSeconds = Math.min(
      elapsedMs / 1000,
      GROUP_SIM_CONSTANTS.physics.maximumDeltaTime
    );
    if (!isPaused()) {
      accumulator += deltaSeconds * config.timeScale;
      const step = GROUP_SIM_CONSTANTS.physics.fixedTimeStep;
      const maximumBudget = GROUP_SIM_CONSTANTS.physics.maximumDeltaTime;
      accumulator = Math.min(accumulator, maximumBudget);
      while (accumulator >= step) {
        simulateStep(step);
        accumulator -= step;
      }
    } else {
      accumulator = 0;
    }
    renderScene();
    animationFrameId = requestAnimationFrame(animationLoop);
  }

  onMount(() => {
    previousTimestamp = 0;
    accumulator = 0;
    restartSimulation();
    animationFrameId = requestAnimationFrame(animationLoop);
  });

  onCleanup(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  });

  createEffect(() => {
    selectedPreset();
    config.unitsPerElement;
    restartSimulation();
  });

  createEffect(() => {
    config.collisionDistance;
  });

  const layout = GROUP_SIM_CONSTANTS.layout;

  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": `${layout.controlPanelWidth} 1fr`,
        gap: layout.gap,
        padding: layout.gap,
        color: GROUP_SIM_CONSTANTS.rendering.panelTextColor,
        "font-family": GROUP_SIM_CONSTANTS.rendering.fontFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: layout.sectionGap,
          "background-color": GROUP_SIM_CONSTANTS.rendering.panelBackground,
          padding: layout.sectionGap,
          "border-radius": "16px",
          "box-shadow": "0 12px 32px rgba(0,0,0,0.35)",
        }}
      >
        <section>
          <h1 style={{ margin: "0 0 12px 0", "font-size": "22px" }}>
            群论造境：碰撞即运算
          </h1>
          <p style={{ margin: 0, "line-height": 1.5 }}>
            作为创世神，你可以挑选一个预设群并调整微观交互规则。
            单元遵循经典力学在平面上运动，碰撞立即执行群运算：
            a·b 与 b·a 会把双方改写为不同的结果，展现交换与否的差异。
          </p>
        </section>

        <section
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: layout.inputGap,
          }}
        >
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>选择预设群</span>
            <select
              value={selectedPresetId()}
              onInput={(event) =>
                setSelectedPresetId(event.currentTarget.value)
              }
              style={{
                padding: "8px 12px",
                "border-radius": "8px",
                border: "1px solid rgba(255,255,255,0.12)",
                "background-color": "#1a2335",
                color: GROUP_SIM_CONSTANTS.rendering.panelTextColor,
              }}
            >
              <For each={GROUP_PRESETS}>
                {(preset) => (
                  <option value={preset.id}>{preset.name}</option>
                )}
              </For>
            </select>
          </label>
          <div style={{ "font-size": "14px", "line-height": 1.6 }}>
            {selectedPreset().description}
          </div>
        </section>

        <section
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: layout.inputGap,
          }}
        >
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>
              每个元素的单元数量：{config.unitsPerElement} 个（总计{" "}
              {selectedPreset().elements.length * config.unitsPerElement}）
            </span>
            <input
              type="range"
              min={GROUP_SIM_CONSTANTS.ranges.unitsPerElement.min}
              max={GROUP_SIM_CONSTANTS.ranges.unitsPerElement.max}
              step={GROUP_SIM_CONSTANTS.ranges.unitsPerElement.step}
              value={config.unitsPerElement}
              onInput={(event) =>
                setConfig("unitsPerElement", Number(event.currentTarget.value))
              }
            />
          </label>
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>时间倍率：×{config.timeScale.toFixed(2)}</span>
            <input
              type="range"
              min={GROUP_SIM_CONSTANTS.ranges.timeScale.min}
              max={GROUP_SIM_CONSTANTS.ranges.timeScale.max}
              step={GROUP_SIM_CONSTANTS.ranges.timeScale.step}
              value={config.timeScale}
              onInput={(event) =>
                setConfig("timeScale", Number(event.currentTarget.value))
              }
            />
          </label>
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>
              全局力强度倍率：×{config.globalForceMultiplier.toFixed(2)}
            </span>
            <input
              type="range"
              min={GROUP_SIM_CONSTANTS.ranges.globalForceMultiplier.min}
              max={GROUP_SIM_CONSTANTS.ranges.globalForceMultiplier.max}
              step={GROUP_SIM_CONSTANTS.ranges.globalForceMultiplier.step}
              value={config.globalForceMultiplier}
              onInput={(event) =>
                setConfig(
                  "globalForceMultiplier",
                  Number(event.currentTarget.value)
                )
              }
            />
          </label>
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>
              碰撞判定距离：{config.collisionDistance.toFixed(1)} px
            </span>
            <input
              type="range"
              min={GROUP_SIM_CONSTANTS.ranges.collisionDistance.min}
              max={GROUP_SIM_CONSTANTS.ranges.collisionDistance.max}
              step={GROUP_SIM_CONSTANTS.ranges.collisionDistance.step}
              value={config.collisionDistance}
              onInput={(event) =>
                setConfig("collisionDistance", Number(event.currentTarget.value))
              }
            />
          </label>
          <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span>碰撞计算方式</span>
            <select
              value={config.collisionMode}
              onInput={(event) =>
                setConfig("collisionMode", event.currentTarget.value as CollisionMode)
              }
              style={{
                padding: "8px 12px",
                "border-radius": "8px",
                border: "1px solid rgba(255,255,255,0.12)",
                "background-color": "#1a2335",
                color: GROUP_SIM_CONSTANTS.rendering.panelTextColor,
              }}
            >
              <option value="product">乘法（a·b / b·a）</option>
              <option value="conjugation">共轭（a b a⁻¹ / b a b⁻¹）</option>
              <option value="commutator">交换子（a b a⁻¹ b⁻¹ / b a b⁻¹ a⁻¹）</option>
              <option value="stochastic">随机温度化</option>
              <option value="conservative">守恒反塌缩</option>
            </select>
          </label>
          <Show when={config.collisionMode === "stochastic"}>
            <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
              <span>
                碰撞温度/概率：×{config.collisionTemperature.toFixed(2)}
              </span>
              <input
                type="range"
                min={GROUP_SIM_CONSTANTS.ranges.collisionTemperature.min}
                max={GROUP_SIM_CONSTANTS.ranges.collisionTemperature.max}
                step={GROUP_SIM_CONSTANTS.ranges.collisionTemperature.step}
                value={config.collisionTemperature}
                onInput={(event) =>
                  setConfig("collisionTemperature", Number(event.currentTarget.value))
                }
              />
            </label>
          </Show>
        </section>

        <section
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: layout.inputGap,
          }}
        >
          <h2 style={{ margin: "0 0 4px 0", "font-size": "18px" }}>交互规则</h2>
          <For each={INTERACTION_ORDER}>
            {(category) => {
              const controls = config.interactions[category];
              const attraction = controls.attraction;
              const repulsion = controls.repulsion;
              return (
                <div
                  style={{
                    padding: "12px 14px",
                    "border-radius": "12px",
                    "background-color": "#1b2538",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ "font-weight": 600 }}>{controls.label}</div>
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      "grid-template-columns": "repeat(2, 1fr)",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "6px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={attraction.enabled}
                          onInput={(event) =>
                            setConfig(
                              "interactions",
                              category,
                              "attraction",
                              "enabled",
                              event.currentTarget.checked
                            )
                          }
                        />
                        <span>吸引启用</span>
                      </label>
                      <div style={{ "font-size": "12px", color: "#a3adcb" }}>
                        始终生效（无阈距）。
                      </div>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "6px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={repulsion.enabled}
                          onInput={(event) =>
                            setConfig(
                              "interactions",
                              category,
                              "repulsion",
                              "enabled",
                              event.currentTarget.checked
                            )
                          }
                        />
                        <span>排斥启用</span>
                      </label>
                      <div style={{ "font-size": "12px", color: "#a3adcb" }}>
                        靠得越近推开更强（无阈距）。
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: "12px",
                      "grid-template-columns": "repeat(2, 1fr)",
                    }}
                  >
                    <ForceSlider
                      label="吸引力度"
                      value={attraction.strength}
                      onInput={(value) =>
                        setConfig(
                          "interactions",
                          category,
                          "attraction",
                          "strength",
                          value
                        )
                      }
                    />
                    <ForceSlider
                      label="排斥力度"
                      value={repulsion.strength}
                      onInput={(value) =>
                        setConfig(
                          "interactions",
                          category,
                          "repulsion",
                          "strength",
                          value
                        )
                      }
                    />
                    <ForceSlider
                      label="吸引幂次"
                      min={GROUP_SIM_CONSTANTS.ranges.exponent.min}
                      max={GROUP_SIM_CONSTANTS.ranges.exponent.max}
                      step={GROUP_SIM_CONSTANTS.ranges.exponent.step}
                      value={attraction.exponent}
                      onInput={(value) =>
                        setConfig(
                          "interactions",
                          category,
                          "attraction",
                          "exponent",
                          value
                        )
                      }
                    />
                    <ForceSlider
                      label="排斥幂次"
                      min={GROUP_SIM_CONSTANTS.ranges.exponent.min}
                      max={GROUP_SIM_CONSTANTS.ranges.exponent.max}
                      step={GROUP_SIM_CONSTANTS.ranges.exponent.step}
                      value={repulsion.exponent}
                      onInput={(value) =>
                        setConfig(
                          "interactions",
                          category,
                          "repulsion",
                          "exponent",
                          value
                        )
                      }
                    />

                  </div>
                </div>
              );
            }}
          </For>
        </section>

        <section
          style={{
            display: "flex",
            gap: layout.buttonGap,
          }}
        >
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            style={{
              flex: 1,
              padding: "10px 16px",
              "border-radius": "10px",
              border: "none",
              cursor: "pointer",
              "background-color": GROUP_SIM_CONSTANTS.rendering.accentColor,
              color: "#101526",
              "font-weight": 600,
            }}
          >
            {isPaused() ? "继续演化" : "暂停演化"}
          </button>
          <button
            type="button"
            onClick={() => {
              restartSimulation();
              setIsPaused(false);
            }}
            style={{
              padding: "10px 16px",
              "border-radius": "10px",
              border: "1px solid rgba(255,255,255,0.24)",
              cursor: "pointer",
              "background-color": "#1d273b",
              color: GROUP_SIM_CONSTANTS.rendering.panelTextColor,
              "font-weight": 600,
            }}
          >
            重置单元
          </button>
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gap: layout.sectionGap,
        }}
      >
        <div
          style={{
            "background-color": GROUP_SIM_CONSTANTS.rendering.panelBackground,
            padding: layout.sectionGap,
            "border-radius": "16px",
            "box-shadow": "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          <canvas
            ref={(el) => {
              canvasRef = el;
            }}
            width={GROUP_SIM_CONSTANTS.canvas.width}
            height={GROUP_SIM_CONSTANTS.canvas.height}
            style={{
              width: "100%",
              height: "auto",
              "border-radius": "12px",
              border: "1px solid rgba(255,255,255,0.12)",
              "background-color": "#04080f",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: layout.sectionGap,
            "background-color": GROUP_SIM_CONSTANTS.rendering.panelBackground,
            padding: layout.sectionGap,
            "border-radius": "16px",
            "box-shadow": "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          <section>
            <h2 style={{ margin: "0 0 12px 0", "font-size": "18px" }}>
              元素统计
            </h2>
            <div
              style={{
                display: "grid",
                gap: "8px",
                "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))",
              }}
            >
              <For each={selectedPreset().elements}>
                {(element) => {
                  const runtime = runtimeData();
                  const color =
                    runtime.colorMap[element] ??
                    GROUP_SIM_CONSTANTS.colors.neutral;
                  const label =
                    selectedPreset().displayNames?.[element] ?? element;
                  return (
                    <div
                      style={{
                        padding: "10px",
                        "border-radius": "10px",
                        "background-color": "#1c273c",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "4px",
                        border: `1px solid ${GROUP_SIM_CONSTANTS.rendering.tableBorderColor}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "8px",
                          "font-weight": 600,
                        }}
                      >
                        <span
                          style={{
                            width: "14px",
                            height: "14px",
                            "border-radius": "50%",
                            "background-color": color,
                            display: "inline-block",
                          }}
                        />
                        <span>{label}</span>
                      </div>
                      <div style={{ "font-size": "12px", color: "#a8b2cd" }}>
                        数量：{elementCounts()[element] ?? 0}
                      </div>
                      <div style={{ "font-size": "12px", color: "#8390af" }}>
                        逆元：{runtimeData().inverseMap[element]}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>

          <section>
            <h2 style={{ margin: "0 0 12px 0", "font-size": "18px" }}>
              凯莱乘法表
            </h2>
            <div style={{ overflow: "auto" }}>
              <table
                style={{
                  width: "100%",
                  "border-collapse": "collapse",
                  "font-size": "14px",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        padding: GROUP_SIM_CONSTANTS.layout.tableCellPadding,
                        border: `1px solid ${GROUP_SIM_CONSTANTS.rendering.tableBorderColor}`,
                        "background-color": "#1d2940",
                      }}
                    >
                      ⋅
                    </th>
                    <For each={selectedPreset().elements}>
                      {(column) => (
                        <th
                          style={{
                            padding:
                              GROUP_SIM_CONSTANTS.layout.tableCellPadding,
                            border: `1px solid ${GROUP_SIM_CONSTANTS.rendering.tableBorderColor}`,
                            "background-color": "#1d2940",
                            "white-space": "nowrap",
                          }}
                        >
                          {selectedPreset().displayNames?.[column] ?? column}
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={selectedPreset().elements}>
                    {(row) => (
                      <tr>
                        <th
                          style={{
                            padding:
                              GROUP_SIM_CONSTANTS.layout.tableCellPadding,
                            border: `1px solid ${GROUP_SIM_CONSTANTS.rendering.tableBorderColor}`,
                            "background-color": "#1d2940",
                            "text-align": "left",
                          }}
                        >
                          {selectedPreset().displayNames?.[row] ?? row}
                        </th>
                        <For each={selectedPreset().elements}>
                          {(column) => (
                            <td
                              style={{
                                padding:
                                  GROUP_SIM_CONSTANTS.layout.tableCellPadding,
                                border: `1px solid ${GROUP_SIM_CONSTANTS.rendering.tableBorderColor}`,
                                "text-align": "center",
                                "white-space": "nowrap",
                              }}
                            >
                              {selectedPreset().displayNames?.[
                                selectedPreset().operationTable[row][column]
                              ] ??
                                selectedPreset().operationTable[row][column]}
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

interface ForceSliderProps {
  label: string;
  value: number;
  onInput: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function ForceSlider(props: ForceSliderProps) {
  const min = props.min ?? GROUP_SIM_CONSTANTS.ranges.strength.min;
  const max = props.max ?? GROUP_SIM_CONSTANTS.ranges.strength.max;
  const step = props.step ?? GROUP_SIM_CONSTANTS.ranges.strength.step;
  return (
    <label
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "6px",
        "font-size": "13px",
      }}
    >
      <span>
        {props.label}：{props.value.toFixed(2)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.value}
        onInput={(event) => props.onInput(Number(event.currentTarget.value))}
      />
    </label>
  );
}


