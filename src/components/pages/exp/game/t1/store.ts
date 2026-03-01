import { createStore } from "solid-js/store";
import { AppState, RunState, MapNode, Difficulty, PlayerData } from "./types";
import { CardData, SUITS, RANKS } from "./core";
import { RELIC_LIBRARY, getRandomRelic } from "./items";

export interface RewardItem {
  id: string;
  type: 'GOLD' | 'CARD' | 'RELIC';
  name: string;
  description: string;
  icon: string;
  amount?: number;
  cardData?: CardData;
  relicId?: string;
}

export const [gameState, setGameState] = createStore<{
  appState: AppState;
  run: RunState;
  pendingRewards: RewardItem[];
  playerData: PlayerData;
}>({
  appState: AppState.MENU,
  run: {
    currentFloor: 1,
    floorIntroPlayed: true,
    map: [],
    currentNodeId: null,
    playerHp: 30,
    playerMaxHp: 30,
    deck: [],
    gold: 0,
    relics: [],
    difficulty: 0,
  },
  pendingRewards: [],
  playerData: {
    merits: 100, // Starting merits for testing
    unlockedArtifacts: ["001"],
    selectedArtifactId: "001",
    unlockedTalents: [],
    discoveredRelics: [],
    discoveredClues: [],
    maxUnlockedDifficulty: 0,
  },
});

export const createDeck = (): CardData[] => {
  const deck: CardData[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const color = suit === "♥" || suit === "♦" ? "red" : "black";
      deck.push({
        suit,
        rank,
        color,
        id: Math.random().toString(36).substr(2, 9),
      });
    }
  }
  // Standard Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Fixed Map Layout to match the requested design
export const generateMap = (floor: number): MapNode[] => {
  const nodes: MapNode[] = [
    // Column 0: Start
    { id: 'n-0', type: 'BATTLE', x: 10, y: 50, next: ['n-1-t', 'n-1-m', 'n-1-b'], status: 'AVAILABLE' },
    
    // Column 1
    { id: 'n-1-t', type: 'BATTLE', x: 30, y: 25, next: ['n-2-t', 'n-2-h'], status: 'LOCKED' },
    { id: 'n-1-m', type: 'EVENT', x: 30, y: 50, next: ['n-2-m'], status: 'LOCKED' },
    { id: 'n-1-b', type: 'BATTLE', x: 30, y: 75, next: ['n-2-b', 'n-2-l'], status: 'LOCKED' },
    
    // Column 2 (Middle) & Extensions (High/Low)
    { id: 'n-2-h', type: 'ELITE', x: 50, y: 5, next: ['n-3-t'], status: 'LOCKED' }, // High path
    { id: 'n-2-t', type: 'EVENT', x: 50, y: 25, next: ['n-3-t'], status: 'LOCKED' },
    { id: 'n-2-m', type: 'REST', x: 50, y: 50, next: ['n-3-m'], status: 'LOCKED' },
    { id: 'n-2-b', type: 'EVENT', x: 50, y: 75, next: ['n-3-b'], status: 'LOCKED' },
    { id: 'n-2-l', type: 'ELITE', x: 50, y: 95, next: ['n-3-b'], status: 'LOCKED' }, // Low path
    
    // Column 3
    { id: 'n-3-t', type: 'BATTLE', x: 70, y: 25, next: ['n-end'], status: 'LOCKED' },
    { id: 'n-3-m', type: 'BATTLE', x: 70, y: 50, next: ['n-end'], status: 'LOCKED' },
    { id: 'n-3-b', type: 'BATTLE', x: 70, y: 75, next: ['n-end'], status: 'LOCKED' },
    
    // Column 4: End
    { id: 'n-end', type: 'BOSS', x: 90, y: 50, next: [], status: 'LOCKED' },
  ];

  return nodes;
};

export const startRun = (difficulty: Difficulty = 0) => {
    const deck = createDeck();
    const map = generateMap(1);
    setGameState({
        appState: AppState.MAP,
        run: {
            currentFloor: 1,
            floorIntroPlayed: false,
            map,
            currentNodeId: null,
            playerHp: 30,
            playerMaxHp: 30,
            deck,
            gold: 0,
            relics: [],
            difficulty,
        }
    });
};

export const completeCurrentNode = () => {
  const currentId = gameState.run.currentNodeId;
  if (!currentId) return;

  const currentNode = gameState.run.map.find(n => n.id === currentId);
  if (!currentNode) return;

  setGameState('run', 'map', (nodes) => nodes.map(n => {
    if (n.id === currentId) return { ...n, status: 'COMPLETED' };
    if (currentNode.next.includes(n.id)) return { ...n, status: 'AVAILABLE' };
    return n;
  }));
  
  setGameState('run', 'currentNodeId', null);
};

export const generateRewards = (nodeType: string) => {
    const rewards: RewardItem[] = [
        { id: 'gold-' + Math.random().toString(36).substr(2, 4), type: 'GOLD', name: '髓玉', description: '获得 25 枚髓玉', icon: '💰', amount: 25 },
    ];

    // Add 3 random cards
    const fullDeck = createDeck();
    const cardRewards = fullDeck.slice(0, 3).map((c, i) => ({
        id: 'card-' + c.id,
        type: 'CARD' as const,
        name: `${c.suit} ${c.rank}`,
        description: '一张新牌，将其加入您的牌组',
        icon: c.suit,
        cardData: c
    }));

    // Add a random relic if it's an Elite or Boss node, or a 20% chance on a regular battle
    const shouldAddRelic = nodeType === 'ELITE' || nodeType === 'BOSS' || Math.random() < 0.2;
    const relicRewards: RewardItem[] = [];
    if (shouldAddRelic) {
        const relic = getRandomRelic();
        relicRewards.push({
            id: 'relic-' + relic.id,
            type: 'RELIC',
            name: relic.name,
            description: relic.description,
            icon: relic.icon,
            relicId: relic.id
        });
    }
    
    setGameState('pendingRewards', [...rewards, ...cardRewards, ...relicRewards]);
};
