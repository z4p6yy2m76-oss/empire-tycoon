import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
    // ===== 联机展示配置 - Cloudflare Tunnel 适配 =====
    // Vite 反向代理：所有 /ws 请求转发到 WebSocket 服务器 (3001)
    // 同学浏览器只需访问前端域名，WebSocket 走同域名 /ws 路径
    // 一条 Cloudflare Tunnel 同时穿透前端 + WebSocket
    proxy: {
      "/ws": {
        target: "http://localhost:3001",
        ws: true, // 关键：启用 WebSocket 代理
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
