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
  compressHTML: true,

  security: {
    checkOrigin: false,
  },

  devToolbar: {
    enabled: false,
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // Evita recargas del dev server mientras Playwright escribe reportes
        // (provoca islands re-render a mitad de test -> flakiness).
        ignored: ["**/playwright-report/**", "**/test-results/**"],
      },
    },
    optimizeDeps: {
      rolldownOptions: {
        transform: {
          define: {
            "process.env.NODE_ENV": JSON.stringify(
              process.env.NODE_ENV ?? "development",
            ),
          },
        },
      },
    },
    build: {
      rolldownOptions: {
        external: ["ldapjs"],
      },
    },
  },

  output: "server",
  integrations: [icon(), react()],

  adapter: node({
    mode: "middleware",
  }),
});
