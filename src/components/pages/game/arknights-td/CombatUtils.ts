import { Enemy, OperatorTemplate } from './types';

/**
 * 核心战斗公式
 */
export const CombatUtils = {
  /**
   * 计算最终伤害（考虑防御力）
   * 基础公式：伤害 = 攻击力 * (100 / (100 + 防御力))
   */
  calculateDamage: (baseDamage: number, defenderDef: number): number => {
    const reduction = 100 / (100 + (defenderDef || 0));
    return baseDamage * reduction;
  },

  /**
   * 计算异常积蓄值（考虑异常抗性）
   * 采用英雄联盟护甲公式: 积蓄 = 效能 * (100 / (100 + 抗性))
   */
  calculateAnomalyBuildup: (potency: number, resistance: number): number => {
    const reduction = 100 / (100 + (resistance || 0));
    return potency * reduction;
  },

  /**
   * 获取干员的攻击范围坐标（考虑方向）
   */
  getRangeTiles: (op: { x: number, y: number, direction: string }, range: number[][]) => {
    return range.map(r => {
      let rx = r[0], ry = r[1];
      if (op.direction === 'RIGHT') { rx = r[0]; ry = r[1]; }
      if (op.direction === 'LEFT') { rx = -r[0]; ry = -r[1]; }
      if (op.direction === 'UP') { rx = r[1]; ry = -r[0]; }
      if (op.direction === 'DOWN') { rx = -r[1]; ry = r[0]; }
      return { x: op.x + rx, y: op.y + ry };
    });
  },

  /**
   * 判断目标是否在范围内 (暂未实现视线遮挡)
   */
  isInRange: (target: { x: number, y: number }, rangeTiles: { x: number, y: number }[], tolerance = 0.5): boolean => {
    return rangeTiles.some(t => 
      Math.abs(target.x - t.x) < tolerance && 
      Math.abs(target.y - t.y) < tolerance
    );
  },

  /**
   * 视线检查 (Line of Sight)
   * @param p1 起点
   * @param p2 终点
   * @param map 地图数据，用于检查 VERY_HIGH 地块
   */
  hasLineOfSight: (p1: { x: number, y: number }, p2: { x: number, y: number }, map: number[][]): boolean => {
     // TODO: 真正的视线检查算法 (Bresenham 或 射线投射)
     // 目前简单返回 true，等待后续实现
     return true;
  },

  /**
   * 计算两点间距离
   */
  getDistance: (p1: { x: number, y: number }, p2: { x: number, y: number }): number => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }
};

