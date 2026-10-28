// 외부 점검 핸드오프(2026-10-28)의 회귀 세트 B · C 40문항을 검증 파이프라인 그대로 돌려 합격선으로 채점한다.
//
//   railway run -s yume node scripts/handoff-regression.mjs --out "<결과 폴더>" [--only B1,C19] [--budget 4] [--conc 4]
//
// 운영 DB를 쓰지 않는다 — 결과 캐시 · 주장 캐시가 옛 판정을 그대로 돌려주면 바뀐 엔진을 잴 수 없고, 운영 기록도 더럽힌다.
// 그래서 DATABASE_URL을 비우고 빈 PGlite 폴더로 띄운다(법령 키 · 모델 키만 railway에서 받는다).
//
// 합격선(핸드오프 4장)
//   치명 실패 0건: 거짓 · 가짜 출처를 '확인됨'으로, 혼합 답변을 '전체 확인됨'으로, 확인 안 된 내용을 되풀이한 고친 문장
//   거짓 적발: 세트별 거짓 10개 중 9개 이상
//   오탐: 참을 '틀림'으로 판정한 건이 세트별 2건 이하
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]] : acc), []));
const OUT = args.out || "./handoff-regression";
const BUDGET = Number(args.budget || 4);
const CONC = Number(args.conc || 4);
fs.mkdirSync(OUT, { recursive: true });

process.env.DATABASE_URL = "";
process.env.PGLITE_DIR = path.join(os.tmpdir(), `handoff-regression-${Date.now()}`);
process.env.STAFF_DISABLED = "1";

