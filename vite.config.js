import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { businessSeoPlugin } from "./scripts/businessSeo.mjs";

export default defineConfig({
  plugins: [react(), businessSeoPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // 기업용 홈(business.html)도 같이 만든다 — 서버가 /business로 연다(server/app.js).
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        business: fileURLToPath(new URL("./business.html", import.meta.url)),
      },
      output: {
        // 리액트와 애니메이션 라이브러리는 우리가 코드를 고쳐도 그대로다. 따로 떼어 두면
        // 배포할 때마다 다시 내려받지 않는다 — 다시 오는 사람에게는 이게 가장 큰 차이다.
        manualChunks: { vendor: ["react", "react-dom", "framer-motion"] },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // 배포에서는 Express가 이 경로들을 직접 서빙하므로, 개발 중에도 같은 서버로 넘긴다.
    proxy: Object.fromEntries(
      ["/api", "/v1", "/admin", "/terms", "/privacy", "/account-deletion", "/docs/api", "/reset-password", "/datasets", "^/r/"].map((p) => [
        p,
        { target: "http://localhost:8787", changeOrigin: false },
      ]),
    ),
  },
});
