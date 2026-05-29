import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1', '.loca.lt'],
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