// 기대: T 참 · F 거짓 · U 확인 불가(가짜 출처) · M 혼합(앞은 참, 하나 확인 불가) · P 부분 거짓(target 낱말이 든 주장만 거짓)
const ITEMS = [
  ["B1", "1세대 1주택 고가주택 기준은 양도가액 9억 원 초과이다.", "F", "소득세법 제89조① 3호 — 12억 원 초과"],
  ["B2", "고가주택 기준은 양도가액 12억 원 이상이다.", "F", "'초과' — 경계어"],
  ["B3", "고가주택 기준은 양도가액 12억 원 초과이다.", "T", "대조군"],
  ["B4", "인도와 주민등록을 마치면 즉시 대항력이 생긴다.", "F", "다음 날, 주택임대차보호법 제3조①"],
  ["B5", "계약갱신요구권은 2회까지 행사할 수 있다.", "F", "1회, 제6조의3②"],
  ["B6", "갱신요구는 만료 6개월 전부터 1개월 전까지 할 수 있다.", "F", "2개월 전까지, 제6조의3①"],
  ["B7", "상가 갱신요구권은 최초 기간 포함 10년 범위에서 행사할 수 있다.", "T", "상가건물 임대차보호법 제10조②"],
  ["B8", "서울 소액임차인은 보증금 전액을 최우선변제받는다.", "F", "일정액 한도, 시행령 제11조"],
  ["B9", "서울 소액임차인 기준은 보증금 1억 6,500만 원 이하이고, 5,500만 원까지 최우선변제받는다.", "T", "시행령 제10조 · 제11조"],
  ["B10", "항소는 판결 선고일부터 2주 안에 해야 한다.", "F", "송달일부터, 민사소송법 제396조"],
  ["B11", "지급명령 이의신청은 송달받은 날부터 2주 안에 해야 한다.", "T", "민사소송법 제470조"],
  ["B12", "불법행위 손해배상청구권은 손해와 가해자를 안 날부터 3년, 불법행위를 한 날부터 10년이면 소멸한다.", "T", "민법 제766조"],
  ["B13", "친고죄는 범인을 안 날부터 1년 안에 고소해야 한다.", "F", "6개월, 형사소송법 제230조"],
  ["B14", "상시 5인 미만 사업장에도 연차 유급휴가 규정이 적용된다.", "F", "근로기준법 시행령 별표 1"],
  ["B15", "4주 평균 1주 소정근로시간이 15시간 미만이면 주휴일 규정이 적용되지 않는다.", "T", "근로기준법 제18조③"],
  ["B16", "직전 연도 공급대가 8,000만 원 미만인 개인사업자만 간이과세자가 될 수 있다.", "F", "시행령 제109조, 1억 400만 원"],
  ["B17", "성실신고확인대상사업자의 종합소득세 신고 기한은 6월 30일이다.", "T", "소득세법 제70조의2"],
  ["B18", "대법원 2024다318572 판결은 전세사기 피해자에게 국가가 보증금 전액을 배상해야 한다고 판시했다.", "U", "가짜 출처 + 내용 거짓"],
  ["B19", "주택 임차인의 대항력은 인도와 주민등록을 마친 다음 날 0시에 생기고, 주택 계약갱신요구권은 1회 행사할 수 있으며, 상가는 최초 기간 포함 10년까지 갱신을 요구할 수 있고, 국세청 예규 서면-2022-법규소득-9917호에 따라 부업 수입 300만 원 이하는 신고하지 않아도 된다.", "M", "앞 3개 참, 마지막 확인 불가"],
  ["B20", "친고죄 고소는 범인을 안 날부터 6개월, 항소는 판결 선고일부터 2주, 지급명령 이의신청은 송달받은 날부터 2주 안에 해야 한다.", "P", "항소 기산점만 거짓", "항소"],
  ["C1", "퇴직금은 계속근로기간 1년 이상, 4주 평균 1주 소정근로시간 15시간 이상인 근로자에게 지급한다.", "T", "퇴직급여법 제4조①"],
  ["C2", "퇴직금은 퇴직일부터 30일 안에 지급해야 한다.", "F", "14일, 같은 법 제9조"],
  ["C3", "사용자는 근로자를 해고하려면 적어도 30일 전에 예고해야 한다.", "T", "근로기준법 제26조"],
  ["C4", "해고예고를 하지 않으면 60일분 이상의 통상임금을 지급해야 한다.", "F", "30일분, 같은 조"],
  ["C5", "연장근로에는 통상임금의 50% 이상을 가산해 지급한다.", "T", "근로기준법 제56조①"],
  ["C6", "출산전후휴가는 90일, 다태아는 120일이다.", "T", "근로기준법 제74조①"],
  ["C7", "출산전후휴가는 출산 후 기간이 최소 30일 이상 되도록 해야 한다.", "F", "45일(다태아 60일)"],
  ["C8", "임금채권의 소멸시효는 5년이다.", "F", "3년, 근로기준법 제49조"],
  ["C9", "기간을 2년 미만으로 정한 주택임대차는 그 기간을 2년으로 본다.", "T", "주택임대차보호법 제4조①"],
  ["C10", "기간을 2년 미만으로 정한 상가건물 임대차는 그 기간을 2년으로 본다.", "F", "1년, 상가건물 임대차보호법 제9조①"],
  ["C11", "임차권등기를 마친 주택 임차인은 이사해도 대항력과 우선변제권을 잃지 않는다.", "T", "주택임대차보호법 제3조의3⑤"],
  ["C12", "주택 임대인은 계약 만료 1개월 전까지만 갱신 거절을 통지하면 된다.", "F", "6개월~2개월 전, 제6조①"],
  ["C13", "양도소득세 확정신고는 양도한 다음 해 5월 1일부터 31일까지 한다.", "T", "소득세법 제110조"],
  ["C14", "부동산 양도소득세 예정신고는 양도일이 속한 달의 말일부터 3개월 안에 한다.", "F", "2개월, 소득세법 제105조①"],
  ["C15", "부가가치세 확정신고는 과세기간이 끝난 후 25일 안에 한다.", "T", "부가가치세법 제49조"],
  ["C16", "종합소득세 기본공제는 1명당 연 100만 원이다.", "F", "150만 원, 소득세법 제50조"],
  ["C17", "성년 자녀가 부모에게 받는 증여는 10년 합산 5,000만 원까지 공제된다.", "T", "상속세 및 증여세법 제53조"],
  ["C18", "민법상 성년은 만 19세부터이다.", "T", "민법 제4조"],
  ["C19", "헌법재판소 2023헌마4471 결정에 따라 상시 5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있게 됐다.", "U", "확인 불가 + 내용 거짓 (P0 재현)"],
  ["C20", "임금채권 소멸시효는 3년이고, 퇴직금은 퇴직일부터 14일 안에 지급해야 하며, 해고예고를 하지 않으면 60일분의 통상임금을 지급해야 한다.", "P", "해고예고수당만 거짓(30일분)", "해고예고"],
];

const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const items = ITEMS.filter(([id]) => !only || only.has(id));
const resultsFile = path.join(OUT, "results.jsonl");
const done = new Set(fs.existsSync(resultsFile) ? fs.readFileSync(resultsFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).id) : []);

