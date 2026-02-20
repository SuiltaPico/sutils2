import { CardData, Rank } from "../core";
import {
  mdiCardsClub,
  mdiCardsDiamond,
  mdiCardsHeart,
  mdiCardsSpade,
} from "@mdi/js";
import { Icon } from "../../../../../common/Icon";
import { isMobileDevice } from "../utils";
import clsx from "clsx";

export const suitMap = {
  "♠": mdiCardsSpade,
  "♥": mdiCardsHeart,
  "♣": mdiCardsClub,
  "♦": mdiCardsDiamond,
};

// Position system is ratio-based (0~1), rendered as percentage.
const toPercent = (ratio: number) => `${ratio * 100}%`;

const COL_L = 0.3; // Left Column
const COL_C = 0.5; // Center Column
const COL_R = 0.7; // Right Column

// Rows tuned to avoid overlapping with corner indicators.
const ROW_T = 0.25; // Top Row
const ROW_QT = 0.41; // Quarter Top
const ROW_M = 0.5; // Middle Row
const ROW_QB = 0.59; // Quarter Bottom
const ROW_B = 0.75; // Bottom Row

// 2 and 3 use wider vertical spread.
const ROW_2_T = 0.2;
const ROW_2_B = 0.8;

const PIP_POSITIONS: Record<
  string,
  { x: number; y: number; inverted?: boolean }[]
> = {
  A: [{ x: 0.5, y: 0.5 }],
  "2": [
    { x: 0.5, y: ROW_2_T },
    { x: 0.5, y: ROW_2_B, inverted: true },
  ],
  "3": [
    { x: 0.5, y: ROW_2_T },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: ROW_2_B, inverted: true },
  ],
  "4": [
    { x: 0.3, y: 0.25 },
    { x: 0.7, y: 0.25 },
    { x: 0.3, y: 0.75, inverted: true },
    { x: 0.7, y: 0.75, inverted: true },
  ],
  "5": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_C, y: ROW_M },
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
  "6": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_L, y: ROW_M },
    { x: COL_R, y: ROW_M },
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
  "7": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_C, y: ROW_QT }, // Extra pip for 7
    { x: COL_L, y: ROW_M },
    { x: COL_R, y: ROW_M },
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
  "8": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_C, y: ROW_QT },
    { x: COL_L, y: ROW_M },
    { x: COL_R, y: ROW_M },
    { x: COL_C, y: ROW_QB, inverted: true },
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
  "9": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_L, y: ROW_QT },
    { x: COL_R, y: ROW_QT },
    { x: COL_C, y: ROW_M },
    { x: COL_L, y: ROW_QB, inverted: true },
    { x: COL_R, y: ROW_QB, inverted: true },
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
  "10": [
    { x: COL_L, y: ROW_T },
    { x: COL_R, y: ROW_T },
    { x: COL_C, y: 0.3 }, // Special spacing for 10 center top
    { x: COL_L, y: ROW_QT },
    { x: COL_R, y: ROW_QT },
    { x: COL_L, y: ROW_QB, inverted: true },
    { x: COL_R, y: ROW_QB, inverted: true },
    { x: COL_C, y: 0.7, inverted: true }, // Special spacing for 10 center bottom
    { x: COL_L, y: ROW_B, inverted: true },
    { x: COL_R, y: ROW_B, inverted: true },
  ],
};

