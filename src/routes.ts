import { lazy } from "solid-js";

export const routes = [
  // --- Data ---

  {
    path: "/data/anyview",
    component: lazy(() => import("./components/pages/data/anyview")),
  },
  // {
  //   path: "/data/barcode-qrcode-gen",
  //   component: lazy(() => import("./components/pages/data/barcode-qrcode-gen")),
  // },
  {
    path: "/data/master",
    component: lazy(() => import("./components/pages/data/master/datamaster")),
  },
  {
    path: "/data/master/json",
    component: lazy(() => import("./components/pages/data/master/json")),
  },

  // --- AI ---
  {
    path: "/ai/selai",
    component: lazy(() => import("./components/pages/ai/selai")),
  },
  // {
  //   path: "/ai/chat-with-me",
  //   component: lazy(() => import("./components/pages/ai/chat-with-me")),
  // },

  // --- EXP ---
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
    description: "WASM 多线程 Mandelbrot 集合渲染",
    done: true,
  },
  {
    path: "/exp/libarchive-wasm",
    component: lazy(() => import("./components/pages/exp/libarchive-wasm")),
    description: "WASM Libarchive 解压压缩包，展示文件树",
    done: true,
  },
  // {
  //   path: "/exp/ffmpeg-wasm",
  //   component: lazy(() => import("./components/pages/exp/ffmpeg-wasm")),
  // },
  {
    path: "/exp/skia-wasm-text-editor",
    component: lazy(() => import("./components/pages/exp/skia-wasm-text-editor")),
    description: "CanvasKit WASM 纯文本编辑器（实验）",
    done: false,
  },
  // {
  //   path: "/exp/shader-playground",
  //   component: lazy(() => import("./components/pages/exp/shader-playground")),
  // },
  // {
  //   path: "/exp/python-wasm",
  //   component: lazy(() => import("./components/pages/exp/python-wasm")),
  // },
  // {
  //   path: "/exp/img-convolution",
  //   component: lazy(() => import("./components/pages/exp/img-convolution")),
  // },
  // {
  //   path: "/exp/audio-convolution",
  //   component: lazy(() => import("./components/pages/exp/audio-convolution")),
  // },
  {
    path: "/exp/ua-debug",
    component: lazy(() => import("./components/pages/exp/ua-debug")),
    description: "浏览器 UA 的信息完整展示",
    done: true,
  },
  // {
  //   path: "/exp/data/binary-stats",
  //   component: lazy(() => import("./components/pages/exp/data/binary-stats")),
  // },
  // {
  //   path: "/exp/nlp/text-stats",
  //   component: lazy(() => import("./components/pages/exp/nlp/text-stats")),
  // },
  // {
  //   path: "/exp/2d-graph-draw",
  //   component: lazy(() => import("./components/pages/exp/local-file-browser")),
  // },
  // {
  //   path: "/exp/local-file-browser",
  //   component: lazy(() => import("./components/pages/exp/local-file-browser")),
  // },
];
