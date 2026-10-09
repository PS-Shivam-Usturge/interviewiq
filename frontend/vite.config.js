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
        // Report generation (agent loop + report sub-agent) can exceed 3 minutes;
        // matches the backend's AGENT_LONG_TIMEOUT_MS default
        proxyTimeout: 400000,
        timeout: 400000,
      },
    },
  },
});
