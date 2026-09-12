import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // 배포에서는 Express가 이 경로들을 직접 서빙하므로, 개발 중에도 같은 서버로 넘긴다.
    proxy: Object.fromEntries(
      ["/api", "/v1", "/admin", "/terms", "/privacy", "/docs/api", "/reset-password", "/datasets", "^/r/"].map((p) => [
        p,
        { target: "http://localhost:8787", changeOrigin: false },
      ]),
    ),
  },
});
