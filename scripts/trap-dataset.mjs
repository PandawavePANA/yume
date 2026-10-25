// 베리라인 함정 질문 데이터셋 만들기 — 2026-10-25.
//
// 목표: 노무 · 법률 · 세무 · 의료(법령) 분야별로, 최신 범용 모델(Sonnet)이 실제로 틀리는 질문을 모은다.
// 정답은 언제나 법제처 현행 조문 문장에서 나온다(모델 기억이 아니라 원문). 순서:
//   1) 법령마다 현행 전체 조문을 받아, 수치 · 제재 · 단서가 있고 최근 개정된 조문을 고른다(+ 없는 조문 함정).
//   2) 생성 모델이 그 조문으로만 답이 정해지는 "실제 사용자 질문"과 정답 · 근거 인용을 쓴다 → 인용이 조문에 그대로 있는지 코드가 확인.
//   3) 피검 모델(Sonnet)에게 아무 자료 없이 묻는다 — 챗봇이 받는 그대로.
//   4) 채점 모델이 정답 · 근거 조문과 대조하고, 코드가 한 번 더 막는다(정답 수치가 같은 자리에 있으면 '틀림'을 버린다).
//   5) '틀림'만 데이터셋에 남긴다. 모든 시도는 attempts.jsonl에 남겨 나중에 다시 볼 수 있다.
//
//   railway run -s yume node scripts/trap-dataset.mjs --out "<폴더>" --per 75 --budget 30          # 한 번에(생성 모델이 질문까지)
//   railway run -s yume node scripts/trap-dataset.mjs --out "<폴더>" --stage candidates              # 1단계: 조문 후보만(모델 호출 없음)
//   railway run -s yume node scripts/trap-dataset.mjs --out "<폴더>" --stage test --budget 15        # 3단계: questions.jsonl을 피검 모델로 시험
// (2단계 questions.jsonl은 생성 모델이나 사람이 쓴다: {cid, question, answer, answer_quote, trap_type, why_hard})
//
// 비용은 응답의 usage로 세고, --budget(달러)를 넘기면 멈춘다. 이어 하기: 같은 --out이면 이미 남긴 질문 수부터 이어 간다.
import fs from "node:fs";
import path from "node:path";
import { searchStatute, getStatuteArticlesAll } from "../server/lawApi.js";
import { extractQuantities, sanctionKinds, contextMatch, contextMismatch } from "../server/engine/quantities.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const OUT = args.out || "./trap-dataset";
const PER = Number(args.per || 75);
const BUDGET = Number(args.budget || 30);
const ONLY = args.field || null;
const SUBJECT = args.subject || "claude-sonnet-5-5";
const GEN = args.gen || "claude-sonnet-5-5";
const JUDGE = args.judge || "claude-sonnet-5-5";
const STAGE = args.stage || "all";
const KEY = process.env.ANTHROPIC_API_KEY;
if (STAGE !== "candidates" && !KEY) throw new Error("ANTHROPIC_API_KEY가 없습니다(railway run으로 실행).");
fs.mkdirSync(OUT, { recursive: true });

export const FIELDS = {
  노무: ["근로기준법", "고용보험법", "최저임금법", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "근로자퇴직급여 보장법", "산업재해보상보험법", "기간제 및 단시간근로자 보호 등에 관한 법률", "파견근로자 보호 등에 관한 법률", "산업안전보건법", "근로자의날 제정에 관한 법률"],
  법률: ["주택임대차보호법", "상가건물 임대차보호법", "민법", "전자상거래 등에서의 소비자보호에 관한 법률", "개인정보 보호법", "도로교통법", "할부거래에 관한 법률", "이자제한법", "공인중개사법", "집합건물의 소유 및 관리에 관한 법률"],
  세무: ["소득세법", "부가가치세법", "조세특례제한법", "상속세 및 증여세법", "국세기본법", "지방세법", "법인세법", "종합부동산세법", "국세징수법", "지방세특례제한법"],
  의료: ["의료법", "약사법", "국민건강보험법", "응급의료에 관한 법률", "감염병의 예방 및 관리에 관한 법률", "의료기기법", "마약류 관리에 관한 법률", "호스피스ㆍ완화의료 및 임종과정에 있는 환자의 연명의료결정에 관한 법률", "국민건강증진법", "정신건강증진 및 정신질환자 복지서비스 지원에 관한 법률"],
};

