export type SignalPhase = {
  id: string;
  durationSec: number;
};

export type SignalPlan = {
  id: string;
  label: string;
  phases: SignalPhase[];
  updatedAt?: string;
};

export type SignalTemplate = {
  id: string;
  label: string;
  phases: SignalPhase[];
};

export type ValidationSeverity = "ok" | "warn" | "error";
export type ValidationIssue = {
  code: string;
  message: string;
  index: number; // 相位索引（从 0 开始）
  severity: ValidationSeverity;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  counts: { ok: number; warn: number; error: number };
};

const PHASE_TEMPLATES: SignalTemplate[] = [
  {
    id: "tmpl.two_phase.opposed",
    label: "两相位（对向直行）",
    phases: [
      { id: "P1: NS 直行放行", durationSec: 30 },
      { id: "P2: EW 直行放行", durationSec: 30 },
    ],
  },
  {
    id: "tmpl.three_phase.protected_left",
    label: "三相位（保护左转）",
    phases: [
      { id: "P1: NS 左转", durationSec: 12 },
      { id: "P2: NS 直行", durationSec: 24 },
      { id: "P3: EW 直行+左转", durationSec: 36 },
    ],
  },
  {
    id: "tmpl.ped_scramble",
    label: "全向行人（交叉口清空）",
    phases: [
      { id: "P1: 机动车 NS", durationSec: 28 },
      { id: "P2: 机动车 EW", durationSec: 28 },
      { id: "P3: 行人全向", durationSec: 18 },
    ],
  },
];

export function listTemplates(): SignalTemplate[] {
  return PHASE_TEMPLATES;
}

export function getTemplateById(id: string): SignalTemplate | undefined {
  return PHASE_TEMPLATES.find(t => t.id === id);
}

export function applyTemplateToPlan(
  base: SignalPlan,
  templateId: string,
  options?: { scale?: number; overrideLabel?: string }
): SignalPlan {
  const tmpl = getTemplateById(templateId);
  if (!tmpl) return base;
  const scale = options?.scale ?? 1;
  const scaledPhases = tmpl.phases.map(p => ({
    id: p.id,
    durationSec: Math.max(1, Math.round(p.durationSec * scale)),
  }));
  return {
    id: base.id,
    label: options?.overrideLabel ?? base.label,
    phases: scaledPhases,
    updatedAt: new Date().toISOString(),
  };
}

// 占位解析：从相位 id 中粗略提取“运动/参与者”标签，用于基础冲突检测
function parsePhaseTags(phaseId: string): Set<string> {
  const id = phaseId.toLowerCase();
  const tags = new Set<string>();
  if (id.includes("ns")) tags.add("ns");
  if (id.includes("ew")) tags.add("ew");
  if (id.includes("直行") || id.includes("thru")) tags.add("thru");
  if (id.includes("左转") || id.includes("left")) tags.add("left");
  if (id.includes("行人") || id.includes("ped")) tags.add("ped");
  if (id.includes("清空") || id.includes("all-red") || id.includes("allred")) tags.add("allred");
  if (id.includes("机动车") || id.includes("veh")) tags.add("veh");
  return tags;
}

