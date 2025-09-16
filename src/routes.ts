import { lazy } from "solid-js";
import { Navigate } from "@solidjs/router";

export const routes = [
  {
    path: "/",
    component: () => Navigate({ href: "/datamaster" }),
  },
  {
    path: "/anyview",
    component: lazy(() => import("./components/pages/anyview")),
  },
  {
    path: "/selai",
    component: lazy(() => import("./components/pages/selai")),
  },
  {
    path: "/datamaster",
    component: lazy(() => import("./components/pages/datamaster/datamaster")),
  },
  {
    path: "/datamaster/json",
    component: lazy(() => import("./components/pages/datamaster/json")),
  },
];