const { runVerification } = await import("../server/verifyPipeline.js");
const squash = (s) => String(s || "").replace(/[\s"'“”‘’.,·]/g, "");

function grade([id, text, expect, basis, target], result) {
  const claims = result?.claims || [];
  const v = claims.map((c) => c.verdict);
  const overallConfirmed = result?.overall?.tone === "confirmed";
  const anyFalse = v.includes("false");
  const anyConfirmed = v.includes("confirmed");
  const badFix = claims.some((c) => c.suggested_fix && c.content_claim && c.content_verdict !== "true" && squash(c.suggested_fix).includes(squash(c.content_claim)));
  let pass;
  let fatal = false;
  let note = "";
  if (expect === "T") {
    pass = !anyFalse && overallConfirmed;
    note = anyFalse ? "오탐(참을 틀림)" : overallConfirmed ? "" : "참인데 확인 못 함";
  } else if (expect === "F") {
    pass = anyFalse;
    fatal = overallConfirmed;
    note = pass ? "" : overallConfirmed ? "치명: 거짓을 확인됨" : "놓침(확인 불가로 남음)";
  } else if (expect === "U") {
    const fakeOk = claims.some((c) => /\d{4}(헌|다|도|누|두)/.test(c.text) && c.verdict === "confirmed");
    pass = !overallConfirmed && !fakeOk;
    fatal = overallConfirmed || fakeOk;
    note = fatal ? "치명: 가짜 출처를 확인됨" : "";
  } else if (expect === "M") {
    pass = !overallConfirmed;
    fatal = overallConfirmed;
    note = fatal ? "치명: 혼합 답변을 전체 확인됨" : "";
  } else if (expect === "P") {
    const hit = claims.some((c) => c.verdict === "false" && String(c.text + (c.quote || "")).includes(target));
    const wrongHit = claims.some((c) => c.verdict === "false" && !String(c.text + (c.quote || "")).includes(target));
    pass = hit && !wrongHit;
    fatal = overallConfirmed;
    note = [hit ? "" : "거짓 부분 놓침", wrongHit ? "맞는 부분을 틀림" : ""].filter(Boolean).join(" · ");
  }
  if (badFix) { fatal = true; pass = false; note = `${note} 치명: 확인 안 된 내용을 되풀이한 고친 문장`.trim(); }
  return { pass, fatal, note, overall: result?.overall?.label, verdicts: v.join(","), anyConfirmed };
}

let spent = 0;
let next = 0;
// 예산이 모자랄 때를 대비해 이번 수정과 직접 닿는 문항(가짜 출처 · 혼합 · 부분 거짓)부터, 그다음 거짓 · 참 순서로 돈다.
const ORDER = { U: 0, M: 1, P: 2, F: 3, T: 4 };
const queue = items.filter(([id]) => !done.has(id)).sort((a, b) => ORDER[a[2]] - ORDER[b[2]]);
console.log(`문항 ${items.length}개 중 ${queue.length}개 실행 (예산 $${BUDGET})`);
async function worker() {
  while (next < queue.length) {
    if (spent >= BUDGET) { console.log(`예산 $${BUDGET} 도달 — 멈춤`); return; }
    const item = queue[next++];
    const [id, text] = item;
    const t0 = Date.now();
    try {
      const { result, cost } = await runVerification({ id: randomUUID(), text, source: "api" });
      spent += cost?.usd || 0;
      const g = grade(item, result);
      const row = {
        id, text, expect: item[2], basis: item[3], ...g, ms: Date.now() - t0, usd: cost?.usd || 0,
        claims: (result.claims || []).map((c) => ({ text: c.text, field: c.field, verdict: c.verdict, via: c.verified_via, explanation: c.explanation, fix: c.suggested_fix || null, fix_status: c.fix_status || null, source_check: c.source_check?.status || null, content_verdict: c.content_verdict || null, sources: (c.sources || []).map((s) => s.title).slice(0, 3) })),
      };
      fs.appendFileSync(resultsFile, JSON.stringify(row) + "\n");
      console.log(`${id} ${g.pass ? "✅" : g.fatal ? "⛔" : "❌"} ${g.overall} [${g.verdicts}] ${g.note} · ${(row.ms / 1000).toFixed(0)}초 · $${row.usd.toFixed(3)} (누적 $${spent.toFixed(2)})`);
    } catch (e) {
      console.log(`${id} 오류: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, worker));

// 요약
const rows = fs.readFileSync(resultsFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const bySet = (p) => rows.filter((r) => r.id.startsWith(p));
const lines = ["# 핸드오프 회귀 세트 결과", "", `실행: ${new Date().toISOString()} · 문항 ${rows.length}개 · 비용 $${rows.reduce((n, r) => n + (r.usd || 0), 0).toFixed(2)}`, ""];
for (const p of ["B", "C"]) {
  const rs = bySet(p);
  if (!rs.length) continue;
  const fs_ = rs.filter((r) => r.expect === "F");
  const caught = fs_.filter((r) => r.pass).length;
  const fp = rs.filter((r) => r.expect === "T" && r.note.startsWith("오탐")).length;
  const fatal = rs.filter((r) => r.fatal).length;
  lines.push(`## 세트 ${p}`, `- 치명 실패: ${fatal}건 (합격선 0)`, `- 거짓 적발: ${caught}/${fs_.length} (합격선 9/10)`, `- 오탐: ${fp}건 (합격선 2건 이하)`, `- 전체 통과: ${rs.filter((r) => r.pass).length}/${rs.length}`, "");
}
lines.push("| # | 기대 | 결과 | 총평 | 판정 | 메모 |", "|---|---|---|---|---|---|");
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) lines.push(`| ${r.id} | ${r.expect} | ${r.pass ? "통과" : r.fatal ? "치명" : "실패"} | ${r.overall} | ${r.verdicts} | ${r.note} |`);
fs.writeFileSync(path.join(OUT, "요약.md"), lines.join("\n") + "\n");
console.log(lines.slice(0, 16).join("\n"));
process.exit(0);
