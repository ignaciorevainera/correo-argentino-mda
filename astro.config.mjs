// @ts-check
// Trigger dev server reload for registering new Astro actions
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import icon from "astro-icon";

import react from "@astrojs/react";

import node from "@astrojs/node";

export default defineConfig({
  site: "http://mda.correo.local",
  base: "/",

  security: {
    checkOrigin: false,
  },

  devToolbar: {
    enabled: false,
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      esbuildOptions: {
        define: {
          "process.env.NODE_ENV": JSON.stringify("development"),
        },
      },
    },
  },

  output: "server",
  integrations: [icon(), react()],

  adapter: node({
    mode: "standalone",
  }),
});
