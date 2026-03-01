import { Difficulty } from "./types";

export interface DifficultyInfo {
  id: Difficulty;
  name: string;
  hpMult: string;
  dmgMult: string;
  extra: string;
  color: string;
}

export const DIFFICULTY_DATA: DifficultyInfo[] = [
  {
    id: 0,
    name: "镇厄",
    hpMult: "1",
    dmgMult: "1",
    extra: "无额外变化",
    color: "text-emerald-400 border-emerald-500/30",
  },
  {
    id: 1,
    name: "搏动",
    hpMult: "1.25",
    dmgMult: "1",
    extra: "无额外变化",
    color: "text-green-400 border-green-500/30",
  },
  {
    id: 2,
    name: "腐血",
    hpMult: "1.5",
    dmgMult: "1.25",
    extra: "无额外变化",
    color: "text-yellow-400 border-yellow-500/30",
  },
  {
    id: 3,
    name: "禁军",
    hpMult: "1.75",
    dmgMult: "1.25",
    extra: "精英怪必定携带 1 个正面 Buff。",
    color: "text-orange-400 border-orange-500/30",
  },
  {
    id: 4,
    name: "狂乱",
    hpMult: "2",
    dmgMult: "1.5",
    extra: "无额外变化",
    color: "text-red-400 border-red-500/30",
  },
  {
    id: 5,
    name: "枯竭",
    hpMult: "2.5",
    dmgMult: "1.75",
    extra: "商店物价上涨 30%，洗牌惩罚增加。",
    color: "text-rose-400 border-rose-500/30",
  },
  {
    id: 6,
    name: "天蚀",
    hpMult: "4",
    dmgMult: "2",
    extra: "极致挑战，九死一生。",
    color: "text-purple-400 border-purple-500/30",
  },
];