// 달러/백만 토큰(입력, 출력) — 대략값. 모르는 모델은 Sonnet 값으로 센다.
const PRICE = { sonnet: [2, 10], haiku: [1, 5], opus: [4, 20] }; // 5.5 세대 공개 단가(server/apiCost.js와 같게, 2026-10-26)
const priceOf = (m) => PRICE[/haiku/.test(m) ? "haiku" : /opus/.test(m) ? "opus" : "sonnet"];
let spent = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function claude(model, system, user, maxTokens = 1500) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) {
      const j = await r.json();
      const [pi, po] = priceOf(model);
      spent += ((j.usage?.input_tokens || 0) * pi + (j.usage?.output_tokens || 0) * po) / 1e6;
      const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      // 생각에 한도를 다 써서 답이 비거나 잘리면 기록하지 않는다(잘린 답을 "틀림"으로 남기면 데이터셋이 부당해진다)
      if (j.stop_reason === "max_tokens" || !text) throw new Error(`${model} 답이 잘림(${j.stop_reason}, ${text.length}자)`);
      return text;
    }
    const body = await r.text();
    if (r.status === 400 || r.status === 401 || r.status === 404) throw new Error(`${model} ${r.status} ${body.slice(0, 200)}`);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`${model} 응답 없음`);
}
const json = (s) => {
  const m = String(s || "").match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};
