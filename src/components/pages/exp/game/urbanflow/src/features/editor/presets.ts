export type BlockPreset = {
  id: string;
  label: string;
  /**
   * 占用的基础网格跨度（与 world.grid 的 1 单位对应 32 world 单位）。
   */
  span: number;
  fill: string;
  stroke: string;
};

export const GRID_UNIT = 32;

export const BLOCK_PRESETS: BlockPreset[] = [
  {
    id: "block.1x1",
    label: "1×1 基础格",
    span: 1,
    fill: "#4ade8030",
    stroke: "#16a34a",
  },
  {
    id: "block.2x2",
    label: "2×2 中型",
    span: 2,
    fill: "#60a5fa30",
    stroke: "#1d4ed8",
  },
  {
    id: "block.4x4",
    label: "4×4 大型",
    span: 4,
    fill: "#facc1530",
    stroke: "#ca8a04",
  },
];

export const DEFAULT_BLOCK_PRESET_ID = BLOCK_PRESETS[0]?.id ?? "block.1x1";

export const BLOCK_PRESET_MAP = new Map<string, BlockPreset>(
  BLOCK_PRESETS.map((preset) => [preset.id, preset])
);


