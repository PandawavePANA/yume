// 공개 글(할루시네이션 읽을거리)·특별호·사이트맵 — 검색엔진이 보는 화면이 서버에서 완성돼 나오는지.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-articles-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.PUBLIC_BASE_URL;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const { ARTICLES, SPECIAL_ISSUES, HUB } = await import("../articles.js");

let server;
let base;
before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, text: await r.text(), type: r.headers.get("content-type") || "" };
};
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("글 여섯 편과 허브가 서버에서 완성된 HTML로 나온다 — 제목·설명·정식 주소·구조화 데이터", async () => {
  for (const [slug, a] of Object.entries(ARTICLES)) {
    const r = await get(`/hallucination/${slug}`);
    assert.equal(r.status, 200, slug);
    // 제목은 HTML로 이스케이프돼 나간다(따옴표 → &#39;).
    const escHtml = (x) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    assert.ok(r.text.includes(`<title>${escHtml(a.seoTitle)}</title>`), slug);
    assert.match(r.text, /<link rel="canonical" href="https:\/\/veriline\.kr\/hallucination\//);
    const ld = jsonLd(r.text);
    assert.ok(ld.some((x) => x["@type"] === "Article" && x.headline === a.title), slug);
    assert.ok(ld.some((x) => x["@type"] === "BreadcrumbList"));
    // 검색 키워드가 제목이나 설명에 있다.
    assert.match(a.seoTitle + a.description, /할루시네이션/);
  }
  const hub = await get("/hallucination");
  assert.equal(hub.status, 200);
  const faq = jsonLd(hub.text).find((x) => x["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, HUB.faq.length);
  for (const slug of Object.keys(ARTICLES)) assert.match(hub.text, new RegExp(`/hallucination/${slug}"`));
  assert.equal((await get("/hallucination/no-such-article")).status, 200); // SPA로 넘어간다(빌드가 없으면 404)
});

test("'할루시네이션 체크' 글과 메인 제목이 그 말을 담는다", async () => {
  assert.match(ARTICLES.check.seoTitle, /할루시네이션 체크/);
  const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  assert.match(indexHtml, /<title>AI 할루시네이션 체크/);
});

test("특별호 표지와 지수 홈의 특별호 목록", async () => {
  for (const iss of SPECIAL_ISSUES) {
    const r = await get(`/hallucination-index/${iss.slug}`);
    assert.equal(r.status, 200);
    for (const s of iss.articles) assert.match(r.text, new RegExp(`/hallucination/${s}"`));
  }
  const home = await get("/hallucination-index");
  assert.match(home.text, /특별호/);
  assert.match(home.text, /\/hallucination-index\/special-1/);
});

test("사이트맵은 서버가 만들고 글·특별호·메인(기업용)·개인용을 모두 담는다", async () => {
  const r = await get("/sitemap.xml");
  assert.equal(r.status, 200);
  assert.match(r.type, /xml/);
  for (const p of ["/hallucination", ...Object.keys(ARTICLES).map((s) => `/hallucination/${s}`), "/hallucination-index/special-2", "/"]) {
    assert.ok(r.text.includes(`<loc>https://veriline.kr${p}</loc>`), p);
  }
});
