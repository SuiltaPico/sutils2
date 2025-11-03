import { createMemo } from "solid-js";
import { scaleLinear, line, curveMonotoneX } from "d3";

type Series = {
  label: string;
  color: string;
  values: (number | undefined)[];
};

type Props = {
  width: number;
  height: number;
  cap: number;
  series: Series[];
  thresholds?: { value: number; color: string; label?: string }[];
};

export default function MiniTimeSeries(props: Props) {
  const xScale = createMemo(() => {
    const n = Math.max(1, Math.max(...props.series.map((s) => s.values.length)) - 1);
    return scaleLinear().domain([0, n]).range([0, props.width]);
  });

  const yScale = createMemo(() => scaleLinear().domain([0, props.cap]).range([props.height, 0]));

  const paths = createMemo(() => {
    const x = xScale();
    const y = yScale();
    return props.series.map((s) => {
      const data = s.values.map((v) => (v ?? NaN));
      const l = line<number>()
        .defined((d) => Number.isFinite(d))
        .x((_, i) => x(i))
        .y((d) => y(d as number))
        .curve(curveMonotoneX);
      return l(data) ?? "";
    });
  });

  return (
    <svg width={props.width} height={props.height} class="block">
      <rect x="0" y="0" width={props.width} height={props.height} fill="#1f293726" rx="2" />
      {props.thresholds?.map((t) => {
        const yy = Math.max(0, Math.min(props.height, yScale()(t.value)));
        return (
          <g>
            <line x1={0} y1={yy} x2={props.width} y2={yy} stroke={`${t.color}88`} stroke-dasharray="4 3" stroke-width="1" />
            {t.label && (
              <text x={props.width - 2} y={Math.max(10, yy - 2)} text-anchor="end" font-size="9" fill={t.color}>
                {t.label}
              </text>
            )}
          </g>
        );
      })}
      {paths().map((d, i) => (
        <path d={d} stroke={props.series[i]!.color} stroke-width="1.5" fill="none" />
      ))}
    </svg>
  );
}


