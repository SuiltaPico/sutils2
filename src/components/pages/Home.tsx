import { For } from "solid-js";
import { A } from "@solidjs/router";
import { routes } from "../../routes";
import pageMetadata from "virtual:page-metadata";

console.log(pageMetadata);

export default function Home() {
  const groupedRoutes = () => {
    const groups: Record<
      string,
      { path: string; name: string; desc?: string; mtime?: string }[]
    > = {};
    for (const route of routes) {
      if (route.path === "/" || route.path === "*") continue;
      const parts = route.path.split("/").filter(Boolean);
      if (parts.length > 0) {
        const group = parts[0];
        const fallback = parts.slice(1).join("/") || group;
        const displayName = (route as any).name || fallback;
        const desc = (route as any).description as string | undefined;
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push({
          path: route.path,
          name: displayName,
          desc,
          mtime: (pageMetadata as any)[route.path],
        });
      }
    }
    return Object.entries(groups);
  };

  return (
    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">Sutils2</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <For each={groupedRoutes()}>
          {(group) => (
            <div class="border rounded-lg p-4">
              <h2 class="text-xl font-semibold capitalize mb-2">{group[0]}</h2>
              <ul>
                <For each={group[1]}>
                  {(route) => (
                    <li class="flex flex-col">
                      <A href={route.path} class="text-blue-500 hover:underline">
                        {route.name}
                      </A>
                      {route.desc && (
                        <span class="text-gray-600 text-sm">{route.desc}</span>
                      )}
                      {route.mtime && (
                        <span class="text-gray-500 text-sm">
                          {new Date(route.mtime).toLocaleString()}
                        </span>
                      )}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
