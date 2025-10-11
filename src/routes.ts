import { lazy } from "solid-js";

export const routes = [
  {
    path: "/",
    name: "首页",
    component: lazy(() => import("./components/pages/Home")),
  },
  // --- Data ---
  // {
  //   path: "/data/anyview",
  //   component: lazy(() => import("./components/pages/data/anyview")),
  // },
  // {
  //   path: "/data/barcode-qrcode-gen",
  //   component: lazy(() => import("./components/pages/data/barcode-qrcode-gen")),
  // },
  // {
  //   path: "/data/master",
  //   component: lazy(() => import("./components/pages/data/master/datamaster")),
  // },
  // {
  //   path: "/data/master/json",
  //   component: lazy(() => import("./components/pages/data/master/json")),
  // },

  // --- AI ---
  {
    path: "/ai/selai",
    name: "SelAI",
    description: "使用 TensorFlow.js 和 WebGPU/WebGL 在浏览器运行在线学习的 Transformer 模型。（已废弃）",
    component: lazy(() => import("./components/pages/ai/selai")),
    deprecated: true,
  },
  {
    path: "/ai/console",
    name: "AI Console",
    description: "配置 API Key，进行对话并管理历史记录（仅本地存储）",
    component: lazy(() => import("./components/pages/ai/console")),
  },
  // --- IMG ---
  {
    path: "/img/color-to-transp",
    name: "颜色转透明",
    description: "将图片的某个颜色转换为透明色。",
    component: lazy(() => import("./components/pages/img/color-to-transp")),
    done: true,
  },
  // --- EXP ---
  {
    path: "/exp/wasm-aot-calc",
    name: "WASM AOT 计算器",
    description: "WASM AOT 计算器，把数学表达式即时编译 (AOT) 成 WebAssembly 并执行",
    component: lazy(() => import("./components/pages/exp/wasm-aot-calc")),
    done: true,
  },
  {
    path: "/exp/l-system",
    name: "L-system 演练场",
    description: "L-system 演练场（WASM AOT）",
    component: lazy(() => import("./components/pages/exp/l-system-wasm-aot")),
    done: false,
  },
  {
    path: "/exp/wasm-aot-simd-particle-swarm-sim",
    name: "WASM AOT 粒子群模拟",
    description: "WASM AOT 粒子群模拟，使用 SIMD 优化",
    component: lazy(
      () => import("./components/pages/exp/wasm-aot-simd-particle-swarm-sim")
    ),
    done: true,
  },
  {
    path: "/exp/wasm-mandelbrot",
    name: "WASM Mandelbrot",
    component: lazy(() => import("./components/pages/exp/wasm-mandelbrot")),
    description: "WASM 多线程 Mandelbrot 集合渲染尝试",
    done: true,
  },
  {
    path: "/exp/compress/libarchive-wasm",
    name: "Libarchive WASM 解压",
    component: lazy(
      () => import("./components/pages/exp/compress/libarchive-wasm")
    ),
  },
  {
    path: "/exp/compress/huffman-coding",
    name: "哈夫曼编码",
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
    name: "Skia 文本编辑器（实验）",
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
    name: "Shader 演练场",
    component: lazy(() => import("./components/pages/exp/shader-playground")),
    description: "Shader 演练场，支持 WebGL(GLSL ES 1.0)、WebGL2(GLSL ES 3.0)、WebGPU(WGSL)",
    done: false,
  },
  {
    path: "/exp/python-wasm",
    name: "Python (Pyodide)",
    component: lazy(() => import("./components/pages/exp/python-wasm")),
    description: "基于 Pyodide 的在线 Python 执行环境。",
    done: false,
  },
  {
    path: "/exp/text-watermark-injector",
    name: "文本水印注入器",
    component: lazy(() => import("./components/pages/exp/unicode-watermark")),
    description: "文本水印注入器。把特殊 Unicode 字符隐式注入文本。",
    done: false,
  },
  {
    path: "/exp/audio-spectrum-corrector",
    name: "音频频谱纠正",
    component: lazy(
      () => import("./components/pages/exp/audio-spectrum-corrector")
    ),
    description: "音频频谱强制纠正（实验）",
    done: false,
  },
  {
    path: "/exp/audio-stat",
    name: "音频可视化",
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
    name: "UA 调试",
    component: lazy(() => import("./components/pages/exp/ua-debug")),
    description: "浏览器 UA 的信息完整展示",
    done: true,
  },
  {
    path: "/exp/file-browser",
    name: "本地文件浏览器",
    component: lazy(() => import("./components/pages/exp/file-browser")),
    description: "File System API 本地文件浏览器（实验）",
    done: false,
  },
  {
    path: "/exp/ui/simple-designer",
    name: "简单 UI 设计器",
    component: lazy(() => import("./components/pages/exp/ui/simple-designer")),
  },
  {
    path: "/exp/game/map-gen",
    name: "地图生成",
    component: lazy(() => import("./components/pages/exp/game/map-gen/index")),
    description: "地图生成：Perlin/Simplex 噪声",
    done: false,
  },
  {
    path: "/exp/game/wayland",
    name: "Wayland 战斗原型",
    description: "1D 编队 · RTwP 基础循环与指令（转位/替位/施放）",
    component: lazy(() => import("./components/pages/exp/game/wayland/sandbox")),
  },
  {
    path: "/exp/mind-map",
    name: "思维导图",
    component: lazy(() => import("./components/pages/exp/mind-map")),
  },
  // {
  //   path: "/exp/data/binary-stats",
  //   component: lazy(() => import("./components/pages/exp/data/binary-stats")),
  // },
  {
    path: "/exp/nlp/text-stats",
    name: "文本统计分析",
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
    name: "未找到",
    component: lazy(() => import("./components/pages/NotFound")),
  },
];
