import { onMount, onCleanup, Accessor, createEffect } from "solid-js";
import { TILE_SIZE } from "../constants";
import { Enemy, Operator, Projectile, Position, Direction, OperatorTemplate, EnemyTemplate, LevelConfig, VisualEffect, GameStats, TileEffect } from "../types";
import { PlacementRules } from "../PlacementRules";

// Image Cache for patterns
const imageCache: Map<string, HTMLImageElement> = new Map();
const isUrl = (str: string) => str.includes('/') || str.includes('.') || str.startsWith('data:');

const getImage = (url: string): HTMLImageElement | null => {
  if (!url || !isUrl(url)) return null;
  if (imageCache.has(url)) return imageCache.get(url)!;
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return img;
};

interface GameCanvasProps {
  canvasRef: (el: HTMLCanvasElement) => void;
  map: Accessor<number[][]>;
  rows: Accessor<number>;
  cols: Accessor<number>;
  enemies: Accessor<Enemy[]>;
  operators: Accessor<Operator[]>;
  projectiles: Accessor<Projectile[]>;
  effects: Accessor<VisualEffect[]>;
  tileEffects?: Accessor<TileEffect[]>;
  zoom: Accessor<number>;
  handlePointerMove: (e: MouseEvent | TouchEvent) => void;
  handlePointerUp: (e: MouseEvent | TouchEvent) => void;
  placingOp: Accessor<{ type: string, pos: Position } | null>;
  hoverTile: Accessor<Position | null>;
  dragOp: Accessor<string | null>;
  getOpTemplate: (id: string) => OperatorTemplate | undefined;
  getEnemyTemplate: (id: string) => EnemyTemplate | undefined;
  levelConfig?: Accessor<LevelConfig>;
  stats: Accessor<GameStats>;
}

