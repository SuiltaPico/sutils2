import presetWind4 from "@unocss/preset-wind4";
import { createRemToPxProcessor } from "@unocss/preset-wind4/utils";
import { defineConfig } from "unocss";

export default defineConfig({
  presets: [
    presetWind4({
      preflights: {
        theme: {
          process: createRemToPxProcessor(),
        },
      },
      theme: {
        spacing: "1px",
      },
    }),
  ],
  postprocess: [createRemToPxProcessor()],
});
