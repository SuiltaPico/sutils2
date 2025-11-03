import { createMemo } from "solid-js";
import { scaleBand, scaleLinear } from "d3";

type Props = {
  width: number;
  height: number;
  values: number[];
  cap: number; // y 轴上限（裁顶避免双轴）
  color?: string;
  background?: string;
};

export default function MiniBarChart(props: Props) {
  const margin = { top: 2, right: 2, bottom: 2, left: 2 };
  const innerW = createMemo(() => Math.max(1, props.width - margin.left - margin.right));
  const innerH = createMemo(() => Math.max(1, props.height - margin.top - margin.bottom));

  const x = createMemo(() =>
    scaleBand<number>()
      .domain(props.values.map((_, i) => i))
      .range([0, innerW()])
      .paddingInner(0.1)
  );

  const y = createMemo(() =>
    scaleLinear()
      .domain([0, props.cap])
      .range([innerH(), 0])
  );

  const bars = createMemo(() => {
    const xb = x();
    const yb = y();
    const bw = Math.max(1, xb.bandwidth());
    return props.values.map((v, i) => {
      const vx = xb(i)!;
      const clamped = Math.max(0, Math.min(props.cap, v));
      const vy = yb(clamped);
      const h = innerH() - vy;
      return { x: vx, y: vy, w: bw, h };
    });
  });

  return (
    <svg width={props.width} height={props.height} class="block">
      <rect x={0} y={0} width={props.width} height={props.height} fill={props.background ?? "#1f293726"} rx={2} />
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {bars().map((b) => (
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={props.color ?? "#94a3b8"} />
        ))}
      </g>
    </svg>
  );
}


