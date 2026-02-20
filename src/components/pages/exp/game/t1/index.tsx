import { Component, Switch, Match } from "solid-js";
import { gameState, setGameState } from "./store";
import { AppState } from "./types";
import { MainMenu } from "./views/MainMenu";
import { MapView } from "./views/Map";
import BattleView from "./views/Battle";
import { isMobileDevice } from "./utils";

const handleFirstMobileTap = () => {
  if (!isMobileDevice) return;
  var docElm = document.documentElement as HTMLElement & {
    requestFullscreen?: () => void;
    msRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    webkitRequestFullScreen?: () => void;
  };
  if (docElm.requestFullscreen) {
    docElm.requestFullscreen();
  } else if (docElm.msRequestFullscreen) {
    docElm.msRequestFullscreen();
  } else if (docElm.mozRequestFullScreen) {
    docElm.mozRequestFullScreen();
  } else if (docElm.webkitRequestFullScreen) {
    docElm.webkitRequestFullScreen();
  }
};

export const GameT1: Component = () => {
  return (
    <div
      onPointerDown={handleFirstMobileTap}
      class="w-full h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans"
    >
      <Switch fallback={<MainMenu />}>
        <Match when={gameState.appState === AppState.MENU}>
          <MainMenu />
        </Match>
        <Match when={gameState.appState === AppState.MAP}>
          <MapView />
        </Match>
        <Match when={gameState.appState === AppState.BATTLE}>
          <BattleView />
        </Match>
        <Match when={gameState.appState === AppState.REWARD}>
          <div class="flex flex-col items-center justify-center h-full gap-8">
            <h2 class="text-4xl font-bold text-amber-400">胜利!</h2>
            <div class="flex gap-4">
              <button
                onClick={() => {
                  setGameState("appState", AppState.MAP);
                  // Mark node completed logic should be here or in Battle end
                }}
                class="px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600"
              >
                返回地图
              </button>
            </div>
          </div>
        </Match>
        <Match when={gameState.appState === AppState.GAME_OVER}>
          <div class="flex flex-col items-center justify-center h-full gap-8">
            <h2 class="text-4xl font-bold text-red-500">失败...</h2>
            <button
              onClick={() => setGameState("appState", AppState.MENU)}
              class="px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600"
            >
              返回主菜单
            </button>
          </div>
        </Match>
        <Match when={gameState.appState === AppState.EVENT}>
          <div class="flex flex-col items-center justify-center h-full gap-8">
            <h2 class="text-4xl font-bold text-blue-400">事件</h2>
            <p>这里什么也没有发生...</p>
            <button
              onClick={() => setGameState("appState", AppState.MAP)}
              class="px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600"
            >
              离开
            </button>
          </div>
        </Match>
      </Switch>
    </div>
  );
};

export default GameT1;
