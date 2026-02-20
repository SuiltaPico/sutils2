import { createEffect, createMemo } from "solid-js";
import { BackgroundEffect } from "../components/BackgroundEffect";
import { BattleArea } from "../components/BattleArea";
import { LogModal } from "../components/LogModal";
import { BattleTopBar } from "../components/BattleTopBar";
import { BattleControls } from "../components/BattleControls";
import { BattleFeedback } from "../components/BattleFeedback";
import { gameState } from "../store";
import { GamePhase } from "../types";
import { isMobileDevice } from "../utils";
import { useBattle } from "../hooks/useBattle";
import clsx from "clsx";

export default function BattleView() {
  const {
    playerA,
    playerB,
    phase,
    attackerId,
    logs,
    showLogs,
    setShowLogs,
    feedback,
    activeTab,
    setActiveTab,
    toggleSelect,
    executeAction,
    skipDefense,
    skipAttack,
    phaseInfo,
    getSelectedCards,
    getDamageSourceWithTotal,
  } = useBattle();

  let logsEndRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (showLogs() && logs().length > 0 && logsEndRef) {
      logsEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const bgTheme = createMemo(() => {
    const currentNodeId = gameState.run.currentNodeId;
    if (!currentNodeId) return "default";

    const currentNode = gameState.run.map.find((n) => n.id === currentNodeId);
    if (!currentNode) return "default";

    switch (currentNode.type) {
      case "BATTLE":
        return "default";
      case "ELITE":
        return "elite";
      case "BOSS":
        return "boss";
      case "EVENT":
        return "event";
      case "REST":
        return "calm";
      default:
        return "default";
    }
  });

  return (
    <div class="w-full h-full relative flex flex-col overflow-hidden bg-[#050508] font-sans text-slate-200 select-none">
      <BackgroundEffect theme={bgTheme()} intensity={1.5} />
      <style>{`
        .clip-cut {
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .clip-hex {
          clip-path: polygon(15px 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 15px 100%, 0 50%);
        }
        .cyber-border {
          position: relative;
        }
        .cyber-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border: 1px solid rgba(6, 182, 212, 0.3);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          pointer-events: none;
          clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        }
        .scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.3) 51%);
          background-size: 100% 4px;
        }
      `}</style>

      <BattleFeedback feedback={feedback()} />

      <BattleTopBar
        playerA={playerA}
        playerB={playerB}
        phase={phase()}
        attackerId={attackerId()}
        phaseInfoColor={phaseInfo().color}
        onShowLogs={() => setShowLogs(true)}
      />

      {/* MIDDLE: Battle Area */}
      <div
        class={clsx(
          "flex-1 w-full h-full flex items-center justify-center relative z-10 min-h-0 scanline",
          isMobileDevice ? "p-2" : "p-4"
        )}
      >
        <BattleArea
          phase={phase()}
          attackerId={attackerId()}
          playerA={playerA}
          playerB={playerB}
          phaseInfo={phaseInfo()}
          getDamageSourceWithTotal={getDamageSourceWithTotal}
        />
      </div>

      <BattleControls
        playerA={playerA}
        phase={phase()}
        attackerId={attackerId()}
        activeTab={activeTab()}
        setActiveTab={setActiveTab}
        toggleSelect={toggleSelect}
        executeAction={executeAction}
        skipAttack={skipAttack}
        skipDefense={skipDefense}
        getSelectedCards={getSelectedCards}
      />

      <LogModal
        show={showLogs()}
        logs={logs()}
        onClose={() => setShowLogs(false)}
        endRef={(el) => (logsEndRef = el)}
      />
    </div>
  );
}
