// 베리라인 메인 미리보기(아티팩트)용 빌드 — 기업용 홈(business.html)만, 스크립트 하나로 묶는다.
// 아티팩트는 다른 파일을 불러오는 데 제약이 있어, 이 결과를 scripts/inline-artifact.mjs 가 HTML 한 장으로 합친다.
//   npx vite build --config vite.artifact.config.js && node scripts/inline-artifact.mjs
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // 미리보기는 claude.ai에서 열리므로 서버 페이지 · API는 실제 주소로(src/businessConfig.js)
  define: { "import.meta.env.VITE_SITE_URL": JSON.stringify("https://veriline.kr") },
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: { business: fileURLToPath(new URL("./business.html", import.meta.url)) },
      output: { inlineDynamicImports: true, entryFileNames: "assets/app.js", assetFileNames: "assets/[name][extname]" },
    },
  },
});
