import { createMemo, Accessor } from "solid-js";
import { mdiSwordCross } from "@mdi/js";
import { GamePhase, PlayerState } from "../types";

export function useBattleUI(
  phase: Accessor<GamePhase>,
  attackerId: Accessor<string>,
  playerA: PlayerState,
  playerB: PlayerState
) {
  const phaseInfo = createMemo(() => {
    const p = phase();
    const attName = attackerId() === "A" ? playerA.name : playerB.name;
    const defName = attackerId() === "A" ? playerB.name : playerA.name;
    switch (p) {
      case GamePhase.P1_ATTACK:
        return {
          title: "进攻阶段",
          desc: `${attName} 正在准备进攻`,
          color: "text-rose-400 shadow-rose-500/50",
          icon: mdiSwordCross,
        };
      case GamePhase.P1_DEFEND:
        return {
          title: "防守阶段",
          desc: `${defName} 正在准备防御`,
          color: "text-cyan-400 shadow-cyan-500/50",
          icon: "🛡️",
        };
      case GamePhase.P2_ATTACK:
        return {
          title: "发起追击",
          desc: `${attName} 正在准备追击`,
          color: "text-amber-400 shadow-amber-500/50 animate-pulse",
          icon: "⚡",
        };
      case GamePhase.P2_DEFEND:
        return {
          title: "抵御追击",
          desc: `${defName} 正在准备防御追击`,
          color: "text-orange-400 shadow-orange-500/50",
          icon: "🛡️",
        };
      case GamePhase.COMBAT_SHOWDOWN:
        return {
          title: "伤害结算",
          desc: "伤害结算中...",
          color: "text-slate-200",
          icon: "⚖️",
        };
      case GamePhase.ROUND_END:
        return {
          title: "回合结束",
          desc: "准备下一回合",
          color: "text-slate-400",
          icon: "⏳",
        };
      default:
        return {
          title: "准备中",
          desc: "",
          color: "text-slate-500",
          icon: "...",
        };
    }
  });

  return {
    phaseInfo,
  };
}
