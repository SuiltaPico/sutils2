import { lazy } from "solid-js";
import { Navigate } from "@solidjs/router";

export const routes = [
  {
    path: "/anyview",
    component: lazy(() => import("./components/pages/anyview")),
  },
  {
    path: "/selai",
    component: lazy(() => import("./components/pages/selai")),
  },
];
