import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type p5 from "p5";

export default function MassSpringLatticePage() {
  let containerRef: HTMLDivElement | undefined;
  const [isReady, setIsReady] = createSignal(false);

  onMount(async () => {
    if (!containerRef) return;

    const { default: P5 } = await import("p5");

    const sketch = (p: p5) => {
      let canvasWidth = 960;
      let canvasHeight = 540;
      type LatticeNode = { x: number; y: number; i: number; j: number };
      let latticeNodes: LatticeNode[] = [];
      let latticeEdges: Array<[number, number]> = [];

      const computeSize = () => {
        if (!containerRef) return;
        const rect = containerRef.getBoundingClientRect();
        const maxWidth = rect.width || 960;
        const maxHeight = Math.max(window.innerHeight - 260, 360);
        const targetWidth = Math.min(maxWidth, 1200);
        const targetHeight = Math.min(maxHeight, 720);
        canvasWidth = targetWidth;
        canvasHeight = targetHeight;
      };

      const buildLattice = () => {
        latticeNodes = [];
        latticeEdges = [];

        const minDimension = Math.min(canvasWidth, canvasHeight);
        const margin = minDimension * 0.08;
        const radius = minDimension * 0.5 - margin;
        const spacing = Math.max(minDimension / 18, 18);
        const verticalSpacing = spacing * Math.sqrt(3) * 0.5;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const range = Math.ceil((radius + margin) / spacing) + 1;

        const nodeIndex = new Map<string, number>();

        for (let j = -range; j <= range; j++) {
          for (let i = -range; i <= range; i++) {
            const x = centerX + (i + j * 0.5) * spacing;
            const y = centerY + j * verticalSpacing;
            if (Math.hypot(x - centerX, y - centerY) <= radius) {
              const id = `${i},${j}`;
              nodeIndex.set(id, latticeNodes.length);
              latticeNodes.push({ x, y, i, j });
            }
          }
        }

        const neighborOffsets: Array<[number, number]> = [
          [1, 0],
          [0, 1],
          [-1, 1],
        ];

        for (const node of latticeNodes) {
          const fromIdx = nodeIndex.get(`${node.i},${node.j}`);
          if (fromIdx === undefined) continue;
          for (const [di, dj] of neighborOffsets) {
            const neighborIdx = nodeIndex.get(`${node.i + di},${node.j + dj}`);
            if (neighborIdx !== undefined) {
              latticeEdges.push([fromIdx, neighborIdx]);
            }
          }
        }
      };

      p.setup = () => {
        computeSize();
        p.createCanvas(canvasWidth, canvasHeight);
        p.pixelDensity(window.devicePixelRatio || 1);
        buildLattice();
        p.background(10, 12, 24);
        setIsReady(true);
      };

      p.windowResized = () => {
        computeSize();
        p.resizeCanvas(canvasWidth, canvasHeight);
        buildLattice();
        p.background(10, 12, 24);
      };

      p.draw = () => {
        p.background(10, 12, 24);

        p.stroke(70, 110, 200, 180);
        p.strokeWeight(1.25);
        for (const [from, to] of latticeEdges) {
          const a = latticeNodes[from];
          const b = latticeNodes[to];
          p.line(a.x, a.y, b.x, b.y);
        }

        p.stroke(180, 220, 255);
        p.strokeWeight(2.4);
        for (const node of latticeNodes) {
          p.line(node.x - 1.2, node.y, node.x + 1.2, node.y);
        }

        p.fill(120, 190, 255);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.textSize(14);
        p.text(
          "质点弹簧晶格物理模拟研究 · 等边三角形晶格（圆形边界）",
          16,
          canvasHeight - 16
        );
      };
    };

    const instance = new P5(sketch, containerRef);

    onCleanup(() => {
      instance.remove();
      setIsReady(false);
    });
  });

  return (
    <div class="p-4 space-y-4">
      <header class="space-y-2">
        <h1 class="text-2xl font-bold">质点弹簧晶格物理模拟研究</h1>
        <p class="text-sm text-slate-300/80">
          使用 p5.js
          渲染的画布占位页面，后续可在此基础上探索质点-弹簧晶格系统的数值模拟与可视化。
        </p>
      </header>
      <section>
        <Show when={!isReady()}>
          <span class="text-slate-500 text-sm select-none">
            正在初始化 p5.js 画布…
          </span>
        </Show>
        <div
          ref={(el) => {
            containerRef = el ?? undefined;
          }}
          class="border border-slate-700/80 rounded-lg bg-black/80 min-h-[360px] flex items-center justify-center overflow-hidden"
        ></div>
      </section>
    </div>
  );
}
