import { createSignal, Accessor, Setter } from 'solid-js';
import { Position, Operator, OperatorTemplate } from './types';
import { TILE_SIZE } from './constants';
import { GameEngine } from './useGameEngine';
import { PlacementRules } from './PlacementRules';

export interface GameInteraction {
  dragOp: Accessor<string | null>;
  setDragOp: Setter<string | null>;
  pointerPos: Accessor<{ x: number, y: number } | null>;
  setPointerPos: Setter<{ x: number, y: number } | null>;
  hoverTile: Accessor<Position | null>;
  setHoverTile: Setter<Position | null>;
  placingOp: Accessor<{ type: string, pos: Position } | null>;
  setPlacingOp: Setter<{ type: string, pos: Position } | null>;
  selectedOpId: Accessor<string | null>;
  setSelectedOpId: Setter<string | null>;
  
  // Helpers
  getEventPos: (e: MouseEvent | TouchEvent, canvasRef: HTMLCanvasElement | undefined, zoom: number) => {
    x: number;
    y: number;
    rawX: number;
    rawY: number;
  } | null;
  handlePointerUp: (
    e: MouseEvent | TouchEvent, 
    canvasRef: HTMLCanvasElement | undefined, 
    zoom: number,
    engine: GameEngine,
    currentMap: number[][],
    getOpTemplate: (id: string) => OperatorTemplate | undefined
  ) => void;
}

export function useGameInteraction() {
  const [dragOp, setDragOp] = createSignal<string | null>(null);
  const [pointerPos, setPointerPos] = createSignal<{ x: number, y: number } | null>(null);
  const [hoverTile, setHoverTile] = createSignal<Position | null>(null);
  const [placingOp, setPlacingOp] = createSignal<{ type: string, pos: Position } | null>(null);
  const [selectedOpId, setSelectedOpId] = createSignal<string | null>(null);

  const getEventPos = (e: MouseEvent | TouchEvent, canvasRef: HTMLCanvasElement | undefined, zoom: number) => {
    const rect = canvasRef?.getBoundingClientRect();
    if (!rect) return null;
    let clientX, clientY;
    if ('touches' in e && (e as TouchEvent).touches.length > 0) {
      clientX = (e as TouchEvent).touches[0].clientX;
      clientY = (e as TouchEvent).touches[0].clientY;
    } else if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const offsetX = (clientX - rect.left) / zoom;
    const offsetY = (clientY - rect.top) / zoom;

    return {
      x: Math.floor(offsetX / TILE_SIZE),
      y: Math.floor(offsetY / TILE_SIZE),
      rawX: offsetX,
      rawY: offsetY
    };
  };

  const handlePointerUp = (
    e: MouseEvent | TouchEvent, 
    canvasRef: HTMLCanvasElement | undefined, 
    zoom: number,
    engine: GameEngine,
    currentMap: number[][],
    getOpTemplate: (id: string) => OperatorTemplate | undefined
  ) => {
    const pos = getEventPos(e, canvasRef, zoom);
    const pOp = placingOp();
    const dOp = dragOp();
    const hTile = pos ? { x: pos.x, y: pos.y } : hoverTile();
    
    // 1. 处理部署确认 (确认方向并正式部署)
    if (pOp && pos) {
      const dir = PlacementRules.calculateDirection(pOp.pos, pos, TILE_SIZE);
      const opStat = getOpTemplate(pOp.type);
      if (!opStat) return;

      const newOp: Operator = {
        id: Math.random().toString(),
        x: pOp.pos.x, y: pOp.pos.y,
        type: opStat.type, direction: dir, attackTimer: 0, range: [],
        hp: opStat.hp, maxHp: opStat.hp, sp: 0, maxSp: opStat.skill.sp,
        skillActive: false, skillTimer: 0,
        templateId: opStat.id
      };
      engine.setOperators(prev => [...prev, newOp]);
      engine.setStats(prev => ({ ...prev, dp: prev.dp - opStat.cost }));
      setPlacingOp(null);
    } 
    // 2. 处理初始放置 (拖拽到地块上)
    else if (dOp && hTile) {
      const opInfo = getOpTemplate(dOp);
      if (!opInfo) {
        setDragOp(null);
        return;
      }

      const check = PlacementRules.canPlace(
        opInfo,
        hTile,
        currentMap,
        engine.operators(),
        engine.stats()
      );

      if (check.allowed) {
        setPlacingOp({ type: dOp, pos: { ...hTile } });
      } else {
        console.log(`Cannot place: ${check.reason}`);
      }
      setDragOp(null);
    } 
    // 3. 处理点击选中
    else if (pos) {
      const clickedOp = engine.operators().find(o => Math.abs(o.x - pos.x) < 0.1 && Math.abs(o.y - pos.y) < 0.1);
      if (clickedOp) {
        setSelectedOpId(clickedOp.id);
      } else {
        setSelectedOpId(null);
      }
    }
  };

  return {
    dragOp, setDragOp, pointerPos, setPointerPos, hoverTile, setHoverTile, placingOp, setPlacingOp, selectedOpId, setSelectedOpId,
    getEventPos, handlePointerUp
  };
}
