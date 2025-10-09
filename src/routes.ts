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
    description: "使用 TensorFlow.js 和 WebGPU/WebGL 在浏览器运行在线学习的 Transformer 模型。（已废弃）",
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
    description: "将图片颜色转换为透明色",
    component: lazy(() => import("./components/pages/img/color-to-transp")),
    done: true,
  },
  // --- EXP ---
  {
    path: "/exp/wasm-aot-calc",
    description: "WASM AOT 计算器，把数学表达式即时编译 (AOT) 成 WebAssembly 并执行",
    component: lazy(() => import("./components/pages/exp/wasm-aot-calc")),
    done: true,
  },
  {
    path: "/exp/l-system",
    description: "L-system 演练场（WASM AOT）",
    component: lazy(() => import("./components/pages/exp/l-system-wasm-aot")),
    done: false,
  },
  {
    path: "/exp/wasm-aot-simd-particle-swarm-sim",
    description: "WASM AOT 粒子群模拟，使用 SIMD 优化",
    component: lazy(
      () => import("./components/pages/exp/wasm-aot-simd-particle-swarm-sim")
    ),
    done: true,
  },
  {
    path: "/exp/wasm-mandelbrot",
    component: lazy(() => import("./components/pages/exp/wasm-mandelbrot")),
    description: "WASM 多线程 Mandelbrot 集合渲染尝试",
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
    component: lazy(
      () => import("./components/pages/exp/skia-wasm-text-editor")
    ),
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
    description: "Shader 演练场，支持 WebGL(GLSL ES 1.0)、WebGL2(GLSL ES 3.0)、WebGPU(WGSL)",
    done: false,
  },
  {
    path: "/exp/python-wasm",
    component: lazy(() => import("./components/pages/exp/python-wasm")),
    description: "基于 Pyodide 的在线 Python 执行环境",
    done: false,
  },
  {
    path: "/exp/text-watermark-injector",
    component: lazy(() => import("./components/pages/exp/unicode-watermark")),
    description: "文本水印注入器",
    done: false,
  },
  {
    path: "/exp/audio-spectrum-corrector",
    component: lazy(
      () => import("./components/pages/exp/audio-spectrum-corrector")
    ),
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
    component: lazy(() => import("./components/pages/exp/game/map-gen/index")),
    description: "地图生成：Perlin/Simplex 噪声",
    done: false,
  },
  {
    path: "/exp/mind-map",
    component: lazy(() => import("./components/pages/exp/mind-map")),
  },
  // {
  //   path: "/exp/data/binary-stats",
  //   component: lazy(() => import("./components/pages/exp/data/binary-stats")),
  // },
  {
    path: "/exp/nlp/text-stats",
    description: "分析文本的基础计数、信息熵、词汇多样性、复杂度、可读性、词频分布及主题连贯性",
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
