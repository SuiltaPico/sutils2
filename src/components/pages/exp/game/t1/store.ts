import { createStore } from "solid-js/store";
import { AppState, RunState, MapNode } from "./types";
import { CardData, SUITS, RANKS } from "./core";

export const [gameState, setGameState] = createStore<{
  appState: AppState;
  run: RunState;
}>({
  appState: AppState.MENU,
  run: {
    currentFloor: 1,
    map: [],
    currentNodeId: null,
    playerHp: 30,
    playerMaxHp: 30,
    deck: [],
    gold: 0,
    relics: [],
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

export const startRun = () => {
    const deck = createDeck();
    const map = generateMap(1);
    setGameState({
        appState: AppState.MAP,
        run: {
            currentFloor: 1,
            map,
            currentNodeId: null,
            playerHp: 30,
            playerMaxHp: 30,
            deck,
            gold: 0,
            relics: [],
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
