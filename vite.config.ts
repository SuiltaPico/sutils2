import unocssPlugin from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [unocssPlugin(), solid()],
});