const squash = (s) => String(s || "").replace(/[\s"'“”‘’「」『』《》〈〉()[\]·ㆍ,.:;…~\-—–]/g, "");
const quoteIn = (hay, q) => squash(q).length >= 8 && squash(hay).includes(squash(q));
const label = (a) => `제${a.no}조${a.branch ? `의${a.branch}` : ""}`;
const lawUrl = (law, a) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}/${encodeURIComponent(label(a))}`;

// 최근 개정 연도 — 조문 본문의 <개정 2025. 2. 20.> 표시 중 가장 늦은 해
const amendYear = (t) => Math.max(0, ...[...String(t).matchAll(/<(?:개정|신설)\s*([0-9]{4})\./g)].map((m) => Number(m[1])));

function candidatesOf(law, articles) {
  const live = articles.filter((a) => !a.deleted && !a.expired && a.text.length >= 80 && a.text.length <= 2600 && !/^제\d+조(의\d+)?\s*\(목적\)/.test(a.text) && !/정의\)/.test(a.text.slice(0, 30)));
  const scored = live.map((a) => {
    const q = extractQuantities(a.text).length;
    const s = sanctionKinds(a.text).length;
    const y = amendYear(a.text);
    let score = Math.min(q, 4) + (s ? 2 : 0) + (/다만/.test(a.text) ? 1 : 0) + (y >= 2025 ? 4 : y >= 2023 ? 2 : y >= 2020 ? 1 : 0);
    if (!q && !s) score -= 3;
    return { law, a, score: score + Math.random() };
  });
  return scored.sort((x, y) => y.score - x.score).slice(0, 22);
}

const GEN_SYSTEM = `너는 한국 법령 전문 출제자다. 주어진 [조문]만으로 정답이 하나로 정해지는 "함정 질문"을 만든다. 범용 AI 챗봇이 기억으로 답하다 틀리기 쉬운 자리를 노린다. JSON만 출력한다.
노릴 자리: 최근 개정으로 바뀐 수치 · 기간 · 횟수 · 금액 · 비율, 단서(다만)와 예외, 요건의 정확한 기준(이상/초과/미만), 제재 종류(벌금 vs 과태료)와 상한, 적용 대상의 범위.
규칙
- 질문은 실제 사용자가 AI 상담 서비스에 묻는 자연스러운 말투로 쓴다(조문 번호를 주지 않는다). 법 이름은 넣어도 된다.
- 정답은 [조문] 문장으로 완전히 정해져야 한다. 시행령 · 별표 · 고시에 맡긴 값은 묻지 않는다.
- 질문 안에 정답을 흘리지 않는다. 그럴듯한 틀린 전제를 슬쩍 넣어도 좋다(예: "2주 기준이죠?").
- answer는 정답 한두 문장(핵심 수치 · 조건 포함). answer_quote는 [조문]에서 근거가 되는 부분을 한 글자도 바꾸지 않고 옮긴다(200자 이내).
출력: {"question":"...","answer":"...","answer_quote":"...","trap_type":"개정|수치|기간|제재|요건|예외|대상","why_hard":"AI가 틀리기 쉬운 이유 한 줄"}
이 조문으로 좋은 함정 질문을 만들 수 없으면 {"skip":true}.`;

const SUBJECT_SYSTEM = "당신은 한국의 법률 · 노무 · 세무 · 의료 제도를 안내하는 AI 상담원입니다. 질문에 정확하고 간결하게(5문장 이내) 답하세요. 구체적인 수치와 조건을 밝혀 주세요.";

const JUDGE_SYSTEM = `너는 채점자다. [정답]과 [근거 조문]을 기준으로 [AI 답변]을 채점한다. 네 기억으로 판단하지 않는다. JSON만 출력한다.
- incorrect: 답변이 핵심 사실(수치 · 기간 · 횟수 · 금액 · 요건 · 제재 종류 · 조문 존재 여부)을 정답과 다르게 단정했다.
- partial: 큰 틀은 맞지만 핵심 수치를 빠뜨렸거나 흐렸다.
- correct: 핵심 사실이 정답과 같다(표현만 다른 것은 correct).
- no_answer: 답을 피했다(모른다, 확인하라 등).
출력: {"verdict":"incorrect|partial|correct|no_answer","wrong_claim":"답변에서 틀린 말 그대로(incorrect일 때)","reason":"한 문장"}`;

// Sonnet 5.5는 답 앞에 먼저 생각한다(짧은 채점에도 생각 300토큰, 4000 한도에서 답이 빈 경우 11% 실측) — 서버(THINKING_FLOOR)처럼 16000을 둔다.
// 코드 방어: 정답의 수치가 답변의 같은 자리(같은 꼬리)에 같은 값으로 있으면 '틀림'이라 하지 않는다.
function codeGuard(answer, groundTruth) {
  const gq = extractQuantities(groundTruth);
  if (!gq.length) return "unknown";
  // 정답의 값이 모두 같은 자리에 있어야 '일치' — 한 값만 맞고 다른 값은 틀린 답(32주→36주, 75일은 맞음)을 놓치지 않게(2026-10-26).
  const ok = gq.every((q) => contextMatch(groundTruth, q, answer));
  const bad = gq.some((q) => contextMismatch(groundTruth, q, answer));
  return ok && !bad ? "matches" : bad ? "conflicts" : "unknown";
}

const done = new Map();
const datasetFile = path.join(OUT, "dataset.jsonl");
const attemptsFile = path.join(OUT, "attempts.jsonl");
if (fs.existsSync(datasetFile)) for (const line of fs.readFileSync(datasetFile, "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  done.set(r.field, (done.get(r.field) || 0) + 1);
}
const seenQ = new Set(fs.existsSync(attemptsFile) ? fs.readFileSync(attemptsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
const write = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + "\n");

async function runOne(field, c) {
  const { law, a } = c;
  const key = `${law}|${label(a)}`;
  if (seenQ.has(key)) return null;
  seenQ.add(key);
  let item;
  if (c.nonexistent) {
    item = { question: c.question, answer: c.answer, answer_quote: c.evidence, trap_type: "없는 조문", why_hard: "그럴듯한 조문 번호를 주면 AI가 내용을 지어낸다" };
  } else {
    const g = json(await claude(GEN, GEN_SYSTEM, `[법령] ${law}\n[조문] ${label(a)}${a.title ? `(${a.title})` : ""}\n${a.text.slice(0, 2400)}`, 900));
    if (!g || g.skip || !g.question || !g.answer || !quoteIn(a.text, g.answer_quote)) {
      write(attemptsFile, { key, field, law, article: label(a), stage: "gen", ok: false });
      return null;
    }
    item = g;
  }
  const answer = await claude(SUBJECT, SUBJECT_SYSTEM, item.question, 16000);
  const j = json(await claude(JUDGE, JUDGE_SYSTEM, `[질문] ${item.question}\n[정답] ${item.answer}\n[근거 조문] ${law} ${c.nonexistent ? "(조문 목록)" : label(a)}\n${c.nonexistent ? c.evidence : a.text.slice(0, 2400)}\n[AI 답변]\n${answer}`, 16000)) || {};
  const guard = c.nonexistent ? "n/a" : codeGuard(answer, item.answer);
  const kept = j.verdict === "incorrect" && guard !== "matches";
  const rec = {
    key, field, law, article: c.nonexistent ? c.fakeLabel : label(a), effective: a.effectiveDate || null,
    question: item.question, ground_truth: item.answer, evidence_quote: item.answer_quote, url: c.nonexistent ? c.url : lawUrl(law, a),
    trap_type: item.trap_type, why_hard: item.why_hard, subject_model: SUBJECT, subject_answer: answer,
    judge: j.verdict || "error", wrong_claim: j.wrong_claim || "", judge_reason: j.reason || "", code_guard: guard, kept,
  };
  write(attemptsFile, rec);
  if (kept) {
    const n = (done.get(field) || 0) + 1;
    done.set(field, n);
    const { key: _k, kept: _kept, ...row } = rec;
    write(datasetFile, { id: `VL-${{ 노무: "LAB", 법률: "LAW", 세무: "TAX", 의료: "MED" }[field]}-${String(n).padStart(3, "0")}`, ...row, created_at: new Date().toISOString() });
  }
  return rec;
}

function readJsonl(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
}
function readCandidates() {
  return new Map(readJsonl(path.join(OUT, "candidates.jsonl")).map((c) => [c.cid, c]));
}

// ── 2단계: 후보 조문마다 생성 모델이 함정 질문을 쓴다(인용은 코드가 확인). 없는 조문 함정은 코드가 만든다. ──
if (STAGE === "generate") {
  const qfile = path.join(OUT, "questions.jsonl");
  const have = new Set(readJsonl(qfile).map((q) => q.cid));
  const list = [...readCandidates().values()].filter((c) => !have.has(c.cid) && (!ONLY || c.field === ONLY));
  let i = 0;
  let made = 0;
  const worker = async () => {
    while (i < list.length && spent < BUDGET) {
      const c = list[i++];
      try {
        if (c.nonexistent) {
          for (const k of [1, 3]) {
            const fake = c.last_no + k;
            write(qfile, { cid: c.cid, fake_no: fake, question: `${c.law} 제${fake}조에는 어떤 내용이 규정돼 있나요? 핵심만 알려 주세요.`, answer: `${c.law}에는 제${fake}조가 없습니다. 본칙의 마지막 조문은 제${c.last_no}조${c.last_title ? `(${c.last_title})` : ""}입니다.`, answer_quote: "", trap_type: "없는 조문", why_hard: "그럴듯한 조문 번호를 주면 AI가 내용을 지어낸다" });
            made += 1;
          }
          continue;
        }
        const g = json(await claude(GEN, GEN_SYSTEM, `[법령] ${c.law}\n[조문] ${c.article}${c.title ? `(${c.title})` : ""}\n${c.text.slice(0, 2400)}`, 900));
        if (!g || g.skip || !g.question || !g.answer || !quoteIn(c.text, g.answer_quote)) continue;
        write(qfile, { cid: c.cid, question: g.question, answer: g.answer, answer_quote: g.answer_quote, trap_type: g.trap_type, why_hard: g.why_hard });
        made += 1;
        if (made % 20 === 0) console.log(`  질문 ${made}개 ($${spent.toFixed(2)})`);
      } catch (e) {
        console.log(`  ! ${c.cid} ${String(e.message || e).slice(0, 120)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`질문 ${made}개 추가 → ${qfile} · 쓴 돈 약 $${spent.toFixed(2)}`);
  process.exit(0);
}

