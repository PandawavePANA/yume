import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 기업용 사이트 전용 프로덕션 빌드 설정. 리머 사이트와 같은 방식이다 — 레포와
// package.json은 유메와 공유하지만 별도 도메인에 따로 배포되므로, 자체 진입점
// (business.html)과 자체 출력 디렉터리가 필요하고, 유메의 서버 프록시 설정은 쓰지 않는다.
//
// 이 사이트에는 백엔드가 없다. 무료 점검 API는 유메 서버를 교차 출처로 부르므로
// VITE_YUME_API_ORIGIN(기본값은 유메 운영 주소)과 서버의 AUDIT_ALLOWED_ORIGINS가
// 서로 맞아야 한다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-business",
    rollupOptions: {
      input: fileURLToPath(new URL("./business.html", import.meta.url)),
    },
  },
});
