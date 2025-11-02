import { Suspense } from "solid-js";
import AppShell from "./src/app/layout/AppShell";

export default function UrbanFlow() {
  return (
    <div class="w-full h-full flex flex-col">
      <Suspense>
        <AppShell />
      </Suspense>
    </div>
  );
}


