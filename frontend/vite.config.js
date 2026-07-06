import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        // Prevents stale keep-alive connections after backend restart
        headers: { connection: "close" },
        proxyTimeout: 180000,
        timeout: 180000,
      },
    },
  },
});
