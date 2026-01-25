import { For, Show } from 'solid-js';
import { EditorWaveEvent } from './types';
import { EnemyTemplate } from '../types';

interface GlobalWavesModalProps {
  waves: EditorWaveEvent[];
  allEnemyTemplates: EnemyTemplate[];
  spawnPoints: () => { x: number; y: number; index: number }[];
  exitPoints: () => { x: number; y: number; index: number }[];
  setSelectedTile: (tile: { x: number; y: number } | null) => void;
  setSelectedTool: (id: number) => void;
  setShowGlobalWaves: (show: boolean) => void;
  startEditingWave: (wave: EditorWaveEvent) => void;
  removeWave: (id: string) => void;
}

export default function GlobalWavesModal(props: GlobalWavesModalProps) {
  return (
    <div class="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-10" onClick={() => props.setShowGlobalWaves(false)}>
      <div class="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 bg-slate-950 flex justify-between items-center">
          <div>
            <h2 class="text-xl font-black italic">波次总览 (时间轴)</h2>
            <p class="text-xs text-white/40">列出所有入口的刷怪事件</p>
          </div>
          <button onClick={() => props.setShowGlobalWaves(false)} class="hover:text-white text-white/50 text-2xl">&times;</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2 bg-black/20">
          <Show when={props.waves.length === 0}>
            <div class="py-20 text-center text-white/20 italic">
              暂无波次事件。
            </div>
          </Show>
          <For each={props.waves}>
            {wave => {
              const template = props.allEnemyTemplates.find(t => t.id === wave.enemyType);
              const spawnPoint = props.spawnPoints().find(p => p.index === wave.spawnPointIndex);
              const exitPoint = props.exitPoints().find(p => p.index === (wave.targetExitIndex ?? 0));
              return (
                <div
                  onClick={() => {
                    if (spawnPoint) {
                      props.setSelectedTile({ x: spawnPoint.x, y: spawnPoint.y });
                      props.setSelectedTool(-1); // Switch to select mode
                      props.setShowGlobalWaves(false);
                    }
                    props.startEditingWave(wave);
                  }}
                  class="flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 rounded border border-white/5 transition-all group cursor-pointer"
                >
                  <div class="w-16 font-mono text-blue-400 font-bold text-right">
                    {wave.time}s
                  </div>
                  <div class="w-1 h-8 bg-white/10 rounded-full"></div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-white">{template?.name || wave.enemyType}</span>
                      <span class="text-xs bg-white/10 px-1.5 py-0.5 rounded text-white/60">x{wave.count}</span>
                    </div>
                    <div class="text-[10px] text-white/40">
                      间隔 {wave.interval}ms ·
                      <span class={`ml-1 ${spawnPoint ? 'text-red-400' : 'text-orange-400'}`}>
                        {spawnPoint ? `红门 ${wave.spawnPointIndex + 1} (${spawnPoint.x},${spawnPoint.y})` : `未知红门 ${wave.spawnPointIndex}`}
                      </span>
                      <Show when={props.exitPoints().length > 1}>
                        <span> → </span>
                        <span class={`${exitPoint ? 'text-blue-400' : 'text-orange-400'}`}>
                          {exitPoint ? `蓝门 ${(wave.targetExitIndex ?? 0) + 1} (${exitPoint.x},${exitPoint.y})` : `蓝门 ${(wave.targetExitIndex ?? 0) + 1}`}
                        </span>
                      </Show>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); props.removeWave(wave.id); }}
                    class="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-500 transition-opacity text-lg px-2"
                    title="删除此波次"
                  >✕</button>
                  <div class="text-[10px] text-white/20 group-hover:text-white/40 transition-colors uppercase font-bold">
                    点击跳转编辑
                  </div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="p-4 border-t border-white/10 bg-slate-950 text-right">
          <span class="text-xs text-white/40">总敌人数量: {props.waves.reduce((a, c) => a + c.count, 0)}</span>
        </div>
      </div>
    </div>
  );
}

