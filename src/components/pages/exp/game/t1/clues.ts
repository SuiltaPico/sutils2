export interface Clue {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE';
}

export const CLUE_LIBRARY: Record<string, Clue> = {
  'clue-01': {
    id: 'clue-01',
    name: '破碎的鳞片',
    description: '一片泛着金属光泽的鳞片，不属于任何已知的生物。',
    icon: '🐚',
    rarity: 'COMMON',
  },
  'clue-02': {
    id: 'clue-02',
    name: '染血的家书',
    description: '一封未寄出的信，字里行间透露出对某种“实验”的恐惧。',
    icon: '✉️',
    rarity: 'COMMON',
  },
  'clue-03': {
    id: 'clue-03',
    name: '太岁观察笔记',
    description: '详细记录了太岁在不同频率下的反应，似乎有人在试图操纵它。',
    icon: '📝',
    rarity: 'UNCOMMON',
  },
  'clue-04': {
    id: 'clue-04',
    name: '龙帝印绶残片',
    description: '象征至高权力的印章碎片，为何会出现在长生塔底层？',
    icon: '💠',
    rarity: 'RARE',
  },
};
