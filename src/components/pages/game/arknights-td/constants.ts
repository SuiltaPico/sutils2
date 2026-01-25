import { LevelConfig } from "./types";

export const TILE_SIZE = 50;
export const ENEMY_SPAWN_RATE = 2000;

export const ENEMY_TEMPLATES = [
  {
    id: "slug",
    name: "源石虫",
    hp: 550,
    speed: 1.1,
    def: 0,
    atk: 150,
    interval: 1500,
    range: [[0, 0]],
    description: "生命值低，成群出现",
    color: "#ef4444",
  },
  {
    id: "soldier",
    name: "轻步兵",
    hp: 1050,
    speed: 1.2,
    def: 20,
    atk: 250,
    interval: 1000,
    range: [[0, 0], [1, 0]],
    description: "各项属性均衡",
    color: "#dc2626",
  },
  {
    id: "shield",
    name: "重装防御者",
    hp: 3000,
    speed: 0.8,
    def: 100,
    atk: 400,
    interval: 2000,
    range: [[0, 0]],
    description: "生命值高，移动缓慢",
    color: "#991b1b",
  },
  {
    id: "dog",
    name: "猎狗",
    hp: 400,
    speed: 1.9,
    def: 0,
    atk: 120,
    interval: 800,
    range: [[0, 0]],
    description: "移动速度极快",
    color: "#f87171",
  },
] as const;

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    code: "0-1",
    name: "遭遇",
    description: "基础作战演练。熟悉干员部署与阻挡。超宽视野下的长程防线。",
    totalEnemies: 15,
    recommendedLevel: "LV.1",
    initialDp: 10,
    maxLife: 3,
    map: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    // Default waves for legacy levels (simulating random spawn roughly)
    waves: [],
  },
  {
    id: 2,
    code: "1-5",
    name: "交叉路口",
    description: "多路径防御。敌人将从两个方向尝试突破。利用高地阻击侧翼敌人。",
    totalEnemies: 30,
    recommendedLevel: "LV.15",
    map: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2],
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  {
    id: 3,
    code: "2-10",
    name: "核心阵地",
    description:
      "高难挑战。超大范围作战，需要合理分配干员位置以应对来自四方的威胁。",
    totalEnemies: 50,
    recommendedLevel: "LV.35",
    map: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 1, 1, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
      [3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  {
    id: "86d33472-25cb-4259-a0fe-082460a92fd2",
    code: "LOOP",
    name: "循环",
    description: "",
    totalEnemies: 100,
    recommendedLevel: "LV.50",
    initialDp: 99,
    maxLife: 3,
    mapWidth: 20,
    mapHeight: 12,
    entryPattern: "",
    exitPattern: "",
    map: [
      [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [3, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 3, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 3, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 1, 0, 3, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1, 0, 1, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    waves: [
      {
        time: 0,
        enemyType: "soldier",
        count: 50,
        interval: 2000,
        spawnPointIndex: 0,
        targetExitIndex: 0,
        id: "c8qcyh69j",
      },
      {
        time: 10,
        enemyType: "soldier",
        count: 10,
        interval: 1000,
        spawnPointIndex: 1,
        targetExitIndex: 3,
        id: "ij3vfm62g",
      },
      {
        time: 20,
        enemyType: "soldier",
        count: 10,
        interval: 1000,
        spawnPointIndex: 2,
        targetExitIndex: 1,
        id: "u3jln41f2",
      },
      {
        time: 30,
        enemyType: "soldier",
        count: 10,
        interval: 1000,
        spawnPointIndex: 3,
        targetExitIndex: 0,
        id: "i03yrr1wf",
      },
      {
        time: 30,
        enemyType: "soldier",
        count: 10,
        interval: 1000,
        spawnPointIndex: 4,
        targetExitIndex: 0,
        id: "pdqaxn8ad",
      },
      {
        time: 50,
        enemyType: "soldier",
        count: 10,
        interval: 1000,
        spawnPointIndex: 5,
        targetExitIndex: 0,
        id: "94r5ql3op",
      },
    ],
  },
];

// ========== 熔火工业阵营 (Pyroclast Industries) - 2026.01.18 深度还原版本 ==========

export const PYROCLAST_OPS = {
  // 1. 体系核心 - 助燃剂 (Accelerant)
  ACCELERANT: {
    id: 'ACCELERANT',
    type: 'SUPPORTER' as const,
    subType: 'BUFFER',
    label: '助燃剂',
    cost: 14,
    range: [[0, 0], [1, 0]], // 文档：近战挥舞法杖攻击前方1格
    interval: 1600,
    damage: 520,
    hp: 1850,
    def: 220,
    block: 1,
    color: '#ff6600',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 15 },
    skill: {
      name: '过热供能',
      description: '停止攻击转为治疗，范围内友方攻击力+30%，每次攻击附带80点真伤燃烧积蓄',
      sp: 40,
      duration: 25000,
      events: [{
        type: 'ENCHANT' as const,
        value: 80, // 80点积蓄
        radius: 3,
        anomalyType: 'BURN' as const,
        duration: 25000
      }]
    },
    faction: 'PYROCLAST'
  },

  // 2. 体系终结者 - 爆燃 (Detonator)
  DETONATOR: {
    id: 'DETONATOR',
    type: 'CASTER' as const,
    subType: 'CORE',
    label: '爆燃',
    cost: 32,
    range: [[1, 0], [2, 0], [3, 0], [1, 1], [1, -1], [2, 1], [2, -1], [3, 1], [3, -1]],
    interval: 1600,
    damage: 850,
    hp: 1750,
    def: 180,
    block: 1,
    color: '#ff3300',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 120 }, // 极高单点积蓄
    skill: {
      name: '临界点',
      description: '立即引爆全场【灼烧】敌人，结算剩余DOT并造成400%范围伤害及600点积蓄',
      sp: 80,
      duration: 100, // 瞬间技能
      events: [{
        type: 'DETONATE_ANOMALY' as const,
        value: 4.0, // 400% 攻击力伤害
        radius: 2.5,
        anomalyType: 'BURN' as const
      }]
    },
    faction: 'PYROCLAST'
  },

  // 3. 先锋 - 火花 (Spark)
  SPARK: {
    id: 'SPARK',
    type: 'VANGUARD' as const,
    subType: 'CHARGER',
    label: '火花',
    cost: 11,
    range: [[0, 0], [1, 0]],
    interval: 1000,
    damage: 520,
    hp: 1650,
    def: 280,
    block: 1,
    color: '#ff9933',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 30 },
    skill: {
      name: '余烬路径',
      description: '部署后ATK+40%，撤退时在自身及周围4格生成15秒燃烧地块(100积蓄/s)',
      sp: 0,
      duration: 0,
      events: [] // 被动/撤退触发在引擎实现
    },
    faction: 'PYROCLAST'
  },

  // 5. 近卫 - 熔切 (Thermite)
  THERMITE: {
    id: 'THERMITE',
    type: 'GUARD' as const,
    subType: 'DREADNOUGHT',
    label: '熔切',
    cost: 24,
    range: [[0, 0], [1, 0]],
    interval: 1500,
    damage: 1150,
    hp: 3800,
    def: 350,
    block: 1,
    color: '#ff4400',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 150 },
    skill: {
      name: '破甲烧灼',
      description: '下次攻击250%伤害，对灼烧目标无视70%减伤并刷新灼烧时间',
      sp: 4,
      duration: 100,
      events: [] // 攻击触发在引擎实现
    },
    faction: 'PYROCLAST'
  },

  // 6. 近卫 - 链锯 (Chainsaw)
  CHAINSAW: {
    id: 'CHAINSAW',
    type: 'GUARD' as const,
    subType: 'CENTURION',
    label: '链锯',
    cost: 22,
    range: [[0, 0], [1, 0]],
    interval: 1200,
    damage: 780,
    hp: 2750,
    def: 420,
    block: 3,
    color: '#ff5522',
    attackType: 'AOE' as const,
    aoeRadius: 1.0, // 攻击阻挡的所有敌人
    anomalyBuildup: { BURN: 50 },
    skill: {
      name: '野火燎原',
      description: '攻击力+60%，范围扩大，将目标30%积蓄值传染给周围1.5格敌人',
      sp: 35,
      duration: 20000,
      events: []
    },
    faction: 'PYROCLAST'
  },

  // 7. 近卫 - 热浪 (Heatwave)
  HEATWAVE: {
    id: 'HEATWAVE',
    type: 'GUARD' as const,
    subType: 'LORD',
    label: '热浪',
    cost: 18,
    range: [[1, 0], [2, 0], [1, 1], [1, -1]],
    interval: 1300,
    damage: 680,
    hp: 2450,
    def: 380,
    block: 2,
    color: '#ff7744',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 40 },
    skill: {
      name: '焦土推进',
      description: '投掷燃烧瓶造成140%范围伤害，落点生成5秒燃烧地块(120积蓄/s)',
      sp: 25,
      duration: 15000,
      events: []
    },
    faction: 'PYROCLAST'
  },

  // 10. 狙击 - 火绳 (Matchlock)
  MATCHLOCK: {
    id: 'MATCHLOCK',
    type: 'SNIPER' as const,
    subType: 'MARKSMAN',
    label: '火绳',
    cost: 12,
    range: [[1, 0], [2, 0], [3, 0], [1, 1], [1, -1], [2, 1], [2, -1]],
    interval: 1000,
    damage: 580,
    hp: 1450,
    def: 140,
    block: 1,
    color: '#ff8844',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 20 },
    skill: {
      name: '速射模式',
      description: '攻击变为3连射，每次造成60%攻击力的伤害',
      sp: 30,
      duration: 20000,
      events: []
    },
    faction: 'PYROCLAST'
  },

  // 13. 术师 - 焊枪 (Welder)
  WELDER: {
    id: 'WELDER',
    type: 'CASTER' as const,
    subType: 'MECH_ACCORD',
    label: '焊枪',
    cost: 20,
    range: [[1, 0], [2, 0], [3, 0], [1, 1], [1, -1]],
    interval: 1300,
    damage: 380,
    hp: 1600,
    def: 150,
    block: 1,
    color: '#ff7733',
    attackType: 'SINGLE' as const,
    anomalyBuildup: { BURN: 25 },
    skill: {
      name: '持续切割',
      description: '攻击力+40%，每次攻击降低目标5点燃烧抗性(最多10层)',
      sp: 40,
      duration: 25000,
      events: []
    },
    faction: 'PYROCLAST'
  },

  // 14. 术师 - 铸造 (Foundry)
  FOUNDRY: {
    id: 'FOUNDRY',
    type: 'CASTER' as const,
    subType: 'PHALANX',
    label: '铸造',
    cost: 26,
    range: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 0]],
    interval: 2000,
    damage: 950,
    hp: 3200,
    def: 550, // 技能未开启时有额外防御，在引擎处理
    block: 1,
    color: '#dd5533',
    attackType: 'AOE' as const,
    aoeRadius: 1.5,
    anomalyBuildup: { BURN: 0 },
    skill: {
      name: '熔炉领域',
      description: '停止防御加成，范围内所有地块变为高能燃烧地块(200积蓄/s)，每秒100%伤害',
      sp: 50,
      duration: 30000,
      events: []
    },
    faction: 'PYROCLAST'
  },

  // 15. 特种 - 喷射 (Jet)
  JET: {
    id: 'JET',
    type: 'SPECIALIST' as const,
    subType: 'PUSH_STROKER',
    label: '喷射',
    cost: 19,
    range: [[0, 0], [1, 0], [2, 0]],
    interval: 1200,
    damage: 650,
    hp: 2150,
    def: 380,
    block: 2,
    color: '#ff5544',
    attackType: 'AOE' as const,
    aoeRadius: 1.2,
    anomalyBuildup: { BURN: 50 },
    skill: {
      name: '烈焰推进',
      description: '将目标中等力度推开，推开路径上生成8秒燃烧地块',
      sp: 6,
      duration: 100,
      events: []
    },
    faction: 'PYROCLAST'
  }
} as const;


