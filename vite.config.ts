import fs from "fs";
import path, { dirname, join } from "path";
import unocssPlugin from "unocss/vite";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

const PYODIDE_EXCLUDE = [
  "!**/*.{md,html}",
  "!**/*.d.ts",
  "!**/*.whl",
  "!**/node_modules",
];

function viteStaticCopyPyodide() {
  const resolved = fileURLToPath(import.meta.resolve("pyodide"));
  const pyodideDirRaw = dirname(resolved);
  const pyodideDirPosix = pyodideDirRaw.split(path.sep).join(path.posix.sep);

  // 使用绝对 POSIX 路径，避免 Windows 反斜杠导致 fast-glob 匹配失败
  const excludeAbsolute = [
    `!${pyodideDirPosix}/*.{md,html}`,
    `!${pyodideDirPosix}/*.d.ts`,
    `!${pyodideDirPosix}/*.whl`,
    `!${pyodideDirPosix}/node_modules/**`,
  ];

  return viteStaticCopy({
    targets: [
      {
        src: [`${pyodideDirPosix}/*`, ...excludeAbsolute],
        dest: "assets",
      },
    ],
  });
}

function pageMetadataPlugin() {
  const virtualModuleId = "virtual:page-metadata";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "page-metadata-plugin",
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        const routesPath = path.resolve(process.cwd(), "src/routes.ts");
        let routesContent = fs.readFileSync(routesPath, "utf-8");

        // Strip comments
        routesContent = routesContent
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");

        // Match route objects capturing both path and lazy import path
        const routeRegex =
          /path:\s*"([^"]+)"[\s\S]*?component:\s*lazy\(\s*.*?import\("([^"]+)"\)\s*\)/g;
        const routeMatches = [...routesContent.matchAll(routeRegex)];

        const metadata: Record<string, string> = {};

        for (const match of routeMatches) {
          const routePath = match[1];
          const componentImportPath = match[2];

          if (routePath === "/" || routePath === "*") continue;

          const componentFilePathTsx = path.resolve(
            path.dirname(routesPath),
            componentImportPath + ".tsx"
          );
          const componentFilePathTs = path.resolve(
            path.dirname(routesPath),
            componentImportPath + ".ts"
          );

          let filepathToStat = "";
          if (fs.existsSync(componentFilePathTsx)) {
            filepathToStat = componentFilePathTsx;
          } else if (fs.existsSync(componentFilePathTs)) {
            filepathToStat = componentFilePathTs;
          }

          if (filepathToStat) {
            try {
              const stats = fs.statSync(filepathToStat);
              metadata[routePath] = stats.mtime.toISOString();
            } catch {}
          }
        }

        return `export default ${JSON.stringify(metadata)};`;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    unocssPlugin(),
    solid(),
    pageMetadataPlugin(),
    viteStaticCopyPyodide(),
  ],
  optimizeDeps: { exclude: ["pyodide"] },
  server: {
    cors: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // optimizeDeps: { exclude: ["pyodide"] },
});
