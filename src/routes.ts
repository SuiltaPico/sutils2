import { lazy } from "solid-js";

export const routes = {
  path: "/anyview",
  component: lazy(() => import("./components/pages/anyview")),
};
