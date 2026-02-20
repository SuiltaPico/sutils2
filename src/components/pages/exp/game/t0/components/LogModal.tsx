import { For, Show } from 'solid-js';

export const LogModal = (props: {
  show: boolean;
  logs: string[];
  onClose: () => void;
  endRef: (el: HTMLDivElement) => void;
}) => {
  return (
    <Show when={props.show}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
        <div class="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
          <div class="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
            <h3 class="text-lg font-bold text-slate-200">战斗日志</h3>
            <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
              ✕
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 font-mono text-sm text-slate-300 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <For each={props.logs}>
              {(log) => <div class="border-b border-slate-800/50 pb-1 last:border-0">{log}</div>}
            </For>
            <div ref={props.endRef} />
          </div>
        </div>
      </div>
    </Show>
  );
};
