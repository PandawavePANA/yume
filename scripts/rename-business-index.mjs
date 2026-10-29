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

const ORIGIN = process.env.BUSINESS_ORIGIN || "https://veriline.kr"; // 2026-10-27 기업용 주소가 veriline.kr로 바뀜
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

// public/의 apple-touch-icon.png · favicon.png는 세 빌드가 같이 쓰는 옛 유메(달) 아이콘이다. 링크 태그를 보지 않고
// /apple-touch-icon.png를 바로 찾는 브라우저 · 메신저 미리보기가 있어, 기업용 빌드에서는 같은 이름에 베리라인 마크를 덮어쓴다(2026-10-28).
import { copyFile } from "node:fs/promises";
await copyFile(at("veriline-apple-touch-icon.png"), at("apple-touch-icon.png"));
await copyFile(at("veriline-favicon-48.png"), at("favicon.png"));
await copyFile(at("veriline-favicon-192.png"), at("favicon-64.png"));
// /favicon.ico가 없으면 정적 호스트가 화면 HTML을 내서 구글이 옛 아이콘을 붙들었다(2026-10-29)
await copyFile(at("veriline-favicon.ico"), at("favicon.ico"));
console.log("dist-business 아이콘 → 베리라인 마크");

// 도메인 이전 뒤(2026-10-29 밤) 이 정적 서비스는 옛 주소(business.yume-reamer.com · yume-reamer.com)만 받는다.
// BUSINESS_REDIRECT_TO가 있으면 모든 경로를 같은 경로의 새 주소로 301 넘긴다(serve가 dist-business/serve.json을 읽는다).
// serve의 "/:path*"는 맨 앞 경로를 못 만들고 여러 단계 경로의 /를 %2F로 바꿔서, 단계별 규칙을 따로 둔다. 쿼리는 넘어가지 않는다.
const REDIRECT_TO = (process.env.BUSINESS_REDIRECT_TO || "").replace(/\/+$/, "");
if (REDIRECT_TO) {
  const segs = ["a", "b", "c", "d", "e"];
  const redirects = [{ source: "/", destination: `${REDIRECT_TO}/`, type: 301 }];
  for (let n = 1; n <= segs.length; n++) {
    const p = segs.slice(0, n).map((s) => `:${s}`).join("/");
    redirects.push({ source: `/${p}`, destination: `${REDIRECT_TO}/${p}`, type: 301 });
  }
  await writeFile(at("serve.json"), `${JSON.stringify({ redirects }, null, 2)}\n`);
  console.log(`dist-business serve.json → 모든 경로를 ${REDIRECT_TO}로 301`);
}
