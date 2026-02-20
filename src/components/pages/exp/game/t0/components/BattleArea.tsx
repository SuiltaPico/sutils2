import { For, Show, createMemo } from 'solid-js';
import { PlayerState, GamePhase } from '../types';
import { Card } from './Card';

export const BattleArea = (props: {
  phase: GamePhase;
  attackerId: string;
  playerA: PlayerState;
  playerB: PlayerState;
  phaseInfo: { title: string; desc: string; color: string; icon: string };
  getDamageSourceWithTotal: (attackVal: number, defenseVal: number, trueDmg: number) => string;
}) => {
  const isShowdown = () => props.phase === GamePhase.COMBAT_SHOWDOWN;
  const isDefend = () => props.phase === GamePhase.P1_DEFEND || props.phase === GamePhase.P2_DEFEND;
  const shouldShow = () => isShowdown() || isDefend();

  const attacker = () => props.attackerId === 'A' ? props.playerA : props.playerB;
  const defender = () => props.attackerId === 'A' ? props.playerB : props.playerA;
  const attackerPower = () => attacker().lastAction?.totalValue || 0;
  const defenderPower = () => defender().lastAction?.totalValue || 0;
  const attackerTrueDamage = () => attacker().lastAction?.buffs?.trueDamage || 0;
  const showdownDamage = () => Math.max(0, attackerPower() - defenderPower()) + attackerTrueDamage();

  return (
    <Show when={shouldShow()} fallback={
      <div class="h-64 max-md:h-28 w-full max-w-4xl mx-auto flex flex-col items-center justify-center gap-4 select-none transition-all duration-500">
        <div class={`text-4xl font-black tracking-widest uppercase flex items-center gap-4 ${props.phaseInfo.color} drop-shadow-lg animate-pulse`}>
          <span>{props.phaseInfo.icon}</span>
          {props.phaseInfo.title}
          <span>{props.phaseInfo.icon}</span>
        </div>
        <div class="text-slate-400 font-bold text-lg tracking-wider bg-black/30 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm">
          {props.phaseInfo.desc}
        </div>
      </div>
    }>
      <div class="w-full max-w-5xl mx-auto flex flex-col items-center justify-center gap-6 p-8 bg-black/40 rounded-3xl border border-slate-800/50 shadow-2xl backdrop-blur-md animate-fade-in-up relative overflow-hidden transition-all duration-500 min-h-[320px]">
        <div class={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full blur-3xl -z-10 transition-colors duration-1000 ${isShowdown() ? 'bg-amber-900/20' : 'bg-rose-900/10'}`} />

        <div class="flex w-full justify-between items-start gap-8 relative">
          {/* Attacker Side (Left) */}
          <div class="flex-1 flex flex-col items-center gap-4">
            <div class="text-rose-400 font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-2 drop-shadow-md">
              <span>⚔️</span> {attacker().name}
            </div>

            <Show when={attacker().lastAction} keyed>
              {(action) => (
                <>
                  <Show when={action.pattern === '放弃攻击'} fallback={
                    <div class="flex gap-2 justify-center perspective-1000 flex-wrap">
                      <For each={[...action.cards].sort((a, b) => (action.relevantCardIds.has(b.id) ? 1 : 0) - (action.relevantCardIds.has(a.id) ? 1 : 0))}>
                        {(card, index) => (
                          <Card
                            card={card}
                            index={index()}
                            selected={false}
                            onClick={() => { }}
                            small
                            dimmed={!action.relevantCardIds.has(card.id)}
                          />
                        )}
                      </For>
                    </div>
                  }>
                    <div class="text-slate-500 font-bold text-xl py-8">放弃攻击</div>
                  </Show>

                  <div class="flex flex-col items-center gap-1 bg-black/30 px-4 py-2 rounded-xl border border-white/5 w-full">
                    <div class="text-xs text-slate-400 uppercase tracking-wider font-bold">攻击力</div>
                    <div class="text-2xl font-black text-rose-500 drop-shadow-lg font-mono">
                      {action.totalValue}
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono">
                      {action.multiplier} ({action.pattern})
                    </div>
                  </div>
                </>
              )}
            </Show>
          </div>

          {/* VS / Result Center */}
          <div class="flex flex-col items-center justify-center pt-12 relative z-10 w-32">
            <Show when={isShowdown()} fallback={
              <div class="text-4xl font-black text-slate-700/50 italic pr-2 animate-pulse">VS</div>
            }>
              <div class="flex flex-col items-center gap-2 animate-bounce-in bg-black/60 p-4 rounded-2xl border border-amber-500/30 shadow-2xl backdrop-blur-xl">
                <div class="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-600 drop-shadow-lg">
                  {showdownDamage()}
                </div>
                
                <div class="flex flex-col items-center gap-1 w-full">
                  <Show when={attacker().lastAction?.buffs?.trueDamage && attacker().lastAction!.buffs!.trueDamage > 0}>
                    <div class="flex items-center gap-1 text-xs font-bold text-purple-400 animate-pulse">
                      <span>⚡</span> 真伤: {attacker().lastAction?.buffs?.trueDamage}
                    </div>
                  </Show>
                  <Show when={attacker().lastAction?.buffs?.poison && attacker().lastAction!.buffs!.poison > 0}>
                    <div class="flex items-center gap-1 text-xs font-bold text-green-400">
                      <span>☠️</span> 中毒: +{attacker().lastAction?.buffs?.poison}
                    </div>
                  </Show>
                  <Show when={attacker().lastAction?.buffs?.heal && attacker().lastAction!.buffs!.heal > 0}>
                    <div class="flex items-center gap-1 text-xs font-bold text-emerald-400">
                      <span>❤️</span> 回复: +{attacker().lastAction?.buffs?.heal}
                    </div>
                  </Show>
                </div>

                <div class="w-full h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent my-1" />
                <div class="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                  {props.getDamageSourceWithTotal(attackerPower(), defenderPower(), attackerTrueDamage())}
                </div>
              </div>
            </Show>
          </div>

          {/* Defender Side (Right) */}
          <div class="flex-1 flex flex-col items-center gap-4 transition-opacity duration-500" style={{ opacity: isShowdown() ? 1 : 0.3, filter: isShowdown() ? 'none' : 'blur(2px)' }}>
            <div class="text-sky-400 font-bold text-lg tracking-widest uppercase mb-1 flex items-center gap-2 drop-shadow-md">
              <span>🛡️</span> {defender().name}
            </div>

            <Show when={isShowdown()}>
              <Show when={defender().lastAction} keyed>
                {(action) => (
                  <>
                    <Show when={action.pattern === '放弃防御'} fallback={
                      <div class="flex gap-2 justify-center perspective-1000 flex-wrap">
                        <For each={[...action.cards].sort((a, b) => (action.relevantCardIds.has(b.id) ? 1 : 0) - (action.relevantCardIds.has(a.id) ? 1 : 0))}>
                          {(card, index) => (
                            <div
                              class="animate-fly-in-bottom"
                              style={{ "animation-delay": `${index() * 0.1}s` }}
                            >
                              <Card
                                card={card}
                                index={index()}
                                selected={false}
                                onClick={() => { }}
                                small
                                noEntryAnimation
                                dimmed={!action.relevantCardIds.has(card.id)}
                              />
                            </div>
                          )}
                        </For>
                      </div>
                    }>
                      <div class="text-slate-500 font-bold text-xl py-8 animate-fade-in-up">放弃防御</div>
                    </Show>

                    <div class="flex flex-col items-center gap-1 bg-black/30 px-4 py-2 rounded-xl border border-white/5 w-full animate-fade-in-up">
                      <div class="text-xs text-slate-400 uppercase tracking-wider font-bold">防御力</div>
                      <div class="text-2xl font-black text-sky-500 drop-shadow-lg font-mono">
                        {action.totalValue}
                      </div>
                      <div class="text-[10px] text-slate-500 font-mono">
                        {action.multiplier} ({action.pattern})
                      </div>
                    </div>
                  </>
                )}
              </Show>
            </Show>

            <Show when={!isShowdown()}>
              <div class="h-32 flex items-center justify-center text-slate-600 font-bold text-sm uppercase tracking-widest animate-pulse">
                思考中...
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
