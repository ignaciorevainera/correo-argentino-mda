import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@lib": path.resolve(import.meta.dirname, "./src/lib"),
      "@components": path.resolve(import.meta.dirname, "./src/components"),
      "@db": path.resolve(import.meta.dirname, "./src/db"),
    },
  },
});
