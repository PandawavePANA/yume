// 번역이 끊긴 자리를 찾는다 — 화면(src)과 서버 응답(server) 양쪽.
//
// 한국어 원문을 키로 쓰는 방식의 약점이 여기다. 한국어를 고치면 번역이 조용히 끊기고,
// 화면에는 한국어가 그대로 나오므로 영어로 보는 사람만 알아챈다. 그 사람은 보통
// 말해 주지 않는다. 그래서 사람 대신 이 스크립트가 본다.
//
//   npm run i18n:check            빠진 것만 출력
//   npm run i18n:check -- --unused 사전에만 있고 안 쓰는 것도 함께
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const load = async (p) => (await import(pathToFileURL(path.join(ROOT, p)).href)).default;

const EN_UI = await load("src/i18n.en.js");
const EN_SRV = await load("server/messages.en.js");

const STRING = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

/** 주석이 아닌 줄만 훑는다. */
function codeLines(file) {
  const out = [];
  let block = false;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const tr = line.trim();
    if (block) { if (tr.includes("*/")) block = false; continue; }
    if (tr.startsWith("/*")) { if (!tr.includes("*/")) block = true; continue; }
    if (tr.startsWith("//") || tr.startsWith("*")) continue;
    out.push(line);
  }
  return out;
}

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "tests") walk(p, test, out); }
    else if (test(e.name)) out.push(p);
  }
  return out;
}

const parse = (raw) => {
  try { return JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw); }
  catch { return null; }
};

// ── 화면: t("...")로 감싼 것 ────────────────────────────────────────────
const uiUsed = new Map();
for (const file of walk(path.join(ROOT, "src"), (n) => /\.jsx?$/.test(n) && !/^i18n(\.en)?\.js$/.test(n))) {
  for (const line of codeLines(file)) {
    for (const m of line.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      const key = parse(m[1]);
      if (key && /[가-힣]/.test(key) && !uiUsed.has(key)) uiUsed.set(key, path.relative(ROOT, file));
    }
  }
}

// ── 서버: 사용자에게 나가는 error·message ───────────────────────────────
// 운영자만 보는 화면은 한국어가 맞다. 번역해 두면 화면과 인수인계 문서가 어긋난다.
const OPERATOR_ONLY = new Set([
  "adminApi.js", "adminAuth.js", "adminGate.js", "renderAdminPage.js",
  "renderStudioPage.js", "studioApi.js", "deskApi.js", "productRevenue.js",
]);
const srvUsed = new Map();
for (const file of walk(path.join(ROOT, "server"), (n) => n.endsWith(".js"))) {
  if (OPERATOR_ONLY.has(path.basename(file))) continue;
  if (/messages\.en\.js|i18n\.js/.test(path.basename(file))) continue;
  for (const line of codeLines(file)) {
    if (!/\b(error|message|msg)\s*:/.test(line)) continue;
    for (const m of line.matchAll(STRING)) {
      const key = parse(m[0]);
      if (key && /[가-힣]/.test(key) && !srvUsed.has(key)) srvUsed.set(key, path.relative(ROOT, file));
    }
  }
}

function report(label, used, dict) {
  const missing = [...used.keys()].filter((k) => !(k in dict));
  console.log(`\n${label} — 쓰는 문구 ${used.size}개 · 사전 ${Object.keys(dict).length}개 · 빠진 것 ${missing.length}개`);
  for (const k of missing) console.log(`  ${JSON.stringify(k)}  << ${used.get(k)}`);
  if (process.argv.includes("--unused")) {
    const unused = Object.keys(dict).filter((k) => !used.has(k));
    console.log(`  (안 쓰는 사전 항목 ${unused.length}개)`);
  }
  return missing.length;
}

const bad = report("화면", uiUsed, EN_UI) + report("서버 응답", srvUsed, EN_SRV);
console.log(bad ? `\n빠진 번역 ${bad}개` : "\n빠진 번역 없음");
// CI에 걸어 두면 번역 없이 배포되는 일이 없다.
process.exit(bad ? 1 : 0);
