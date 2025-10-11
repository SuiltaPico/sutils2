import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

// 以数据驱动：模板 -> 实例 -> 系统循环 -> UI 渲染

type Side = "ally" | "enemy";

type Buff = {
  name: string;
  endTick: number;
  defenseBonus?: number;
  regenPerSecond?: number; // 每秒回复生命值
  nextRegenTick?: number;
};

type SkillConfig =
  | {
      name: string;
      type: "buff";
      costEntropy: number;
      durationTicks: number;
      defenseBonus: number;
      regenPerSecond: number;
    }
  | {
      name: string;
      type: "damage";
      costEntropy: number;
      damageFactor: number; // 乘以攻击力
    }
  | {
      name: string;
      type: "heal";
      costEntropy: number;
      healPercentOfSelfMaxHp: number; // 按施法者自身生命上限的百分比治疗
    };

type NormalAttackConfig =
  | { type: "damage"; damageFactor?: number }
  | { type: "heal"; healPercentOfSelfMaxHp: number };

type RoleTemplate = {
  id: string;
  name: string;
  profession: string;
  maxHp: number;
  attack: number;
  defense: number;
  maxEntropy: number;
  maxSkillGauge: number;
  attackIntervalTicks: number;
  normalAttack?: NormalAttackConfig;
  skill?: SkillConfig;
};

type RoleInstance = {
  id: string;
  side: Side;
  template: RoleTemplate;
  hp: number;
  entropy: number;
  skillGauge: number;
  lastAttackTick: number;
  buffs: Buff[];
  alive: boolean;
};

const TICKS_PER_SECOND = 30;
const HP_WARN_YELLOW = 50; // <= 50% 黄
const HP_WARN_RED = 25; // <= 25% 红
const HIT_FX_MS = 500; // 受击特效时长
const CAST_FX_MS = 500; // 释放特效时长
const LOCK_TTL_MS = 900; // 锁定提示存在时长
const FLOAT_TEXT_MS = 900; // 飘字存在时长
const CRIT_RATE = 0.2; // 暴击概率
const CRIT_MULTIPLIER = 1.5; // 暴击伤害倍率

// ---- 立绘资源自动加载 (@char/<id>.png) ----
const CHAR_IMAGE_URLS = (import.meta as any).glob("./char/*.png", {
  eager: true,
  as: "url",
}) as Record<string, string>;

function getCharUrlById(id: string): string | undefined {
  const key = `./char/${id}.png`;
  return CHAR_IMAGE_URLS[key];
}

// ---- 模板库（来自 sandbox.tree）----
const TEMPLATES: Record<string, RoleTemplate> = {
  heavy_guard: {
    id: "heavy_guard",
    name: "重甲近卫",
    profession: "近卫",
    maxHp: 200,
    attack: 10,
    defense: 100,
    maxEntropy: 20,
    maxSkillGauge: 20,
    attackIntervalTicks: 90,
    normalAttack: { type: "damage", damageFactor: 1 },
    skill: {
      name: "守护姿态",
      type: "buff",
      costEntropy: 5,
      durationTicks: 10 * TICKS_PER_SECOND,
      defenseBonus: 400,
      regenPerSecond: 5,
    },
  },
  melee_fighter: {
    id: "melee_fighter",
    name: "近战斗士",
    profession: "斗士",
    maxHp: 80,
    attack: 30,
    defense: 30,
    maxEntropy: 20,
    maxSkillGauge: 20,
    attackIntervalTicks: 60,
    normalAttack: { type: "damage", damageFactor: 1 },
    skill: {
      name: "破势斩",
      type: "damage",
      costEntropy: 10,
      damageFactor: 3.0,
    },
  },
  medic: {
    id: "medic",
    name: "药师",
    profession: "医疗",
    maxHp: 100,
    attack: 5,
    defense: 20,
    maxEntropy: 20,
    maxSkillGauge: 20,
    attackIntervalTicks: 120,
    normalAttack: { type: "heal", healPercentOfSelfMaxHp: 0.1 },
    skill: {
      name: "紧急治疗",
      type: "heal",
      costEntropy: 10,
      healPercentOfSelfMaxHp: 0.6,
    },
  },
  mob: {
    id: "mob",
    name: "小怪",
    profession: "怪物",
    maxHp: 200,
    attack: 20,
    defense: 10,
    maxEntropy: 0,
    maxSkillGauge: 0,
    attackIntervalTicks: 75,
    normalAttack: { type: "damage", damageFactor: 1 },
  },
};

function cloneFromTemplate(
  side: Side,
  tpl: RoleTemplate,
  idSuffix: string
): RoleInstance {
  return {
    id: `${tpl.id}-${side}-${idSuffix}`,
    side,
    template: tpl,
    hp: tpl.maxHp,
    entropy: Math.min(0, tpl.maxEntropy),
    skillGauge: 0,
    lastAttackTick: 0,
    buffs: [],
    alive: true,
  };
}

