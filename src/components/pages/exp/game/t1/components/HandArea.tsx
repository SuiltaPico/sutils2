import { For, createMemo } from "solid-js";
import { PlayerState, GamePhase, isAttackPhase, isDefendPhase } from "../types";
import { Card } from "./Card";
import { CardData, identifyPattern } from "../core";
import { useFlipAnimation } from "../hooks";
import clsx from "clsx";
import { isMobileDevice } from "../utils";

export const HandArea = (props: {
  player: PlayerState;
  phase: GamePhase;
  attackerId: string;
  onToggleSelect: (playerId: string, cardId: string) => void;
  small?: boolean;
}) => {
  const setRef = useFlipAnimation(() => props.player.hand);

  const isAttacker = () => props.attackerId === props.player.id;
  const isMyTurn = () =>
    (isAttacker() && isAttackPhase(props.phase)) ||
    (!isAttacker() && isDefendPhase(props.phase));

  const isAttacking = () => isAttacker() && isAttackPhase(props.phase);
  const isDefending = () => !isAttacker() && isDefendPhase(props.phase);

  const suitBoostedCardIds = createMemo(() => {
    const result = new Set<string>();
    if (!isAttacker() || !isAttackPhase(props.phase)) return result;

    const selectedCards = props.player.hand.filter((c: CardData) =>
      props.player.selectedIds.has(c.id)
    );
    if (selectedCards.length < 3) return result;

    const bySuit: Record<string, CardData[]> = {};
    selectedCards.forEach((card: CardData) => {
      if (!bySuit[card.suit]) bySuit[card.suit] = [];
      bySuit[card.suit].push(card);
    });

    Object.values(bySuit).forEach((cards) => {
      if (cards.length >= 3) {
        cards.forEach((card) => result.add(card.id));
      }
    });

    return result;
  });

  const junkCardIds = createMemo(() => {
    const selectedCards = props.player.hand.filter((c: CardData) =>
      props.player.selectedIds.has(c.id)
    );
    if (selectedCards.length === 0) return new Set<string>();

    const pattern = identifyPattern(selectedCards);
    const relevantIds = new Set(pattern.relevantCards.map((c) => c.id));

    const junk = new Set<string>();
    selectedCards.forEach((c) => {
      if (!relevantIds.has(c.id)) {
        junk.add(c.id);
      }
    });
    return junk;
  });

  return (
    <div
      class={`flex-1 min-w-0 transition-opacity duration-300 ${
        isMyTurn() ? "opacity-100" : "opacity-60 grayscale-[0.8]"
      }`}
    >
      <div
        class={`flex items-center overflow-visible p-4 max-md:px-4 max-md:py-2 backdrop-blur-sm h-full border-t border-b transition-all duration-300 ${
          isAttacking()
            ? "bg-rose-900/20 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
            : isDefending()
            ? "bg-cyan-900/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            : "bg-slate-950/50 border-white/5"
        }`}
      >
        <div
          ref={setRef}
          class="flex items-center justify-center group/hand px-4 mx-auto"
        >
          <For each={props.player.hand}>
            {(card, index) => (
              <div
                data-id={card.id}
                class={clsx("transition-all duration-300 ease-out",
                  isMobileDevice ? "-ml-2" : "-ml-4"
                )}
                style={{
                  "z-index": index(),
                //   transform: `
                //     rotate(${
                //       (index() - (props.player.hand.length - 1) / 2) * 1
                //     }deg) translateY(${
                //     Math.abs(props.player.hand.length / 2 - index()) * 1
                //   }px)
                // `,
                }}
              >
                <Card
                  card={card}
                  index={index()}
                  selected={props.player.selectedIds.has(card.id)}
                  suitBoosted={suitBoostedCardIds().has(card.id)}
                  isJunk={junkCardIds().has(card.id)}
                  onClick={() => props.onToggleSelect(props.player.id, card.id)}
                  small={props.small}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