// 相位集合是否“语义等价”（占位：基于解析出的标签做近似）
function isEquivalentPhase(a: SignalPhase, b: SignalPhase): boolean {
  const ta = parsePhaseTags(a.id);
  const tb = parsePhaseTags(b.id);
  if (ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

export function validateSignalPlan(plan: SignalPlan): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!plan.id) {
    issues.push({ code: "plan.id.missing", message: "缺少计划 id", index: -1, severity: "error" });
  }
  if (!Array.isArray(plan.phases) || plan.phases.length === 0) {
    issues.push({ code: "plan.phases.empty", message: "相位列表为空", index: -1, severity: "error" });
  }

  // 规则 1：相位时长区间（占位阈值）
  // error: <5s； warn: [5,10) 或 >120s
  for (let i = 0; i < (plan.phases?.length ?? 0); i += 1) {
    const p = plan.phases[i]!;
    if (!p.id) {
      issues.push({ code: "phase.id.missing", message: `相位 #${i + 1} 缺少 id`, index: i, severity: "error" });
    }
    if (!Number.isFinite(p.durationSec) || p.durationSec <= 0) {
      issues.push({ code: "phase.duration.invalid", message: `相位 ${p.id || `#${i + 1}`} 时长非法`, index: i, severity: "error" });
      continue;
    }
    if (p.durationSec < 5) {
      issues.push({ code: "phase.duration.too_short", message: `相位 ${p.id} 时长过短(<5s)`, index: i, severity: "error" });
    } else if (p.durationSec < 10) {
      issues.push({ code: "phase.duration.short", message: `相位 ${p.id} 时长偏短(<10s)`, index: i, severity: "warn" });
    } else if (p.durationSec > 120) {
      issues.push({ code: "phase.duration.long", message: `相位 ${p.id} 时长偏长(>120s)`, index: i, severity: "warn" });
    }
  }

  // 规则 2：相邻相位“等价未变化”
  for (let i = 0; i + 1 < (plan.phases?.length ?? 0); i += 1) {
    const a = plan.phases[i]!;
    const b = plan.phases[i + 1]!;
    if (isEquivalentPhase(a, b)) {
      issues.push({ code: "phase.adjacent.duplicate", message: `相位 ${a.id} 与后继 ${b.id} 语义等价，可能冗余`, index: i + 1, severity: "warn" });
    }
  }

  // 规则 3：机动车 ↔ 行人 相邻切换缺少“清空/全红”占位
  for (let i = 0; i + 1 < (plan.phases?.length ?? 0); i += 1) {
    const a = plan.phases[i]!;
    const b = plan.phases[i + 1]!;
    const ta = parsePhaseTags(a.id);
    const tb = parsePhaseTags(b.id);
    const vehSideA = ta.has("veh") || ta.has("ns") || ta.has("ew") || ta.has("left") || ta.has("thru");
    const pedSideA = ta.has("ped");
    const vehSideB = tb.has("veh") || tb.has("ns") || tb.has("ew") || tb.has("left") || tb.has("thru");
    const pedSideB = tb.has("ped");
    const crossesVehPed = (vehSideA && pedSideB) || (pedSideA && vehSideB);
    if (crossesVehPed) {
      if (!ta.has("allred") && !tb.has("allred")) {
        issues.push({ code: "phase.adjacent.missing_allred", message: `相位 ${a.id} → ${b.id} 机动车/行人直接切换，缺少清空/全红占位`, index: i + 1, severity: "warn" });
      }
    }
  }

  // 规则 4：周期上下限（占位阈值）
  // error: < 10s 或 > 600s；warn: [10,30) 或 (240,600]
  const totalCycleSec = (plan.phases ?? []).reduce((acc, p) => acc + Math.max(0, p.durationSec || 0), 0);
  if (totalCycleSec < 10) {
    issues.push({ code: "cycle.too_short", message: `周期过短(${totalCycleSec}s < 10s)`, index: -1, severity: "error" });
  } else if (totalCycleSec < 30) {
    issues.push({ code: "cycle.short", message: `周期偏短(${totalCycleSec}s < 30s)`, index: -1, severity: "warn" });
  }
  if (totalCycleSec > 600) {
    issues.push({ code: "cycle.too_long", message: `周期过长(${totalCycleSec}s > 600s)`, index: -1, severity: "error" });
  } else if (totalCycleSec > 240) {
    issues.push({ code: "cycle.long", message: `周期偏长(${totalCycleSec}s > 240s)`, index: -1, severity: "warn" });
  }

  // 规则 5：主要运动占空比阈值
  // warn: (0,5%] 近似不可用；warn: >80% 过高
  if (totalCycleSec > 0) {
    const { windows } = computeGateWindows(plan);
    const movementDur: Record<MovementId, number> = {
      NS_THRU: 0,
      EW_THRU: 0,
      NS_LEFT: 0,
      EW_LEFT: 0,
      PED: 0,
    };
    for (const w of windows) movementDur[w.movementId] += Math.max(0, w.openEndSec - w.openStartSec);
    (Object.keys(movementDur) as MovementId[]).forEach((m) => {
      const duty = movementDur[m] / totalCycleSec;
      if (duty > 0 && duty <= 0.05) {
        issues.push({ code: `duty.low.${m.toLowerCase()}` as any, message: `${m} 占空比过低(${(duty * 100).toFixed(1)}%)`, index: -1, severity: "warn" });
      } else if (duty >= 0.8) {
        issues.push({ code: `duty.high.${m.toLowerCase()}` as any, message: `${m} 占空比过高(${(duty * 100).toFixed(1)}%)`, index: -1, severity: "warn" });
      }
    });
  }

  const counts = issues.reduce((acc, it) => {
    acc[it.severity] += 1;
    return acc;
  }, { ok: 0, warn: 0, error: 0 } as { ok: number; warn: number; error: number });

  // 若没有任何问题，添加一条 ok 信息以便 UI 显示
  if (issues.length === 0) {
    issues.push({ code: "plan.ok", message: "未发现明显问题", index: -1, severity: "ok" });
    counts.ok += 1;
  }

  return { issues, counts };
}


// ---- Gate（放行时间窗，占位）-------------------------------------------------

export type MovementId = "NS_THRU" | "EW_THRU" | "NS_LEFT" | "EW_LEFT" | "PED";

export type GateWindow = {
  movementId: MovementId;
  openStartSec: number;
  openEndSec: number;
  cycleSec: number;
  phaseIndex: number;
};

function phaseActiveMovements(phaseId: string): Set<MovementId> {
  const tags = parsePhaseTags(phaseId);
  const active = new Set<MovementId>();
  // 全红/清空：不放行
  if (tags.has("allred")) return active;

  const isNS = tags.has("ns");
  const isEW = tags.has("ew");
  const isThru = tags.has("thru") || (!tags.has("left") && !tags.has("ped"));
  const isLeft = tags.has("left");
  const isPed = tags.has("ped");

  if (isPed) {
    active.add("PED");
    return active;
  }

  if (isNS && isThru) active.add("NS_THRU");
  if (isEW && isThru) active.add("EW_THRU");
  if (isNS && isLeft) active.add("NS_LEFT");
  if (isEW && isLeft) active.add("EW_LEFT");
  return active;
}

export function computeGateWindows(plan: SignalPlan): { cycleSec: number; windows: GateWindow[] } {
  const windows: GateWindow[] = [];
  let t = 0;
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  for (let i = 0; i < phases.length; i += 1) {
    const p = phases[i]!;
    const dur = Math.max(0, Math.floor(p.durationSec || 0));
    if (dur <= 0) continue;
    const actives = phaseActiveMovements(p.id);
    for (const m of actives) {
      windows.push({ movementId: m, openStartSec: t, openEndSec: t + dur, cycleSec: 0, phaseIndex: i });
    }
    t += dur;
  }
  const cycleSec = t;
  for (const w of windows) w.cycleSec = cycleSec;
  return { cycleSec, windows };
}


