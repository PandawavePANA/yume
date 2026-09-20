// Vite는 HTML 진입점의 출력 파일을 소스 파일명 그대로 내보내므로 빌드 결과가
// dist-business/business.html이 된다. 정적 호스트는 "/"를 index.html에서 서빙하니
// 빌드 후에 이름만 바꾼다 — rename-reamer-index.mjs와 같은 이유, 같은 일이다.
import { rename } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const from = fileURLToPath(new URL("../dist-business/business.html", import.meta.url));
const to = fileURLToPath(new URL("../dist-business/index.html", import.meta.url));

await rename(from, to);
console.log("dist-business/business.html -> dist-business/index.html");

// robots.txt와 sitemap.xml은 public/에 있어 세 빌드가 같은 파일을 복사해 간다.
// 그대로 두면 business.yume-reamer.com이 www 쪽 사이트맵을 내놓는다. 이 사이트는
// 영업용 한 장짜리라 색인 대상은 자기 주소 하나뿐이다.
import { writeFile } from "node:fs/promises";

const ORIGIN = process.env.BUSINESS_ORIGIN || "https://business.yume-reamer.com";
const at = (p) => fileURLToPath(new URL(`../dist-business/${p}`, import.meta.url));

await writeFile(at("robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await writeFile(
  at("sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`,
);
console.log(`dist-business robots.txt · sitemap.xml (${ORIGIN})`);
