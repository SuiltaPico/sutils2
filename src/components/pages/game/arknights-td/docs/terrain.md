# 地形与地图机制设计文档

本文件用于记录 Arknights-TD 的地图地形系统、高度层级及视线机制。

---

## 1. 地块基础属性 (Tile Properties)

地图由网格化的地块 (Tile) 组成，每个地块拥有以下基础属性：

### 1.1 可部署性 (Deployability)
- **可部署 (Deployable)**: 允许放置干员。
- **不可部署 (Undeployable)**: 禁止放置干员（如敌人出生点、保护目标点、深坑、墙体等）。

---

## 2. 地形高度分级 (Height Levels)

为了增加战术深度，引入了三档高度系统。这不仅决定了谁能部署在哪里，还影响战斗中的索敌逻辑。

### Level 1: 地面 (Ground)
- **定义**: 战场的最底层平面。
- **部署规则**: 仅允许部署 **地面干员** (如近卫 GUARD、盾卫 DEFENDER、特种 SPECIALIST 等)。
- **视线**: 不会遮挡任何视线。
- **敌人交互**: 大部分非飞行敌人在此层移动，会被地面干员阻挡。

### Level 2: 高台 (High Ground)
- **定义**: 略高于地面的平台。
- **部署规则**: 仅允许部署 **高台干员** (如射手 SNIPER、术师 CASTER、辅助 SUPPORTER 等)。
- **视线**: 不会遮挡视线。通常拥有更好的射界。
- **敌人交互**: 地面敌人无法直接攻击高台干员（除非拥有远程攻击能力），也无法通过高台地块。

### Level 3: 特高 (Very High / Obstacle)
- **定义**: 巨大的墙体、柱子或障碍物，高度超过普通高台。
- **部署规则**: **完全禁止部署** (无论地面还是高台干员)。
- **视线遮挡 (Block LOS)**: 
    - 它是实体的视线障碍。
    - **机制**: 如果攻击者与目标之间的连线穿过了 Level 3 地块，则判定为“无视野”，无法进行普通攻击。
    - **战术价值**: 
        - 创造“安全走廊”：敌人在墙后移动时，我方远程无法攻击。
        - 分割战场：强行改变远程单位的输出环境。

---

## 3. 视线遮挡机制 (Line of Sight - LOS)

### 3.1 判定逻辑
- 战斗系统在进行索敌（寻找攻击目标）时，会进行 LOS 检查。
- 只有当 `hasLineOfSight(attacker, target) === true` 时，目标才会被锁定。
- 抛射类技能（如迫击炮）或特定干员特性可以**无视 LOS**。

### 3.2 跨越机制 (预留)
- 未来可设计特殊单位（如“攻城手”或“飞行单位”），它们拥有 `ignoreTerrainHeight: true` 的属性，可以无视 Level 3 的视线遮挡进行攻击或移动。

---

## 4. 地图编辑器数据结构参考

```typescript
export interface TileData {
    // 坐标
    x: number;
    y: number;
    
    // 部署类型
    type: 'GROUND' | 'HIGH_GROUND' | 'FORBIDDEN';
    
    // 高度层级
    height: 'LOW'     // Level 1
          | 'HIGH'    // Level 2
          | 'VERY_HIGH'; // Level 3 (Blocks Vision)
    
    // 视觉资源
    texture?: string;
}
```

