// dist-artifact/business.html 의 스크립트 · 스타일을 HTML 안에 넣어, 아티팩트로 올릴 한 장짜리 미리보기를 만든다.
// 결과: dist-artifact/veriline-main.html (아티팩트 형식: <html>/<head>/<body> 없이 내용만)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-artifact");
const js = await readFile(path.join(root, "assets", "app.js"), "utf8");
let css = "";
try {
  css = await readFile(path.join(root, "assets", "style.css"), "utf8");
} catch {
  const { readdir } = await import("node:fs/promises");
  const f = (await readdir(path.join(root, "assets"))).find((n) => n.endsWith(".css"));
  if (f) css = await readFile(path.join(root, "assets", f), "utf8");
}
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const html = `<title>베리라인 메인</title>
<meta name="description" content="법률·노무·의료 AI 할루시네이션 검증 — 베리라인 새 메인 사이트 미리보기">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>html,body{margin:0;background:#0A0A0B}${css}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;
await writeFile(path.join(root, "veriline-main.html"), html);
console.log("veriline-main.html", Math.round(html.length / 1024), "KB");
