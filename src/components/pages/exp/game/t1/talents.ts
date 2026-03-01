export interface Talent {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  effect: string;
  dependencies: string[]; // IDs of talents that must be unlocked first
  x: number; // For tree visualization
  y: number; // For tree visualization
}

export const TALENT_TREE: Talent[] = [
  {
    id: "start_gold_1",
    name: "开局髓玉 I",
    description: "每次入塔前，额外携带少量髓玉。",
    cost: 20,
    icon: "髓",
    effect: "初始髓玉 +10",
    dependencies: [],
    x: 0,
    y: 0,
  },
  {
    id: "start_gold_2",
    name: "开局髓玉 II",
    description: "每次入塔前，额外携带更多髓玉。",
    cost: 50,
    icon: "髓",
    effect: "初始髓玉 +20",
    dependencies: ["start_gold_1"],
    x: 0,
    y: 1,
  },
  {
    id: "start_level_1",
    name: "初登宝塔",
    description: "法器在入塔时已完成初步祭炼。",
    cost: 50,
    icon: "祭",
    effect: "开局法器等级为 1",
    dependencies: [],
    x: 1,
    y: 0,
  },
  {
    id: "new_events_1",
    name: "见闻广博",
    description: "在塔内会遇到更多奇特的事情。",
    cost: 80,
    icon: "闻",
    effect: "解锁新事件",
    dependencies: [],
    x: -1,
    y: 0,
  },
  {
    id: "relic_unlock_1",
    name: "奇珍解锁",
    description: "解锁一些稀有的奇珍供在塔内发现。",
    cost: 100,
    icon: "珍",
    effect: "解锁高级奇珍",
    dependencies: ["new_events_1"],
    x: -1,
    y: 1,
  },
];
