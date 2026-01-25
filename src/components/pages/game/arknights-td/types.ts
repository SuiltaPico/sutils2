export type Position = { x: number; y: number };
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// 八大异常积蓄赛道
export type AnomalyType = 
  | 'BURN'        // 燃烧 - 持续伤害
  | 'FREEZE'      // 冻结 - 完全停止
  | 'CORROSION'   // 腐蚀 - 真实伤害DOT
  | 'APOPTOSIS'   // 凋亡 - 百分比扣血
  | 'PANIC'       // 恐慌 - 易伤+乱走
  | 'SILENCE'     // 沉默 - 禁技能
  | 'SLOTH'       // 迟缓 - 减速
  | 'PARALYSIS';  // 麻痹 - 定身+打断

export interface AnomalyBuildup {
  type: AnomalyType;
  value: number;      // 当前积蓄值
  threshold: number;  // 爆发阈值 (通常1000)
}

export interface AnomalyEffect {
  type: AnomalyType;
  duration: number;   // 剩余持续时间 (ms)
  maxDuration: number; // 总持续时间
  value?: number;     // 效果数值 (如每0.5s伤害百分比)
  attackerAtk?: number; // 触发者的攻击力，用于计算基于ATK的DOT
}

// 地块效果定义 (如燃烧地块)
export interface TileEffect {
  id: string;
  x: number;
  y: number;
  type: 'BURN';
  potency: number; // 每秒积蓄效能
  duration: number; // 剩余时间 (ms)
  maxDuration: number;
}

export interface WaveEvent {
    id: string;
    time: number; // seconds
    enemyType: string;
    count: number;
    interval: number; // ms
    spawnPointIndex: number;
    targetExitIndex?: number; // Optional: which exit (blue gate) to target
}

export interface LevelConfig {
    id: string | number;
    code: string;
    name: string;
    description: string;
    map: number[][];
    totalEnemies: number;
    recommendedLevel: string;
    initialDp?: number;
    maxLife?: number;
    mapWidth?: number;
    mapHeight?: number;
    waves?: WaveEvent[];
    entryPattern?: string; // Image URL for red gates
    exitPattern?: string;  // Image URL for blue gates
    maxDeployment?: number;
}

export interface TileData {
    type: 'GROUND' | 'HIGH_GROUND' | 'FORBIDDEN';
    height: 'LOW' | 'HIGH' | 'VERY_HIGH';
    isDeployable: boolean;
    blocksVision: boolean;
}

export interface EnemyTemplate {
  id: string;
  name: string;
  hp: number;
  speed: number;
  def: number;
  atk: number;
  interval: number;
  range: number[][];
  description: string;
  color?: string;
  pattern?: string; // Image URL for the enemy
  isCustom?: boolean;
  // 异常抗性 (数值型，参考公式计算)
  anomalyResistance?: Partial<Record<AnomalyType, number>>;
}

export interface SkillEvent {
  type: 'HEAL' | 'STUN' | 'BUFF_ATK' | 'DP_GAIN' | 'DAMAGE_ALL' | 'DETONATE_ANOMALY' | 'ENCHANT';
  value: number;
  radius?: number;
  anomalyType?: AnomalyType; // 用于 ENCHANT 和 DETONATE_ANOMALY
  duration?: number; // 用于 ENCHANT 的持续时间
}

export interface OperatorTemplate {
  id: string;
  type: 'DEFENDER' | 'GUARD' | 'SNIPER' | 'CASTER' | 'VANGUARD' | 'SUPPORTER' | 'SPECIALIST';
  subType?: string; // 职业分支：'MARKSMAN', 'HEAVYWEIGHT', 'DREADNOUGHT', 'CHAINSAW', 'MEDIC', 'BUFFER' 等
  label: string;
  cost: number;
  range: number[][];
  interval: number;
  damage: number;
  hp: number;
  def: number;
  block: number;
  color: string;
  attackType?: 'SINGLE' | 'AOE' | 'TRUE_AOE' | 'HEAL';
  damageMultiplier?: number; // Multiply base damage (e.g. 1.5 for 150%)
  aoeRadius?: number;
  skillAttackSpeedBuff?: number; // Multiply interval by this when skill active
  pattern?: string; // Image URL for the operator
  attackSound?: string; // Audio URL for attack
  skillSound?: string; // Audio URL for skill activation
  // 异常积蓄能力
  anomalyBuildup?: Partial<Record<AnomalyType, number>>; // 每次攻击造成的积蓄值
  skill: {
    name: string;
    description: string;
    sp: number;
    duration: number;
    events?: SkillEvent[];
  };
  isCustom?: boolean;
  faction?: string; // 阵营：'PYROCLAST' 等
}

export interface Enemy {
  id: string;
  templateId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  def: number;
  path: Position[];
  pathIndex: number;
  frozen: boolean;
  attackTimer: number;
  direction: Direction;
  color?: string;
  // 异常积蓄系统
  anomalies: AnomalyBuildup[]; // 当前积蓄值
  anomalyEffects: AnomalyEffect[]; // 已触发的异常效果
}

export interface Operator {
  id: string;
  templateId?: string;
  x: number;
  y: number;
  type: 'DEFENDER' | 'GUARD' | 'SNIPER' | 'CASTER' | 'VANGUARD' | 'SUPPORTER' | 'SPECIALIST';
  direction: Direction;
  attackTimer: number;
  range: Position[];
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  skillActive: boolean;
  skillTimer: number;
  // 附魔系统 (由增幅者干员施加)
  enchantment?: {
    type: AnomalyType;
    value: number; // 每次攻击附加的积蓄值
    duration: number; // 剩余持续时间
  };
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  type: 'ARROW' | 'MAGIC';
}

export interface VisualEffect {
  id: string;
  x: number;
  y: number;
  type: 'EXPLOSION' | 'FLASH' | 'BURN' | 'HEAL' | 'FREEZE' | 'CORROSION' | 'CHAIN_HEAL';
  duration: number;
  maxDuration: number;
  radius: number;
  targetId?: string; // 用于追踪特效目标
  fromId?: string; // 用于链接特效的起点
}

export interface GameStats {
  dp: number;
  kills: number;
  lives: number;
  totalEnemies: number;
  wave: number;
  maxDeployment: number;
  currentDeployment: number;
}

export type GameEventType = 
  | 'GAME_START'
  | 'GAME_OVER'
  | 'GAME_WON'
  | 'ENEMY_SPAWN'
  | 'ENEMY_LEAK'
  | 'ENEMY_DIE'
  | 'OPERATOR_DEPLOY'
  | 'OPERATOR_ATTACK'
  | 'OPERATOR_DIE'
  | 'SKILL_ACTIVATE'
  | 'HIT'
  | 'EFFECT_SPAWN';

export interface GameEvent {
  type: GameEventType;
  payload?: any;
}