export const GameCanvas = (props: GameCanvasProps) => {
  let internalCanvasRef: HTMLCanvasElement | undefined;

  const draw = () => {
    if (!internalCanvasRef) return;
    const ctx = internalCanvasRef.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, internalCanvasRef.width, internalCanvasRef.height);

    const map = props.map();
    const rows = props.rows();
    const cols = props.cols();

    // Map
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const type = map[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        ctx.fillStyle = type === 0 ? '#14171c' :
          type === 1 ? '#20242a' :
            type === 2 ? '#331a1a' :
              type === 3 ? '#1a2433' :
                '#000';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(px - 1, py - 1, 2, 2);

        if (type === 2) {
          const entryPattern = props.levelConfig?.()?.entryPattern;
          const entryImg = entryPattern ? getImage(entryPattern) : null;
          
          if (entryImg && entryImg.complete && entryImg.naturalWidth !== 0) {
            ctx.drawImage(entryImg, px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else {
            ctx.fillStyle = 'rgba(255, 77, 77, 0.1)';
            ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 10, py + 5); ctx.lineTo(px + 5, py + 5); ctx.lineTo(px + 5, py + 10);
            ctx.moveTo(px + TILE_SIZE - 10, py + 5); ctx.lineTo(px + TILE_SIZE - 5, py + 5); ctx.lineTo(px + TILE_SIZE - 5, py + 10);
            ctx.moveTo(px + 10, py + TILE_SIZE - 5); ctx.lineTo(px + 5, py + TILE_SIZE - 5); ctx.lineTo(px + 5, py + TILE_SIZE - 10);
            ctx.moveTo(px + TILE_SIZE - 10, py + TILE_SIZE - 5); ctx.lineTo(px + TILE_SIZE - 5, py + TILE_SIZE - 5); ctx.lineTo(px + TILE_SIZE - 5, py + TILE_SIZE - 10);
            ctx.stroke();
            ctx.fillStyle = '#ff4d4d'; 
            
            const icon = (entryPattern && !isUrl(entryPattern)) ? entryPattern : '入口';
            ctx.font = icon.length > 2 ? 'bold 8px Arial' : 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(icon, px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 3);
          }
        }
        if (type === 3) {
          const exitPattern = props.levelConfig?.()?.exitPattern;
          const exitImg = exitPattern ? getImage(exitPattern) : null;

          if (exitImg && exitImg.complete && exitImg.naturalWidth !== 0) {
            ctx.drawImage(exitImg, px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else {
            ctx.fillStyle = 'rgba(77, 166, 255, 0.1)';
            ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = '#4da6ff'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 10, py + 5); ctx.lineTo(px + 5, py + 5); ctx.lineTo(px + 5, py + 10);
            ctx.moveTo(px + TILE_SIZE - 10, py + 5); ctx.lineTo(px + TILE_SIZE - 5, py + 5); ctx.lineTo(px + TILE_SIZE - 5, py + 10);
            ctx.moveTo(px + 10, py + TILE_SIZE - 5); ctx.lineTo(px + 5, py + TILE_SIZE - 5); ctx.lineTo(px + 5, py + TILE_SIZE - 10);
            ctx.moveTo(px + TILE_SIZE - 10, py + TILE_SIZE - 5); ctx.lineTo(px + TILE_SIZE - 5, py + TILE_SIZE - 5); ctx.lineTo(px + TILE_SIZE - 5, py + TILE_SIZE - 10);
            ctx.stroke();
            ctx.fillStyle = '#4da6ff';
            
            const icon = (exitPattern && !isUrl(exitPattern)) ? exitPattern : '基地';
            ctx.font = icon.length > 2 ? 'bold 8px Arial' : 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(icon, px + TILE_SIZE / 2, py + TILE_SIZE / 2 + 3);
          }
        }
      }
    }

    // Tile Effects (Burning Tiles)
    props.tileEffects?.().forEach(eff => {
      if (eff.type === 'BURN') {
        const px = eff.x * TILE_SIZE;
        const py = eff.y * TILE_SIZE;
        const progress = 1 - (eff.duration / eff.maxDuration);
        
        ctx.save();
        // 绘制橙红色地块底色
        ctx.fillStyle = `rgba(255, 69, 0, ${0.2 * (1 - progress)})`;
        ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        
        // 动态火焰粒子
        const time = Date.now() / 200;
        for (let i = 0; i < 4; i++) {
          const fx = px + TILE_SIZE * (0.2 + 0.6 * Math.abs(Math.sin(time + i)));
          const fy = py + TILE_SIZE * (0.8 - 0.6 * Math.abs(Math.cos(time + i * 0.5)));
          
          const gradient = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8);
          gradient.addColorStop(0, 'rgba(255, 140, 0, 0.4)');
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(fx, fy, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });

    // Operators
    props.operators().forEach(op => {
      const px = op.x * TILE_SIZE;
      const py = op.y * TILE_SIZE;
      const template = props.getOpTemplate(op.templateId || op.type);
      if (!template) return;

      ctx.save();
      ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);

      const pattern = template.pattern;
      const img = pattern ? getImage(pattern) : null;

      if (img && img.complete && img.naturalWidth !== 0) {
        // Draw character pattern
        ctx.drawImage(img, -TILE_SIZE / 2 + 5, -TILE_SIZE / 2 + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        // Border
        ctx.strokeStyle = template.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-TILE_SIZE / 2 + 5, -TILE_SIZE / 2 + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-TILE_SIZE / 2 + 8, -TILE_SIZE / 2 + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        ctx.fillStyle = '#222';
        ctx.strokeStyle = template.color;
        ctx.lineWidth = 2;
        ctx.fillRect(-TILE_SIZE / 2 + 5, -TILE_SIZE / 2 + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        ctx.strokeRect(-TILE_SIZE / 2 + 5, -TILE_SIZE / 2 + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        ctx.fillStyle = template.color;
        ctx.font = `${Math.floor(TILE_SIZE * 0.35)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Use custom pattern as icon if provided and not a URL, otherwise fallback to class icon
        const icon = (pattern && !isUrl(pattern)) ? pattern : (op.type === 'DEFENDER' ? '🛡️' : op.type === 'GUARD' ? '⚔️' : op.type === 'CASTER' ? '🔮' : '🏹');
        ctx.fillText(icon, 0, 0);
      }

      ctx.fillStyle = '#fff';
      const triSize = 4;
      ctx.beginPath();
      if (op.direction === 'UP') {
        ctx.moveTo(0, -TILE_SIZE / 2 + 2); ctx.lineTo(-triSize, -TILE_SIZE / 2 + 2 + triSize); ctx.lineTo(triSize, -TILE_SIZE / 2 + 2 + triSize);
      } else if (op.direction === 'DOWN') {
        ctx.moveTo(0, TILE_SIZE / 2 - 2); ctx.lineTo(-triSize, TILE_SIZE / 2 - 2 - triSize); ctx.lineTo(triSize, TILE_SIZE / 2 - 2 - triSize);
      } else if (op.direction === 'LEFT') {
        ctx.moveTo(-TILE_SIZE / 2 + 2, 0); ctx.lineTo(-TILE_SIZE / 2 + 2 + triSize, -triSize); ctx.lineTo(-TILE_SIZE / 2 + 2 + triSize, triSize);
      } else {
        ctx.moveTo(TILE_SIZE / 2 - 2, 0); ctx.lineTo(TILE_SIZE / 2 - 2 - triSize, -triSize); ctx.lineTo(TILE_SIZE / 2 - 2 - triSize, triSize);
      }
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px + 8, py + 4, TILE_SIZE - 16, 3);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(px + 8, py + 4, (TILE_SIZE - 16) * (op.hp / op.maxHp), 3);

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, 2);
      ctx.fillStyle = op.skillActive ? '#fbbf24' : '#60a5fa';
      ctx.fillRect(px + 8, py + 8, (TILE_SIZE - 16) * (op.sp / op.maxSp), 2);

      const pct = Math.min(op.attackTimer / template.interval, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(px + 12, py + TILE_SIZE - 6, TILE_SIZE - 24, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 12, py + TILE_SIZE - 6, (TILE_SIZE - 24) * pct, 2);
    });

    // Enemies
    props.enemies().forEach(e => {
      const px = e.x * TILE_SIZE + TILE_SIZE / 2;
      const py = e.y * TILE_SIZE + TILE_SIZE / 2;

      const template = props.getEnemyTemplate(e.templateId);
      const pattern = template?.pattern;
      const img = pattern ? getImage(pattern) : null;

      if (img && img.complete && img.naturalWidth !== 0) {
        ctx.drawImage(img, px - TILE_SIZE * 0.25, py - TILE_SIZE * 0.25, TILE_SIZE * 0.5, TILE_SIZE * 0.5);
      } else if (pattern && !isUrl(pattern)) {
        ctx.fillStyle = e.color || '#ef4444';
        ctx.font = `${Math.floor(TILE_SIZE * 0.3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pattern, px, py);
      } else {
        ctx.fillStyle = e.color || '#ef4444';
        ctx.beginPath();
        ctx.arc(px, py, TILE_SIZE * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // 异常状态指示器
      if (e.anomalyEffects && e.anomalyEffects.length > 0) {
        const iconSize = 8;
        const startX = px - (e.anomalyEffects.length * iconSize) / 2;
        e.anomalyEffects.forEach((effect, idx) => {
          const ix = startX + idx * iconSize;
          const iy = py - TILE_SIZE * 0.3;
          
          // 绘制异常图标
          ctx.fillStyle = getAnomalyColor(effect.type);
          ctx.beginPath();
          ctx.arc(ix, iy, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // 燃烧特效
          if (effect.type === 'BURN') {
            const time = Date.now() / 100;
            for (let i = 0; i < 3; i++) {
              const angle = (time + i * 120) % 360;
              const rad = (angle * Math.PI) / 180;
              const flameX = px + Math.cos(rad) * 10;
              const flameY = py - 10 + Math.sin(time + i) * 5;
              
              const gradient = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, 5);
              gradient.addColorStop(0, 'rgba(255, 100, 50, 0.6)');
              gradient.addColorStop(0.5, 'rgba(255, 50, 0, 0.4)');
              gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
              
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.arc(flameX, flameY, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        });
      }

      // 异常积蓄条
      if (e.anomalies && e.anomalies.length > 0) {
        const barWidth = 30;
        const barHeight = 2;
        let yOffset = -18;
        
        e.anomalies.forEach(anomaly => {
          if (anomaly.value > 0) {
            const progress = anomaly.value / anomaly.threshold;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(px - barWidth/2, py + yOffset, barWidth, barHeight);
            ctx.fillStyle = getAnomalyColor(anomaly.type);
            ctx.fillRect(px - barWidth/2, py + yOffset, barWidth * progress, barHeight);
            yOffset -= 3;
          }
        });
      }

      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px - 15, py - 20, 30, 3);
      ctx.fillStyle = '#10b981'; ctx.fillRect(px - 15, py - 20, 30 * (e.hp / e.maxHp), 3);
    });

    function getAnomalyColor(type: string): string {
      const colors: Record<string, string> = {
        BURN: '#ff4444',
        FREEZE: '#4488ff',
        CORROSION: '#44ff44',
        APOPTOSIS: '#222222',
        PANIC: '#ff8844',
        SILENCE: '#ffffff',
        SLOTH: '#8b4513',
        PARALYSIS: '#ffff44',
      };
      return colors[type] || '#ffffff';
    }

    // Projectiles
    props.projectiles().forEach(p => {
      const px = p.x * TILE_SIZE + TILE_SIZE / 2;
      const py = p.y * TILE_SIZE + TILE_SIZE / 2;
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    });

    // Visual Effects
    props.effects().forEach(eff => {
      const px = eff.x * TILE_SIZE + TILE_SIZE / 2;
      const py = eff.y * TILE_SIZE + TILE_SIZE / 2;
      const progress = 1 - (eff.duration / eff.maxDuration);
      
      if (eff.type === 'EXPLOSION') {
        ctx.save();
        ctx.beginPath();
        const currentRadius = eff.radius * TILE_SIZE * progress;
        ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
        
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, currentRadius);
        gradient.addColorStop(0, `rgba(168, 85, 247, ${0.6 * (1 - progress)})`);
        gradient.addColorStop(0.7, `rgba(168, 85, 247, ${0.3 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.strokeStyle = `rgba(192, 132, 252, ${0.8 * (1 - progress)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (eff.type === 'BURN') {
        // 燃烧爆发特效
        ctx.save();
        const currentRadius = eff.radius * TILE_SIZE * (1 + progress * 0.5);
        
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + progress * Math.PI;
          const flameX = px + Math.cos(angle) * currentRadius * 0.7;
          const flameY = py + Math.sin(angle) * currentRadius * 0.7;
          
          const gradient = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, currentRadius * 0.4);
          gradient.addColorStop(0, `rgba(255, 150, 50, ${0.8 * (1 - progress)})`);
          gradient.addColorStop(0.5, `rgba(255, 80, 0, ${0.5 * (1 - progress)})`);
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(flameX, flameY, currentRadius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (eff.type === 'HEAL') {
        // 治疗特效
        ctx.save();
        const currentRadius = eff.radius * TILE_SIZE * (1 - progress * 0.3);
        
        // 绿色光环
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, currentRadius);
        gradient.addColorStop(0, `rgba(16, 185, 129, ${0.6 * (1 - progress)})`);
        gradient.addColorStop(0.7, `rgba(16, 185, 129, ${0.3 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 十字
        ctx.strokeStyle = `rgba(52, 211, 153, ${0.9 * (1 - progress)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px - currentRadius * 0.4, py);
        ctx.lineTo(px + currentRadius * 0.4, py);
        ctx.moveTo(px, py - currentRadius * 0.4);
        ctx.lineTo(px, py + currentRadius * 0.4);
        ctx.stroke();
        
        // 粒子
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const particleX = px + Math.cos(angle) * currentRadius * (0.5 + progress * 0.5);
          const particleY = py + Math.sin(angle) * currentRadius * (0.5 + progress * 0.5);
          
          ctx.fillStyle = `rgba(52, 211, 153, ${0.7 * (1 - progress)})`;
          ctx.beginPath();
          ctx.arc(particleX, particleY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (eff.type === 'FREEZE') {
        // 冻结特效
        ctx.save();
        const currentRadius = eff.radius * TILE_SIZE * (1 + progress * 0.3);
        
        // 蓝色冰晶
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, currentRadius);
        gradient.addColorStop(0, `rgba(68, 136, 255, ${0.7 * (1 - progress)})`);
        gradient.addColorStop(0.7, `rgba(68, 136, 255, ${0.4 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(68, 136, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 冰晶线条
        ctx.strokeStyle = `rgba(147, 197, 253, ${0.8 * (1 - progress)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + progress * Math.PI * 0.5;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(angle) * currentRadius * 0.8, py + Math.sin(angle) * currentRadius * 0.8);
          ctx.stroke();
        }
        ctx.restore();
      } else if (eff.type === 'CORROSION') {
        // 腐蚀特效
        ctx.save();
        const currentRadius = eff.radius * TILE_SIZE * (1 + progress * 0.4);
        
        // 绿色腐蚀雾气
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, currentRadius);
        gradient.addColorStop(0, `rgba(68, 255, 68, ${0.5 * (1 - progress)})`);
        gradient.addColorStop(0.7, `rgba(34, 197, 94, ${0.3 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 腐蚀气泡
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2 + progress * Math.PI * 2;
          const bubbleX = px + Math.cos(angle) * currentRadius * 0.6;
          const bubbleY = py + Math.sin(angle) * currentRadius * 0.6 - progress * 10;
          
          ctx.fillStyle = `rgba(74, 222, 128, ${0.6 * (1 - progress)})`;
          ctx.beginPath();
          ctx.arc(bubbleX, bubbleY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (eff.type === 'CHAIN_HEAL') {
        // 治疗链接特效
        if (eff.fromId && eff.targetId) {
          const fromOp = props.operators().find(o => o.id === eff.fromId);
          const toOp = props.operators().find(o => o.id === eff.targetId);
          
          if (fromOp && toOp) {
            const fx = fromOp.x * TILE_SIZE + TILE_SIZE / 2;
            const fy = fromOp.y * TILE_SIZE + TILE_SIZE / 2;
            const tx = toOp.x * TILE_SIZE + TILE_SIZE / 2;
            const ty = toOp.y * TILE_SIZE + TILE_SIZE / 2;
            
            ctx.save();
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.7 * (1 - progress)})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -progress * 20;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    });

    // Interaction UI
    const pOp = props.placingOp();
    const hTile = props.hoverTile();
    if (pOp && hTile) {
      const dir = PlacementRules.calculateDirection(pOp.pos, { rawX: hTile.x * TILE_SIZE + TILE_SIZE / 2, rawY: hTile.y * TILE_SIZE + TILE_SIZE / 2 }, TILE_SIZE);
      const template = props.getOpTemplate(pOp.type);
      if (!template) return;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      template.range.forEach(r => {
        let rx = r[0], ry = r[1];
        if (dir === 'RIGHT') { rx = r[0]; ry = r[1]; }
        if (dir === 'LEFT') { rx = -r[0]; ry = -r[1]; }
        if (dir === 'UP') { rx = r[1]; ry = -r[0]; }
        if (dir === 'DOWN') { rx = -r[1]; ry = r[0]; }
        const tx = pOp.pos.x + rx; const ty = pOp.pos.y + ry;
        if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) {
          ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      });
      const cx = pOp.pos.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = pOp.pos.y * TILE_SIZE + TILE_SIZE / 2;
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy);
      if (dir === 'RIGHT') ctx.lineTo(cx + 40, cy); if (dir === 'LEFT') ctx.lineTo(cx - 40, cy);
      if (dir === 'UP') ctx.lineTo(cx, cy - 40); if (dir === 'DOWN') ctx.lineTo(cx, cy + 40);
      ctx.stroke();
    } else {
      const dOp = props.dragOp();
      if (dOp && hTile) {
        const template = props.getOpTemplate(dOp);
        if (!template) return;

        const cx = hTile.x * TILE_SIZE; const cy = hTile.y * TILE_SIZE;
        const check = PlacementRules.canPlace(
          template,
          hTile,
          map,
          props.operators(),
          props.stats()
        );
        const valid = check.allowed;

        ctx.fillStyle = valid ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(cx, cy, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = valid ? '#3b82f6' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(cx + 2, cy + 2, TILE_SIZE - 4, TILE_SIZE - 4);

        if (valid) {
          ctx.save();
          ctx.translate(cx + TILE_SIZE / 2, cy + TILE_SIZE / 2);
          ctx.globalAlpha = 0.5;
          ctx.font = `${Math.floor(TILE_SIZE * 0.4)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const icon = template.type === 'DEFENDER' ? '🛡️' : template.type === 'GUARD' ? '⚔️' : template.type === 'CASTER' ? '🔮' : '🏹';
          ctx.fillText(icon, 0, 0);
          ctx.restore();
        }
      }
    }
  };

  createEffect(() => {
    // Redraw when anything relevant changes
    props.enemies();
    props.operators();
    props.projectiles();
    props.effects();
    props.tileEffects?.();
    props.placingOp();
    props.hoverTile();
    props.dragOp();
    props.stats();
    draw();
  });

  return (
    <canvas
      ref={el => {
        internalCanvasRef = el;
        props.canvasRef(el);
      }}
      width={props.cols() * TILE_SIZE}
      height={props.rows() * TILE_SIZE}
      class="shadow-2xl touch-none"
      onMouseMove={props.handlePointerMove}
      onTouchMove={(e) => { e.preventDefault(); props.handlePointerMove(e); }}
      onMouseUp={props.handlePointerUp}
      onTouchEnd={(e) => { e.preventDefault(); props.handlePointerUp(e); }}
      style={{
        transform: `scale(${props.zoom()})`,
        "transform-origin": "top center"
      }}
    />
  );
};