function currentDefense(role: RoleInstance): number {
  let def = role.template.defense;
  for (const b of role.buffs) {
    if (b.defenseBonus) def += b.defenseBonus;
  }
  return Math.max(0, def);
}

function computeDamage(
  attacker: RoleInstance,
  target: RoleInstance,
  factor = 1
): number {
  // 减伤率 = 防御力 / (防御力 + 100)
  // 实际伤害 = (基础伤害 + 攻击力) * (1 - 减伤率)
  const def = currentDefense(target);
  const reductionRate = def / (def + 100);
  const raw = attacker.template.attack * factor; // 基础伤害暂按 0 处理
  const reduced = raw * (1 - reductionRate);
  const dmg = Math.floor(reduced);
  // 若有正向伤害，至少造成 1 点
  return Math.max(raw > 0 ? 1 : 0, dmg);
}

export default function WaylandSandbox() {
  // ---- 战场与时间 ----
  const [tick, setTick] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [speed, setSpeed] = createSignal<1 | 2>(1);
  const [logLines, setLogLines] = createSignal<string[]>([]);

  // ---- UI 特效状态（与业务分离）----
  const [hitFxIds, setHitFxIds] = createSignal<Set<string>>(new Set());
  const [castFxIds, setCastFxIds] = createSignal<Set<string>>(new Set());
  const hitFxTimers = new Map<string, number>();
  const castFxTimers = new Map<string, number>();

  // ---- HP 拖尾（全局按角色ID管理，避免组件重建丢失动画状态）----
  const [ghostHpPctMap, setGhostHpPctMap] = createSignal<Map<string, number>>(
    new Map()
  );
  function setGhostPctFor(id: string, pctVal: number) {
    setGhostHpPctMap((prev) => {
      const next = new Map(prev);
      next.set(id, pctVal);
      return next;
    });
  }
  function updateGhostHpForRole(role: RoleInstance) {
    const pctVal = percent(role.hp, role.template.maxHp);
    const prev = ghostHpPctMap().get(role.id) ?? pctVal;
    if (pctVal < prev) {
      // 掉血：拖尾延迟收缩
      window.setTimeout(() => setGhostPctFor(role.id, pctVal), 300);
    } else {
      // 回血：拖尾立即追上
      setGhostPctFor(role.id, pctVal);
    }
  }

  // ---- 卡片与容器引用（用于全局覆盖层定位）----
  const cardElById = new Map<string, HTMLElement>();
  let containerEl: HTMLDivElement | undefined;
  function registerCardRef(id: string, el: HTMLElement | null) {
    if (!el) return;
    cardElById.set(id, el);
  }
  function setContainerRef(el: HTMLDivElement) {
    containerEl = el;
  }
  function getCardPos(id: string): { cx: number; top: number } | null {
    const el = cardElById.get(id);
    if (!el || !containerEl) return null;
    const r = el.getBoundingClientRect();
    const host = containerEl.getBoundingClientRect();
    return { cx: r.left - host.left + r.width / 2, top: r.top - host.top };
  }

  // ---- 锁定提示（敌方头顶展示被哪个我方锁定）----
  const [locks, setLocks] = createSignal<Map<string, string>>(new Map()); // key: targetId, val: ally template id
  const lockTimers = new Map<string, number>();
  function setLockTarget(targetId: string, allyTemplateId: string) {
    const old = lockTimers.get(targetId);
    if (old != null) clearTimeout(old);
    setLocks((prev) => {
      const next = new Map(prev);
      next.set(targetId, allyTemplateId);
      return next;
    });
    const tid = window.setTimeout(() => {
      setLocks((prev) => {
        const next = new Map(prev);
        next.delete(targetId);
        return next;
      });
      lockTimers.delete(targetId);
    }, LOCK_TTL_MS);
    lockTimers.set(targetId, tid);
  }

  // ---- 伤害飘字（随机漂移 + 分道）----
  type FloatText = {
    id: string;
    roleId: string;
    text: string;
    isCrit: boolean;
    isHeal: boolean;
    dx: number; // 水平漂移起点
    yOffset: number; // 垂直起点微调，分道用
  };
  const [floatTexts, setFloatTexts] = createSignal<FloatText[]>([]);
  const floatTimers = new Map<string, number>();
  const roleLaneIdx = new Map<string, number>(); // 每个角色的车道轮换 0/1/2
  function spawnFloat(
    roleId: string,
    text: string,
    isCrit = false,
    isHeal = false
  ) {
    // 三车道基础漂移 [-14, 0, 14]，叠加轻微随机抖动
    const lane = ((roleLaneIdx.get(roleId) ?? -1) + 1) % 3;
    roleLaneIdx.set(roleId, lane);
    const baseDx = lane === 0 ? -14 : lane === 1 ? 0 : 14;
    const jitter = Math.floor(Math.random() * 9) - 4; // [-4,4]
    const dx = baseDx + jitter;
    const yOffset = lane * 6 + Math.floor(Math.random() * 5); // 车道间隔 + 轻微随机
    const id = `${roleId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    setFloatTexts((prev) => [
      ...prev,
      { id, roleId, text, isCrit, isHeal, dx, yOffset },
    ]);
    const tid = window.setTimeout(() => {
      setFloatTexts((prev) => prev.filter((f) => f.id !== id));
      floatTimers.delete(id);
    }, FLOAT_TEXT_MS);
    floatTimers.set(id, tid);
  }

  function triggerHitFx(id: string) {
    // 清理旧定时器
    const old = hitFxTimers.get(id);
    if (old != null) clearTimeout(old);
    // 添加到集合
    setHitFxIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // 定时移除
    const tid = window.setTimeout(() => {
      setHitFxIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      hitFxTimers.delete(id);
    }, HIT_FX_MS);
    hitFxTimers.set(id, tid);
  }

  function triggerCastFx(id: string) {
    const old = castFxTimers.get(id);
    if (old != null) clearTimeout(old);
    setCastFxIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const tid = window.setTimeout(() => {
      setCastFxIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      castFxTimers.delete(id);
    }, CAST_FX_MS);
    castFxTimers.set(id, tid);
  }

  // ---- 阵列 ----
  const [allies, setAllies] = createSignal<RoleInstance[]>([]);
  const [allyBench, setAllyBench] = createSignal<RoleInstance[]>([]);
  const [enemies, setEnemies] = createSignal<RoleInstance[]>([]);
  const [enemyQueue, setEnemyQueue] = createSignal<RoleInstance[]>([]);

  // ---- 配队配置（战前设置）----
  const [setupMode, setSetupMode] = createSignal(true);
  const [cfgAlliesOn, setCfgAlliesOn] = createSignal<RoleTemplate[]>([]);
  const [cfgAlliesBench, setCfgAlliesBench] = createSignal<RoleTemplate[]>([]);
  const [cfgEnemiesOn, setCfgEnemiesOn] = createSignal<RoleTemplate[]>([]);
  const [cfgEnemiesQueue, setCfgEnemiesQueue] = createSignal<RoleTemplate[]>([]);
  const MAX_ALLY_ON = 4;
  const MAX_ALLY_BENCH = 6;
  const MAX_ENEMY_ON = 5;

  // 敌方新进场节奏（简单规则）
  let nextEnemySpawnTick = 0;

  function commitRoleUpdate(updated: RoleInstance) {
    if (updated.side === "ally") {
      setAllies((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...updated } : r))
      );
    } else {
      setEnemies((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...updated } : r))
      );
    }
    // 更新 HP 拖尾
    updateGhostHpForRole(updated);
  }

  function pushLog(text: string) {
    setLogLines((prev) => {
      const line = `[t${tick()}] ${text}`;
      const arr = [...prev, line];
      if (arr.length > 200) arr.shift();
      return arr;
    });
  }

  function firstAlive(list: RoleInstance[]): RoleInstance | undefined {
    return list.find((r) => r.alive);
  }

  function firstAliveTarget(side: Side): RoleInstance | undefined {
    return side === "ally" ? firstAlive(enemies()) : firstAlive(allies());
  }

  function lowestHpAlive(list: RoleInstance[]): RoleInstance | undefined {
    let chosen: RoleInstance | undefined;
    let chosenRatio = Number.POSITIVE_INFINITY;
    for (const r of list) {
      if (!r.alive) continue;
      const ratio = r.hp / Math.max(1, r.template.maxHp);
      if (ratio < chosenRatio) {
        chosen = r;
        chosenRatio = ratio;
      }
    }
    return chosen;
  }

  function applyHeal(target: RoleInstance, amount: number) {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.template.maxHp, target.hp + amount);
    const healed = Math.max(0, target.hp - before);
    if (healed <= 0) return;
    // 刷新
    commitRoleUpdate(target);
    // 飘字（绿色）
    spawnFloat(target.id, `+${healed}`, false, true);
  }

  function applyDamage(
    target: RoleInstance,
    amount: number,
    opts?: { isCrit?: boolean; sourceId?: string }
  ) {
    if (!target.alive) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      target.alive = false;
      pushLog(
        `${target.side === "ally" ? "我方" : "敌方"} ${
          target.template.name
        } 倒下`
      );
    }
    // 触发响应式刷新（替换为新对象）
    commitRoleUpdate(target);
    // 受击特效
    triggerHitFx(target.id);
    // 飘字
    spawnFloat(target.id, String(amount), Boolean(opts?.isCrit));
  }

  function tryNormalAttack(attacker: RoleInstance) {
    if (!attacker.alive) return;
    const interval = attacker.template.attackIntervalTicks;
    if (tick() - attacker.lastAttackTick < interval) return;
    // 普攻按模板配置执行
    const na = attacker.template.normalAttack ?? { type: "damage", damageFactor: 1 };
    if (na.type === "heal") {
      const list = attacker.side === "ally" ? allies() : enemies();
      const targetHeal = lowestHpAlive(list);
      if (!targetHeal) return;
      const amount = Math.max(
        1,
        Math.floor(attacker.template.maxHp * na.healPercentOfSelfMaxHp)
      );
      applyHeal(targetHeal, amount);
      attacker.lastAttackTick = tick();
      pushLog(
        `${attacker.side === "ally" ? "我方" : "敌方"} ${
          attacker.template.name
        } 普攻 治疗 ${targetHeal.template.name} ${amount}`
      );
      return;
    }
    // damage 普攻
    const target = firstAliveTarget(attacker.side);
    if (!target) return;
    const isCrit = Math.random() < CRIT_RATE;
    const dmg = computeDamage(
      attacker,
      target,
      (na.damageFactor ?? 1) * (isCrit ? CRIT_MULTIPLIER : 1)
    );
    applyDamage(target, dmg, { isCrit, sourceId: attacker.id });
    if (attacker.side === "ally") setLockTarget(target.id, attacker.template.id);
    attacker.lastAttackTick = tick();
    pushLog(
      `${attacker.side === "ally" ? "我方" : "敌方"} ${
        attacker.template.name
      } 普攻 对 ${target.template.name} 造成 ${dmg}`
    );
  }

  function tryCastSkill(caster: RoleInstance) {
    if (!caster.alive || !caster.template.skill) return;
    const s = caster.template.skill;
    if (caster.skillGauge < caster.template.maxSkillGauge) return;

    // 重置技能条（释放条件：仅需技能条满）
    caster.skillGauge = 0;

    // 释放技能会提高精神熵（上限封顶）
    if (caster.template.maxEntropy > 0) {
      caster.entropy = Math.min(
        caster.template.maxEntropy,
        caster.entropy + (s as any).costEntropy
      );
    }

    if (s.type === "buff") {
      const buff: Buff = {
        name: s.name,
        endTick: tick() + s.durationTicks,
        defenseBonus: s.defenseBonus,
        regenPerSecond: s.regenPerSecond,
        nextRegenTick: tick() + TICKS_PER_SECOND,
      };
      caster.buffs.push(buff);
      pushLog(
        `${caster.side === "ally" ? "我方" : "敌方"} ${
          caster.template.name
        } 施放技能「${s.name}」`
      );
      // 刷新施法者侧（熵/技能条/增益）
      commitRoleUpdate(caster);
      // 释放特效
      triggerCastFx(caster.id);
      return;
    }

    if (s.type === "damage") {
      const target = firstAliveTarget(caster.side);
      if (!target) return;
      const isCrit = Math.random() < CRIT_RATE;
      const dmg = computeDamage(
        caster,
        target,
        s.damageFactor * (isCrit ? CRIT_MULTIPLIER : 1)
      );
      applyDamage(target, dmg, { isCrit, sourceId: caster.id });
      if (caster.side === "ally") setLockTarget(target.id, caster.template.id);
      pushLog(
        `${caster.side === "ally" ? "我方" : "敌方"} ${
          caster.template.name
        } 技能「${s.name}」 对 ${target.template.name} 造成 ${dmg}`
      );
      // 刷新施法者侧（熵/技能条）
      commitRoleUpdate(caster);
      // 释放特效
      triggerCastFx(caster.id);
    }
    if (s.type === "heal") {
      const list = caster.side === "ally" ? allies() : enemies();
      const target = lowestHpAlive(list);
      if (!target) return;
      const amount = Math.max(
        1,
        Math.floor(caster.template.maxHp * s.healPercentOfSelfMaxHp)
      );
      applyHeal(target, amount);
      pushLog(
        `${caster.side === "ally" ? "我方" : "敌方"} ${
          caster.template.name
        } 技能「${s.name}」 治疗 ${target.template.name} ${amount}`
      );
      // 刷新施法者侧（熵/技能条）
      commitRoleUpdate(caster);
      // 释放特效
      triggerCastFx(caster.id);
    }
  }

  function tickPerSecondUpdates(list: RoleInstance[], side: Side) {
    for (const r of list) {
      if (!r.alive) continue;
      // 每秒 熵-1、技能+1
      if (r.template.maxEntropy > 0) r.entropy = Math.max(0, r.entropy - 1);
      if (r.template.maxSkillGauge > 0)
        r.skillGauge = Math.min(r.template.maxSkillGauge, r.skillGauge + 1);
      // Buff 持续&回复
      if (r.buffs.length > 0) {
        r.buffs = r.buffs.filter((b) => b.endTick > tick());
        for (const b of r.buffs) {
          if (b.regenPerSecond && (b.nextRegenTick ?? 0) <= tick()) {
            r.hp = Math.min(r.template.maxHp, r.hp + b.regenPerSecond);
            b.nextRegenTick = tick() + TICKS_PER_SECOND;
          }
        }
      }
      // 逐个角色替换以确保 UI 刷新
      commitRoleUpdate(r);
    }
  }

  function stepOneTick() {
    const t = tick() + 1;
    setTick(t);

    // 每秒更新（对齐到 60 的倍数）
    if (t % TICKS_PER_SECOND === 0) {
      tickPerSecondUpdates(allies(), "ally");
      tickPerSecondUpdates(enemies(), "enemy");
    }

    // 攻击
    for (const r of allies()) tryNormalAttack(r);
    for (const r of enemies()) tryNormalAttack(r);

    // 技能释放改为手动点击触发

    // 敌方增援：简单规则（每 3 秒检查一次）
    if (t >= nextEnemySpawnTick) {
      nextEnemySpawnTick = t + 3 * TICKS_PER_SECOND;
      if (
        enemies().filter((e) => e.alive).length < 5 &&
        enemyQueue().length > 0
      ) {
        const [nxt, ...rest] = enemyQueue();
        setEnemyQueue(rest);
        setEnemies((prev) => [...prev, nxt]);
        pushLog(`敌方 ${nxt.template.name} 入场`);
      }
    }
  }

  function haltBattle() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // 清理特效定时器
    for (const tid of hitFxTimers.values()) clearTimeout(tid);
    for (const tid of castFxTimers.values()) clearTimeout(tid);
    hitFxTimers.clear();
    castFxTimers.clear();
  }

  function startBattleFromSetup() {
    // 先切到战斗视图，避免事件批处理造成的视觉延迟
    setSetupMode(false);
    // 基于当前配队配置克隆实例
    const aOn = cfgAlliesOn().map((tpl, i) =>
      cloneFromTemplate("ally", tpl, `a${i + 1}`)
    );
    const aBench = cfgAlliesBench().map((tpl, i) =>
      cloneFromTemplate("ally", tpl, `b${i + 1}`)
    );
    const eOn = cfgEnemiesOn().map((tpl, i) =>
      cloneFromTemplate("enemy", tpl, `e${i + 1}`)
    );
    const eQueue = cfgEnemiesQueue().map((tpl, i) =>
      cloneFromTemplate("enemy", tpl, `q${i + 1}`)
    );

    setAllies(aOn);
    setAllyBench(aBench);
    setEnemies(eOn);
    setEnemyQueue(eQueue);
    setTick(0);
    setLogLines([]);
    setPaused(false);
    nextEnemySpawnTick = 2 * TICKS_PER_SECOND;
    pushLog("战斗开始");

    // 初始化 HP 拖尾地图
    const initMap = new Map<string, number>();
    const initRole = (r: RoleInstance) => {
      initMap.set(r.id, percent(r.hp, r.template.maxHp));
    };
    aOn.forEach(initRole);
    aBench.forEach(initRole);
    eOn.forEach(initRole);
    eQueue.forEach(initRole);
    setGhostHpPctMap(initMap);

    // 启动循环
    if (rafId == null) rafId = requestAnimationFrame(loop);
  }

  function resetBattle() {
    // 使用当前配队配置重开
    haltBattle();
    startBattleFromSetup();
  }

  // 动画时钟：按实际帧率推进逻辑 tick
  let rafId: number | null = null;
  let lastTs = 0;
  let accumulatorMs = 0;

  function loop(ts: number) {
    if (paused()) {
      lastTs = ts;
      rafId = requestAnimationFrame(loop);
      return;
    }
    if (lastTs === 0) lastTs = ts;
    const dt = Math.min(250, ts - lastTs);
    lastTs = ts;
    accumulatorMs += dt * (speed() === 2 ? 2 : 1);
    const msPerTick = 1000 / TICKS_PER_SECOND;
    while (accumulatorMs >= msPerTick) {
      stepOneTick();
      accumulatorMs -= msPerTick;
    }
    rafId = requestAnimationFrame(loop);
  }

  

  onMount(() => {
    // 初始停留在配队模式
    setSetupMode(true);
    // 若配队为空，预填一套默认编队，避免无法开始
    if (cfgAlliesOn().length === 0 && cfgEnemiesOn().length === 0) {
      setCfgAlliesOn([TEMPLATES.heavy_guard, TEMPLATES.medic]);
      setCfgAlliesBench([TEMPLATES.melee_fighter]);
      setCfgEnemiesOn([TEMPLATES.mob]);
      setCfgEnemiesQueue([TEMPLATES.mob, TEMPLATES.mob]);
    }
  });

  onCleanup(() => {
    if (rafId != null) cancelAnimationFrame(rafId);
    // 清理特效定时器
    for (const tid of hitFxTimers.values()) clearTimeout(tid);
    for (const tid of castFxTimers.values()) clearTimeout(tid);
  });

  const alliesAlive = createMemo(() => allies().filter((a) => a.alive));
  const enemiesAlive = createMemo(() => enemies().filter((e) => e.alive));

  function percent(v: number, max: number): number {
    return Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
  }

  function RoleCard(props: { rAccessor: () => RoleInstance }) {
    const r = () => props.rAccessor();
    const def = () => currentDefense(r());
    const hpPct = () => percent(r().hp, r().template.maxHp);
    const sePct = () => percent(r().entropy, r().template.maxEntropy || 1);
    const sgPct = () =>
      percent(r().skillGauge, r().template.maxSkillGauge || 1);
    const ready = () =>
      r().template.skill && r().skillGauge >= r().template.maxSkillGauge;
    const portraitUrl = () => getCharUrlById(r().template.id);
    const ghostPctForThis = () => ghostHpPctMap().get(r().id) ?? hpPct();
    return (
      <div
        ref={(el) => registerCardRef(r().id, el)}
        class="rounded border bg-white shadow-sm p-2 w-48 space-y-2 opacity-100 relative"
        classList={{ "opacity-50": !r().alive }}
      >
        <div class="text-xs text-gray-600">{r().template.profession}</div>
        <div class="text-base font-600">{r().template.name}</div>
        <div class="h-24 w-full overflow-hidden rounded bg-gray-50 flex items-center justify-center relative">
          <Show
            when={portraitUrl()}
            fallback={<span class="text-gray-400 text-xs">无立绘</span>}
          >
            {(url) => (
              <>
                <img
                  src={url()}
                  alt={r().template.name}
                  class="max-h-24 object-contain z-0"
                />
                {/* 受击红色滤镜，随时间淡出 */}
                <Show when={hitFxIds().has(r().id)}>
                  <div
                    class="absolute inset-0 bg-red-500 mix-blend-multiply pointer-events-none z-10"
                    style={{
                      animation: `hit-fade ${HIT_FX_MS}ms ease-out forwards`,
                    }}
                  />
                </Show>
                {/* 释放技能的轻微高亮，淡出 */}
                <Show when={castFxIds().has(r().id)}>
                  <div
                    class="absolute inset-0 bg-sky-300 mix-blend-screen pointer-events-none z-10"
                    style={{
                      animation: `cast-fade ${CAST_FX_MS}ms ease-out forwards`,
                    }}
                  />
                </Show>
              </>
            )}
          </Show>
        </div>
        <div class="space-y-1">
          <Bar
            label="生命"
            value={r().hp}
            max={r().template.maxHp}
            color="emerald"
            ghostPct={ghostPctForThis()}
          />
          <Show when={r().template.maxEntropy > 0}>
            <Bar
              label="精神熵"
              value={r().entropy}
              max={r().template.maxEntropy}
              color="violet"
            />
          </Show>
          <Show when={r().template.maxSkillGauge > 0}>
            <Bar
              label="技能"
              value={r().skillGauge}
              max={r().template.maxSkillGauge}
              color="sky"
            />
          </Show>
        </div>
        <div class="text-xs text-gray-600">防御: {def()}</div>
        <div class="text-xs text-gray-700">
          <Show when={r().template.skill} fallback={<span>无技能</span>}>
            <span>技能: {(r().template.skill as SkillConfig).name}</span>
            <span class="ml-2" classList={{ "text-emerald-600": ready() }}>
              {ready() ? "可释放" : "充能中"}
            </span>
            <button
              class="ml-2 px-2 py-0.5 rounded text-white text-[11px]"
              classList={{
                "bg-emerald-600 hover:bg-emerald-700": ready() && r().alive,
                "bg-gray-300 text-gray-500 cursor-not-allowed": !(
                  ready() && r().alive
                ),
              }}
              disabled={!ready() || !r().alive}
              onClick={() => tryCastSkill(r())}
            >
              释放
            </button>
          </Show>
        </div>
      </div>
    );
  }

  function Bar(props: {
    label: string;
    value: number;
    max: number;
    color: "emerald" | "violet" | "sky";
    ghostPct?: number;
  }) {
    const pct = () => percent(props.value, props.max);
    const baseBg =
      props.color === "emerald"
        ? "bg-emerald-500"
        : props.color === "violet"
        ? "bg-violet-500"
        : "bg-sky-500";
    const hpBg = () =>
      props.label !== "生命"
        ? baseBg
        : pct() <= HP_WARN_RED
        ? "bg-red-500 animate-pulse"
        : pct() <= HP_WARN_YELLOW
        ? "bg-amber-400 animate-pulse"
        : baseBg;

    return (
      <div class={`w-full`}>
        <div class="flex justify-between text-[11px] text-gray-600">
          <span>{props.label}</span>
          <span class="tabular-nums">
            {props.value}/{props.max}
          </span>
        </div>
        <div class="h-2 w-full rounded bg-gray-100 overflow-hidden relative">
          {/* 拖尾条（仅生命），深红色，慢收缩 */}
          <Show when={props.label === "生命"}>
            <div
              class="absolute inset-y-0 left-0 bg-red-300/80"
              style={{
                width: `${props.ghostPct ?? pct()}%`,
                transition: "width 400ms ease-out",
              }}
            />
          </Show>
          {/* 前景条 */}
          <div
            class={`h-2 ${hpBg()} relative`}
            style={{
              width: `${pct()}%`,
              transition: "width 150ms ease-out",
            }}
          />
        </div>
      </div>
    );
  }

  // ---- 配队视图（战前设置）----
  function SetupView() {
    return (
      <div class="p-4 space-y-4">
        <h1 class="text-lg font-600">Wayland 配队设置</h1>
        <div class="grid grid-cols-2 gap-4">
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">角色库</h2>
            <div class="flex flex-wrap gap-2">
              <For each={Object.values(TEMPLATES)}>
                {(tpl) => (
                  <div class="w-48 rounded border bg-white p-2 space-y-1">
                    <div class="text-xs text-gray-600">{tpl.profession}</div>
                    <div class="text-base font-600">{tpl.name}</div>
                    <div class="h-20 w-full overflow-hidden rounded bg-gray-50 flex items-center justify-center">
                      <img
                        src={getCharUrlById(tpl.id) || ""}
                        alt={tpl.name}
                        class="max-h-20 object-contain"
                      />
                    </div>
                    <div class="grid grid-cols-2 gap-1 text-[11px]">
                      <button
                        class="px-1 py-0.5 rounded bg-emerald-600 text-white disabled:opacity-50"
                        disabled={cfgAlliesOn().length >= MAX_ALLY_ON}
                        onClick={() =>
                          setCfgAlliesOn((prev) =>
                            prev.length >= MAX_ALLY_ON ? prev : [...prev, tpl]
                          )
                        }
                      >
                        加我方在场
                      </button>
                      <button
                        class="px-1 py-0.5 rounded bg-emerald-500 text-white disabled:opacity-50"
                        disabled={cfgAlliesBench().length >= MAX_ALLY_BENCH}
                        onClick={() =>
                          setCfgAlliesBench((prev) =>
                            prev.length >= MAX_ALLY_BENCH ? prev : [...prev, tpl]
                          )
                        }
                      >
                        加我方后备
                      </button>
                      <button
                        class="px-1 py-0.5 rounded bg-rose-600 text-white disabled:opacity-50"
                        disabled={cfgEnemiesOn().length >= MAX_ENEMY_ON}
                        onClick={() =>
                          setCfgEnemiesOn((prev) =>
                            prev.length >= MAX_ENEMY_ON ? prev : [...prev, tpl]
                          )
                        }
                      >
                        加敌方在场
                      </button>
                      <button
                        class="px-1 py-0.5 rounded bg-rose-500 text-white"
                        onClick={() => setCfgEnemiesQueue((prev) => [...prev, tpl])}
                      >
                        加敌方队列
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </section>
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">当前配队</h2>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="text-xs text-gray-600 mb-1">我方在场 ({cfgAlliesOn().length}/{MAX_ALLY_ON})</div>
                <div class="flex flex-wrap gap-1">
                  <For each={cfgAlliesOn()}>
                    {(tpl, idx) => (
                      <div class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] flex items-center gap-1">
                        <span>{tpl.name}</span>
                        <button
                          class="px-1 rounded bg-emerald-600 text-white"
                          onClick={() =>
                            setCfgAlliesOn((prev) => prev.filter((_, i) => i !== idx()))
                          }
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-600 mb-1">我方后备 ({cfgAlliesBench().length}/{MAX_ALLY_BENCH})</div>
                <div class="flex flex-wrap gap-1">
                  <For each={cfgAlliesBench()}>
                    {(tpl, idx) => (
                      <div class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] flex items-center gap-1">
                        <span>{tpl.name}</span>
                        <button
                          class="px-1 rounded bg-emerald-600 text-white"
                          onClick={() =>
                            setCfgAlliesBench((prev) => prev.filter((_, i) => i !== idx()))
                          }
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-600 mb-1">敌方在场 ({cfgEnemiesOn().length}/{MAX_ENEMY_ON})</div>
                <div class="flex flex-wrap gap-1">
                  <For each={cfgEnemiesOn()}>
                    {(tpl, idx) => (
                      <div class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] flex items-center gap-1">
                        <span>{tpl.name}</span>
                        <button
                          class="px-1 rounded bg-rose-600 text-white"
                          onClick={() =>
                            setCfgEnemiesOn((prev) => prev.filter((_, i) => i !== idx()))
                          }
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-600 mb-1">敌方队列 ({cfgEnemiesQueue().length})</div>
                <div class="flex flex-wrap gap-1">
                  <For each={cfgEnemiesQueue()}>
                    {(tpl, idx) => (
                      <div class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] flex items-center gap-1">
                        <span>{tpl.name}</span>
                        <button
                          class="px-1 rounded bg-rose-600 text-white"
                          onClick={() =>
                            setCfgEnemiesQueue((prev) => prev.filter((_, i) => i !== idx()))
                          }
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={cfgAlliesOn().length === 0 || cfgEnemiesOn().length === 0}
            onClick={() => startBattleFromSetup()}
          >
            开始战斗
          </button>
          <button
            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => {
              setCfgAlliesOn([]);
              setCfgAlliesBench([]);
              setCfgEnemiesOn([]);
              setCfgEnemiesQueue([]);
            }}
          >
            清空
          </button>
        </div>
      </div>
    );
  }

  // 处于配队模式时渲染配队界面（使用 Show 保证切换的稳定性）
  return (
    <Show when={!setupMode()} fallback={<SetupView />}>
      <div class="p-4 grid grid-cols-[1fr_280px] gap-4">
      <style>{`
      @keyframes hit-fade { from { opacity: 0.55; filter: saturate(1.1); } to { opacity: 0; filter: none; } }
      @keyframes cast-fade { from { opacity: 0.35; } to { opacity: 0; } }
      @keyframes float-up { from { transform: translate(-50%, 0); opacity: 1; } to { transform: translate(-50%, -24px); opacity: 0; } }
      @keyframes float-up-drift { from { transform: translate(-50%, 0); opacity: 1; } to { transform: translate(-50%, -28px); opacity: 0; } }
      `}</style>
      <div
        class="space-y-3 relative"
        ref={(el) => setContainerRef(el as HTMLDivElement)}
      >
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-600">Wayland 沙盒</h1>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-700">tick: {tick()}</span>
            <label class="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={speed() === 2}
                onInput={(e) =>
                  setSpeed((e.currentTarget.checked ? 2 : 1) as 1 | 2)
                }
              />
              2x
            </label>
            <button
              class="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={() => setPaused((p) => !p)}
            >
              {paused() ? "继续" : "暂停"}
            </button>
            <button
              class="px-2 py-1 rounded bg-blue-600 text-white"
              onClick={() => resetBattle()}
            >
              重开
            </button>
              <button
                class="px-2 py-1 rounded bg-amber-600 text-white"
                onClick={() => {
                  haltBattle();
                  setPaused(true);
                  setSetupMode(true);
                }}
              >
                返回配队
              </button>
          </div>
        </div>

        {/* 全局覆盖层：锁定标记与伤害飘字，避免被单卡片裁剪 */}
        <div class="pointer-events-none absolute inset-0 z-50">
          {/* 锁定标记 */}
          <For each={Array.from(locks().entries())}>
            {([targetId, allyTplId]) => {
              const p = getCardPos(targetId);
              if (!p) return null as any;
              return (
                <div
                  class="absolute px-1.5 py-0.5 rounded bg-white/95 shadow text-[10px] flex items-center gap-1"
                  style={{
                    left: `${p.cx}px`,
                    top: `${p.top + 4}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <img
                    src={getCharUrlById(allyTplId) || ""}
                    alt="lock"
                    class="h-4 w-4 object-contain"
                  />
                  <span>锁定</span>
                </div>
              );
            }}
          </For>
          {/* 伤害飘字 */}
          <For each={floatTexts()}>
            {(f) => {
              const p = getCardPos(f.roleId);
              if (!p) return null as any;
              return (
                <div
                  class="absolute"
                  classList={{
                    "text-red-600": !f.isHeal,
                    "text-emerald-600": f.isHeal,
                    "font-extrabold": f.isCrit,
                    "font-semibold": !f.isCrit,
                  }}
                  style={{
                    left: `${p.cx + f.dx}px`,
                    top: `${p.top + 6 + f.yOffset}px`,
                    transform: "translateX(-50%)",
                    animation: `float-up-drift ${FLOAT_TEXT_MS}ms ease-out forwards`,
                    "text-shadow": f.isCrit
                      ? "0 0 2px rgba(255,255,255,0.8)"
                      : "none",
                  }}
                >
                  {f.text}
                </div>
              );
            }}
          </For>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">我方在场</h2>
            <div class="flex flex-row-reverse flex-wrap gap-2">
              <For each={allies()}>
                {(r) => <RoleCard rAccessor={() => r} />}
              </For>
            </div>
          </section>
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">敌方在场</h2>
            <div class="flex flex-wrap gap-2 justify-end">
              <For each={enemies()}>
                {(r) => <RoleCard rAccessor={() => r} />}
              </For>
            </div>
          </section>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">后备</h2>
            <div class="flex flex-wrap gap-2">
              <For each={allyBench()}>
                {(r) => <RoleCard rAccessor={() => r} />}
              </For>
            </div>
          </section>
          <section class="space-y-2">
            <h2 class="text-sm text-gray-600">敌方队列</h2>
            <div class="flex flex-wrap gap-2 justify-end">
              <For each={enemyQueue()}>
                {(r) => <RoleCard rAccessor={() => r} />}
              </For>
            </div>
          </section>
        </div>

        <div class="text-sm text-gray-600">
          <span>
            我方存活: {alliesAlive().length} / {allies().length}
          </span>
          <span class="ml-4">
            敌方存活: {enemiesAlive().length} / {enemies().length}
          </span>
        </div>
      </div>

      <aside class="space-y-2">
        <h2 class="text-sm text-gray-600">战斗日志</h2>
        <div class="h-[520px] overflow-auto rounded border bg-white p-2 text-sm whitespace-pre-wrap">
          <For each={logLines()}>{(l) => <div>{l}</div>}</For>
        </div>
      </aside>
      </div>
    </Show>
  );
}
