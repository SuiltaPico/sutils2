import { Position, OperatorTemplate, GameStats, Operator, Direction } from './types';

export const PlacementRules = {
  /**
   * 检查干员是否可以放置在指定位置
   */
  canPlace: (
    opTemplate: OperatorTemplate,
    pos: Position,
    map: number[][],
    existingOperators: Operator[],
    stats: GameStats
  ): { allowed: boolean; reason?: string } => {
    const { x, y } = pos;
    const rows = map.length;
    const cols = map[0].length;

    // 1. 边界检查
    if (y < 0 || y >= rows || x < 0 || x >= cols) {
      return { allowed: false, reason: '超出地图边界' };
    }

    // 2. 部署数量检查
    if (stats.currentDeployment >= stats.maxDeployment) {
      return { allowed: false, reason: '已达到最大部署上限' };
    }

    // 3. 费用检查
    if (stats.dp < opTemplate.cost) {
      return { allowed: false, reason: '部署费用不足' };
    }

    // 4. 地块类型检查 (0: 高地, 1: 地面, 2: 刷怪点, 3: 蓝门)
    const tileType = map[y][x];
    const isRanged = opTemplate.type === 'SNIPER' || opTemplate.type === 'CASTER';
    
    if (isRanged && tileType !== 0) {
      return { allowed: false, reason: '远程干员只能部署在高地' };
    }
    if (!isRanged && tileType !== 1) {
      return { allowed: false, reason: '近战干员只能部署在地面' };
    }

    // 5. 占用检查
    const isOccupied = existingOperators.some(o => o.x === x && o.y === y);
    if (isOccupied) {
      return { allowed: false, reason: '该位置已有干员' };
    }

    return { allowed: true };
  },

  /**
   * 根据滑动手势计算部署方向
   */
  calculateDirection: (
    startPos: Position,
    currentRawPos: { rawX: number; rawY: number },
    tileSize: number
  ): Direction => {
    const dx = (currentRawPos.rawX / tileSize) - (startPos.x + 0.5);
    const dy = (currentRawPos.rawY / tileSize) - (startPos.y + 0.5);
    
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      return dy > 0 ? 'DOWN' : 'UP';
    }
  }
};
