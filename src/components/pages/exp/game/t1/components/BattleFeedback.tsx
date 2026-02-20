import { Show } from "solid-js";

interface BattleFeedbackProps {
  feedback: string | null;
}

export const BattleFeedback = (props: BattleFeedbackProps) => {
  return (
    <Show when={props.feedback}>
      <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
        <div class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-yellow-600 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-bounce tracking-tighter font-mono">
          {props.feedback}
        </div>
      </div>
    </Show>
  );
};
