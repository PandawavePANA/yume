// t()로 감쌌지만 사전에 없는 문구를 찾는다.
//
// 한국어 원문을 키로 쓰는 방식의 약점이 여기다 — 한국어를 고치면 번역이 조용히 끊긴다.
// 화면에는 한국어가 그대로 나오므로 영어로 보는 사람만 알아채고, 그 사람은 보통
// 말해 주지 않는다. 그래서 사람 대신 이 스크립트가 본다.
//
//   node scripts/i18n-check.mjs          빠진 것만 출력
//   node scripts/i18n-check.mjs --unused 사전에만 있고 안 쓰는 것도 함께
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

// 윈도우 절대경로는 import가 받지 않는다(c: 를 프로토콜로 읽는다). file:// URL로 바꾼다.
const EN = (await import(pathToFileURL(path.join(SRC, "i18n.en.js")).href)).default;

/** src 아래 .js/.jsx 전부. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name) && !/^i18n(\.en)?\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

// t("...") 또는 t('...'). 변수를 넘기는 t(c.title) 같은 것은 정적으로 알 수 없어 건너뛴다.
const CALL = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

const used = new Map();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(CALL)) {
    let key;
    try { key = JSON.parse(m[1].startsWith("'") ? `"${m[1].slice(1, -1).replace(/"/g, '\\"')}"` : m[1]); }
    catch { continue; }
    if (!/[가-힣]/.test(key)) continue;
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(path.relative(ROOT, file));
  }
}

const missing = [...used.keys()].filter((k) => !(k in EN));
const unused = Object.keys(EN).filter((k) => !used.has(k));

console.log(`t()로 감싼 한국어 ${used.size}개 · 사전 ${Object.keys(EN).length}개`);
console.log(`\n번역이 빠진 것 ${missing.length}개`);
for (const k of missing) console.log(`  ${JSON.stringify(k)}  << ${[...used.get(k)][0]}`);

if (process.argv.includes("--unused")) {
  console.log(`\n사전에만 있고 안 쓰는 것 ${unused.length}개`);
  for (const k of unused) console.log(`  ${JSON.stringify(k)}`);
}

// 빠진 것이 있으면 실패로 끝낸다 — CI에 걸어 두면 번역 없이 배포되는 일이 없다.
process.exit(missing.length ? 1 : 0);
