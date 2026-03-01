import { Show, createSignal } from 'solid-js';
import { calculateReductionPercentage } from '../core';

export const HelpModal = (props: {
  show: boolean;
  onClose: () => void;
}) => {
  const [resonanceLevel, setResonanceLevel] = createSignal(1);

  return (
    <Show when={props.show}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={props.onClose}>
        <div class="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div class="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-900/50">
            <h3 class="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span class="w-1 h-5 bg-cyan-500 rounded-full"></span>
              战斗指南
            </h3>
            <button onClick={props.onClose} class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all">
              ✕
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent text-slate-300">
            {/* Hand Types */}
            <section>
              <h4 class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                牌型表
                <span class="h-px flex-1 bg-cyan-500/20"></span>
              </h4>
              <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-800/20">
                <table class="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr class="bg-slate-800/60 text-slate-400 font-medium">
                      <th class="p-3 border-b border-slate-700">分类</th>
                      <th class="p-3 border-b border-slate-700">牌型名称</th>
                      <th class="p-3 border-b border-slate-700">构成要求</th>
                      <th class="p-3 border-b border-slate-700 text-right">倍率 (q)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/50">
                    <tr>
                      <td rowspan="3" class="p-3 font-medium text-slate-500 bg-slate-900/20">基础牌型</td>
                      <td class="p-3 font-bold text-slate-200">单张</td>
                      <td class="p-3 text-slate-400">任意 1 张牌</td>
                      <td class="p-3 text-right font-mono text-amber-400">1</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">对子</td>
                      <td class="p-3 text-slate-400">2 张点数相同</td>
                      <td class="p-3 text-right font-mono text-amber-400">2</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">两对</td>
                      <td class="p-3 text-slate-400">2 组对子</td>
                      <td class="p-3 text-right font-mono text-amber-400">3</td>
                    </tr>
                    <tr>
                      <td rowspan="6" class="p-3 font-medium text-slate-500 bg-slate-900/20">高级牌型</td>
                      <td class="p-3 font-bold text-slate-200">三条</td>
                      <td class="p-3 text-slate-400">3 张点数相同</td>
                      <td class="p-3 text-right font-mono text-amber-400">4</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">顺子</td>
                      <td class="p-3 text-slate-400">5 张连续点数</td>
                      <td class="p-3 text-right font-mono text-amber-400">5</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">同花</td>
                      <td class="p-3 text-slate-400">5 张相同花色</td>
                      <td class="p-3 text-right font-mono text-amber-400">5</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">三带二</td>
                      <td class="p-3 text-slate-400">3 张相同 + 1 对子</td>
                      <td class="p-3 text-right font-mono text-amber-400">5</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">四条</td>
                      <td class="p-3 text-slate-400">4 张点数相同</td>
                      <td class="p-3 text-right font-mono text-amber-400">8</td>
                    </tr>
                    <tr>
                      <td class="p-3 font-bold text-slate-200">同花顺</td>
                      <td class="p-3 text-slate-400">5 张连续且同花</td>
                      <td class="p-3 text-right font-mono text-amber-400">11</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Resonance Buffs */}
            <section>
              <div class="flex justify-between items-end mb-4">
                <h4 class="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  共鸣机制
                  <span class="h-px w-24 bg-cyan-500/20"></span>
                </h4>
                <div class="flex flex-col items-end gap-2">
                  <span class="text-[10px] text-slate-500">模拟共鸣强度 (强度 = 同花牌数 - 2)</span>
                  <div class="flex items-center gap-3 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={resonanceLevel()} 
                      onInput={(e) => setResonanceLevel(parseInt(e.currentTarget.value))}
                      class="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span class="text-xs font-mono font-bold text-cyan-400 w-4 text-center">{resonanceLevel()}</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-3">
                  <h5 class="text-xs font-bold text-rose-400/80 flex items-center gap-2 px-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500/50"></span>
                    攻势共鸣 (进攻时触发)
                  </h5>
                  <div class="grid gap-2">
                    {[
                      { suit: '♦', name: '甲 (方片)', effect: '护盾', value: () => resonanceLevel(), unit: '点', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
                      { suit: '♠', name: '刃 (黑桃)', effect: '真伤', value: () => resonanceLevel() * 2, unit: '点', color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
                      { suit: '♥', name: '血 (红桃)', effect: '回复/净化', value: () => resonanceLevel(), unit: '点/层', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
                      { suit: '♣', name: '煞 (梅花)', effect: '中毒', value: () => resonanceLevel(), unit: '层', color: 'bg-lime-500/10 border-lime-500/20 text-lime-400' },
                    ].map(item => (
                      <div class={`flex items-center justify-between p-2.5 rounded-lg border ${item.color}`}>
                        <div class="flex items-center gap-2">
                          <span class="text-xl w-6 text-center">{item.suit}</span>
                          <span class="text-xs font-bold opacity-90">{item.name}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-[10px] opacity-60">{item.effect}</span>
                          <span class="text-sm font-mono font-bold">+{item.value()}{item.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div class="space-y-3">
                  <h5 class="text-xs font-bold text-blue-400/80 flex items-center gap-2 px-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500/50"></span>
                    守势共鸣 (防御时触发)
                  </h5>
                  <div class="grid gap-2">
                    {[
                      { suit: '♦', name: '甲 (方片)', effect: '护盾', value: () => resonanceLevel(), unit: '点', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
                      { suit: '♠', name: '刃 (黑桃)', effect: '减伤', value: () => Math.round(calculateReductionPercentage(resonanceLevel()) * 100), unit: '%', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
                      { suit: '♥', name: '血 (红桃)', effect: '回复/净化', value: () => resonanceLevel(), unit: '点/层', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
                      { suit: '♣', name: '煞 (梅花)', effect: '愤怒', value: () => resonanceLevel(), unit: '点', color: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
                    ].map(item => (
                      <div class={`flex items-center justify-between p-2.5 rounded-lg border ${item.color}`}>
                        <div class="flex items-center gap-2">
                          <span class="text-xl w-6 text-center">{item.suit}</span>
                          <span class="text-xs font-bold opacity-90">{item.name}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-[10px] opacity-60">{item.effect}</span>
                          <span class="text-sm font-mono font-bold">+{item.value()}{item.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Card Order */}
            <section>
              <h4 class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                点数大小顺序
                <span class="h-px flex-1 bg-cyan-500/20"></span>
              </h4>
              <div class="bg-slate-800/40 border border-slate-700/50 p-4 rounded-lg flex justify-between items-center text-lg font-mono text-slate-300">
                {['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'].map((rank, i) => (
                  <div class="flex items-center gap-1.5">
                    <span class={rank === '2' ? 'text-amber-400 font-bold' : ''}>{rank}</span>
                    {i < 12 && <span class="text-slate-600 text-sm">/</span>}
                  </div>
                ))}
              </div>
              <p class="mt-2 text-[10px] text-slate-500 italic text-center">※ 3 最小，2 最大。J=11, Q=12, K=13, A=14, 2=15</p>
            </section>
          </div>

          <div class="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-center">
            <button 
              onClick={props.onClose}
              class="px-8 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold rounded-full transition-colors border border-slate-700"
            >
              了解
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
