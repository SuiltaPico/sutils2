import { Show } from "solid-js";
import { CardData } from "../core";
import {
  mdiCardsClub,
  mdiCardsDiamond,
  mdiCardsHeart,
  mdiCardsSpade,
  mdiHeart,
  mdiSpade,
} from "@mdi/js";
import { Icon } from "../../../../../common/Icon";

export const suitMap = {
  "♠": mdiCardsSpade,
  "♥": mdiCardsHeart,
  "♣": mdiCardsClub,
  "♦": mdiCardsDiamond,
};

export const Card = (props: {
  card: CardData;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
  index?: number;
  noEntryAnimation?: boolean;
  dimmed?: boolean;
  suitBoosted?: boolean;
}) => {
  return (
    <div
      data-id={props.card.id} // Important for FLIP tracking
      onClick={props.onClick}
      style={{ "animation-delay": `${(props.index || 0) * 0.1}s` }}
      class={`${
        props.small
          ? "w-[62.5px] max-md:w-[45px] h-[87.5px] max-md:h-[63px] text-xs py-1.5 px-1"
          : "w-[100px] h-[140px] text-lg p-2"
      }
      bg-white rounded-md shadow-lg border border-gray-400 flex flex-col justify-between select-none cursor-pointer relative overflow-hidden transition-all duration-200 ${
        props.noEntryAnimation ? "" : "animate-card-enter"
      } ${
        props.suitBoosted
          ? "-translate-y-8 ring-4 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)] z-50 scale-110"
          : props.selected
          ? "-translate-y-8 z-50 scale-110"
          : "hover:-translate-y-4 hover:z-50 hover:scale-105"
      } ${props.dimmed ? "grayscale opacity-60" : ""}`}
    >
      <div
        class={`font-bold ${
          props.card.color === "red" ? "text-red-600" : "text-gray-900"
        }`}
      >
        <div
          class={`${props.small ? "text-[10px] line-height-1.2" : "text-sm"}`}
        >
          {props.card.rank}
        </div>
        <Icon size={props.small ? 10 : 16} path={suitMap[props.card.suit]} />
      </div>

      <div
        class={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 ${
          props.card.color === "red" ? "text-red-600" : "text-gray-900"
        } ${props.small ? "text-xl" : "text-4xl"}`}
      >
        <Icon path={suitMap[props.card.suit]} />
      </div>

      <div
        class={`font-bold self-end rotate-180 ${
          props.card.color === "red" ? "text-red-600" : "text-gray-900"
        }`}
      >
        <div
          class={`${props.small ? "text-[10px] line-height-1.2" : "text-sm"}`}
        >
          {props.card.rank}
        </div>
        <Icon size={props.small ? 10 : 16} path={suitMap[props.card.suit]} />
      </div>
    </div>
  );
};
