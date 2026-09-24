// Vite는 HTML 진입점의 출력 파일을 소스 파일명 그대로 내보내므로 빌드 결과가
// dist-app/app.html이 된다. 앱이 여는 주소는 /app/ 한 곳이라 그 자리에 index.html이
// 있어야 한다 — rename-business-index.mjs와 같은 이유, 같은 일이다.
import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const at = (p) => fileURLToPath(new URL(`../dist-app/${p}`, import.meta.url));

await rename(at("app.html"), at("index.html"));
console.log("dist-app/app.html -> dist-app/index.html");

// public/의 robots.txt가 그대로 복사돼 오면 /app/robots.txt가 www 사이트맵을 가리킨다.
// 스토어용 빌드는 사람이 검색으로 찾아올 자리가 아니라 앱이 여는 화면이므로 색인을 막는다.
// (웹 루트의 robots.txt는 dist 쪽 파일이라 이 빌드와 무관하다 — 웹은 그대로다.)
await writeFile(at("robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(at("sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
console.log("dist-app robots.txt — 색인 차단");