// ── 1단계만: 조문 후보를 파일로(모델 호출 없음) ──
if (STAGE === "candidates") {
  const file = path.join(OUT, "candidates.jsonl");
  // --append: 기존 후보를 지키며 덧붙인다(이미 뽑은 조문은 건너뜀). --laws "법1,법2"로 그 분야(--field)에 법령을 더 넣을 수 있다.
  const APPEND = !!args.append;
  const old = APPEND ? [...readCandidates().values()] : [];
  const seenArt = new Set(old.filter((c) => !c.nonexistent).map((c) => `${c.law}|${c.article}`));
  const seenFake = new Set(old.filter((c) => c.nonexistent).map((c) => c.law));
  if (!APPEND) fs.writeFileSync(file, "");
  let n = old.reduce((m, c) => Math.max(m, Number(String(c.cid).slice(1)) || 0), 0);
  const fieldsToRun = args.laws ? { [ONLY]: String(args.laws).split(",").map((s) => s.trim()).filter(Boolean) } : FIELDS;
  for (const [field, laws] of Object.entries(fieldsToRun)) {
    if (ONLY && field !== ONLY) continue;
    for (const law of laws) {
      const s = await searchStatute(law).catch(() => null);
      if (!s?.found || s.versionStatus !== "current") { console.log(`  [건너뜀] ${law}`); continue; }
      const all = await getStatuteArticlesAll(s.mst).catch(() => null);
      if (!all?.ok) continue;
      const official = s.lawNameOfficial;
      const cands = candidatesOf(official, all.articles).filter((c) => !seenArt.has(`${official}|${label(c.a)}`)).slice(0, Number(args.take || 12));
      for (const c of cands) {
        n += 1;
        write(file, { cid: `C${String(n).padStart(4, "0")}`, field, law: official, article: label(c.a), no: c.a.no, branch: c.a.branch || 0, title: c.a.title, effective: c.a.effectiveDate || s.effectiveDate, amend_year: amendYear(c.a.text), url: lawUrl(official, c.a), text: c.a.text });
      }
      const nums = all.articles.filter((x) => !x.branch).map((x) => x.no);
      const last = Math.max(...nums);
      const lastArt = all.articles.find((x) => x.no === last && !x.branch);
      if (!seenFake.has(official)) write(file, { cid: `X${String(n).padStart(4, "0")}`, field, law: official, nonexistent: true, last_no: last, last_title: lastArt?.title || "", url: s.detailUrl });
      console.log(`  ${field} ${official}: ${cands.length}`);
    }
  }
  console.log(`후보 ${n}개 → ${file}`);
  process.exit(0);
}

