// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

import icon from "astro-icon";

import mdx from "@astrojs/mdx";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },

  output: "server",
  adapter: vercel(),
  integrations: [icon(), mdx()],
});