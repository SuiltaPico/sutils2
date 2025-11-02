import type { IRenderer } from "../../platform/render/RendererRegistry";
import type { AppStore } from "../../core/state/createAppStore";
import { registerWorldLayers } from "./renderer/layers";

export function registerWorldFeature(renderer: IRenderer, app: AppStore) {
  registerWorldLayers(renderer, app);
}


