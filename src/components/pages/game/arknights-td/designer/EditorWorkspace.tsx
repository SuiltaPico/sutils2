import { For } from 'solid-js';
import { TILE_SIZE } from '../constants';
import { EditorConfig, Tool } from './types';

interface EditorWorkspaceProps {
  config: EditorConfig;
  mapData: number[][];
  selectedTile: { x: number; y: number } | null;
  tools: Tool[];
  handleMouseDown: (e: MouseEvent, x: number, y: number) => void;
  handleMouseEnter: (e: MouseEvent, x: number, y: number) => void;
}

export default function EditorWorkspace(props: EditorWorkspaceProps) {
  return (
    <div class="flex-1 h-full overflow-auto p-10 flex items-center justify-center bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] relative">
      <div
        class="relative shadow-2xl ring-1 ring-white/10 bg-black"
        style={{
          width: `${props.config.mapWidth * TILE_SIZE}px`,
          height: `${props.config.mapHeight * TILE_SIZE}px`
        }}
      >
        <For each={props.mapData}>
          {(row, y) => (
            <For each={row}>
              {(cell, x) => (
                <div
                  onMouseDown={(e) => props.handleMouseDown(e, x(), y())}
                  onMouseEnter={(e) => props.handleMouseEnter(e, x(), y())}
                  class={`absolute border hover:border-white/30 cursor-crosshair transition-colors duration-75 ${props.selectedTile?.x === x() && props.selectedTile?.y === y() ? 'border-blue-500 z-10 ring-2 ring-blue-500/50' : 'border-white/5'}`}
                  style={{
                    left: `${x() * TILE_SIZE}px`,
                    top: `${y() * TILE_SIZE}px`,
                    width: `${TILE_SIZE}px`,
                    height: `${TILE_SIZE}px`,
                    "background-color": props.tools.find(t => t.id === cell)?.color || '#000'
                  }}
                >
                  {cell === 2 && <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-500 pointer-events-none select-none">IN</div>}
                  {cell === 3 && <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-500 pointer-events-none select-none">OUT</div>}
                </div>
              )}
            </For>
          )}
        </For>
      </div>

      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-full text-xs text-white/50 pointer-events-none backdrop-blur border border-white/10">
        按住鼠标左键拖动以连续绘制
      </div>
    </div>
  );
}

