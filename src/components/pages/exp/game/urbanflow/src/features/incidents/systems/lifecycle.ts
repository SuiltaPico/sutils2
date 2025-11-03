import type { EdgeId } from "../../traffic/services/graph";

export type Incident = {
  id: string;
  type: "collision";
  at: { x: number; y: number };
  vehicles: [number, number];
  edgeId?: EdgeId; // 关联碰撞所在边（用于容量/封闭效果）
  ts: number; // ms since epoch
};

const state: {
  incidents: Incident[];
  maxHistory: number;
  zones: { x: number; y: number; radius: number; factor: number; expiresAt: number }[];
  // INCIDENT-3：边级影响（容量因子与临时封闭）
  edgeCapacity: Map<EdgeId, { factor: number; expiresAt: number }>;
  edgeClosed: Map<EdgeId, number>; // expiresAt
} = {
  incidents: [],
  maxHistory: 200,
  zones: [],
  edgeCapacity: new Map(),
  edgeClosed: new Map(),
};

function addIncident(inc: Incident) {
  state.incidents.push(inc);
  if (state.incidents.length > state.maxHistory) {
    state.incidents.splice(0, state.incidents.length - state.maxHistory);
  }
}

export function getIncidents(): readonly Incident[] {
  return state.incidents;
}

export function clearIncidents() {
  state.incidents.length = 0;
}

export function getIncidentZones(): readonly { x: number; y: number; radius: number; factor: number; expiresAt: number }[] {
  return state.zones;
}

// 边级容量因子（默认 1）
export function getEdgeCapacityFactor(edgeId: EdgeId | undefined | null): number {
  if (!edgeId) return 1;
  const now = Date.now();
  const rec = state.edgeCapacity.get(edgeId);
  if (!rec) return 1;
  if (rec.expiresAt <= now) {
    state.edgeCapacity.delete(edgeId);
    return 1;
  }
  return Math.max(0, Math.min(1, rec.factor));
}

// 返回当前仍处于封闭状态的边集合（快照，避免外部修改内部 Map）
export function getClosedEdges(): Set<EdgeId> {
  const now = Date.now();
  const result = new Set<EdgeId>();
  for (const [eid, exp] of state.edgeClosed.entries()) {
    if (exp > now) result.add(eid);
  }
  return result;
}

function addSlowdownZoneAt(x: number, y: number, opts?: { radius?: number; factor?: number; ttlMs?: number }) {
  const radius = Math.max(4, Math.min(128, opts?.radius ?? 32)); // world units
  const factor = Math.max(0.2, Math.min(1, opts?.factor ?? 0.4)); // 0.2..1
  const ttlMs = Math.max(1000, Math.min(60000, opts?.ttlMs ?? 8000));
  const now = Date.now();
  state.zones.push({ x, y, radius, factor, expiresAt: now + ttlMs });
}

export function startIncidentsLifecycle(): () => void {
  const onIncident = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as Incident | undefined;
    if (!detail) return;
    addIncident(detail);
    // 在事故点生成一个临时减速区（半径 32 world，系数 0.4，8s）
    addSlowdownZoneAt(detail.at.x, detail.at.y, { radius: 32, factor: 0.4, ttlMs: 8000 });
    // INCIDENT-3：对关联边施加影响
    try {
      const now = Date.now();
      if (detail.edgeId) {
        // 1) 临时封闭（短 TTL）
        state.edgeClosed.set(detail.edgeId, now + 4000);
        // 2) 容量下调（较长 TTL）
        state.edgeCapacity.set(detail.edgeId, { factor: 0.3, expiresAt: now + 8000 });
      }
    } catch {}
  };
  window.addEventListener("urbanflow:incident", onIncident as EventListener);
  // 使用模拟时钟驱动清理过期的减速区
  const onTick = () => {
    const now = Date.now();
    if (state.zones.length > 0) {
      let write = 0;
      for (let i = 0; i < state.zones.length; i += 1) {
        const z = state.zones[i]!;
        if (z.expiresAt > now) {
          state.zones[write++] = z;
        }
      }
      if (write !== state.zones.length) state.zones.length = write;
    }
    // 清理边级影响
    if (state.edgeCapacity.size > 0) {
      for (const [eid, rec] of Array.from(state.edgeCapacity.entries())) {
        if (rec.expiresAt <= now) state.edgeCapacity.delete(eid);
      }
    }
    if (state.edgeClosed.size > 0) {
      for (const [eid, exp] of Array.from(state.edgeClosed.entries())) {
        if (exp <= now) state.edgeClosed.delete(eid);
      }
    }
  };
  window.addEventListener("urbanflow:simTick", onTick as EventListener);
  return () => {
    window.removeEventListener("urbanflow:incident", onIncident as EventListener);
    window.removeEventListener("urbanflow:simTick", onTick as EventListener);
  };
}


