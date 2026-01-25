import { For, Show } from 'solid-js';
import { LevelConfig } from '../types';
import { EditorConfig } from './types';

interface MapsLibraryProps {
  savedLevels: LevelConfig[];
  currentConfigId: string | number | undefined;
  loadLevel: (level: LevelConfig) => void;
  deleteLevel: (id: string | number, e: Event) => void;
  createNewLevel: () => void;
}

export default function MapsLibrary(props: MapsLibraryProps) {
  return (
    <div class="w-72 bg-slate-950 border-r border-white/10 flex flex-col shrink-0">
      <div class="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
        <h3 class="text-xs font-bold uppercase tracking-widest text-white/60">地图库</h3>
        <button
          onClick={props.createNewLevel}
          class="text-[10px] bg-blue-600 px-2 py-1 rounded font-bold"
        >+ 新建</button>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-2">
        <For each={props.savedLevels}>
          {level => (
            <div
              onClick={() => props.loadLevel(level)}
              class={`p-3 rounded border cursor-pointer transition-all ${props.currentConfigId === level.id ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
            >
              <div class="flex justify-between items-start">
                <span class="text-[10px] font-bold bg-white/10 px-1 rounded text-white/60">{level.code}</span>
                <button
                  onClick={(e) => props.deleteLevel(level.id, e)}
                  class="text-white/20 hover:text-red-500 transition-colors"
                >🗑️</button>
              </div>
              <div class="font-bold text-sm mt-1 truncate">{level.name}</div>
              <div class="text-[10px] text-white/40 mt-1 line-clamp-1">{level.description || '无描述'}</div>
            </div>
          )}
        </For>
        <Show when={props.savedLevels.length === 0}>
          <div class="text-center py-10 text-[10px] text-white/20 italic">暂无保存的地图</div>
        </Show>
      </div>
    </div>
  );
}



