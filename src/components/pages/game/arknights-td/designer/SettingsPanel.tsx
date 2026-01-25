import { For, Show } from 'solid-js';
import { EditorConfig, Tool, EditorWaveEvent } from './types';
import { EnemyTemplate } from '../types';

interface SettingsPanelProps {
  config: EditorConfig;
  setConfig: (config: EditorConfig) => void;
  saveToDb: () => void;
  resizeMap: (w: number, h: number) => void;
  tools: Tool[];
  selectedTool: number;
  setSelectedTool: (id: number) => void;
  selectedTile: { x: number; y: number } | null;
  mapData: number[][];
  allEnemyTemplates: EnemyTemplate[];
  newWave: Omit<EditorWaveEvent, 'id'>;
  setNewWave: (wave: Omit<EditorWaveEvent, 'id'>) => void;
  waves: EditorWaveEvent[];
  editingWaveId: string | null;
  addWave: () => void;
  startEditingWave: (wave: EditorWaveEvent) => void;
  removeWave: (id: string) => void;
  setShowGlobalWaves: (show: boolean) => void;
  spawnPoints: () => { x: number; y: number; index: number }[];
  exitPoints: () => { x: number; y: number; index: number }[];
}

export default function SettingsPanel(props: SettingsPanelProps) {
  const currentTileType = () => props.selectedTile ? props.mapData[props.selectedTile.y][props.selectedTile.x] : null;

  return (
    <div class="w-80 bg-slate-950 border-l border-white/10 flex flex-col shadow-2xl overflow-y-auto shrink-0">
      <div class="p-4 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
        <h3 class="text-sm font-bold uppercase tracking-widest text-white/60">地图设置</h3>
        <button
          onClick={props.saveToDb}
          class="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors"
        >
          保存地图
        </button>
      </div>

      <div class="p-4 space-y-6">
        {/* Basic Info */}
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">代号</span>
              <input type="text" value={props.config.code}
                onInput={e => props.setConfig({ ...props.config, code: e.currentTarget.value })}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
              />
            </label>
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">名称</span>
              <input type="text" value={props.config.name}
                onInput={e => props.setConfig({ ...props.config, name: e.currentTarget.value })}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
              />
            </label>
          </div>
          <label class="block">
            <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">描述</span>
            <textarea value={props.config.description}
              onInput={e => props.setConfig({ ...props.config, description: e.currentTarget.value })}
              class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none h-16 resize-none"
            />
          </label>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">初始 Cost</span>
              <input type="number" value={props.config.initialDp}
                onInput={e => props.setConfig({ ...props.config, initialDp: parseInt(e.currentTarget.value) || 0 })}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
              />
            </label>
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">生命值</span>
              <input type="number" value={props.config.maxLife}
                onInput={e => props.setConfig({ ...props.config, maxLife: parseInt(e.currentTarget.value) || 3 })}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
              />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">宽度</span>
              <input type="number" value={props.config.mapWidth}
                onChange={e => props.resizeMap(parseInt(e.currentTarget.value) || 20, props.config.mapHeight)}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
              />
            </label>
            <label class="block">
              <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">高度</span>
              <input type="number" value={props.config.mapHeight}
                onChange={e => props.resizeMap(props.config.mapWidth, parseInt(e.currentTarget.value) || 12)}
                class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
              />
            </label>
          </div>
          <div class="space-y-2">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <label class="block">
                <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">入口图案 (URL/图标)</span>
                <input type="text" value={props.config.entryPattern || ''}
                  onInput={e => props.setConfig({ ...props.config, entryPattern: e.currentTarget.value })}
                  placeholder="如: 🚪 或 URL"
                  class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
                />
              </label>
              <label class="block">
                <span class="text-[10px] text-white/40 uppercase font-bold mb-1 block">基地图案 (URL/图标)</span>
                <input type="text" value={props.config.exitPattern || ''}
                  onInput={e => props.setConfig({ ...props.config, exitPattern: e.currentTarget.value })}
                  placeholder="如: 🏰 或 URL"
                  class="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 focus:border-blue-500 outline-none"
                />
              </label>
            </div>
            <div class="flex justify-between gap-2">
              <div class="flex gap-1">
                <For each={['🚪', '👹', '🔥']}>
                  {icon => (
                    <button onClick={() => props.setConfig({...props.config, entryPattern: icon})} class="text-[10px] bg-white/5 px-1.5 py-0.5 rounded hover:bg-white/10 border border-white/5">{icon}</button>
                  )}
                </For>
              </div>
              <div class="flex gap-1">
                <For each={['🏰', '🛡️', '💎']}>
                  {icon => (
                    <button onClick={() => props.setConfig({...props.config, exitPattern: icon})} class="text-[10px] bg-white/5 px-1.5 py-0.5 rounded hover:bg-white/10 border border-white/5">{icon}</button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>

        <div class="w-full h-px bg-white/10"></div>

        {/* Tool Palette */}
        <div class="space-y-2">
          <h3 class="text-[10px] font-bold text-white/60 uppercase tracking-widest">绘制工具</h3>
          <div class="grid grid-cols-2 gap-1">
            <For each={props.tools}>
              {tool => (
                <button
                  onClick={() => props.setSelectedTool(tool.id)}
                  class={`flex items-center gap-2 p-1.5 rounded transition-all text-left border ${props.selectedTool === tool.id ? 'bg-blue-600 border-blue-400' : 'bg-slate-900 border-transparent hover:bg-slate-800'}`}
                >
                  <div class="w-4 h-4 rounded border" style={{ "background-color": tool.color, "border-color": tool.border }}></div>
                  <span class="text-[10px] font-medium truncate">{tool.name}</span>
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="w-full h-px bg-white/10"></div>

        {/* Tile Property Panel */}
        <Show when={props.selectedTile} fallback={
          <div class="text-center text-white/20 italic text-[10px] py-4">选择一个地块编辑其波次</div>
        }>
          <div class="space-y-4">
            <div class="flex justify-between items-baseline">
              <span class="text-[10px] text-white/40 uppercase font-bold">地块坐标: {props.selectedTile?.x}, {props.selectedTile?.y}</span>
              <span class="text-[10px] text-blue-400 font-bold">{props.tools.find(t => t.id === currentTileType())?.name}</span>
            </div>

            <Show when={currentTileType() === 2}>
              <div class="bg-white/5 border border-white/10 rounded p-3 space-y-3">
                <div class="text-[10px] font-black text-red-400 uppercase">波次编辑 (当前红门)</div>
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-[8px] text-white/40 block">开始 (s)</span>
                    <input type="number" min="0" value={props.newWave.time}
                      onInput={e => props.setNewWave({ ...props.newWave, time: parseFloat(e.currentTarget.value) })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[8px] text-white/40 block">敌人</span>
                    <select
                      value={props.newWave.enemyType}
                      onChange={e => props.setNewWave({ ...props.newWave, enemyType: e.currentTarget.value })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    >
                      <For each={props.allEnemyTemplates}>
                        {template => (
                          <option value={template.id}>{template.name}</option>
                        )}
                      </For>
                    </select>
                  </label>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="text-[8px] text-white/40 block">数量</span>
                    <input type="number" min="1" value={props.newWave.count}
                      onInput={e => props.setNewWave({ ...props.newWave, count: parseInt(e.currentTarget.value) })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[8px] text-white/40 block">间隔 (ms)</span>
                    <input type="number" step="100" min="100" value={props.newWave.interval}
                      onInput={e => props.setNewWave({ ...props.newWave, interval: parseInt(e.currentTarget.value) })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    />
                  </label>
                </div>
                <Show when={props.exitPoints().length > 1}>
                  <label class="block">
                    <span class="text-[8px] text-white/40 block">目标蓝门 (基地)</span>
                    <select
                      value={props.newWave.targetExitIndex ?? 0}
                      onChange={e => props.setNewWave({ ...props.newWave, targetExitIndex: parseInt(e.currentTarget.value) })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    >
                      <For each={props.exitPoints()}>
                        {exit => (
                          <option value={exit.index}>蓝门 {exit.index + 1} (x:{exit.x}, y:{exit.y})</option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>
                <button
                  onClick={props.addWave}
                  class={`w-full font-bold py-1.5 rounded text-[10px] transition-colors ${props.editingWaveId ? 'bg-yellow-600 text-black hover:bg-yellow-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                >
                  {props.editingWaveId ? '更新波次' : '确认添加'}
                </button>
              </div>

              {/* List of waves for THIS door */}
              <div class="space-y-1 mt-2">
                <div class="text-[10px] text-white/40 uppercase font-bold mb-1">此门口的波次</div>
                <div class="space-y-1 max-h-32 overflow-y-auto pr-1">
                  <For each={props.waves.filter(w => {
                    const spts = props.spawnPoints();
                    const idx = spts.find(p => p.x === props.selectedTile?.x && p.y === props.selectedTile?.y)?.index;
                    return w.spawnPointIndex === idx;
                  })}>
                    {wave => (
                      <div
                        onClick={() => props.startEditingWave(wave)}
                        class={`group flex items-center justify-between p-2 rounded text-[10px] border cursor-pointer ${props.editingWaveId === wave.id ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                      >
                        <div>
                          <span class="text-blue-400 font-mono w-8 inline-block">{wave.time}s</span>
                          <span class="font-bold ml-2">{props.allEnemyTemplates.find(t => t.id === wave.enemyType)?.name} x{wave.count}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); props.removeWave(wave.id); }}
                          class="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-500 transition-opacity"
                        >✕</button>
                      </div>
                    )}
                  </For>
                  <Show when={props.waves.filter(w => {
                    const spts = props.spawnPoints();
                    const idx = spts.find(p => p.x === props.selectedTile?.x && p.y === props.selectedTile?.y)?.index;
                    return w.spawnPointIndex === idx;
                  }).length === 0}>
                    <div class="text-[10px] text-white/20 italic p-2 bg-white/5 rounded border border-dashed border-white/5">暂无刷怪事件</div>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <div class="mt-auto p-4 border-t border-white/10 bg-slate-900/30">
          <button
            onClick={() => props.setShowGlobalWaves(true)}
            class="w-full bg-white/5 hover:bg-white/10 text-white/80 py-2 rounded text-[10px] font-bold border border-white/10 transition-all flex items-center justify-center gap-2"
          >
            <span>📋 查看全部波次时间轴</span>
          </button>
        </div>
      </div>
    </div>
  );
}

