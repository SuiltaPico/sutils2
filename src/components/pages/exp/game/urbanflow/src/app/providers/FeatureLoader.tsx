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
      } else if (name === "blocks") {
        try {
          const mod = await import("../../features/blocks");
          const d = mod.registerBlocksFeature?.();
          if (typeof d === "function") disposers.push(d);
        } catch (e) {
          console.warn("Feature blocks failed to load", e);
        }
      } else if (name === "roads") {
        try {
          const mod = await import("../../features/roads");
          const d = mod.registerRoadsFeature?.();
          if (typeof d === "function") disposers.push(d);
        } catch (e) {
          console.warn("Feature roads failed to load", e);
        }
      } else if (name === "intersections") {
        try {
          const mod = await import("../../features/intersections");
          const d = mod.registerIntersectionsFeature?.();
          if (typeof d === "function") disposers.push(d);
        } catch (e) {
          console.warn("Feature intersections failed to load", e);
        }
      } else if (name === "traffic") {
        try {
          const mod = await import("../../features/traffic");
          const d = mod.registerTrafficFeature?.(props.renderer, props.app);
          if (typeof d === "function") disposers.push(d);
        } catch (e) {
          console.warn("Feature traffic failed to load", e);
        }
      } else if (name === "incidents") {
        try {
          const mod = await import("../../features/incidents");
          const d = mod.registerIncidentsFeature?.(props.renderer, props.app);
          if (typeof d === "function") disposers.push(d);
        } catch (e) {
          console.warn("Feature incidents failed to load", e);
        }
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


