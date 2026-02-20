import { splitProps, type JSX } from "solid-js";

interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  path: string;
  size?: number | string;
  color?: string;
  class?: string;
}

export function Icon(props: IconProps) {
  const [localProps, restProps] = splitProps(props, [
    "path",
    "size",
    "color",
    "class",
  ]);

  return (
    <svg
      viewBox="0 0 24 24"
      width={localProps.size ?? 24}
      height={localProps.size ?? 24}
      class={localProps.class}
      fill={localProps.color ?? "currentColor"}
      {...restProps}
    >
      <path d={localProps.path} />
    </svg>
  );
}
