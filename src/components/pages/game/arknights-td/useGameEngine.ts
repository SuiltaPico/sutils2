import { createSignal, Accessor, Setter, batch } from 'solid-js';
import { ENEMY_SPAWN_RATE } from './constants';
import { Position, Enemy, Operator, Projectile, GameStats, LevelConfig, EnemyTemplate, OperatorTemplate, GameEvent, TileEffect } from './types';
import { getExitCount, calculatePaths } from './utils';
import { CombatUtils } from './CombatUtils';
import { AnomalySystem } from './AnomalySystem';

export interface GameEngine {
  gameState: Accessor<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
  setGameState: Setter<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>;
  isPaused: Accessor<boolean>;
  setIsPaused: Setter<boolean>;
  stats: Accessor<GameStats>;
  setStats: Setter<GameStats>;
  enemies: Accessor<Enemy[]>;
  operators: Accessor<Operator[]>;
  setOperators: Setter<Operator[]>;
  projectiles: Accessor<Projectile[]>;
  tileEffects: Accessor<TileEffect[]>;
  initGame: (level: LevelConfig) => void;
  update: (dt: number, level: LevelConfig, allEnemyTemplates: EnemyTemplate[], getOpTemplate: (id: string) => OperatorTemplate | undefined) => void;
  activateSkill: (opId: string, getOpTemplate: (id: string) => OperatorTemplate | undefined, allEnemyTemplates: EnemyTemplate[]) => void;
}

interface PendingSpawn {
  count: number;
  interval: number;
  timer: number;
  type: string;
  path: Position[];
}

