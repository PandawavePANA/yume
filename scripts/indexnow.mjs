// IndexNow 제출(2026-10-29 SEO) — 네이버 · 빙 등 IndexNow를 받는 검색엔진에 "이 주소들이 바뀌었다"고 바로 알린다.
// 키는 비밀이 아니다: public/6e23ba8b9b6809e42a33d8f6b0e348d7.txt가 두 주소 모두에서 열려야 소유가 확인된다(빌드가 public/을 복사한다).
// 배포 뒤 실행: node scripts/indexnow.mjs   (사이트맵의 주소를 그대로 읽어 보낸다)
const KEY = "6e23ba8b9b6809e42a33d8f6b0e348d7";
const HOSTS = ["https://veriline.kr"];
const ENGINES = ["https://searchadvisor.naver.com/indexnow", "https://api.indexnow.org/indexnow"];

for (const origin of HOSTS) {
  const xml = await fetch(`${origin}/sitemap.xml`).then((r) => r.text()).catch(() => "");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(origin));
  if (!urls.length) { console.log(origin, "사이트맵 주소 없음 — 건너뜀"); continue; }
  const host = new URL(origin).host;
  for (const engine of ENGINES) {
    const r = await fetch(engine, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host, key: KEY, keyLocation: `${origin}/${KEY}.txt`, urlList: urls }) }).catch((e) => ({ status: String(e.message) }));
    console.log(host, urls.length, "개 →", new URL(engine).host, r.status);
  }
}
