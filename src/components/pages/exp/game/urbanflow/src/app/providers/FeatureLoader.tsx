import { onCleanup, onMount } from "solid-js";
import type { AppStore } from "../../core/state/createAppStore";
import type { IRenderer } from "../../platform/render/RendererRegistry";
import { featuresManifest } from "../../core/config/features.manifest";

type Props = {
  renderer: IRenderer;
  app: AppStore;
  container: HTMLDivElement;
};

// 基于清单按需动态装配 feature 模块
export default function FeatureLoader(props: Props) {
  let disposed = false;

  const disposers: (() => void)[] = [];

  async function load() {
    const entries = Object.entries(featuresManifest).filter(([, enabled]) => enabled);
    for (const [name] of entries) {
      if (disposed) break;
      // 仅实现 world，后续模块可在此追加分支
      if (name === "world") {
        const mod = await import("../../features/world");
        mod.registerWorldFeature(props.renderer, props.app);
      } else if (name === "editor") {
        const mod = await import("../../features/editor");
        const d = mod.registerEditorFeature(props.renderer, props.app, props.container);
        if (typeof d === "function") disposers.push(d);
      }
    }
  }

  onMount(() => {
    load();
  });
  onCleanup(() => {
    disposed = true;
    for (const d of disposers.splice(0)) {
      try { d(); } catch {}
    }
  });

  return null;
}


