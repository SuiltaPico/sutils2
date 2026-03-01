export interface ArtifactLevelBonus {
  level: number;
  cost: number;
  maxHpBonus: number;
  baseAttackMultiplier: number;
  description: string;
}

export interface ArtifactDefinition {
  id: string;
  name: string;
  skillName: string;
  baseSpThreshold: number; // 灵压阈值
  description: string;
  levels: ArtifactLevelBonus[];
}

export const ARTIFACTS: Record<string, ArtifactDefinition> = {
  "001": {
    id: "001",
    name: "断渊",
    skillName: "解神斩",
    baseSpThreshold: 100,
    description: "对敌方造成相当于 基础伤害倍率 * 10 + 超限值 * 0.1 的伤害。以及基础伤害倍率 * 20 + 超限值 * 0.2 的 护盾特攻伤害。",
    levels: [
      { level: 0, cost: 0, maxHpBonus: 20, baseAttackMultiplier: 1.0, description: "基础攻击倍率: 1.0；生命值上限: 20" },
      { level: 1, cost: 20, maxHpBonus: 25, baseAttackMultiplier: 1.0, description: "生命上限 +5" },
      { level: 2, cost: 40, maxHpBonus: 25, baseAttackMultiplier: 1.1, description: "基础攻击倍率提升至 1.1" },
      { level: 3, cost: 60, maxHpBonus: 35, baseAttackMultiplier: 1.1, description: "生命上限 +10" },
      { level: 4, cost: 80, maxHpBonus: 35, baseAttackMultiplier: 1.3, description: "基础攻击倍率提升至 1.3" },
      { level: 5, cost: 100, maxHpBonus: 55, baseAttackMultiplier: 1.3, description: "生命上限 +20" },
      { level: 6, cost: 120, maxHpBonus: 55, baseAttackMultiplier: 1.5, description: "基础攻击倍率提升至 1.5" },
      { level: 7, cost: 150, maxHpBonus: 85, baseAttackMultiplier: 1.7, description: "生命上限 +30；基础攻击倍率提升至 1.7" },
    ]
  }
};
