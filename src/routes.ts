import { lazy } from "solid-js";

export const routes = [
  {
    path: "/data/anyview",
    component: lazy(() => import("./components/pages/data/anyview")),
  },
  {
    path: "/ai/selai",
    component: lazy(() => import("./components/pages/ai/selai")),
  },
  {
    path: "/exp/wasm-aot-calc",
    component: lazy(() => import("./components/pages/exp/wasm-aot-calc")),
  },
  {
    path: "/exp/wasm-aot-simd-particle-swarm-sim",
    component: lazy(
      () => import("./components/pages/exp/wasm-aot-simd-particle-swarm-sim")
    ),
  },
  {
    path: "/exp/wasm-mandelbrot",
    component: lazy(() => import("./components/pages/exp/wasm-mandelbrot")),
  },
  {
    path: "/exp/libarchive-wasm",
    component: lazy(() => import("./components/pages/exp/libarchive-wasm")),
  },
  {
    path: "/exp/wasm-audio-worklet",
    component: lazy(() => import("./components/pages/exp/wasm-audio-worklet")),
  },
];
