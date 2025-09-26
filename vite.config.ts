import unocssPlugin from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import fs from "fs";
import path from "path";

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
        const routeRegex = /path:\s*"([^"]+)"[\s\S]*?component:\s*lazy\(\s*.*?import\("([^"]+)"\)\s*\)/g;
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
  plugins: [unocssPlugin(), solid(), pageMetadataPlugin()],
  server: {
    cors: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
