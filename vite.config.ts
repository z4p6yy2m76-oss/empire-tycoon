import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
