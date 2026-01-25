import { For, Show } from 'solid-js';
import { EnemyTemplate } from '../types';

interface MonstersLibraryProps {
  allEnemyTemplates: EnemyTemplate[];
  editingEnemy: EnemyTemplate | null;
  setEditingEnemy: (enemy: EnemyTemplate | null) => void;
  saveEnemyToDb: () => void;
  deleteEnemy: (id: string) => void;
}

export default function MonstersLibrary(props: MonstersLibraryProps) {
  return (
    <div class="flex-1 h-full flex flex-col p-6 overflow-hidden">
      <div class="flex gap-6 h-full">
        {/* List */}
        <div class="w-80 bg-slate-950 rounded-lg border border-white/10 flex flex-col overflow-hidden">
          <div class="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 class="font-bold text-sm uppercase tracking-widest text-white/60">怪物库</h3>
            <button
              onClick={() => props.setEditingEnemy({ id: '', name: '新怪物', hp: 1000, speed: 1.0, def: 0, description: '', color: '#ff0000', isCustom: true })}
              class="text-xs bg-blue-600 px-2 py-1 rounded font-bold"
            >+ 新建</button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            <For each={props.allEnemyTemplates}>
              {enemy => (
                <div
                  onClick={() => props.setEditingEnemy({ ...enemy })}
                  class={`p-3 rounded border cursor-pointer transition-all ${props.editingEnemy?.id === enemy.id ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                  <div class="flex items-center gap-3">
                    <div class="w-4 h-4 rounded-full" style={{ "background-color": enemy.color }}></div>
                    <span class="font-bold text-sm">{enemy.name}</span>
                    {enemy.isCustom && <span class="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">自定义</span>}
                  </div>
                  <div class="text-[10px] text-white/40 mt-1 line-clamp-1">{enemy.description}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Editor */}
        <div class="flex-1 bg-slate-900 rounded-lg border border-white/10 p-6 overflow-y-auto">
          <Show when={props.editingEnemy} fallback={<div class="h-full flex items-center justify-center text-white/20 italic">选择或创建一个怪物进行编辑</div>}>
            <div class="max-w-xl space-y-6">
              <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold">编辑怪物: {props.editingEnemy?.name}</h2>
                <Show when={props.editingEnemy?.isCustom}>
                  <button onClick={() => props.deleteEnemy(props.editingEnemy!.id)} class="text-xs text-red-400 hover:text-red-300">删除配置</button>
                </Show>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <label class="block">
                  <span class="text-xs text-white/40 block mb-1">名称</span>
                  <input type="text" value={props.editingEnemy?.name}
                    onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, name: e.currentTarget.value })}
                    class="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
                <label class="block">
                  <span class="text-xs text-white/40 block mb-1">图案 (URL 或 图标)</span>
                  <div class="flex gap-2">
                    <input type="text" value={props.editingEnemy?.pattern || ''}
                      onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, pattern: e.currentTarget.value })}
                      placeholder="URL 或 🕷️/🐺/🛡️"
                      class="flex-1 bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                    <div class="flex gap-1 bg-black/20 p-1 rounded">
                      <For each={['🕷️', '🐺', '🛡️', '🧟', '👻', '💀']}>
                        {icon => (
                          <button 
                            onClick={() => props.setEditingEnemy({ ...props.editingEnemy!, pattern: icon })}
                            class="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded text-sm"
                          >{icon}</button>
                        )}
                      </For>
                    </div>
                  </div>
                </label>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <label class="block col-span-1">
                  <span class="text-xs text-white/40 block mb-1">代表色</span>
                  <div class="flex gap-2">
                    <input type="color" value={props.editingEnemy?.color}
                      onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, color: e.currentTarget.value })}
                      class="w-10 h-9 bg-slate-950 border border-white/10 rounded outline-none p-1"
                    />
                    <input type="text" value={props.editingEnemy?.color}
                      onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, color: e.currentTarget.value })}
                      class="flex-1 bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                </label>
              </div>

              <div class="grid grid-cols-3 gap-4">
                <label class="block">
                  <span class="text-xs text-white/40 block mb-1">生命值 (HP)</span>
                  <input type="number" value={props.editingEnemy?.hp}
                    onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, hp: parseInt(e.currentTarget.value) || 0 })}
                    class="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
                <label class="block">
                  <span class="text-xs text-white/40 block mb-1">防御力 (DEF)</span>
                  <input type="number" value={props.editingEnemy?.def}
                    onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, def: parseInt(e.currentTarget.value) || 0 })}
                    class="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
                <label class="block">
                  <span class="text-xs text-white/40 block mb-1">移动速度</span>
                  <input type="number" step="0.1" value={props.editingEnemy?.speed}
                    onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, speed: parseFloat(e.currentTarget.value) || 0 })}
                    class="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </label>
              </div>

              <label class="block">
                <span class="text-xs text-white/40 block mb-1">描述</span>
                <textarea value={props.editingEnemy?.description}
                  onInput={e => props.setEditingEnemy({ ...props.editingEnemy!, description: e.currentTarget.value })}
                  class="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none h-24 resize-none"
                />
              </label>

              <div class="pt-6 border-t border-white/10">
                <button
                  onClick={props.saveEnemyToDb}
                  class="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded font-bold transition-all shadow-lg"
                >保存配置</button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

