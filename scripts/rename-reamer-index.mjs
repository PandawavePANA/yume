// 리머 사이트 빌드 마무리.
//
// 1) Vite는 HTML 진입점 파일명을 그대로 쓰므로 reamer.html로 나온다. 정적 호스팅은
//    "/"를 index.html에서 찾으니 이름을 바꾼다.
// 2) 검색엔진용 구조화 데이터를 페이지에 새긴다. 내용은 사이트와 같은 파일
//    (src/reamerContent.js)에서 읽는다 — HTML에 FAQ를 한 벌 더 적어두면 사이트 글을
//    고칠 때 반드시 한쪽만 고치게 되고, 검색 결과에는 옛날 문답이 남는다.
// 3) robots.txt와 sitemap.xml을 이 도메인 것으로 덮어쓴다. public/은 세 빌드가
//    공유해서, 그대로 두면 d-reamer.com이 yume-reamer.com의 사이트맵을 내놓는다.
//    크롤러는 다른 도메인을 가리키는 사이트맵을 그냥 버린다.
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { FAQ, SERVICES, WORK } from "../src/reamerContent.js";

const out = (p) => fileURLToPath(new URL(`../dist-reamer/${p}`, import.meta.url));
const ORIGIN = process.env.REAMER_ORIGIN || "https://www.d-reamer.com";

await rename(out("reamer.html"), out("index.html"));

// ── 구조화 데이터 ────────────────────────────────────────────────────────
// 검색 결과에 회사 정보와 문답이 붙을 수 있게 한다. 지어낸 값은 넣지 않는다 —
// 별점이나 후기 수를 넣으면 리치 결과는 나오지만 없는 사실이고, 구글은 그걸 제재한다.
const business = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${ORIGIN}/#business`,
  name: "리머",
  alternateName: "REAMER",
  url: ORIGIN,
  email: "reamer@d-reamer.com",
  telephone: "+82-53-557-3415",
  description:
    "웹사이트, 앱, 결제·인증 연동, AI 기능, 업무 자동화를 만드는 개발 외주 스튜디오. 대표가 직접 개발합니다.",
  founder: { "@type": "Person", name: "정원영" },
  address: {
    "@type": "PostalAddress",
    addressCountry: "KR",
    addressRegion: "대구광역시",
    addressLocality: "달성군 유가읍",
    streetAddress: "테크노대로5길 80, 212동 1402호",
  },
  areaServed: { "@type": "Country", name: "대한민국" },
  // 실제로 만들어 운영 중인 것들. 같은 주체가 만든 사이트라는 연결을 준다.
  sameAs: WORK.filter((w) => w.href).map((w) => w.href),
  makesOffer: SERVICES.map((s) => ({
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: s.name, description: s.desc },
  })),
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

let html = await readFile(out("index.html"), "utf8");
html = html.replace("</head>", `    ${ld(business)}\n    ${ld(faq)}\n  </head>`);
await writeFile(out("index.html"), html);

// ── robots.txt / sitemap.xml ────────────────────────────────────────────
await writeFile(
  out("robots.txt"),
  // /t는 의뢰인 한 사람의 대화 화면이다. 열쇠가 해시에 있어 크롤러가 내용을 볼 수는
  // 없지만, 색인에 주소가 오르면 "이런 게 있다"는 것까지는 드러난다. 막아 둔다.
  `User-agent: *
Allow: /
Disallow: /t

Sitemap: ${ORIGIN}/sitemap.xml
`,
);

// 한 장짜리 사이트라 주소는 하나다. 앵커(#work 등)는 사이트맵에 넣지 않는다 —
// 같은 문서라 색인이 갈리지 않고, 넣어도 중복으로 취급된다.
await writeFile(
  out("sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`,
);

// ── 캐시 규칙 (serve.json) ───────────────────────────────────────────────
// 리머는 `serve`가 정적으로 내보낸다. 지금까지 캐시 지시를 아무것도 안 보내서, 브라우저가
// 파일 날짜를 보고 알아서 짐작했다. 그 짐작은 해시 붙은 파일에는 너무 짧고, index.html에는
// 너무 길 수 있다. 서버가 미국 동부에 있어 다시 묻는 한 번이 태평양 왕복이다.
//
// serve는 내보내는 폴더 맨 위의 serve.json을 읽는다. 여기서만 쓰이므로 public/에 두지 않고
// 빌드 결과에 직접 쓴다 — public/은 세 빌드가 같이 쓴다.
await writeFile(
  out("serve.json"),
  JSON.stringify(
    {
      headers: [
        // 내용 해시가 붙은 파일 — 이름이 곧 버전이다. 1년 동안 묻지 않는다.
        { source: "assets/**", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
        // 작업물 이미지는 이름이 고정이라 굳히면 바꿔도 안 바뀐다. 하루만 둔다.
        { source: "work/**", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
        // 진입 파일은 매번 확인한다. 옛 것을 쥐면 새 배포의 JS를 못 찾아 흰 화면이 된다.
        { source: "**/*.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
        { source: "/", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log(`dist-reamer 준비 완료 — index.html, 구조화 데이터(회사·FAQ ${FAQ.length}개), robots.txt, sitemap.xml, serve.json (${ORIGIN})`);
