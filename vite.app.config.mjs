import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 스토어(플레이·앱스토어)용 빌드.
//
// 웹과 같은 코드로 만들지만 결과물은 따로다. 앱은 이 빌드를 띄우고(capacitor.config.json의
// server.url이 /app/을 가리킨다), 웹 루트(dist)는 손대지 않는다 — 웹 화면을 바꾸지 않으면서
// 스토어 정책에 맞춘 화면만 따로 두기 위해서다.
//
// 같은 도메인의 하위 경로에 올리는 이유는 로그인 때문이다. 다른 도메인에 두면 세션 쿠키가
// 교차 출처가 되어 앱에서 로그인이 풀린다. /app/ 아래면 쿠키도 API도 그대로 같은 출처다.
export default defineConfig({
  plugins: [react()],
  base: "/app/",
  define: { "import.meta.env.VITE_STORE_BUILD": JSON.stringify("play") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "dist-app",
    rollupOptions: {
      input: fileURLToPath(new URL("./app.html", import.meta.url)),
      // 웹과 같은 이유. 앱은 네트워크가 더 느린 자리에서 열리는 일이 많아 더 중요하다.
      output: { manualChunks: { vendor: ["react", "react-dom", "framer-motion"] } },
    },
  },
});
