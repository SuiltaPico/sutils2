import type { SignalPlan } from "../../intersections/systems/signals";
import { computeGateWindows, type MovementId } from "../../intersections/systems/signals";

export type GateQuery = {
  movement: MovementId;
  timeSec: number; // 相位周期内的时间（取模后）
};

export function isGateOpen(plan: SignalPlan, query: GateQuery): boolean {
  const { cycleSec, windows } = computeGateWindows(plan);
  if (cycleSec <= 0) return false;
  const t = ((query.timeSec % cycleSec) + cycleSec) % cycleSec;
  for (const w of windows) {
    if (w.movementId !== query.movement) continue;
    if (t >= w.openStartSec && t <= w.openEndSec) return true;
  }
  return false;
}

export function nextOpenInterval(plan: SignalPlan, movement: MovementId, fromSec: number): { start: number; end: number } | null {
  const { cycleSec, windows } = computeGateWindows(plan);
  if (cycleSec <= 0) return null;
  const mod = ((fromSec % cycleSec) + cycleSec) % cycleSec;
  let candidate: { start: number; end: number } | null = null;
  for (const w of windows) {
    if (w.movementId !== movement) continue;
    if (w.openEndSec < mod) continue;
    if (!candidate || w.openStartSec < candidate.start) {
      candidate = { start: w.openStartSec, end: w.openEndSec };
    }
  }
  if (candidate) return candidate;
  // 下一周期的第一段
  const next = windows.find((w) => w.movementId === movement);
  return next ? { start: next.openStartSec + cycleSec, end: next.openEndSec + cycleSec } : null;
}


