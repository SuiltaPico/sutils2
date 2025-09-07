/* @refresh reload */
import { Router } from "@solidjs/router";
import { render } from "solid-js/web";
import "virtual:uno.css";
import "./index.css";
import { routes } from "./routes";

const wrapper = document.getElementById("app");
if (!wrapper) {
  throw new Error("Wrapper div not found");
}

render(() => <Router>{routes}</Router>, wrapper);