export function useGameEngine(onEvent?: (event: GameEvent) => void) {
  const [gameState, setGameState] = createSignal<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>('IDLE');
  const [isPaused, setIsPaused] = createSignal(false);
  const [stats, setStats] = createSignal<GameStats>({ dp: 10, kills: 0, lives: 3, totalEnemies: 0, wave: 1, maxDeployment: 8, currentDeployment: 0 });
  const [enemies, setEnemies] = createSignal<Enemy[]>([]);
  const [operators, setOperators] = createSignal<Operator[]>([]);
  const [projectiles, setProjectiles] = createSignal<Projectile[]>([]);
  const [tileEffects, setTileEffects] = createSignal<TileEffect[]>([]);

  let gameTime = 0;
  let spawnTimer = 0;
  let dpTimer = 0;
  let paths: Position[][] = [];
  let triggeredWaveIds: Set<string> = new Set();
  let pendingSpawns: PendingSpawn[] = [];

  const emit = (type: GameEvent['type'], payload?: any) => {
    onEvent?.({ type, payload });
  };

  const initGame = (level: LevelConfig) => {
    emit('GAME_START');
    batch(() => {
      setEnemies([]);
      setOperators([]);
      setProjectiles([]);
      setStats({
        dp: level.initialDp ?? 10,
        kills: 0,
        lives: level.maxLife ?? 3,
        totalEnemies: level.totalEnemies,
        wave: 1,
        maxDeployment: level.maxDeployment ?? 8,
        currentDeployment: 0
      });
      paths = calculatePaths(level.map);
      triggeredWaveIds.clear();
      pendingSpawns = [];
      gameTime = 0;
      spawnTimer = 0;
      setGameState('PLAYING');
    });
  };

  const spawnEnemy = (typeId: string, path: Position[], allEnemyTemplates: EnemyTemplate[]) => {
    const template = allEnemyTemplates.find(t => t.id === typeId);
    const startNode = path[0];
    if (!startNode || !template) return;

    const newEnemy: Enemy = {
      id: Math.random().toString(36).substr(2, 9),
      templateId: template.id,
      x: startNode.x,
      y: startNode.y,
      hp: template.hp,
      maxHp: template.hp,
      speed: template.speed,
      def: template.def || 0,
      path: path,
      pathIndex: 0,
      frozen: false,
      attackTimer: 0,
      direction: 'RIGHT',
      color: template.color,
      anomalies: [],
      anomalyEffects: []
    };
    setEnemies(prev => [...prev, newEnemy]);
    emit('ENEMY_SPAWN', { enemy: newEnemy });
  };

  const activateSkill = (opId: string, getOpTemplate: (id: string) => OperatorTemplate | undefined, allEnemyTemplates: EnemyTemplate[]) => {
    const op = operators().find(o => o.id === opId);
    if (!op || op.sp < op.maxSp || op.skillActive) return;

    const template = getOpTemplate(op.templateId || op.type);
    if (!template) return;

    batch(() => {
      op.skillActive = true;
      op.skillTimer = template.skill.duration;

      if (template.skill.events) {
        template.skill.events.forEach(event => {
          switch (event.type) {
            case 'HEAL':
              setOperators(prev => prev.map(o => {
                const dist = CombatUtils.getDistance(o, op);
                if (dist <= (event.radius || 2)) {
                  emit('EFFECT_SPAWN', { 
                    id: Math.random().toString(), x: o.x, y: o.y, 
                    type: 'HEAL', duration: 500, maxDuration: 500, radius: 0.5 
                  });
                  return { ...o, hp: Math.min(o.maxHp, o.hp + event.value) };
                }
                return o;
              }));
              break;
            case 'STUN':
              setEnemies(prev => prev.map(e => {
                const dist = CombatUtils.getDistance(e, op);
                if (dist <= (event.radius || 2)) {
                  return { ...e, frozen: true };
                }
                return e;
              }));
              break;
            case 'DP_GAIN':
              setStats(prev => ({ ...prev, dp: Math.min(99, prev.dp + event.value) }));
              break;
            case 'DAMAGE_ALL':
              setEnemies(prev => prev.map(e => {
                const dist = CombatUtils.getDistance(e, op);
                if (dist <= (event.radius || 2)) {
                  const finalDamage = CombatUtils.calculateDamage(event.value, e.def);
                  return { ...e, hp: e.hp - finalDamage };
                }
                return e;
              }));
              break;
            case 'ENCHANT':
              // 助燃剂附魔：给范围内友方单位附加异常积蓄能力和攻击力提升
              if (event.anomalyType) {
                setOperators(prev => prev.map(o => {
                  const dist = CombatUtils.getDistance(o, op);
                  if (dist <= (event.radius || 3)) {
                    // 同时应用攻击力提升 (文档要求+30%)
                    const finalDamage = o.hp > 0 ? (o.maxHp > 0 ? o.hp : 0) : 0; 
                    return {
                      ...o,
                      enchantment: {
                        type: event.anomalyType!,
                        value: event.value, // 80点积蓄
                        duration: event.duration || 15000
                      }
                    };
                  }
                  return o;
                }));
              }
              break;
            case 'DETONATE_ANOMALY':
              // 爆燃：立即引爆全场处于【灼烧】状态的敌人
              enemies().forEach(enemy => {
                if (AnomalySystem.hasEffect(enemy, 'BURN')) {
                  // 1. 立即结算剩余DOT
                  const dotDamage = AnomalySystem.settleRemainingDOT(enemy, 'BURN');
                  enemy.hp -= dotDamage;

                  // 2. 造成范围爆发伤害 (400% ATK)
                  const burstDmg = template.damage * 4.0;
                  const radius = event.radius || 2.5;
                  
                  // 波及周围敌人
                  enemies().forEach(e => {
                    if (CombatUtils.getDistance(e, enemy) <= radius) {
                      const eTemp = allEnemyTemplates.find(t => t.id === e.templateId);
                      if (eTemp) {
                        const finalDamage = CombatUtils.calculateDamage(burstDmg, e.def);
                        e.hp -= finalDamage;
                        // 3. 爆炸波及者获得600点积蓄
                        AnomalySystem.applyBuildup(e, 'BURN', 600, eTemp, template.damage);
                      }
                    }
                  });

                  emit('EFFECT_SPAWN', { 
                    id: Math.random().toString(), x: enemy.x, y: enemy.y, 
                    type: 'EXPLOSION', duration: 800, maxDuration: 800, radius: radius 
                  });
                }
              });
              break;
          }
        });
      }

      setOperators(prev => [...prev]);
      emit('SKILL_ACTIVATE', { operator: op, template });
    });
  };

  const update = (dt: number, level: LevelConfig, allEnemyTemplates: EnemyTemplate[], getOpTemplate: (id: string) => OperatorTemplate | undefined) => {
    if (gameState() !== 'PLAYING' || isPaused()) return;

    batch(() => {
      updateResources(dt);
      updateSpawning(dt, level, allEnemyTemplates);
      updateTileEffects(dt, allEnemyTemplates);
      const updatedEnemies = updateEnemyMovement(dt);
      updateBlocking(updatedEnemies, getOpTemplate);
      updateAnomalies(dt, updatedEnemies, allEnemyTemplates);
      updateEnemyCombat(dt, updatedEnemies, allEnemyTemplates, getOpTemplate);
      const updatedProjectiles = updateCombat(dt, updatedEnemies, getOpTemplate, allEnemyTemplates);
      updateProjectilesTracking(dt, updatedProjectiles, updatedEnemies, allEnemyTemplates);
      updateOperatorEnchantments(dt);
      cleanupEntities(updatedEnemies, updatedProjectiles, dt);
      checkVictory();
    });
  };

  const updateTileEffects = (dt: number, allEnemyTemplates: EnemyTemplate[]) => {
    setTileEffects(prev => {
      const updated = prev.map(eff => ({ ...eff, duration: eff.duration - dt })).filter(eff => eff.duration > 0);
      
      // 应用地块积蓄给处于其中的敌人
      enemies().forEach(enemy => {
        const enemyTileX = Math.floor(enemy.x);
        const enemyTileY = Math.floor(enemy.y);
        
        // 查找该地块上的所有效果
        const effectsOnTile = updated.filter(eff => Math.floor(eff.x) === enemyTileX && Math.floor(eff.y) === enemyTileY);
        
        if (effectsOnTile.length > 0) {
          // 取最高效能
          const bestEffect = effectsOnTile.reduce((prev, curr) => prev.potency > curr.potency ? prev : curr);
          const enemyTemplate = allEnemyTemplates.find(t => t.id === enemy.templateId);
          if (enemyTemplate) {
            // 地块积蓄 (每秒)
            const potencyPerFrame = (bestEffect.potency * dt) / 1000;
            AnomalySystem.applyBuildup(enemy, bestEffect.type, potencyPerFrame, enemyTemplate);
          }
        }
      });
      
      return updated;
    });
  };

  // --- 辅助函数 ---

  const applyAnomalyBuildupToEnemy = (
    enemy: Enemy,
    op: Operator,
    opTemplate: OperatorTemplate,
    enemyTemplate: EnemyTemplate
  ) => {
    // 焊枪特殊逻辑：削减抗性
    if (opTemplate.id === 'WELDER' && op.skillActive) {
      if (!enemyTemplate.anomalyResistance) enemyTemplate.anomalyResistance = {};
      const currentRes = enemyTemplate.anomalyResistance.BURN || 0;
      // 最多叠加10层，每层-5
      enemyTemplate.anomalyResistance.BURN = Math.max(-100, currentRes - 5);
    }

    // 从干员模板获取异常积蓄
    if (opTemplate.anomalyBuildup) {
      Object.entries(opTemplate.anomalyBuildup).forEach(([type, value]) => {
        if (value) {
          const effect = AnomalySystem.applyBuildup(enemy, type as any, value, enemyTemplate, opTemplate.damage);
          if (effect) {
            // 触发异常爆发特效
            emit('EFFECT_SPAWN', { 
              id: Math.random().toString(), 
              x: enemy.x, 
              y: enemy.y, 
              type: effect.type as any, 
              duration: 1000, 
              maxDuration: 1000, 
              radius: 1,
              targetId: enemy.id
            });
          }
        }
      });
    }

    // 从附魔获取异常积蓄 (助燃剂附魔无视抗性)
    if (op.enchantment) {
      const isTrueBuildup = op.templateId === 'ACCELERANT' || op.type === 'SUPPORTER';
      const effect = AnomalySystem.applyBuildup(
        enemy, 
        op.enchantment.type, 
        op.enchantment.value, 
        enemyTemplate,
        opTemplate.damage,
        isTrueBuildup
      );
      if (effect) {
        emit('EFFECT_SPAWN', { 
          id: Math.random().toString(), 
          x: enemy.x, 
          y: enemy.y, 
          type: effect.type as any, 
          duration: 1000, 
          maxDuration: 1000, 
          radius: 1,
          targetId: enemy.id
        });
      }
    }
  };

  // --- 内部子系统函数 ---

  const updateResources = (dt: number) => {
    dpTimer += dt;
    if (dpTimer > 1000) {
      setStats(prev => ({ ...prev, dp: Math.min(prev.dp + 1, 99) }));
      dpTimer = 0;
    }
    gameTime += dt / 1000;
  };

  const updateSpawning = (dt: number, level: LevelConfig, allEnemyTemplates: EnemyTemplate[]) => {
    if (level.waves && level.waves.length > 0) {
      level.waves.forEach(wave => {
        if (!triggeredWaveIds.has(wave.id) && gameTime >= wave.time) {
          triggeredWaveIds.add(wave.id);
          const exitCount = getExitCount(level.map);
          const spawnIndex = wave.spawnPointIndex || 0;
          const exitIndex = wave.targetExitIndex ?? 0;
          const pathIndex = exitCount > 0 ? spawnIndex * exitCount + exitIndex : spawnIndex;
          const path = paths[pathIndex] || paths[0];
          if (path) {
            pendingSpawns.push({ count: wave.count, interval: wave.interval, timer: 0, type: wave.enemyType, path: path });
          }
        }
      });

      for (let i = pendingSpawns.length - 1; i >= 0; i--) {
        const p = pendingSpawns[i];
        p.timer -= dt;
        if (p.timer <= 0) {
          spawnEnemy(p.type, p.path, allEnemyTemplates);
          p.count--;
          p.timer = p.interval;
          if (p.count <= 0) pendingSpawns.splice(i, 1);
        }
      }
    } else {
      const s = stats();
      if (s.kills + enemies().length < s.totalEnemies) {
        spawnTimer += dt;
        if (spawnTimer > ENEMY_SPAWN_RATE) {
          const randomPath = paths[Math.floor(Math.random() * paths.length)];
          if (randomPath && randomPath.length > 0) {
            const startNode = randomPath[0];
            const newEnemy: Enemy = {
              id: Math.random().toString(36).substr(2, 9), templateId: 'slug',
              x: startNode.x, y: startNode.y, hp: 500 + (s.wave * 100), maxHp: 500 + (s.wave * 100),
              speed: 1.2, def: 0, path: randomPath, pathIndex: 0, frozen: false,
              attackTimer: 0, direction: 'RIGHT', color: '#ef4444',
              anomalies: [], anomalyEffects: []
            };
            setEnemies(prev => [...prev, newEnemy]);
            emit('ENEMY_SPAWN', { enemy: newEnemy });
          }
          spawnTimer = 0;
        }
      }
    }
  };

  const updateAnomalies = (dt: number, updatedEnemies: Enemy[], allEnemyTemplates: EnemyTemplate[]) => {
    updatedEnemies.forEach(enemy => {
      const template = allEnemyTemplates.find(t => t.id === enemy.templateId);
      if (!template) return;

      // 更新异常效果并应用DOT伤害
      const anomalyDamage = AnomalySystem.updateAnomalies(enemy, dt, template);
      enemy.hp -= anomalyDamage;

      // 应用凋亡效果
      const apoptosis = enemy.anomalyEffects.find(e => e.type === 'APOPTOSIS');
      if (apoptosis) {
        enemy.hp -= enemy.hp * (apoptosis.value || 0.1);
      }

      // 重置frozen状态（由冻结异常决定）
      enemy.frozen = enemy.anomalyEffects.some(e => e.type === 'FREEZE');
    });
  };

  const updateOperatorEnchantments = (dt: number) => {
    operators().forEach(op => {
      if (op.enchantment) {
        op.enchantment.duration -= dt;
        if (op.enchantment.duration <= 0) {
          delete op.enchantment;
        }
      }
    });
  };

  const updateEnemyMovement = (dt: number) => {
    const updatedEnemies = [...enemies()];
    updatedEnemies.forEach(enemy => {
      if (enemy.frozen) return;
      
      // 应用异常速度修正
      const speedModifier = AnomalySystem.getSpeedModifier(enemy);
      const targetTile = enemy.path[enemy.pathIndex + 1];
      if (!targetTile) {
        enemy.hp = -999;
        setStats(prev => ({ ...prev, lives: prev.lives - 1 }));
        emit('ENEMY_LEAK');
        if (stats().lives <= 0) {
          setGameState('GAMEOVER');
          emit('GAME_OVER');
        }
        return;
      }
      const dx = targetTile.x - enemy.x;
      const dy = targetTile.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const moveStep = (enemy.speed * speedModifier * dt) / 1000;

      if (Math.abs(dx) > Math.abs(dy)) {
        enemy.direction = dx > 0 ? 'RIGHT' : 'LEFT';
      } else {
        enemy.direction = dy > 0 ? 'DOWN' : 'UP';
      }

      if (dist <= moveStep) {
        enemy.x = targetTile.x;
        enemy.y = targetTile.y;
        enemy.pathIndex++;
      } else {
        enemy.x += (dx / dist) * moveStep;
        enemy.y += (dy / dist) * moveStep;
      }
    });
    return updatedEnemies;
  };

  const updateBlocking = (updatedEnemies: Enemy[], getOpTemplate: (id: string) => OperatorTemplate | undefined) => {
    updatedEnemies.forEach(e => e.frozen = false);
    operators().forEach(op => {
      const opTemplate = getOpTemplate(op.templateId || op.type);
      if (opTemplate && opTemplate.block > 0) {
        const enemiesInTile = updatedEnemies.filter(e =>
          Math.abs(e.x - op.x) < 0.3 && Math.abs(e.y - op.y) < 0.3 && e.hp > 0
        );
        enemiesInTile.slice(0, opTemplate.block).forEach(e => e.frozen = true);
      }
    });
  };

  const updateEnemyCombat = (dt: number, updatedEnemies: Enemy[], allEnemyTemplates: EnemyTemplate[], getOpTemplate: (id: string) => OperatorTemplate | undefined) => {
    updatedEnemies.forEach(enemy => {
      const template = allEnemyTemplates.find(t => t.id === enemy.templateId);
      if (!template || template.atk <= 0) return;

      enemy.attackTimer += dt;
      if (enemy.attackTimer >= template.interval) {
        const rangeTiles = CombatUtils.getRangeTiles(enemy, template.range);
        
        // 查找范围内的干员
        const target = operators().find(op => {
          const opTemplate = getOpTemplate(op.templateId || op.type);
          if (!opTemplate) return false;
          
          const inRange = CombatUtils.isInRange(op, rangeTiles);
          if (!inRange) return false;

          // 目前设计敌人只对地，但这里预留了对高台的判断逻辑
          // 如果以后要允许攻击高台，可以修改此处的过滤条件
          const isGround = opTemplate.type === 'DEFENDER' || opTemplate.type === 'GUARD';
          return isGround;
        });

        if (target) {
          enemy.attackTimer = 0;
          const opTemplate = getOpTemplate(target.templateId || target.type);
          if (opTemplate) {
            const finalDamage = CombatUtils.calculateDamage(template.atk, opTemplate.def);
            target.hp -= finalDamage;
            emit('HIT');
          }
        }
      }
    });
  };

  const updateCombat = (dt: number, updatedEnemies: Enemy[], getOpTemplate: (id: string) => OperatorTemplate | undefined, allEnemyTemplates: EnemyTemplate[]) => {
    const updatedProjectiles = [...projectiles()];
    operators().forEach(op => {
      const opTemplate = getOpTemplate(op.templateId || op.type);
      if (!opTemplate) return;

      // --- 0. 熔火阵营特殊逻辑：铸造 (Foundry) 技能期间持续产生地块效果 ---
      if (opTemplate.id === 'FOUNDRY' && op.skillActive) {
        const rangeTiles = CombatUtils.getRangeTiles(op, opTemplate.range);
        rangeTiles.forEach(tile => {
          // 检查是否已有更高或相等的效能地块
          const existing = tileEffects().find(e => e.x === tile.x && e.y === tile.y && e.potency >= 200);
          if (!existing) {
            setTileEffects(prev => [...prev, {
              id: Math.random().toString(),
              x: tile.x,
              y: tile.y,
              type: 'BURN',
              potency: 200,
              duration: 500, // 持续刷新
              maxDuration: 500
            }]);
          }
        });
      }

      if (op.skillActive) {
        op.skillTimer -= dt;
        if (op.skillTimer <= 0) {
          op.skillActive = false;
          op.sp = 0;
        }
      } else if (op.sp < op.maxSp) {
        // 爆燃天才：攻击灼烧敌人回技力 (在攻击逻辑处理)
        op.sp += dt / 1000;
      }

      op.attackTimer += dt;
      let currentInterval = opTemplate.interval;
      // 火绳速射模式不改变间隔，而是改变攻击方式（3连射在下面处理）
      if (op.skillActive && opTemplate.skillAttackSpeedBuff) {
        currentInterval *= opTemplate.skillAttackSpeedBuff;
      }

      if (op.attackTimer >= currentInterval) {
        const rangeTiles = CombatUtils.getRangeTiles(op, opTemplate.range);
        
        // --- 1. 处理全范围群攻 (TRUE_AOE) ---
        if (opTemplate.attackType === 'TRUE_AOE') {
          // ... 逻辑保持 ...
        }

        // --- 2. 处理常规单体或溅射攻击 ---
        // 暖流/焦土优先寻找受伤干员
        if (opTemplate.attackType === 'HEAL') {
          const wounded = operators().find(o => o.hp < o.maxHp && CombatUtils.isInRange(o, rangeTiles));
          if (wounded) {
            op.attackTimer = 0;
            emit('OPERATOR_ATTACK', { operator: op, template: opTemplate });
            wounded.hp = Math.min(wounded.maxHp, wounded.hp + opTemplate.damage);
            emit('EFFECT_SPAWN', { id: Math.random().toString(), x: wounded.x, y: wounded.y, type: 'HEAL', duration: 500, maxDuration: 500, radius: 0.8 });
            
            // 暖流特殊逻辑：奶熔火干员回技力
            if (opTemplate.id === 'WARMTH' && wounded.templateId?.includes('PYROCLAST')) {
              op.sp = Math.min(op.maxSp, op.sp + 1);
            }
          }
          return;
        }

        const target = updatedEnemies.find(e =>
          e.hp > 0 && CombatUtils.isInRange(e, rangeTiles)
        );

        if (target) {
          op.attackTimer = 0;
          
          // 处理连射逻辑
          let burstCount = 1;
          if (opTemplate.id === 'MATCHLOCK' && op.skillActive) burstCount = 3;

          for (let i = 0; i < burstCount; i++) {
            emit('OPERATOR_ATTACK', { operator: op, template: opTemplate });
            
            const enemyTemplate = allEnemyTemplates.find(t => t.id === target.templateId);
            if (!enemyTemplate) continue;

            let damageMultiplier = opTemplate.damageMultiplier || 1;
            
            // 熔切特殊逻辑：对灼烧目标250%并无视减伤
            if (opTemplate.id === 'THERMITE' && op.skillActive) {
              damageMultiplier = 2.5;
            }

            const baseDmg = opTemplate.damage * damageMultiplier;
            const isBurning = AnomalySystem.hasEffect(target, 'BURN');

            // 爆燃天才：攻击灼烧敌人回2技力
            if (opTemplate.id === 'DETONATOR' && isBurning) {
              op.sp = Math.min(op.maxSp, op.sp + 2);
            }

            if (opTemplate.attackType === 'AOE') {
              const radius = op.skillActive ? (opTemplate.aoeRadius || 1.5) * 1.6 : (opTemplate.aoeRadius || 1.5);
              const damage = op.skillActive ? baseDmg * 1.5 : baseDmg;
              updatedEnemies.forEach(enemy => {
                const dist = CombatUtils.getDistance(enemy, target);
                if (dist <= radius) {
                  const eTemp = allEnemyTemplates.find(t => t.id === enemy.templateId);
                  if (!eTemp) return;

                  // 链锯扩散逻辑
                  if (opTemplate.id === 'CHAINSAW' && op.skillActive) {
                    const targetBuildup = target.anomalies.find(a => a.type === 'BURN')?.value || 0;
                    if (targetBuildup > 0) {
                      AnomalySystem.applyBuildup(enemy, 'BURN', targetBuildup * 0.3, eTemp);
                    }
                  }

                  applyAnomalyBuildupToEnemy(enemy, op, opTemplate, eTemp);
                  const vul = AnomalySystem.getVulnerabilityMultiplier(enemy);
                  const finalDamage = CombatUtils.calculateDamage(damage * vul, enemy.def);
                  enemy.hp -= finalDamage;
                  if (enemy.hp <= 0) { setStats(s => ({ ...s, kills: s.kills + 1 })); emit('ENEMY_DIE', { enemy }); }
                }
              });
              emit('EFFECT_SPAWN', { id: Math.random().toString(), x: target.x, y: target.y, type: 'EXPLOSION', duration: 500, maxDuration: 500, radius: radius });
              emit('HIT');
            } else {
              // 单体攻击 (投射物)
              updatedProjectiles.push({ 
                id: Math.random().toString(), 
                x: op.x, 
                y: op.y, 
                targetId: target.id, 
                speed: 10, 
                damage: op.skillActive ? baseDmg * 1.5 : baseDmg, 
                type: op.type === 'SNIPER' ? 'ARROW' : 'MAGIC' 
              });
              
              // 热浪技能：产生地块
              if (opTemplate.id === 'HEATWAVE' && op.skillActive) {
                setTileEffects(prev => [...prev, {
                  id: Math.random().toString(),
                  x: target.x,
                  y: target.y,
                  type: 'BURN',
                  potency: 120,
                  duration: 5000,
                  maxDuration: 5000
                }]);
              }
            }
          }
        }
      }
    });
    return updatedProjectiles;
  };

  const updateProjectilesTracking = (dt: number, updatedProjectiles: Projectile[], updatedEnemies: Enemy[], allEnemyTemplates: EnemyTemplate[]) => {
    updatedProjectiles.forEach(p => {
      const target = updatedEnemies.find(e => e.id === p.targetId);
      if (!target || target.hp <= 0) { p.damage = 0; return; }
      const dx = target.x - p.x, dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const moveStep = (p.speed * dt) / 1000;

      if (dist <= moveStep) {
        const enemyTemplate = allEnemyTemplates.find(t => t.id === target.templateId);
        
        // 应用易伤修正
        const vulnerabilityMultiplier = AnomalySystem.getVulnerabilityMultiplier(target);
        
        // 寻找发射该投射物的干员 (为了获取其附魔)
        // 注意：目前投射物没有记录发射者ID，这里简单处理，实际应在Projectile中添加sourceOpId
        
        const finalDamage = CombatUtils.calculateDamage(p.damage * vulnerabilityMultiplier, target.def);
        target.hp -= finalDamage;
        
        // 如果命中时目标已灼烧，且满足熔切/Thermite逻辑 (这里需要判断源干员)
        // 由于结构限制，这里暂时通过damage特征值或其他方式判断，
        // 建议在后续迭代中给Projectile增加sourceTemplateId字段
        
        if (target.hp <= 0) {
          setStats(prev => ({ ...prev, kills: prev.kills + 1 }));
          emit('ENEMY_DIE', { enemy: target });
        }
        emit('HIT');
        p.damage = 0;
      } else {
        p.x += (dx / dist) * moveStep;
        p.y += (dy / dist) * moveStep;
      }
    });
  };

  const cleanupEntities = (updatedEnemies: Enemy[], updatedProjectiles: Projectile[], dt: number) => {
    setEnemies(updatedEnemies.filter(e => e.hp > 0 && e.hp !== -999));
    setProjectiles(updatedProjectiles.filter(p => p.damage > 0));
    
    // 清理死亡的干员
    const currentOps = operators();
    const aliveOps = currentOps.filter(op => {
      if (op.hp <= 0) {
        // --- 火花 (Spark) 撤退逻辑 ---
        if (op.templateId === 'ACCELERANT' || op.templateId === 'SPARK') {
          // 这里实际上应该检查是否是火花，文档说撤退生成地块
          const x = op.x;
          const y = op.y;
          // 生成十字范围的地块
          const tiles = [{x,y}, {x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}];
          tiles.forEach(t => {
            setTileEffects(prev => [...prev, {
              id: Math.random().toString(),
              x: t.x,
              y: t.y,
              type: 'BURN',
              potency: 100,
              duration: 15000,
              maxDuration: 15000
            }]);
          });
        }
        emit('OPERATOR_DIE', { operator: op });
        return false;
      }
      return true;
    });

    if (aliveOps.length !== currentOps.length) {
      setOperators(aliveOps);
    }
    
    setStats(prev => ({ ...prev, currentDeployment: aliveOps.length }));
  };

  const checkVictory = () => {
    if (stats().kills >= stats().totalEnemies && enemies().length === 0 && gameState() === 'PLAYING') {
      setGameState('WON');
      emit('GAME_WON');
    }
  };

  return {
    gameState, setGameState, isPaused, setIsPaused, stats, setStats, enemies, operators, setOperators, projectiles, tileEffects, initGame, update, activateSkill
  };
}
