import { createSignal, onMount, onCleanup, createEffect, Show } from 'solid-js';
import { TILE_SIZE, LEVELS, OP_STATS, ENEMY_TEMPLATES, PYROCLAST_OPS } from './constants';
import { LevelConfig, EnemyTemplate, OperatorTemplate, GameEvent, VisualEffect } from './types';
import { db } from './db';
import { useGameEngine } from './useGameEngine';
import { useGameInteraction } from './useGameInteraction';
import { audioSystem } from './audio';

// Components
import { LevelSelection } from './components/LevelSelection';
import { TopBar, BottomBar } from './components/HUD';
import { EnemyInfoModal, MapPreviewModal, PauseModal } from './components/Modals';
import { MissionAccomplished, GameOver, OperatorDetail } from './components/Overlays';
import { GameCanvas } from './components/GameCanvas';

export default function ArknightsTD() {
  const [effects, setEffects] = createSignal<VisualEffect[]>([]);

  const handleGameEvent = (event: GameEvent) => {
    switch (event.type) {
      case 'GAME_START':
        audioSystem.init();
        audioSystem.playStartActionSound();
        setEffects([]);
        break;
      case 'GAME_OVER':
        audioSystem.playMissionFailedSound();
        break;
      case 'GAME_WON':
        audioSystem.playVictorySound();
        break;
      case 'ENEMY_LEAK':
        audioSystem.playLeakWarningSound();
        break;
      case 'HIT':
        audioSystem.playHitSound();
        break;
      case 'OPERATOR_DIE':
        audioSystem.playRetreatSound();
        break;
      case 'EFFECT_SPAWN':
        setEffects(prev => [...prev, event.payload]);
        // 播放特效音效
        const effectType = event.payload.type;
        if (effectType === 'BURN') {
          audioSystem.playBurnSound();
        } else if (effectType === 'HEAL' || effectType === 'CHAIN_HEAL') {
          audioSystem.playHealSound();
        } else if (effectType === 'FREEZE') {
          audioSystem.playFreezeSound();
        }
        break;
      case 'OPERATOR_ATTACK': {
        const { template } = event.payload;
        const sound = template.attackSound || template.type;
        const presets = ['SNIPER', 'GUARD', 'DEFENDER', 'MAGIC'] as const;
        if (presets.includes(sound as any)) {
          audioSystem.playShootSound(sound as any);
        } else if (sound) {
          audioSystem.playUrlSound(sound);
        }
        break;
      }
      case 'SKILL_ACTIVATE': {
        const { template } = event.payload;
        // 检查技能事件类型来播放对应音效
        if (template.skill.events) {
          const hasDetonate = template.skill.events.some((e: any) => e.type === 'DETONATE_ANOMALY');
          const hasEnchant = template.skill.events.some((e: any) => e.type === 'ENCHANT');
          
          if (hasDetonate) {
            audioSystem.playDetonateSound();
          } else if (hasEnchant) {
            audioSystem.playEnchantSound();
          } else {
            const skillSound = template.skillSound || 'MAGIC';
            const presets = ['SNIPER', 'GUARD', 'DEFENDER', 'MAGIC'] as const;
            if (presets.includes(skillSound as any)) {
              audioSystem.playShootSound(skillSound as any);
            } else if (skillSound) {
              audioSystem.playUrlSound(skillSound);
            }
          }
        } else {
          const skillSound = template.skillSound || 'MAGIC';
          const presets = ['SNIPER', 'GUARD', 'DEFENDER', 'MAGIC'] as const;
          if (presets.includes(skillSound as any)) {
            audioSystem.playShootSound(skillSound as any);
          } else if (skillSound) {
            audioSystem.playUrlSound(skillSound);
          }
        }
        break;
      }
    }
  };

  const engine = useGameEngine(handleGameEvent);
  const interaction = useGameInteraction();

  // --- BGM Control ---
  createEffect(() => {
    if (engine.gameState() === 'PLAYING' && !engine.isPaused()) {
      audioSystem.startBGM();
    } else {
      audioSystem.stopBGM();
    }
  });

  // --- State ---
  const [currentLevelConfig, setCurrentLevelConfig] = createSignal<LevelConfig>(LEVELS[0]);
  const [showEnemyInfo, setShowEnemyInfo] = createSignal(false);
  const [showMapPreview, setShowMapPreview] = createSignal(false);
  const [showPauseModal, setShowPauseModal] = createSignal(false);
  const [gameSpeed, setGameSpeed] = createSignal<1 | 2>(1);
  const [isLandscape, setIsLandscape] = createSignal(true);
  const [zoom, setZoom] = createSignal(1);
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const [customEnemies, setCustomEnemies] = createSignal<EnemyTemplate[]>([]);
  const [customOperators, setCustomOperators] = createSignal<OperatorTemplate[]>([]);

  const allEnemyTemplates = () => [...ENEMY_TEMPLATES, ...customEnemies()] as EnemyTemplate[];
  const allOperatorTemplates = () => {
    const baseOps = Object.entries(OP_STATS).map(([id, stats]) => ({
      id,
      ...stats,
      isCustom: false
    })) as unknown as OperatorTemplate[];
    const pyroclastOps = Object.entries(PYROCLAST_OPS).map(([id, stats]) => ({
      ...stats,
      isCustom: false
    })) as unknown as OperatorTemplate[];
    return [...baseOps, ...pyroclastOps, ...customOperators()];
  };

  const getOpTemplate = (id: string): OperatorTemplate | undefined => allOperatorTemplates().find(t => t.id === id);
  const getEnemyTemplate = (id: string): EnemyTemplate | undefined => allEnemyTemplates().find(t => t.id === id);

  const currentMap = () => currentLevelConfig().map;
  const ROWS = () => currentMap().length;
  const COLS = () => currentMap()[0].length;

  let lastTime = 0;
  let loopId: number;
  let canvasRef: HTMLCanvasElement | undefined;

  const selectedOp = () => engine.operators().find(o => o.id === interaction.selectedOpId());

  // --- Helpers ---
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => { });
      }
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const checkOrientation = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    setIsLandscape(width > height);

    const mapWidth = COLS() * TILE_SIZE;
    const mapHeight = ROWS() * TILE_SIZE;
    const topBarHeight = width < 768 ? 40 : 48;
    const bottomReserved = width < 768 ? 64 : 80;
    const availableWidth = width;
    const availableHeight = height - topBarHeight - bottomReserved;

    const scaleX = availableWidth / mapWidth;
    const scaleY = availableHeight / mapHeight;
    setZoom(Math.min(scaleX, scaleY));
  };

  createEffect(() => {
    currentLevelConfig();
    checkOrientation();
  });

  onMount(async () => {
    window.addEventListener('resize', checkOrientation);
    checkOrientation();

    try {
      const cEnemies = await db.getAllEnemies();
      const cOperators = await db.getAllOperators();
      setCustomEnemies(cEnemies);
      setCustomOperators(cOperators);
    } catch (e) {
      console.error("Failed to load custom data", e);
    }

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (interaction.dragOp()) {
        interaction.setPointerPos({ x: e.clientX, y: e.clientY });
        const pos = interaction.getEventPos(e, canvasRef, zoom());
        if (pos) {
          interaction.setHoverTile({ x: pos.x, y: pos.y });
        } else {
          interaction.setHoverTile(null);
        }
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (interaction.dragOp()) {
        interaction.handlePointerUp(e, canvasRef, zoom(), engine, currentMap(), getOpTemplate);
        interaction.setDragOp(null);
        interaction.setPointerPos(null);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);

    onCleanup(() => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    });
  });

  onCleanup(() => {
    window.removeEventListener('resize', checkOrientation);
    if (loopId) cancelAnimationFrame(loopId);
  });

  const initGame = () => {
    engine.initGame(currentLevelConfig());
    lastTime = performance.now();
    loopId = requestAnimationFrame(gameLoop);
    if (window.innerWidth < 1024 && !document.fullscreenElement) {
      toggleFullscreen();
    }
  };

  function gameLoop(time: number) {
    if (engine.gameState() !== 'PLAYING') return;
    const dt = time - lastTime;
    lastTime = time;
    
    const isInteracting = interaction.dragOp() || interaction.placingOp() || interaction.selectedOpId();
    const effectiveSpeed = isInteracting ? 0.1 : gameSpeed();
    
    // 更新特效生命周期 (在 UI 层)
    setEffects(prev => prev.map(eff => ({ ...eff, duration: eff.duration - (dt * effectiveSpeed) })).filter(eff => eff.duration > 0));

    engine.update(dt * effectiveSpeed, currentLevelConfig(), allEnemyTemplates(), getOpTemplate);
    loopId = requestAnimationFrame(gameLoop);
  }

  const hudProps = {
    gameState: engine.gameState,
    setIsPaused: engine.setIsPaused,
    setShowPauseModal,
    stats: engine.stats,
    toggleFullscreen,
    isFullscreen,
    setStats: engine.setStats,
    gameSpeed,
    setGameSpeed,
    isPaused: engine.isPaused,
    dragOp: interaction.dragOp,
    setDragOp: interaction.setDragOp,
    placingOp: interaction.placingOp,
    setPointerPos: interaction.setPointerPos,
    setGameState: engine.setGameState,
    operatorTemplates: allOperatorTemplates
  };

  return (
    <div class="flex flex-col h-screen bg-slate-900 text-white overflow-hidden select-none relative">
      <Show when={!isLandscape()}>
        <div class="absolute inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-10 text-center">
          <div class="w-16 h-24 border-4 border-white rounded-lg animate-bounce mb-6 flex items-center justify-center">
            <div class="w-12 h-1 bg-white rotate-90"></div>
          </div>
          <h2 class="text-2xl font-black">请旋转设备</h2>
          <p class="text-white/50 mt-2 italic">请使用横屏模式以获得最佳体验</p>
        </div>
      </Show>

      <Show when={engine.gameState() === 'IDLE'}>
        <LevelSelection
          currentLevel={currentLevelConfig}
          setCurrentLevel={setCurrentLevelConfig}
          initGame={initGame}
          showEnemyInfo={showEnemyInfo}
          setShowEnemyInfo={setShowEnemyInfo}
          showMapPreview={showMapPreview}
          setShowMapPreview={setShowMapPreview}
          toggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
      </Show>

      <TopBar {...hudProps} />

      <div class="flex-1 relative flex items-start justify-center bg-slate-950 overflow-hidden">
        <GameCanvas
          canvasRef={el => canvasRef = el}
          map={currentMap}
          rows={ROWS}
          cols={COLS}
          enemies={engine.enemies}
          operators={engine.operators}
          projectiles={engine.projectiles}
          effects={effects}
          tileEffects={engine.tileEffects}
          zoom={zoom}
          handlePointerMove={(e) => {
            const pos = interaction.getEventPos(e, canvasRef, zoom());
            if (pos) interaction.setHoverTile({ x: pos.x, y: pos.y });
          }}
          handlePointerUp={(e) => interaction.handlePointerUp(e, canvasRef, zoom(), engine, currentMap(), getOpTemplate)}
          placingOp={interaction.placingOp}
          hoverTile={interaction.hoverTile}
          dragOp={interaction.dragOp}
          getOpTemplate={getOpTemplate}
          getEnemyTemplate={getEnemyTemplate}
          levelConfig={currentLevelConfig}
          stats={engine.stats}
        />

        <Show when={interaction.dragOp() || interaction.placingOp()}>
          <div class="absolute inset-0 pointer-events-none opacity-20 border border-white/5"></div>
        </Show>

        <Show when={interaction.placingOp()}>
          <div class="absolute bottom-8 right-8 z-[60] animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                interaction.setPlacingOp(null);
              }}
              class="group bg-red-600 hover:bg-red-500 text-white px-8 py-3 font-black italic flex flex-col items-center gap-0 border-l-4 border-white shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all active:scale-95"
            >
              <span class="text-xs tracking-[0.2em] opacity-80 uppercase leading-none mb-1">取消</span>
              <span class="text-xl md:text-2xl tracking-widest">取消部署</span>
            </button>
          </div>
        </Show>

        <MissionAccomplished show={engine.gameState() === 'WON'} onContinue={() => engine.setGameState('IDLE')} />
        <GameOver show={engine.gameState() === 'GAMEOVER'} onRestart={() => engine.setGameState('IDLE')} />
        <PauseModal show={showPauseModal} setShowPauseModal={setShowPauseModal} setIsPaused={engine.setIsPaused} setGameState={engine.setGameState} />
        <OperatorDetail
          selectedOp={selectedOp}
          setSelectedOpId={interaction.setSelectedOpId}
          setStats={engine.setStats}
          setOperators={engine.setOperators}
          getOpTemplate={getOpTemplate}
          activateSkill={(id) => engine.activateSkill(id, getOpTemplate, allEnemyTemplates())}
        />
      </div>

      <BottomBar {...hudProps} />
      <EnemyInfoModal show={showEnemyInfo} onClose={() => setShowEnemyInfo(false)} />
      <MapPreviewModal show={showMapPreview} onClose={() => setShowMapPreview(false)} level={currentLevelConfig()} />
    </div>
  );
}