// ========== 基础职业 ==========

export const OP_STATS = {
  DEFENDER: {
    type: "DEFENDER",
    cost: 18,
    range: [[0, 0]],
    interval: 1200,
    damage: 150,
    hp: 1200,
    def: 200,
    block: 3,
    color: "#3b82f6",
    label: "盾卫",
    attackType: 'SINGLE',
    skill: {
      name: "坚守形态",
      description: "防御力大幅提升，阻挡数+1",
      sp: 20,
      duration: 15000,
    },
  },
  GUARD: {
    type: "GUARD",
    cost: 15,
    range: [
      [0, 0],
      [1, 0],
    ],
    interval: 1000,
    damage: 280,
    hp: 950,
    def: 100,
    block: 2,
    color: "#eab308",
    label: "近卫",
    attackType: 'SINGLE',
    skill: {
      name: "强力击",
      description: "攻击力提升，攻击间隔缩短",
      sp: 15,
      duration: 10000,
    },
  },
  SNIPER: {
    type: "SNIPER",
    cost: 12,
    range: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [2, 1],
      [2, -1],
    ],
    interval: 900,
    damage: 200,
    hp: 600,
    def: 50,
    block: 0,
    color: "#ef4444",
    label: "射手",
    attackType: 'SINGLE',
    skillAttackSpeedBuff: 0.66, // 1/1.5 approx
    skill: {
      name: "战术咏唱",
      description: "攻击速度大幅提升",
      sp: 30,
      duration: 12000,
    },
  },
  CASTER: {
    type: "CASTER",
    cost: 25,
    range: [
      [1, 0],
      [2, 0],
      [3, 0],
      [1, 1],
      [1, -1],
      [2, 1],
      [2, -1],
    ],
    interval: 2500,
    damage: 600,
    hp: 750,
    def: 40,
    block: 0,
    color: "#a855f7",
    label: "术师",
    attackType: 'AOE',
    aoeRadius: 1.5,
    attackSound: "MAGIC",
    skill: {
      name: "炎爆",
      description: "下次攻击爆炸范围扩大，伤害提升",
      sp: 20,
      duration: 10000,
    },
  },
} as const;
