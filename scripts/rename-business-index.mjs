// Vite는 HTML 진입점의 출력 파일을 소스 파일명 그대로 내보내므로 빌드 결과가
// dist-business/business.html이 된다. 정적 호스트는 "/"를 index.html에서 서빙하니
// 빌드 후에 이름만 바꾼다 — rename-reamer-index.mjs와 같은 이유, 같은 일이다.
import { rename } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const from = fileURLToPath(new URL("../dist-business/business.html", import.meta.url));
const to = fileURLToPath(new URL("../dist-business/index.html", import.meta.url));

await rename(from, to);
console.log("dist-business/business.html -> dist-business/index.html");
