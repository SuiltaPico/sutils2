# 长生塔 - Roguelike Card Game (v1)

Uses SolidJS + Tailwind CSS.

## Structure

- `t1/index.tsx`: Main entry point, handles view switching.
- `t1/store.ts`: Global state (Run data, Map, Player Deck).
- `t1/types.ts`: Type definitions.
- `t1/core.ts`: Game logic (Card patterns, Suit buffs).
- `t1/views/`:
  - `MainMenu.tsx`: Start game.
  - `Map.tsx`: Navigate nodes.
  - `Battle.tsx`: The core combat loop (adapted from t0).
- `t1/components/`: Reusable UI components.

## How to Play

1. Start a run from Main Menu.
2. Select a node on the Map.
3. Battle enemies using poker hands.
   - Combine cards to form hands (Pair, Straight, Flush, etc.).
   - Suit combos give buffs (Shield, True Dmg, Heal, Poison).
   - High level hands trigger extra attacks.
4. Win to proceed.

## Development

- Based on design doc in `../t0/游戏设计.md`.
- Prototype logic from `../t0`.
