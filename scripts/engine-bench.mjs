// 베리라인 엔진 대 "법제처 API + 강한 모델(Opus)" 비교 시험 — 2026-10-26 대표
// "법제청 등 누구나 접근 가능한 api + opus를 써도 베리라인이 이길 정도로".
//
// 문항: 함정 질문 데이터셋(scripts/trap-dataset.mjs)에서
//   양성 = Sonnet이 실제로 틀린 답(dataset.jsonl) — 틀린 곳을 잡아 원문대로 고쳐야 정답
//   음성 = Sonnet이 맞힌 답(attempts.jsonl의 correct) — 멀쩡한 답을 망가뜨리지 않아야 정답
// 겨루는 쪽:
//   veriline — 서비스의 답변 검증(checkAnswer)을 그대로 부른다(법령 대조 · 수치/제재 코드 대조 · 반론 검토 · 고쳐 쓰기).
//   baseline — 경쟁사가 만들 법한 가장 강한 형태: Opus가 법제처 도구(법령 검색 · 조문 목록 · 조문 본문)를 직접 골라 쓰며
//              확인하고 고친 최종 답을 낸다. 같은 법제처 API, 같은 질문 · 답.
// 채점: 데이터셋을 만든 채점자(Sonnet)가 최종 답을 [정답]과 [근거 조문]에 비춰 correct / partial / incorrect 로 본다.
//
//   railway run -s yume node scripts/engine-bench.mjs --data "<데이터셋 폴더>" --out "<결과 폴더>" --pos 15 --neg 5 --budget 12
//   (--systems veriline,baseline  --level standard  --seed 7  --only 노무)
// 이어 하기: 같은 --out이면 이미 채점한 문항은 건너뛴다.
import fs from "node:fs";
import path from "node:path";
import { checkAnswer } from "../server/answerCheck.js";
import { newLedger, summarize, costOf } from "../server/apiCost.js";
import { searchStatute, getStatuteIndex, getStatuteArticle } from "../server/lawApi.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const DATA = args.data;
const OUT = args.out || path.join(DATA, "bench");
const POS = Number(args.pos || 15);
const NEG = Number(args.neg || 5);
const BUDGET = Number(args.budget || 12);
const LEVEL = args.level || "standard";
const SYSTEMS = String(args.systems || "veriline,baseline").split(",");
const BASE_MODEL = args.baseModel || "claude-opus-5-5";
const JUDGE = "claude-sonnet-5-5";
const SEED = Number(args.seed || 7);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("ANTHROPIC_API_KEY가 없습니다(railway run으로 실행).");
fs.mkdirSync(OUT, { recursive: true });

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const write = (f, o) => fs.appendFileSync(f, `${JSON.stringify(o)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let spent = 0;

// 같은 씨앗이면 같은 문항 — 엔진을 고친 뒤 다시 돌려도 같은 문제로 비교된다.
function shuffled(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// --exclude "a.jsonl,b.jsonl": 이미 쓴(엔진을 고치며 들여다본) 문항을 뺀다 — 새 문항으로만 겨루기 위해.
const EXCLUDE = new Set(String(args.exclude || "").split(",").filter(Boolean).flatMap((f) => readJsonl(f).map((r) => r.bid)));
// 2세대(trap-rag.mjs) 기록은 key 대신 cid를 쓴다
const negId = (r) => (r.cid ? `NEG-${r.cid}` : `NEG-${r.field}-${String(r.key || "").split("|")[1] || ""}`);
// 반박까지 한 기록은 "[첫 답] … [반박 뒤 답] …" — 검증할 답은 마지막 답이다
const answerOf = (it) => String(it.subject_answer || "").split("[반박 뒤 답]").pop().replace(/^\s*\[첫 답\]\s*/, "").trim();
function pickItems() {
  const pos = readJsonl(path.join(DATA, "dataset.jsonl")).filter((r) => !EXCLUDE.has(r.id));
  const neg = readJsonl(path.join(DATA, "attempts.jsonl")).filter((r) => r.judge === "correct" && r.code_guard !== "conflicts" && !EXCLUDE.has(negId(r)));
  const items = [];
  for (const field of ["노무", "법률", "세무", "의료"]) {
    if (args.only && field !== args.only) continue;
    for (const r of shuffled(pos.filter((x) => x.field === field), SEED).slice(0, POS)) items.push({ ...r, bid: r.id, kind: "pos" });
    shuffled(neg.filter((x) => x.field === field), SEED).slice(0, NEG).forEach((r) => items.push({ ...r, bid: negId(r), kind: "neg" }));
  }
  return items;
}

async function anthropic(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) {
      const j = await r.json();
      const u = j.usage || {};
      const usd = costOf({ model: body.model, input: u.input_tokens || 0, output: u.output_tokens || 0, cachedInput: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 });
      spent += usd;
      return { j, usd };
    }
    const t = await r.text();
    if ([400, 401, 404].includes(r.status)) throw new Error(`${body.model} ${r.status} ${t.slice(0, 200)}`);
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(`${body.model} 응답 없음`);
}
const textOf = (j) => (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
const json = (s) => { const m = String(s || "").match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

// ── 겨루는 쪽 1: 베리라인 엔진 ──
async function runVeriline(it) {
  const ledger = newLedger();
  const t0 = Date.now();
  const out = await checkAnswer({ question: it.question, answer: answerOf(it), level: LEVEL, ledger });
  const sum = summarize(ledger);
  const usd = sum?.usd || 0;
  spent += usd;
  const fixes = out.verification?.fixes || [];
  return { final: out.text, flagged: fixes.length > 0, notes: fixes.map((f) => `${f.quote} → ${f.problem}`).slice(0, 4), usd, ms: Date.now() - t0, cost_by: sum?.byLabel || {}, searches: sum?.searches || 0 };
}

// ── 겨루는 쪽 2: 법제처 API + Opus(도구를 스스로 골라 쓰는 검증기) ──
const BASE_SYSTEM = `너는 AI 답변 검증기다. 한국 법령에 관한 [질문]과 다른 AI의 [답변]이 주어진다.
기억에 기대지 말고, 주어진 법제처 도구로 현행 법령 조문을 직접 찾아 답변의 수치 · 기간 · 횟수 · 금액 · 요건 · 제재 종류 · 조문 존재 여부를 하나하나 확인하라.
틀린 곳이 있으면 조문대로 고친 최종 답변을 쓰고, 맞으면 답변을 그대로 둔다. 확인하지 못한 내용을 새로 지어내지 마라.
마지막 출력 형식: <verdict>error 또는 ok</verdict><answer>최종 답변</answer>`;
const TOOLS = [
  { name: "search_law", description: "법령 이름으로 현행 법령을 찾는다. 정확한 정식 명칭과 시행일, 비슷한 이름 후보를 돌려준다.", input_schema: { type: "object", properties: { name: { type: "string", description: "법령 이름(예: 근로기준법, 소득세법 시행령)" } }, required: ["name"] } },
  { name: "list_articles", description: "법령의 조문 번호와 제목 목록(현행).", input_schema: { type: "object", properties: { law: { type: "string" } }, required: ["law"] } },
  { name: "get_article", description: "법령의 조문 본문(현행). 가지조문(제19조의4)은 branch에 4.", input_schema: { type: "object", properties: { law: { type: "string" }, article: { type: "integer" }, branch: { type: "integer" } }, required: ["law", "article"] } },
];
const mstCache = new Map();
async function mstOf(name) {
  if (!mstCache.has(name)) mstCache.set(name, searchStatute(name).catch(() => ({ ok: false })));
  return mstCache.get(name);
}
async function runTool(name, input) {
  if (name === "search_law") {
    const r = await mstOf(input.name);
    if (r?.found) return `정식 명칭: ${r.lawNameOfficial} · 시행일 ${r.effectiveDate} · 상태 ${r.versionStatus}`;
    return `정확히 같은 이름의 법령 없음. 후보: ${(r?.candidates || []).map((c) => c.lawNameOfficial).join(", ") || "없음"}`;
  }
  const r = await mstOf(input.law);
  if (!r?.found) return `법령을 찾지 못함: ${input.law}`;
  if (name === "list_articles") {
    const idx = await getStatuteIndex(r.mst);
    if (!idx.ok) return "목록을 받지 못함";
    return idx.articles.map((a) => `제${a.no}조${a.branch ? `의${a.branch}` : ""}(${a.title})${a.deleted ? " 삭제" : ""}`).join(" / ").slice(0, 9000);
  }
  if (name === "get_article") {
    const a = await getStatuteArticle(r.mst, input.article, input.branch || null);
    if (!a.found) return `${r.lawNameOfficial}에 제${input.article}조${input.branch ? `의${input.branch}` : ""}가 없음(마지막 조문 제${a.maxArticleNo}조)`;
    return `${r.lawNameOfficial} 제${input.article}조${input.branch ? `의${input.branch}` : ""}(${a.title}) 조문 시행일 ${a.effectiveDate}\n${a.text.slice(0, 6000)}`;
  }
  return "모르는 도구";
}
async function runBaseline(it) {
  const t0 = Date.now();
  const messages = [{ role: "user", content: `[질문]\n${it.question}\n\n[답변]\n${answerOf(it)}` }];
  let usd = 0;
  let calls = 0;
  for (let turn = 0; turn < 10; turn++) {
    const { j, usd: u } = await anthropic({ model: BASE_MODEL, max_tokens: 16000, system: BASE_SYSTEM, tools: TOOLS, messages });
    usd += u;
    messages.push({ role: "assistant", content: j.content });
    const uses = (j.content || []).filter((c) => c.type === "tool_use");
    if (j.stop_reason !== "tool_use" || !uses.length) {
      const t = textOf(j);
      const final = (t.match(/<answer>([\s\S]*?)<\/answer>/) || [])[1]?.trim() || t;
      const verdict = (t.match(/<verdict>\s*(\w+)\s*<\/verdict>/) || [])[1] || "";
      return { final, flagged: verdict === "error", notes: [], usd, ms: Date.now() - t0, tool_calls: calls };
    }
    const results = [];
    for (const u2 of uses) {
      calls += 1;
      const content = await runTool(u2.name, u2.input || {}).catch((e) => `도구 오류: ${String(e.message || e).slice(0, 100)}`);
      results.push({ type: "tool_result", tool_use_id: u2.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  return { final: answerOf(it), flagged: false, notes: ["도구 반복 한도"], usd, ms: Date.now() - t0, tool_calls: calls };
}

const JUDGE_SYSTEM = `너는 채점자다. [정답]과 [근거 조문]을 기준으로 [AI 답변]을 채점한다. 네 기억으로 판단하지 않는다. JSON만 출력한다.
- incorrect: 답변이 핵심 사실(수치 · 기간 · 횟수 · 금액 · 요건 · 제재 종류 · 조문 존재 여부)을 정답과 다르게 단정했다.
- partial: 큰 틀은 맞지만 핵심 수치를 빠뜨렸거나 흐렸다.
- correct: 핵심 사실이 정답과 같다(표현만 다른 것은 correct).
- no_answer: 답을 피했다(모른다, 확인하라 등).
출력: {"verdict":"incorrect|partial|correct|no_answer","wrong_claim":"답변에서 틀린 말 그대로(incorrect일 때)","reason":"한 문장"}`;
async function judge(it, final) {
  // 채점 JSON이 비면 한 번 더 묻는다 — 엔진 답은 맞았는데 채점이 비어 'error'로 찍힌 일이 있었다(2026-10-27, 두 시스템 모두 같은 규칙)
  for (let k = 0; k < 2; k++) {
    const { j } = await anthropic({ model: JUDGE, max_tokens: 16000, system: JUDGE_SYSTEM, messages: [{ role: "user", content: `[질문] ${it.question}\n[정답] ${it.ground_truth}\n[근거 조문] ${it.law} ${it.article}\n${it.evidence_quote}\n[AI 답변]\n${final}` }] });
    const v = json(textOf(j));
    if (v?.verdict) return v;
  }
  return {};
}

const items = pickItems();
console.log(`문항 ${items.length}개(양성 ${items.filter((x) => x.kind === "pos").length} · 음성 ${items.filter((x) => x.kind === "neg").length}) · 시스템 ${SYSTEMS.join(", ")} · 예산 $${BUDGET}`);
for (const sys of SYSTEMS) {
  const file = path.join(OUT, `${sys}.jsonl`);
  const have = new Set(readJsonl(file).map((r) => r.bid));
  const todo = items.filter((x) => !have.has(x.bid));
  let i = 0;
  const worker = async () => {
    while (i < todo.length && spent < BUDGET) {
      const it = todo[i++];
      try {
        const r = sys === "veriline" ? await runVeriline(it) : await runBaseline(it);
        const v = await judge(it, r.final);
        const rec = { bid: it.bid, kind: it.kind, field: it.field, law: it.law, article: it.article, trap_type: it.trap_type, system: sys, verdict: v.verdict || "error", reason: v.reason || "", flagged: r.flagged, usd: Math.round(r.usd * 10000) / 10000, ms: r.ms, tool_calls: r.tool_calls, cost_by: r.cost_by, searches: r.searches, notes: r.notes, final: r.final };
        write(file, rec);
        console.log(`  [${sys}] ${it.bid} ${it.kind} → ${rec.verdict}${rec.flagged ? " (고침)" : ""} $${rec.usd} ${Math.round(r.ms / 1000)}초 · 누적 $${spent.toFixed(2)}`);
      } catch (e) {
        console.log(`  ! [${sys}] ${it.bid} ${String(e.message || e).slice(0, 160)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
}

// ── 집계 ──
const report = {};
for (const sys of SYSTEMS) {
  const rows = readJsonl(path.join(OUT, `${sys}.jsonl`)).filter((r) => items.some((x) => x.bid === r.bid));
  const pos = rows.filter((r) => r.kind === "pos");
  const neg = rows.filter((r) => r.kind === "neg");
  const rate = (a, f) => (a.length ? Math.round((a.filter(f).length / a.length) * 1000) / 10 : null);
  const byField = {};
  for (const f of ["노무", "법률", "세무", "의료"]) { const p = pos.filter((r) => r.field === f); if (p.length) byField[f] = { n: p.length, fixed: rate(p, (r) => r.verdict === "correct") }; }
  report[sys] = {
    n: rows.length,
    pos_n: pos.length, pos_fixed: rate(pos, (r) => r.verdict === "correct"), pos_fixed_or_partial: rate(pos, (r) => r.verdict === "correct" || r.verdict === "partial"), pos_flagged: rate(pos, (r) => r.flagged),
    neg_n: neg.length, neg_kept: rate(neg, (r) => r.verdict === "correct"), neg_false_flag: rate(neg, (r) => r.flagged),
    overall_correct: rate(rows, (r) => r.verdict === "correct"),
    usd_per_item: rows.length ? Math.round((rows.reduce((s, r) => s + r.usd, 0) / rows.length) * 10000) / 10000 : null,
    sec_per_item: rows.length ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length / 100) / 10 : null,
    by_field: byField,
  };
}
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ at: new Date().toISOString(), level: LEVEL, base_model: BASE_MODEL, seed: SEED, report }, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`쓴 돈 약 $${spent.toFixed(2)}`);
process.exit(0);