// ── 3단계만: 이미 쓴 질문(questions.jsonl)을 피검 모델로 시험 ──
if (STAGE === "test") {
  const cands = readCandidates();
  const qs = readJsonl(path.join(OUT, "questions.jsonl"));
  let bad = 0;
  const work = [];
  for (const q of qs) {
    const c = cands.get(q.cid);
    if (!c) { bad += 1; continue; }
    if (!c.nonexistent && !quoteIn(c.text, q.answer_quote)) { bad += 1; console.log(`  [인용 불일치 제외] ${q.cid} ${c.law} ${c.article}`); continue; }
    work.push({ q, c });
  }
  console.log(`질문 ${qs.length}개 중 시험 ${work.length}개(인용 불일치 · 후보 없음 ${bad})`);
  let i = 0;
  const worker = async () => {
    while (i < work.length && spent < BUDGET) {
      const { q, c } = work[i++];
      const key = `Q|${q.cid}|${q.question.slice(0, 40)}`;
      if (seenQ.has(key)) continue;
      seenQ.add(key);
      try {
        const a = c.nonexistent ? { no: q.fake_no, branch: 0, text: "", effectiveDate: null } : { no: c.no, branch: c.branch, text: c.text, effectiveDate: c.effective };
        const answer = await claude(SUBJECT, SUBJECT_SYSTEM, q.question, 16000);
        const evidence = c.nonexistent ? `${c.law} 본칙 마지막 조문: 제${c.last_no}조(${c.last_title})` : c.text.slice(0, 2400);
        const j = json(await claude(JUDGE, JUDGE_SYSTEM, `[질문] ${q.question}
[정답] ${q.answer}
[근거 조문] ${c.law} ${c.nonexistent ? "(조문 목록)" : c.article}
${evidence}
[AI 답변]
${answer}`, 16000)) || {};
        const guard = c.nonexistent ? "n/a" : codeGuard(answer, q.answer);
        const kept = j.verdict === "incorrect" && guard !== "matches";
        const rec = { key, field: c.field, law: c.law, article: c.nonexistent ? `제${q.fake_no}조` : c.article, effective: c.effective || null, question: q.question, ground_truth: q.answer, evidence_quote: c.nonexistent ? evidence : q.answer_quote, url: c.url, trap_type: q.trap_type, why_hard: q.why_hard, subject_model: SUBJECT, subject_answer: answer, judge: j.verdict || "error", wrong_claim: j.wrong_claim || "", judge_reason: j.reason || "", code_guard: guard, kept };
        write(attemptsFile, rec);
        if (kept) {
          const n = (done.get(c.field) || 0) + 1;
          done.set(c.field, n);
          const { key: _k, kept: _kept, ...row } = rec;
          write(datasetFile, { id: `VL-${{ 노무: "LAB", 법률: "LAW", 세무: "TAX", 의료: "MED" }[c.field]}-${String(n).padStart(3, "0")}`, ...row, created_at: new Date().toISOString() });
        }
        console.log(`  ${kept ? "◆ 틀림(남김)" : "· " + (j.verdict || "?")} ${c.law} ${rec.article} ($${spent.toFixed(2)})`);
      } catch (e) {
        console.log(`  ! ${q.cid} ${String(e.message || e).slice(0, 120)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  console.log(`
끝. 남긴 질문: ${[...done.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")} · 쓴 돈 약 $${spent.toFixed(2)}`);
  process.exit(0);
}

for (const [field, laws] of Object.entries(FIELDS)) {
  if (ONLY && field !== ONLY) continue;
  if ((done.get(field) || 0) >= PER) continue;
  console.log(`\n== ${field} (지금 ${done.get(field) || 0}/${PER}) ==`);
  const pool = [];
  for (const law of laws) {
    const s = await searchStatute(law).catch(() => null);
    if (!s?.found || s.versionStatus !== "current") { console.log(`  [건너뜀] ${law} — 현행 버전 없음`); continue; }
    const all = await getStatuteArticlesAll(s.mst).catch(() => null);
    if (!all?.ok) continue;
    const official = s.lawNameOfficial;
    const cands = candidatesOf(official, all.articles.map((x) => ({ ...x, effectiveDate: x.effectiveDate || s.effectiveDate })));
    // 없는 조문 함정 2개: 마지막 조문 바로 뒤 번호
    const nums = all.articles.filter((x) => !x.branch).map((x) => x.no);
    const last = Math.max(...nums);
    const lastArt = all.articles.find((x) => x.no === last && !x.branch);
    for (const k of [1, 3]) {
      const fakeNo = last + k;
      cands.push({ law: official, nonexistent: true, a: { no: fakeNo, branch: 0, text: "", effectiveDate: s.effectiveDate }, fakeLabel: `제${fakeNo}조`, question: `${official} 제${fakeNo}조에는 어떤 내용이 규정돼 있나요? 핵심만 알려 주세요.`, answer: `${official}에는 제${fakeNo}조가 없습니다. 본칙의 마지막 조문은 제${last}조${lastArt?.title ? `(${lastArt.title})` : ""}입니다.`, evidence: `${official} 본칙 마지막 조문: 제${last}조${lastArt?.title ? `(${lastArt.title})` : ""}`, url: s.detailUrl, score: 3 });
    }
    pool.push(...cands);
    console.log(`  ${official}: 후보 ${cands.length}`);
  }
  // 법령을 섞어 고르게(한 법령에 몰리지 않게) — 점수 순으로 번갈아
  const byLaw = new Map();
  for (const c of pool) { if (!byLaw.has(c.law)) byLaw.set(c.law, []); byLaw.get(c.law).push(c); }
  const queue = [];
  for (let i = 0; queue.length < pool.length; i++) for (const list of byLaw.values()) if (list[i]) queue.push(list[i]);
  const CONC = 3;
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length && (done.get(field) || 0) < PER && spent < BUDGET) {
      const c = queue[idx++];
      try {
        const r = await runOne(field, c);
        if (r) console.log(`  ${r.kept ? "◆ 남김" : "· 통과"} ${r.law} ${r.article} [${r.judge}${r.code_guard === "matches" ? "/코드:정답일치" : ""}] (${done.get(field) || 0}/${PER}, $${spent.toFixed(2)})`);
      } catch (e) {
        console.log(`  ! ${c.law} ${label(c.a)} ${String(e.message || e).slice(0, 120)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  if (spent >= BUDGET) { console.log(`\n예산 $${BUDGET} 도달 — 멈춤`); break; }
}
console.log(`\n끝. 분야별: ${[...done.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")} · 쓴 돈 약 $${spent.toFixed(2)}`);
process.exit(0);
