import { createSignal, createEffect, For, Show, onMount, createMemo } from 'solid-js';
import { ENEMY_TEMPLATES, OP_STATS } from './constants';
import { db } from './db';
import { LevelConfig, EnemyTemplate, OperatorTemplate, SkillEvent } from './types';
import { EditorConfig, EditorWaveEvent, DesignerTab, Tool } from './designer/types';

// Components
import Toolbar from './designer/Toolbar';
import MapsLibrary from './designer/MapsLibrary';
import EditorWorkspace from './designer/EditorWorkspace';
import SettingsPanel from './designer/SettingsPanel';
import MonstersLibrary from './designer/MonstersLibrary';
import OperatorsLibrary from './designer/OperatorsLibrary';
import JsonExport from './designer/JsonExport';
import GlobalWavesModal from './designer/GlobalWavesModal';

export default function MapDesigner() {
  // --- State ---
  const [config, setConfig] = createSignal<EditorConfig>({
    code: 'NEW-01',
    name: '新建关卡',
    description: '在这里输入关卡描述...',
    totalEnemies: 20,
    initialDp: 10,
    maxLife: 3,
    mapWidth: 20,
    mapHeight: 12,
    entryPattern: '',
    exitPattern: ''
  });

  // Map Data: 0=High, 1=Ground, 2=Start, 3=End
  const [mapData, setMapData] = createSignal<number[][]>(
    Array(12).fill(0).map(() => Array(20).fill(0))
  );

  const [selectedTool, setSelectedTool] = createSignal<number>(1); // Default to Ground
  const [selectedTile, setSelectedTile] = createSignal<{ x: number, y: number } | null>(null);
  const [showGlobalWaves, setShowGlobalWaves] = createSignal(false);
  const [waves, setWaves] = createSignal<EditorWaveEvent[]>([]);

  // Wave Editor State
  const [newWave, setNewWave] = createSignal<Omit<EditorWaveEvent, 'id'>>({
    time: 0,
    enemyType: 'soldier',
    count: 1,
    interval: 1000,
    spawnPointIndex: 0,
    targetExitIndex: 0
  });

  // UI State
  const [activeTab, setActiveTab] = createSignal<DesignerTab>('MAPS');
  const [savedLevels, setSavedLevels] = createSignal<LevelConfig[]>([]);
  const [customEnemies, setCustomEnemies] = createSignal<EnemyTemplate[]>([]);
  const [customOperators, setCustomOperators] = createSignal<OperatorTemplate[]>([]);

  const [toast, setToast] = createSignal<{ msg: string, type: 'success' | 'error' } | null>(null);
  const [editingWaveId, setEditingWaveId] = createSignal<string | null>(null);

  // Entity Editor States
  const [editingEnemy, setEditingEnemy] = createSignal<EnemyTemplate | null>(null);
  const [editingOperator, setEditingOperator] = createSignal<OperatorTemplate | null>(null);

  onMount(() => {
    refreshSavedLevels();
    refreshCustomEntities();
  });

  const refreshSavedLevels = async () => {
    try {
      const levels = await db.getAllLevels();
      setSavedLevels(levels);
    } catch (e) {
      console.error("Failed to load levels", e);
    }
  };

  const refreshCustomEntities = async () => {
    try {
      const enemies = await db.getAllEnemies();
      const operators = await db.getAllOperators();
      setCustomEnemies(enemies);
      setCustomOperators(operators);
    } catch (e) {
      console.error("Failed to load custom entities", e);
    }
  };

  const allEnemyTemplates = createMemo(() => [
    ...ENEMY_TEMPLATES.map(t => ({ ...t, isCustom: false as const })),
    ...customEnemies()
  ]);

  const allOperatorTemplates = createMemo(() => {
    const baseOps = Object.entries(OP_STATS).map(([id, stats]) => ({
      id,
      ...stats,
      isCustom: false
    })) as unknown as OperatorTemplate[];
    return [...baseOps, ...customOperators()];
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveEnemyToDb = async () => {
    const enemy = editingEnemy();
    if (!enemy) return;
    try {
      await db.saveEnemy(enemy);
      showToast("敌人配置保存成功");
      refreshCustomEntities();
      setEditingEnemy(null);
    } catch (e) {
      showToast("保存失败", 'error');
    }
  };

  const deleteEnemy = async (id: string) => {
    if (!confirm('确定要删除这个敌人配置吗？')) return;
    try {
      await db.deleteEnemy(id);
      showToast("删除成功");
      refreshCustomEntities();
    } catch (e) {
      showToast("删除失败", 'error');
    }
  };

  const saveOperatorToDb = async () => {
    const op = editingOperator();
    if (!op) return;
    try {
      await db.saveOperator(op);
      showToast("干员配置保存成功");
      refreshCustomEntities();
      setEditingOperator(null);
    } catch (e) {
      showToast("保存失败", 'error');
    }
  };

  const deleteOperator = async (id: string) => {
    if (!confirm('确定要删除这个干员配置吗？')) return;
    try {
      await db.deleteOperator(id);
      showToast("删除成功");
      refreshCustomEntities();
    } catch (e) {
      showToast("删除失败", 'error');
    }
  };

  const addSkillEvent = () => {
    const op = editingOperator();
    if (!op) return;
    const newEvent: SkillEvent = { type: 'HEAL', value: 100 };
    setEditingOperator({
      ...op,
      skill: {
        ...op.skill,
        events: [...(op.skill.events || []), newEvent]
      }
    });
  };

  const removeSkillEvent = (index: number) => {
    const op = editingOperator();
    if (!op) return;
    const events = [...(op.skill.events || [])];
    events.splice(index, 1);
    setEditingOperator({
      ...op,
      skill: { ...op.skill, events }
    });
  };

  // --- Actions ---
  const resizeMap = (w: number, h: number) => {
    const newMap = Array(h).fill(0).map((_, y) =>
      Array(w).fill(0).map((_, x) => {
        return mapData()[y]?.[x] ?? 0;
      })
    );
    setMapData(newMap);
    setConfig(prev => ({ ...prev, mapWidth: w, mapHeight: h }));
  };

  const handleTileClick = (x: number, y: number) => {
    if (selectedTool() === -1) {
      setSelectedTile({ x, y });
      return;
    }

    const newMap = [...mapData()];
    newMap[y] = [...newMap[y]]; // Copy row
    newMap[y][x] = selectedTool();
    setMapData(newMap);

    // If we just painted, maybe select it too?
    setSelectedTile({ x, y });
  };

  const handleMouseDown = (e: MouseEvent, x: number, y: number) => {
    if (e.buttons === 1) handleTileClick(x, y);
  };

  const handleMouseEnter = (e: MouseEvent, x: number, y: number) => {
    if (e.buttons === 1) handleTileClick(x, y);
  };

  // Helper to find spawn points
  const spawnPoints = () => {
    const points: { x: number, y: number, index: number }[] = [];
    let idx = 0;
    mapData().forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 2) {
          points.push({ x, y, index: idx });
          idx++;
        }
      });
    });
    return points;
  };

  // Helper to find exit points (blue gates)
  const exitPoints = () => {
    const points: { x: number, y: number, index: number }[] = [];
    let idx = 0;
    mapData().forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 3) {
          points.push({ x, y, index: idx });
          idx++;
        }
      });
    });
    return points;
  };

  const addWave = () => {
    const spts = spawnPoints();
    const idx = spts.find(p => p.x === selectedTile()?.x && p.y === selectedTile()?.y)?.index;
    
    if (idx === undefined) {
       showToast("请先选择一个红门作为出生点", "error");
       return;
    }

    const waveWithIdx = { ...newWave(), spawnPointIndex: idx };

    if (editingWaveId()) {
      setWaves(prev => prev.map(w =>
        w.id === editingWaveId() ? { ...waveWithIdx, id: w.id } : w
      ).sort((a, b) => a.time - b.time));
      setEditingWaveId(null);
      showToast("已更新波次");
    } else {
      setWaves(prev => [
        ...prev,
        { ...waveWithIdx, id: Math.random().toString(36).substr(2, 9) }
      ].sort((a, b) => a.time - b.time));
      showToast("已添加波次");
    }
    
    setNewWave({
      time: newWave().time,
      enemyType: 'soldier',
      count: 1,
      interval: 1000,
      spawnPointIndex: 0,
      targetExitIndex: 0
    });
  };

  const startEditingWave = (wave: EditorWaveEvent) => {
    setEditingWaveId(wave.id);
    setNewWave({
      time: wave.time,
      enemyType: wave.enemyType,
      count: wave.count,
      interval: wave.interval,
      spawnPointIndex: wave.spawnPointIndex,
      targetExitIndex: wave.targetExitIndex ?? 0
    });
  };

  const removeWave = (id: string) => {
    if (editingWaveId() === id) setEditingWaveId(null);
    setWaves(prev => prev.filter(w => w.id !== id));
  };

  const saveToDb = async () => {
    const total = waves().reduce((acc, curr) => acc + curr.count, 0);
    const levelData: LevelConfig = {
      id: config().id || crypto.randomUUID(),
      code: config().code,
      name: config().name,
      description: config().description,
      totalEnemies: total,
      initialDp: config().initialDp,
      maxLife: config().maxLife,
      recommendedLevel: 'CUSTOM',
      map: mapData(),
      waves: waves(),
      entryPattern: config().entryPattern,
      exitPattern: config().exitPattern
    };

    try {
      await db.saveLevel(levelData);
      setConfig(prev => ({ ...prev, id: levelData.id }));

      const channel = new BroadcastChannel('arknights-td-sync');
      channel.postMessage({ type: 'LEVEL_SAVED', levelId: levelData.id });
      channel.close();

      showToast("保存成功！");
      refreshSavedLevels();
    } catch (e) {
      showToast("保存失败", 'error');
      console.error(e);
    }
  };

  const loadLevel = (level: LevelConfig) => {
    setConfig({
      id: level.id,
      code: level.code,
      name: level.name,
      description: level.description,
      totalEnemies: level.totalEnemies,
      initialDp: level.initialDp || 10,
      maxLife: level.maxLife || 3,
      mapWidth: level.map[0]?.length || 20,
      mapHeight: level.map.length || 12,
      entryPattern: level.entryPattern || '',
      exitPattern: level.exitPattern || ''
    });
    setMapData(level.map);
    setWaves(level.waves || []);
    showToast(`已加载关卡: ${level.name}`);
  };

  const deleteLevel = async (id: string | number, e: Event) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个存档吗？')) return;
    try {
      await db.deleteLevel(id);
      refreshSavedLevels();
      showToast("删除成功");
    } catch (e) {
      showToast("删除失败", 'error');
    }
  };

  const exportJson = () => {
    const total = waves().reduce((acc, curr) => acc + curr.count, 0);
    const finalConfig = { ...config(), totalEnemies: total };
    const output = {
      ...finalConfig,
      map: mapData(),
      waves: waves()
    };
    return JSON.stringify(output, null, 2);
  };

  const tools: Tool[] = [
    { id: -1, name: '选择模式', color: 'transparent', border: '#666', icon: '🖱️' },
    { id: 0, name: '高台 (不可部署)', color: '#14171c', border: '#333' },
    { id: 1, name: '地面 (可部署)', color: '#20242a', border: '#444' },
    { id: 2, name: '侵入点 (红门)', color: '#331a1a', border: '#ff4d4d' },
    { id: 3, name: '保护点 (蓝门)', color: '#1a2433', border: '#4da6ff' },
  ];

  const createNewLevel = () => {
    setConfig({
      code: 'NEW-01',
      name: '新建关卡',
      description: '',
      totalEnemies: 0,
      initialDp: 10,
      maxLife: 3,
      mapWidth: 20,
      mapHeight: 12,
      entryPattern: '',
      exitPattern: ''
    });
    setMapData(Array(12).fill(0).map(() => Array(20).fill(0)));
    setWaves([]);
    setSelectedTile(null);
  };

  return (
    <div class="flex h-screen bg-slate-900 text-white overflow-hidden font-sans relative">
      <Show when={toast()}>
        <div class={`absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 rounded shadow-xl font-bold border ${toast()?.type === 'success' ? 'bg-green-600 border-green-400' : 'bg-red-600 border-red-400'}`}>
          {toast()?.msg}
        </div>
      </Show>

      <div class="flex-1 flex flex-col bg-[#0a0c10]">
        <Toolbar activeTab={activeTab()} setActiveTab={setActiveTab} />

        <div class="flex-1 overflow-hidden relative">
          <Show when={activeTab() === 'MAPS'}>
            <div class="flex-1 h-full overflow-hidden flex">
              <MapsLibrary 
                savedLevels={savedLevels()} 
                currentConfigId={config().id} 
                loadLevel={loadLevel} 
                deleteLevel={deleteLevel} 
                createNewLevel={createNewLevel} 
              />
              
              <EditorWorkspace 
                config={config()} 
                mapData={mapData()} 
                selectedTile={selectedTile()} 
                tools={tools} 
                handleMouseDown={handleMouseDown} 
                handleMouseEnter={handleMouseEnter} 
              />

              <SettingsPanel 
                config={config()} 
                setConfig={setConfig} 
                saveToDb={saveToDb} 
                resizeMap={resizeMap} 
                tools={tools} 
                selectedTool={selectedTool()} 
                setSelectedTool={setSelectedTool} 
                selectedTile={selectedTile()} 
                mapData={mapData()} 
                allEnemyTemplates={allEnemyTemplates()} 
                newWave={newWave()} 
                setNewWave={setNewWave} 
                waves={waves()} 
                editingWaveId={editingWaveId()} 
                addWave={addWave} 
                startEditingWave={startEditingWave} 
                removeWave={removeWave} 
                setShowGlobalWaves={setShowGlobalWaves} 
                spawnPoints={spawnPoints} 
                exitPoints={exitPoints} 
              />
            </div>
          </Show>

          <Show when={activeTab() === 'JSON'}>
            <JsonExport exportJson={exportJson} />
          </Show>

          <Show when={activeTab() === 'MONSTERS'}>
            <MonstersLibrary 
              allEnemyTemplates={allEnemyTemplates()} 
              editingEnemy={editingEnemy()} 
              setEditingEnemy={setEditingEnemy} 
              saveEnemyToDb={saveEnemyToDb} 
              deleteEnemy={deleteEnemy} 
            />
          </Show>

          <Show when={activeTab() === 'OPERATORS'}>
            <OperatorsLibrary 
              allOperatorTemplates={allOperatorTemplates()} 
              editingOperator={editingOperator()} 
              setEditingOperator={setEditingOperator} 
              saveOperatorToDb={saveOperatorToDb} 
              deleteOperator={deleteOperator} 
              addSkillEvent={addSkillEvent} 
              removeSkillEvent={removeSkillEvent} 
            />
          </Show>

          <Show when={showGlobalWaves()}>
            <GlobalWavesModal 
              waves={waves()} 
              allEnemyTemplates={allEnemyTemplates()} 
              spawnPoints={spawnPoints} 
              exitPoints={exitPoints} 
              setSelectedTile={setSelectedTile} 
              setSelectedTool={setSelectedTool} 
              setShowGlobalWaves={setShowGlobalWaves} 
              startEditingWave={startEditingWave} 
              removeWave={removeWave} 
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