const CardPips = (props: {
  rank: Rank;
  suit: string;
  color: string;
  small?: boolean;
}) => {
  const positions = PIP_POSITIONS[props.rank];
  const pipSize = isMobileDevice ? 11 : props.small ? 10 : 20;

  // For face cards (J, Q, K), we render a special center graphic
  if (!positions) {
    return (
      <div class="w-full h-full flex items-center justify-center p-6">
        <div
          class={`border-[1.5px] ${
            props.color === "red" ? "border-[#AC1F18]" : "border-[#101f30]"
          } rounded-sm w-full h-full flex items-center justify-center relative opacity-90`}
        >
          <div
            class={`text-4xl font-serif leading-0.5 ${
              props.color === "red" ? "text-[#AC1F18]" : "text-[#101f30]"
            }`}
          >
            {props.rank}
          </div>
          {/* Decorative Corner Icons inside the box */}
          <div class="absolute top-1 left-1 opacity-40">
            <Icon
              size={isMobileDevice ? 8 : 12}
              path={suitMap[props.suit as keyof typeof suitMap]}
            />
          </div>
          <div class="absolute bottom-1 right-1 opacity-40 rotate-180">
            <Icon
              size={isMobileDevice ? 8 : 12}
              path={suitMap[props.suit as keyof typeof suitMap]}
            />
          </div>

          {/* Center Icon */}
          <div class="absolute opacity-10 scale-150">
            <Icon
              size={isMobileDevice ? 24 : 48}
              path={suitMap[props.suit as keyof typeof suitMap]}
            />
          </div>
        </div>
      </div>
    );
  }

  // For number cards
  return (
    <div class="w-full h-full relative z-0">
      {positions.map((pos) => (
        <div
          class={`absolute flex items-center justify-center ${
            props.color === "red" ? "text-[#AC1F18]" : "text-[#101f30]"
          }`}
          style={{
            left: toPercent(pos.x),
            top: toPercent(pos.y),
            width: "0", // Zero width to center perfectly
            height: "0",
            transform: `translate(0, 0) ${
              pos.inverted ? "rotate(180deg)" : ""
            }`,
          }}
        >
          <div class="z-10">
            <Icon
              size={pipSize}
              path={suitMap[props.suit as keyof typeof suitMap]}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export const Card = (props: {
  card: CardData;
  selected?: boolean;
  onClick: () => void;
  small?: boolean;
  index?: number;
  noEntryAnimation?: boolean;
  dimmed?: boolean;
  suitBoosted?: boolean;
  isJunk?: boolean;
}) => {
  return (
    <div
      data-id={props.card.id}
      onClick={props.onClick}
      style={{ "animation-delay": `${(props.index || 0) * 0.1}s` }}
      class={clsx(
        `bg-[#F9F7F2] rounded-md shadow-sm border border-[#DCD6C8] font-serif relative overflow-hidden select-none cursor-pointer transition-all duration-300`,
        props.noEntryAnimation ? "" : "animate-card-enter",
        props.suitBoosted
          ? "-translate-y-4 ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] z-50"
          : props.selected
          ? props.isJunk
            ? "-translate-y-4 z-50 shadow-[0_10px_20px_rgba(0,0,0,0.3)] ring-2 ring-gray-400 grayscale-[0.5] !bg-gray-200"
            : "-translate-y-4 z-50 shadow-[0_10px_20px_rgba(0,0,0,0.3)] ring-2 ring-yellow-400"
          : "",
        props.dimmed ? "grayscale opacity-60" : "",
        isMobileDevice
          ? "w-[54px] h-[75.6px]"
          : clsx(
              "hover:-translate-y-4 hover:z-50 hover:shadow-xl",
              props.small
                ? "w-[60px] h-[84px] text-xs"
                : "w-[100px] h-[140px] text-lg"
            )
      )}
    >
      {/* Top Left Corner */}
      <div
        class={clsx(
          `absolute top-0.5 left-0.5 font-bold flex flex-col items-center gap-1 z-20`,
          props.card.color === "red" ? "text-[#AC1F18]" : "text-[#101f30]",
          isMobileDevice ? "text-[8px]" : "p-0.5"
        )}
      >
        <div
          class={clsx(
            isMobileDevice
              ? "text-[10px] leading-2"
              : props.small
              ? "leading-4 text-[12px]"
              : "leading-4 text-md"
          )}
        >
          {props.card.rank}
        </div>
        <Icon
          size={isMobileDevice ? 8 : props.small ? 10 : 14}
          path={suitMap[props.card.suit]}
        />
      </div>

      {/* Center Content (Pips or Face Art) */}
      <div class="absolute inset-0 pointer-events-none z-0">
        <CardPips
          rank={props.card.rank}
          suit={props.card.suit}
          color={props.card.color}
          small={props.small}
        />
      </div>

      {/* Bottom Right Corner */}
      <div
        class={clsx(
          `absolute bottom-0.5 right-0.5 font-bold flex flex-col items-center gap-1 rotate-180 z-20`,
          props.card.color === "red" ? "text-[#AC1F18]" : "text-[#101f30]",
          isMobileDevice ? "text-[8px]" : "p-0.5"
        )}
      >
        <div
          class={clsx(
            isMobileDevice
              ? "text-[10px] leading-2"
              : props.small
              ? "leading-4 text-[12px]"
              : "leading-4 text-md"
          )}
        >
          {props.card.rank}
        </div>
        <Icon
          size={isMobileDevice ? 8 : props.small ? 10 : 14}
          path={suitMap[props.card.suit]}
        />
      </div>
    </div>
  );
};
