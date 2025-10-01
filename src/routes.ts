import { lazy } from "solid-js";

export const routes = [
  {
    path: "/",
    component: lazy(() => import("./components/pages/Home")),
  },
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
    deprecated: true,
  },
  // {
  //   path: "/ai/chat-with-me",
  //   component: lazy(() => import("./components/pages/ai/chat-with-me")),
  // },
  // --- IMG ---
  {
    path: "/img/color-to-transp",
    component: lazy(() => import("./components/pages/img/color-to-transp")),
  },
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
    path: "/exp/compress/libarchive-wasm",
    component: lazy(
      () => import("./components/pages/exp/compress/libarchive-wasm")
    ),
  },
  {
    path: "/exp/compress/huffman-coding",
    component: lazy(
      () => import("./components/pages/exp/compress/huffman-coding")
    ),
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
  //   path: "/exp/db/sqlite-wasm",
  //   component: lazy(() => import("./components/pages/exp/db/sqlite-wasm")),
  // },
  // {
  //   path: "/exp/db/duckdb-wasm",
  //   component: lazy(() => import("./components/pages/exp/db/duckdb-wasm")),
  // },
  // {
  //   path: "/exp/skia-wasm-text-editor",
  //   component: lazy(() => import("./components/pages/exp/skia-wasm-text-editor")),
  // },
  {
    path: "/exp/shader-playground",
    component: lazy(() => import("./components/pages/exp/shader-playground")),
    description: "Shader Playground: WebGL/WebGL2/WebGPU",
    done: false,
  },
  {
    path: "/exp/python-wasm",
    component: lazy(() => import("./components/pages/exp/python-wasm")),
    description: "Pyodide 在线 Python",
    done: false,
  },
  {
    path: "/exp/audio-spectrum-corrector",
    component: lazy(() => import("./components/pages/exp/audio-spectrum-corrector")),
    description: "音频频谱强制纠正（实验）",
    done: false,
  },
  {
    path: "/exp/audio-stat",
    component: lazy(() => import("./components/pages/exp/audio-stat")),
    description: "音频可视：波形/FFT Spectrogram/CWT Scalogram (d3)",
    done: false,
  },
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
  {
    path: "/exp/file-browser",
    component: lazy(() => import("./components/pages/exp/file-browser")),
    description: "File System API 本地文件浏览器（实验）",
    done: false,
  },
  {
    path: "/exp/ui/simple-designer",
    component: lazy(() => import("./components/pages/exp/ui/simple-designer")),
  },
  {
    path: "/exp/game/map-gen",
    component: lazy(() => import("./components/pages/exp/game/map-gen/index.tsx")),
    description: "地图生成：Perlin/Simplex 噪声",
    done: false,
  },
  // {
  //   path: "/exp/data/binary-stats",
  //   component: lazy(() => import("./components/pages/exp/data/binary-stats")),
  // },
  {
    path: "/exp/nlp/text-stats",
    component: lazy(() => import("./components/pages/exp/nlp/text-stats")),
  },
  // {
  //   path: "/exp/coop/yjs",
  //   component: lazy(() => import("./components/pages/exp/coop/yjs")),
  // },
  // {
  //   path: "/exp/2d-graph-draw",
  //   component: lazy(() => import("./components/pages/exp/local-file-browser")),
  // },
  // {
  //   path: "/exp/local-file-browser",
  //   component: lazy(() => import("./components/pages/exp/local-file-browser")),
  // },
  {
    path: "*",
    component: lazy(() => import("./components/pages/NotFound")),
  },
];
