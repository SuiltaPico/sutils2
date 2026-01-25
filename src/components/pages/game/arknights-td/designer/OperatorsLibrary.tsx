import { For, Show } from 'solid-js';
import { OperatorTemplate } from '../types';

interface OperatorsLibraryProps {
  allOperatorTemplates: OperatorTemplate[];
  editingOperator: OperatorTemplate | null;
  setEditingOperator: (op: OperatorTemplate | null) => void;
  saveOperatorToDb: () => void;
  deleteOperator: (id: string) => void;
  addSkillEvent: () => void;
  removeSkillEvent: (index: number) => void;
}

export default function OperatorsLibrary(props: OperatorsLibraryProps) {
  return (
    <div class="flex-1 h-full flex flex-col p-6 overflow-hidden">
      <div class="flex gap-6 h-full">
        {/* List */}
        <div class="w-80 bg-slate-950 rounded-lg border border-white/10 flex flex-col overflow-hidden">
          <div class="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 class="font-bold text-sm uppercase tracking-widest text-white/60">干员库</h3>
            <button
              onClick={() => props.setEditingOperator({
                id: '',
                type: 'GUARD',
                label: '新干员',
                cost: 15,
                range: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                interval: 1000,
                damage: 300,
                hp: 1000,
                def: 100,
                block: 2,
                color: '#fbbf24',
                skill: { name: '新技能', description: '', sp: 20, duration: 10000, events: [] },
                isCustom: true
              })}
              class="text-xs bg-blue-600 px-2 py-1 rounded font-bold"
            >+ 新建</button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            <For each={props.allOperatorTemplates}>
              {op => (
                <div
                  onClick={() => props.setEditingOperator({ ...op })}
                  class={`p-3 rounded border cursor-pointer transition-all ${props.editingOperator?.id === op.id ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                  <div class="flex items-center gap-3">
                    <div class="w-4 h-4 rounded border" style={{ "background-color": op.color }}></div>
                    <span class="font-bold text-sm">{op.label}</span>
                    {op.isCustom && <span class="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">自定义</span>}
                  </div>
                  <div class="text-[10px] text-white/40 mt-1 line-clamp-1">{op.type} · Cost {op.cost}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Editor */}
        <div class="flex-1 bg-slate-900 rounded-lg border border-white/10 p-6 overflow-y-auto">
          <Show when={props.editingOperator} fallback={<div class="h-full flex items-center justify-center text-white/20 italic">选择或创建一个干员进行编辑</div>}>
            <div class="max-w-2xl space-y-8">
              <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold">编辑干员: {props.editingOperator?.label}</h2>
                <Show when={props.editingOperator?.isCustom}>
                  <button onClick={() => props.deleteOperator(props.editingOperator!.id)} class="text-xs text-red-400 hover:text-red-300">删除配置</button>
                </Show>
              </div>

              {/* Basic Stats */}
              <div class="space-y-4">
                <h3 class="text-xs font-black text-blue-400 uppercase tracking-widest">基础数值</h3>
                <div class="grid grid-cols-3 gap-4">
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">代号</span>
                    <input type="text" value={props.editingOperator?.label}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, label: e.currentTarget.value })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">职业</span>
                    <select
                      value={props.editingOperator?.type}
                      onChange={e => props.setEditingOperator({ ...props.editingOperator!, type: e.currentTarget.value as any })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    >
                      <option value="DEFENDER">重装 (DEFENDER)</option>
                      <option value="GUARD">近卫 (GUARD)</option>
                      <option value="SNIPER">狙击 (SNIPER)</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">部署费用 (Cost)</span>
                    <input type="number" value={props.editingOperator?.cost}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, cost: parseInt(e.currentTarget.value) || 0 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">图案 (图片 URL 或 图标)</span>
                    <div class="flex gap-2">
                      <input type="text" value={props.editingOperator?.pattern || ''}
                        onInput={e => props.setEditingOperator({ ...props.editingOperator!, pattern: e.currentTarget.value })}
                        placeholder="URL 或 🛡️/⚔️/🏹"
                        class="flex-1 bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                      />
                      <div class="flex gap-1 bg-black/20 p-1 rounded">
                        <For each={['🛡️', '⚔️', '🏹', '🔥', '❄️', '⚡']}>
                          {icon => (
                            <button 
                              onClick={() => props.setEditingOperator({ ...props.editingOperator!, pattern: icon })}
                              class="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded text-xs"
                            >{icon}</button>
                          )}
                        </For>
                      </div>
                    </div>
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">攻击音效 (URL 或 预设)</span>
                    <div class="flex flex-col gap-2">
                      <input type="text" value={props.editingOperator?.attackSound || ''}
                        onInput={e => props.setEditingOperator({ ...props.editingOperator!, attackSound: e.currentTarget.value })}
                        placeholder="URL 或 预设名称"
                        class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                      />
                      <div class="flex gap-1">
                        <For each={['SNIPER', 'GUARD', 'DEFENDER', 'MAGIC']}>
                          {preset => (
                            <button 
                              onClick={() => props.setEditingOperator({ ...props.editingOperator!, attackSound: preset })}
                              class={`text-[8px] px-2 py-1 rounded border transition-all ${props.editingOperator?.attackSound === preset ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                            >{preset}</button>
                          )}
                        </For>
                      </div>
                    </div>
                  </label>
                </div>

                <div class="grid grid-cols-4 gap-4">
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">生命值 (HP)</span>
                    <input type="number" value={props.editingOperator?.hp}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, hp: parseInt(e.currentTarget.value) || 0 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">攻击力 (ATK)</span>
                    <input type="number" value={props.editingOperator?.damage}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, damage: parseInt(e.currentTarget.value) || 0 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">防御力 (DEF)</span>
                    <input type="number" value={props.editingOperator?.def}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, def: parseInt(e.currentTarget.value) || 0 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">阻挡数</span>
                    <input type="number" value={props.editingOperator?.block}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, block: parseInt(e.currentTarget.value) || 0 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">攻击间隔 (ms)</span>
                    <input type="number" step="100" value={props.editingOperator?.interval}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, interval: parseInt(e.currentTarget.value) || 1000 })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                      placeholder="例如: 1000"
                    />
                    <span class="text-[9px] text-white/30 block mt-1">值越小攻速越快 (建议: 800-2000)</span>
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">颜色</span>
                    <input type="color" value={props.editingOperator?.color}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, color: e.currentTarget.value })}
                      class="w-full h-9 bg-slate-950 border border-white/10 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Skill Editor */}
              <div class="space-y-4 pt-6 border-t border-white/10">
                <h3 class="text-xs font-black text-yellow-500 uppercase tracking-widest">技能与事件</h3>
                <div class="grid grid-cols-3 gap-4">
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">技能名称</span>
                    <input type="text" value={props.editingOperator?.skill.name}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, name: e.currentTarget.value } })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">技力消耗 (SP)</span>
                    <input type="number" value={props.editingOperator?.skill.sp}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, sp: parseInt(e.currentTarget.value) || 0 } })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                  <label class="block">
                    <span class="text-[10px] text-white/40 block mb-1">持续时间 (ms)</span>
                    <input type="number" step="500" value={props.editingOperator?.skill.duration}
                      onInput={e => props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, duration: parseInt(e.currentTarget.value) || 0 } })}
                      class="w-full bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                    />
                  </label>
                </div>

                <div class="bg-black/20 rounded p-4 space-y-4 border border-white/5">
                  <div class="flex justify-between items-center">
                    <span class="text-[10px] text-white/60 font-bold uppercase">技能触发事件 (Skill Events)</span>
                    <button
                      onClick={props.addSkillEvent}
                      class="text-[10px] bg-yellow-600/20 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded hover:bg-yellow-600 hover:text-white"
                    >+ 添加事件</button>
                  </div>

                  <div class="space-y-2">
                    <For each={props.editingOperator?.skill.events || []}>
                      {(event, index) => (
                        <div class="flex gap-2 items-center bg-white/5 p-2 rounded border border-white/5">
                          <select
                            value={event.type}
                            onChange={e => {
                              const events = [...(props.editingOperator!.skill.events || [])];
                              events[index()] = { ...event, type: e.currentTarget.value as any };
                              props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, events } });
                            }}
                            class="bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                          >
                            <option value="HEAL">群体治疗</option>
                            <option value="STUN">群体晕眩</option>
                            <option value="BUFF_ATK">自身攻击提升</option>
                            <option value="DP_GAIN">获得部署费用</option>
                            <option value="DAMAGE_ALL">范围伤害</option>
                          </select>
                          <input
                            type="number"
                            value={event.value}
                            onInput={e => {
                              const events = [...(props.editingOperator!.skill.events || [])];
                              events[index()] = { ...event, value: parseFloat(e.currentTarget.value) || 0 };
                              props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, events } });
                            }}
                            class="w-20 bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                            placeholder="数值"
                          />
                          <Show when={['STUN', 'DAMAGE_ALL', 'HEAL'].includes(event.type)}>
                            <input
                              type="number"
                              value={event.radius || 2}
                              onInput={e => {
                                const events = [...(props.editingOperator!.skill.events || [])];
                                events[index()] = { ...event, radius: parseFloat(e.currentTarget.value) || 2 };
                                props.setEditingOperator({ ...props.editingOperator!, skill: { ...props.editingOperator!.skill, events } });
                              }}
                              class="w-16 bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                              placeholder="半径"
                            />
                          </Show>
                          <button onClick={() => props.removeSkillEvent(index())} class="text-white/20 hover:text-red-500 ml-auto text-xs">✕</button>
                        </div>
                      )}
                    </For>
                    <Show when={!(props.editingOperator?.skill?.events?.length)}>
                      <div class="text-center py-4 text-[10px] text-white/20 italic border border-dashed border-white/10 rounded">暂无技能事件</div>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="pt-6 border-t border-white/10">
                <button
                  onClick={props.saveOperatorToDb}
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

