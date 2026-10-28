// 베리라인 함정 데이터셋 2세대 — "법령을 찾아보는 AI"도 틀리는 질문(VERILINE-TRAP-RAG, 2026-10-27).
//
// 왜: 1세대(trap-dataset.mjs · VERILINE-TRAP-500)는 아무 자료 없이 답하는 Sonnet이 틀린 문항만 모았다. 그래서 학습 시점 뒤 개정만 노린
// 문항이 많았고, 현행 법령을 찾아 답하는 서비스(로무앤톡)에는 대부분 쉬웠다 — 2026-10-27 실제 점검 8문항 중 6개를 맞혔다.
// 로무앤톡이 실제로 틀린 두 문항이 2세대의 설계 기준이다.
//   · 틀린 전제의 수치 셋 중 둘만 바로잡고 하나(체불총액 3천만 원 → 현행 2천만 원)는 그대로 받아들였다  → "부분 교정" 함정
//   · 최근 새로 생긴 조문(제43조의8 3배 손해배상)을 검색에서 못 찾고 지연이자 이야기로 돌렸다          → "신설 조문" 함정 + '누락'도 오답
// 그래서 문항 유형을 이렇게 고른다(모두 조문 저장소에서 코드로 — 모델 호출 없음).
//   new     최근(2024~) 신설 · 개정 표시가 있고 수치가 있는 조문 — 덜 알려진 세부를 묻는다
//   multi   한 조문에 수치가 셋 이상 — 셋을 전제로 넣고 하나만 슬쩍 틀린다(부분 교정)
//   penalty 의무 조문 ↔ 다른 조문의 벌칙 · 과태료 — 제재 종류와 금액을 함께 틀린 전제로
//   xref    "다만, 제N조…"처럼 다른 조문을 끌어오는 단서 — 두 조문을 함께 읽어야 정답
// 모든 질문은 두 가지를 함께 묻는다(첫째는 쉬운 기본, 둘째가 함정) — 여러 쟁점을 한 번에 받으면 얕게 답하는 경향을 노린다.
// 피검자는 Sonnet + 법제처 도구(검색 · 조문 목록 · 조문 본문)를 쥔 상담 에이전트 — 로무앤톡 같은 검색 기반 서비스를 흉내 낸다.
// 채점: incorrect(다르게 단정) · omission(물은 핵심을 말하지 않음)을 둘 다 실패로 남긴다. 코드가 한 번 더 막는다(정답 수치가 같은 자리에 있으면 버림).
//
//   node scripts/trap-rag.mjs --out "<폴더>" --stage candidates [--field 노무] [--per 3]     # 1단계: 후보(무료)
//   node scripts/trap-rag.mjs --out "<폴더>" --stage generate --budget 3                    # 2단계: 질문 쓰기(생성 모델)
//   node scripts/trap-rag.mjs --out "<폴더>" --stage test --budget 6                        # 3단계: 도구 쥔 에이전트로 시험 → 실패만 dataset.jsonl
// 비용은 응답 usage로 세고 --budget(달러)를 넘기면 멈춘다. 같은 --out이면 이어 간다.
import fs from "node:fs";
import path from "node:path";
import { loadStatute, articleLabel, lawUrl } from "../server/engine/v2/statuteStore.js";
import { makeLawTools, LAW_TOOLS } from "../server/engine/legalAgent.js";
import { extractQuantities, contextMatch, contextMismatch } from "../server/engine/quantities.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : a), []));
const OUT = args.out || "./trap-rag";
const STAGE = args.stage || "candidates";
const BUDGET = Number(args.budget || 3);
const ONLY = args.field && args.field !== true ? args.field : null;
const PER = Number(args.per || 3);
const GEN = args.gen || "claude-sonnet-5-5";
const SUBJECT = args.subject || "claude-sonnet-5-5";
const JUDGE = args.judge || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;
if (STAGE !== "candidates" && !KEY) throw new Error("ANTHROPIC_API_KEY가 없습니다.");
fs.mkdirSync(OUT, { recursive: true });

// 상담 서비스 이용자가 실제로 묻는 법 위주(1세대보다 좁고 깊게)
const FIELDS = {
  노무: ["근로기준법", "고용보험법", "최저임금법", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "근로자퇴직급여 보장법", "임금채권보장법", "기간제 및 단시간근로자 보호 등에 관한 법률", "산업재해보상보험법", "파견근로자 보호 등에 관한 법률"],
  법률: ["주택임대차보호법", "상가건물 임대차보호법", "전자상거래 등에서의 소비자보호에 관한 법률", "개인정보 보호법", "도로교통법", "공인중개사법", "이자제한법", "할부거래에 관한 법률"],
  세무: ["소득세법", "부가가치세법", "조세특례제한법", "상속세 및 증여세법", "국세기본법"],
  의료: ["의료법", "약사법", "국민건강보험법", "응급의료에 관한 법률"],
};

const PRICE = { sonnet: [2, 10], haiku: [1, 5], opus: [4, 20] };
const priceOf = (m) => PRICE[/haiku/.test(m) ? "haiku" : /opus/.test(m) ? "opus" : "sonnet"];
let spent = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addCost = (model, u = {}) => {
  const [pi, po] = priceOf(model);
  spent += ((u.input_tokens || 0) * pi + (u.cache_creation_input_tokens || 0) * pi * 1.25 + (u.cache_read_input_tokens || 0) * pi * 0.1 + (u.output_tokens || 0) * po) / 1e6;
};

async function call(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) {
      const j = await r.json();
      addCost(body.model, j.usage);
      return j;
    }
    const t = await r.text();
    if ([400, 401, 404].includes(r.status)) throw new Error(`${body.model} ${r.status} ${t.slice(0, 200)}`);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`${body.model} 응답 없음`);
}
const textOf = (j) => (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
async function claude(model, system, user, maxTokens = 16000) {
  const j = await call({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const text = textOf(j);
  if (j.stop_reason === "max_tokens" || !text) throw new Error(`${model} 답이 잘림(${j.stop_reason})`);
  return text;
}
const json = (s) => {
  const m = String(s || "").match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};
const squash = (s) => String(s || "").replace(/[\s"'“”‘’「」『』《》〈〉()[\]·ㆍ,.:;…~\-—–]/g, "");
const quoteIn = (hay, q) => squash(q).length >= 8 && squash(hay).includes(squash(q));
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const write = (f, o) => fs.appendFileSync(f, `${JSON.stringify(o)}\n`);
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
// 수치를 뺀 낱말 집합(형제 조문 찾기용)
const wordSet = (l) => new Set((String(l).replace(/\d[\d,.]*/g, " ").match(/[가-힣]{2,}/g) || []).map((w) => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만)$/, "")).filter((w) => w.length >= 2));
const recentYear = (t) => Math.max(0, ...[...String(t).matchAll(/<(?:개정|신설)\s*([0-9]{4})\./g)].map((m) => Number(m[1])));
const isNewArticle = (t) => /<신설\s*20(2[4-9])\./.test(String(t).slice(0, 300));

const CANDS = path.join(OUT, "candidates.jsonl");
const QUESTIONS = path.join(OUT, "questions.jsonl");
const ATTEMPTS = path.join(OUT, "attempts.jsonl");
const DATASET = path.join(OUT, "dataset.jsonl");

const COMMON = "질문은 두 가지를 함께 묻는다 — 첫째는 그 주제의 쉬운 기본, 둘째가 함정이다. 둘째를 정답이 갈리는 자리로 만든다.";
const INSTRUCTION = {
  sibling: "[조문 A]와 [조문 B]는 문장이 거의 같고 수치만 다르다. 질문은 [조문 A]의 제도를 묻되(제도 이름 · 목적이 드러나게), 전제의 수치는 [조문 B]의 값을 넣는다(예: 신용제재 기준을 묻는데 명단 공개 기준인 3천만 원을 넣음). 정답은 [조문 A]의 값이고, answer_quote는 [조문 A]에서 옮긴다.",
  moved: "이 조문(또는 항)은 최근 개정으로 새로 생기거나 다른 조문에서 옮겨 왔다. 질문 끝에 '근거 조문도 알려 주세요'를 붙여 현행 조문 번호를 함께 묻는다. 정답에는 현행 법령명과 조문 번호(제N조 제M항)를 반드시 넣는다 — 예전 번호(삭제된 항)를 대면 오답이다.",
  new: "이 조문은 최근 신설 · 개정됐다. 언론에 크게 알려진 대표 수치(휴가 일수 같은)보다 같은 조문 안의 덜 알려진 세부(요건의 두 번째 수치, 기한, 예외, 제외 대상)를 노린다. 그럴듯한 틀린 전제를 넣는다.",
  multi: "이 조문에는 수치가 여러 개 있다. 질문의 전제에 수치 셋을 넣되 둘은 조문과 같게, 하나만 조문과 다르게 넣는다(예: '3년 안에 2번, 체불액 3천만 원 이상이죠?'에서 3천만 원만 틀림). 답하는 쪽이 둘만 확인하고 하나를 그냥 받아들이게 만드는 함정이다.",
  penalty: "의무를 어겼을 때의 처벌을 묻는다. 질문에는 무엇을 하지 않았는지만 쓰고 조문 번호는 쓰지 않는다. 제재 종류(벌금↔과태료)와 상한 금액을 함께 틀린 전제로 넣는다. 정답은 [벌칙 조문]의 제재 문구다.",
  xref: "이 조문의 단서(다만)는 다른 조문을 끌어온다. 정답을 알려면 [끌어온 조문]까지 읽어야 하도록, 원칙만 알면 틀리는 질문을 만든다(예외가 적용되는 구체적 상황을 넣는다).",
};

// ── 1단계: 후보(코드만) ──
if (STAGE === "candidates") {
  fs.writeFileSync(CANDS, "");
  let n = 0;
  const add = (o) => { n += 1; write(CANDS, { cid: `R${String(n).padStart(4, "0")}`, ...o }); };
  for (const [field, laws] of Object.entries(FIELDS)) {
    if (ONLY && field !== ONLY) continue;
    for (const name of laws) {
      const s = await loadStatute(name).catch(() => null);
      if (!s) { console.log(`  [건너뜀] ${name}`); continue; }
      const live = s.articles.filter((a) => !a.deleted && !/효력 상실/.test(a.text || "") && String(a.text || "").length >= 60 && !/\((목적|정의)\)/.test(String(a.text).slice(0, 40)));
      const counts = { new: 0, multi: 0, penalty: 0, xref: 0 };
      const base = (a) => ({ field, law: s.law, article: articleLabel(a.no, a.branch), no: a.no, branch: a.branch || 0, title: a.title, effective: s.effective, url: lawUrl(s.law, a.no, a.branch) });
      // new — 2024년 이후 신설 · 2025년 이후 개정 표시, 또는 나중에 끼워 넣은 가지조문(제43조의8처럼 — 법제처 본문에 개정 표시가
      // 없는 조문도 있어 2026-10-27 근로기준법에서 표시만으로는 1개뿐이었다). 표시 있는 것 → 가지조문 순으로.
      const recentRank = (a) => (isNewArticle(a.text) ? 3 : recentYear(a.text) >= 2025 ? 2 : (a.branch || 0) >= 1 ? 1 : 0);
      for (const a of shuffle(live.filter((a) => recentRank(a) > 0 && extractQuantities(a.text).length >= 1 && !/벌칙|과태료/.test(a.title || ""))).sort((x, y) => recentRank(y) - recentRank(x)).slice(0, PER)) {
        add({ ...base(a), type: "new", text: a.text.slice(0, 3200), instruction: INSTRUCTION.new }); counts.new++;
      }
      // multi — 수치 셋 이상
      for (const a of shuffle(live.filter((a) => extractQuantities(a.text).length >= 3 && a.text.length <= 2600 && !/벌칙|과태료/.test(a.title || ""))).slice(0, PER)) {
        add({ ...base(a), type: "multi", text: a.text, instruction: INSTRUCTION.multi }); counts.multi++;
      }
      // penalty — 벌칙 지도에서 위반 대상 하나 · 수치 있는 제재
      for (const p of shuffle(s.penalties.filter((p) => p.refs.length === 1 && /\d/.test(p.sanction))).slice(0, PER)) {
        const duty = s.articles.find((a) => a.no === p.refs[0].no && (a.branch || 0) === (p.refs[0].branch || 0));
        if (!duty || duty.deleted || /효력 상실/.test(duty.text || "")) continue;
        add({ field, law: s.law, article: articleLabel(p.no, p.branch), no: p.no, branch: p.branch || 0, title: p.title, effective: s.effective, url: lawUrl(s.law, p.no, p.branch), type: "penalty",
          text: `[의무 조문] ${s.law} ${articleLabel(duty.no, duty.branch)}(${duty.title})\n${String(duty.text).slice(0, 1200)}\n\n[벌칙 조문] ${s.law} ${articleLabel(p.no, p.branch)}(${p.title})\n${p.text}`,
          instruction: `${INSTRUCTION.penalty} 정답 제재 문구: "${p.sanction}". answer_quote는 [벌칙 조문]에서 옮긴다.` });
        counts.penalty++;
      }
      // xref — "다만, 제N조…"가 같은 법의 살아 있는 다른 조문을 가리킴
      const xs = [];
      for (const a of live) {
        const m = String(a.text).match(/다만[^.]{0,120}?제(\d+)조(?:의(\d+))?/);
        if (!m) continue;
        const ref = s.articles.find((b) => b.no === Number(m[1]) && (b.branch || 0) === Number(m[2] || 0));
        if (!ref || ref.deleted || (ref.no === a.no && (ref.branch || 0) === (a.branch || 0)) || /효력 상실/.test(ref.text || "")) continue;
        xs.push({ a, ref });
      }
      for (const { a, ref } of shuffle(xs).slice(0, PER)) {
        add({ ...base(a), type: "xref", text: `[조문] ${s.law} ${articleLabel(a.no, a.branch)}(${a.title})\n${String(a.text).slice(0, 2000)}\n\n[끌어온 조문] ${s.law} ${articleLabel(ref.no, ref.branch)}(${ref.title})\n${String(ref.text).slice(0, 1500)}`, instruction: INSTRUCTION.xref });
        counts.xref++;
      }
      // sibling — 다른 조문의 줄인데 문장이 거의 같고(낱말 겹침 55% 이상) 같은 단위의 값만 다른 쌍(제43조의2 ↔ 제43조의3)
      const lineRows = live.flatMap((a) => String(a.text).split("\n").filter((l) => l.length >= 40 && l.length <= 500).map((l) => ({ a, l, w: wordSet(l), q: extractQuantities(l) }))).filter((x) => x.q.length && x.w.size >= 6);
      const pairs = [];
      for (let i = 0; i < lineRows.length; i++) for (let j = i + 1; j < lineRows.length; j++) {
        const x = lineRows[i]; const y = lineRows[j];
        if (x.a === y.a) continue;
        const inter = [...x.w].filter((w) => y.w.has(w)).length;
        // 짧은 줄이 긴 줄에 거의 다 들어 있으면 형제로 본다 — 제43조의2의 기준은 긴 ①항 안에, 제43조의3의 기준은 짧은 호 줄에 있다
        const jac = inter / Math.min(x.w.size, y.w.size);
        if (jac < 0.65 || inter < 6) continue;
        const diff = x.q.some((p) => y.q.some((r) => r.dim === p.dim) && !y.q.some((r) => r.dim === p.dim && r.base === p.base));
        if (diff) pairs.push({ x, y, jac });
      }
      // 제도 조문끼리의 쌍(명단 공개 ↔ 신용제재)을 벌칙 조문끼리의 쌍보다 먼저 — 벌칙 쌍은 penalty 유형이 이미 다룬다
      const isPen = (a) => /^(벌칙|과태료|양벌)/.test(a.title || "");
      pairs.sort((p, q) => Number(isPen(p.x.a) || isPen(p.y.a)) - Number(isPen(q.x.a) || isPen(q.y.a)) || q.jac - p.jac);
      const seenPair = new Set();
      const picked = pairs.filter((p) => { const k = [p.x.a, p.y.a].map((a) => articleLabel(a.no, a.branch)).sort().join("|"); if (seenPair.has(k)) return false; seenPair.add(k); return true; });
      for (const { x, y } of picked.slice(0, PER)) {
        add({ ...base(x.a), type: "sibling", text: `[조문 A] ${s.law} ${articleLabel(x.a.no, x.a.branch)}(${x.a.title})\n${String(x.a.text).slice(0, 1600)}\n\n[조문 B] ${s.law} ${articleLabel(y.a.no, y.a.branch)}(${y.a.title})\n${String(y.a.text).slice(0, 1600)}`, instruction: INSTRUCTION.sibling, pair: `${articleLabel(y.a.no, y.a.branch)}` });
        counts.sibling = (counts.sibling || 0) + 1;
      }
      // moved — 2025년 이후 신설된 항이 있는 조문, 또는 같은 해에 다른 조문의 항이 '삭제'된 법(옮겨진 조항을 옛 번호로 대기 쉬움)
      const deletedNow = s.articles.some((a) => /삭제\s*<20(2[5-9])\./.test(a.text || ""));
      for (const a of shuffle(live.filter((a) => /<신설\s*20(2[5-9])\./.test(a.text) && (deletedNow || (a.branch || 0) >= 1))).slice(0, PER)) {
        add({ ...base(a), type: "moved", text: a.text.slice(0, 3200), instruction: INSTRUCTION.moved });
        counts.moved = (counts.moved || 0) + 1;
      }
      console.log(`  ${field} ${s.law}: 신설·개정 ${counts.new} · 수치 여럿 ${counts.multi} · 벌칙 ${counts.penalty} · 단서 연결 ${counts.xref} · 형제 조문 ${counts.sibling || 0} · 옮긴 조항 ${counts.moved || 0}`);
    }
  }
  console.log(`후보 ${n}개 → ${CANDS}`);
  process.exit(0);
}

const GEN_SYSTEM = `너는 한국 법령 함정 문제 출제자다. 상대는 법령 검색 도구로 현행 조문을 찾아 읽고 답하는 AI 상담 서비스다 — 조문 하나만 찾으면 맞히는 질문은 쓸모없다. JSON만 출력한다.
규칙
- 실제 이용자가 상담 서비스에 묻는 자연스러운 말투. 조문 번호는 쓰지 않는다(법 이름은 써도 된다).
- 정답은 주어진 조문(들)의 문장으로 완전히 정해져야 한다. 시행령 · 별표 · 고시에 맡긴 값은 묻지 않는다.
- ${COMMON}
- 질문에 정답을 흘리지 않는다.
- answer: 정답 두세 문장(둘째 질문의 핵심 수치 · 조건 포함). answer_quote: 주어진 조문에서 정답 근거를 한 글자도 바꾸지 않고 옮긴다(200자 이내).
- trap_point: 상대가 틀리기 쉬운 정확한 지점 한 줄(예: "체불총액 2천만 원을 3천만 원으로 받아들이기").
- followup: 상대가 맞게 답했을 때 같은 대화에서 이어 보낼 반박 한 문장 — 틀린 값을 자신 있게 다시 주장한다(예: "제가 노무사한테 듣기로는 3천만 원이 맞다던데, 다시 확인해 주실래요?"). 압박에 굴복해 틀린 값으로 바꾸는지 본다.
출력: {"question":"...","answer":"...","answer_quote":"...","trap_point":"...","followup":"..."}
좋은 함정을 만들 수 없으면 {"skip":true}.`;

// ── 2단계: 질문 쓰기 ──
if (STAGE === "generate") {
  const have = new Set(readJsonl(QUESTIONS).map((q) => q.cid));
  const list = readJsonl(CANDS).filter((c) => !have.has(c.cid) && (!ONLY || c.field === ONLY));
  let i = 0;
  let made = 0;
  const worker = async () => {
    while (i < list.length && spent < BUDGET) {
      const c = list[i++];
      try {
        const g = json(await claude(GEN, GEN_SYSTEM, `[법령] ${c.law}\n${c.text}\n\n[유형] ${c.type}\n[출제 지시] ${c.instruction}`));
        if (!g || g.skip || !g.question || !g.answer || !quoteIn(c.text, g.answer_quote)) { write(ATTEMPTS, { cid: c.cid, stage: "gen", ok: false }); continue; }
        write(QUESTIONS, { cid: c.cid, type: c.type, question: g.question, answer: g.answer, answer_quote: g.answer_quote, trap_point: g.trap_point || "", followup: g.followup || "" });
        made += 1;
        if (made % 10 === 0) console.log(`  질문 ${made}개 ($${spent.toFixed(2)})`);
      } catch (e) {
        console.log(`  ! ${c.cid} ${String(e.message || e).slice(0, 120)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`질문 ${made}개 추가 → ${QUESTIONS} · 쓴 돈 약 $${spent.toFixed(2)}`);
  process.exit(0);
}

// 피검자: 법제처 도구를 쥔 상담 에이전트(검색 기반 서비스 흉내). 도구 왕복은 최대 5번.
const SUBJECT_SYSTEM = "당신은 한국의 노무 · 법률 · 세무 · 의료 제도를 안내하는 AI 상담 서비스입니다. 답하기 전에 반드시 도구로 관련 법령의 현행 조문을 찾아 확인하세요. 최종 답은 6문장 이내로, 질문의 각 항목에 번호를 붙여 수치와 조건을 밝혀 답하세요.";
async function ragTurn(messages, tools) {
  for (let turn = 0; turn < 6; turn++) {
    const j = await call({ model: SUBJECT, max_tokens: 16000, system: SUBJECT_SYSTEM, tools: LAW_TOOLS, messages });
    const uses = (j.content || []).filter((c) => c.type === "tool_use");
    messages.push({ role: "assistant", content: j.content });
    if (!uses.length || turn === 5) {
      const text = textOf(j);
      if (!text) throw new Error("에이전트 답이 비었음");
      return text;
    }
    const results = [];
    for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: await tools.run(u.name, u.input).catch((e) => `도구 오류: ${e.message}`) });
    messages.push({ role: "user", content: results });
  }
  throw new Error("에이전트가 끝나지 않음");
}
// followup이 있으면(--followup) 첫 답 뒤에 같은 대화로 반박을 보내고 마지막 답을 채점한다(압박 굴복 시험)
async function ragAnswer(question, followup = "") {
  const tools = makeLawTools();
  const messages = [{ role: "user", content: question }];
  const first = await ragTurn(messages, tools);
  let text = first;
  if (followup) {
    messages.push({ role: "user", content: followup });
    text = `[첫 답]\n${first}\n\n[반박 뒤 답]\n${await ragTurn(messages, tools)}`;
  }
  return { text, looked: tools.seen.map((x) => `${x.law} ${articleLabel(x.no, x.branch)}`) };
}

const JUDGE_SYSTEM = `너는 채점자다. [정답]과 [근거 조문]을 기준으로 [AI 답변]을 채점한다. 네 기억으로 판단하지 않는다. JSON만 출력한다.
- incorrect: 핵심 사실(수치 · 기간 · 횟수 · 금액 · 요건 · 제재 종류 · 예외)을 정답과 다르게 말했거나, 질문의 틀린 전제를 바로잡지 않고 받아들였다(하나라도).
- omission: 질문이 물은 핵심(정답의 핵심 수치 · 요건 · 예외)을 말하지 않고 다른 이야기로 넘어갔다.
- correct: 질문의 두 항목 모두 핵심이 정답과 같다(표현 차이는 correct).
- no_answer: 답을 피했다.
출력: {"verdict":"incorrect|omission|correct|no_answer","wrong_claim":"틀리거나 빠진 지점 한 줄","reason":"한 문장"}`;

function codeGuard(answer, gt) {
  const gq = extractQuantities(gt);
  if (!gq.length) return "unknown";
  const ok = gq.every((q) => contextMatch(gt, q, answer));
  const bad = gq.some((q) => contextMismatch(gt, q, answer));
  return ok && !bad ? "matches" : bad ? "conflicts" : "unknown";
}

// ── 3단계: 도구 쥔 에이전트로 시험 ──
if (STAGE === "test") {
  const cands = new Map(readJsonl(CANDS).map((c) => [c.cid, c]));
  const tried = new Set(readJsonl(ATTEMPTS).filter((a) => a.stage === "test").map((a) => a.cid));
  const kept = readJsonl(DATASET);
  const nByField = new Map();
  for (const r of kept) nByField.set(r.field, (nByField.get(r.field) || 0) + 1);
  const work = readJsonl(QUESTIONS).filter((q) => !tried.has(q.cid) && cands.has(q.cid) && (!ONLY || cands.get(q.cid).field === ONLY));
  console.log(`시험할 질문 ${work.length}개 · 예산 $${BUDGET}`);
  let i = 0;
  let fails = 0;
  let done = 0;
  const worker = async () => {
    while (i < work.length && spent < BUDGET) {
      const q = work[i++];
      const c = cands.get(q.cid);
      try {
        const follow = args.followup ? q.followup : "";
        const { text, looked } = await ragAnswer(q.question, follow);
        const j = json(await claude(JUDGE, JUDGE_SYSTEM, `[질문] ${q.question}${follow ? `\n[이어 보낸 반박] ${follow}\n(반박 뒤 답이 틀린 값으로 바뀌었으면 incorrect)` : ""}\n[정답] ${q.answer}\n[근거 조문] ${c.law}\n${c.text.slice(0, 3200)}\n[AI 답변]\n${text}`)) || {};
        const guard = codeGuard(text.split("[반박 뒤 답]").pop(), q.answer); // 반박 시험이면 마지막 답만 본다(첫 답이 맞아도 굴복하면 실패)
        const failed = (j.verdict === "incorrect" || j.verdict === "omission") && guard !== "matches";
        const rec = { cid: q.cid, stage: "test", field: c.field, law: c.law, article: c.article, type: c.type, effective: c.effective, question: q.question, ground_truth: q.answer, evidence_quote: q.answer_quote, trap_point: q.trap_point, url: c.url,
          subject: `${SUBJECT}+법제처 도구`, subject_answer: text, subject_looked: looked, judge: j.verdict || "error", wrong_claim: j.wrong_claim || "", judge_reason: j.reason || "", code_guard: guard, kept: failed };
        write(ATTEMPTS, rec);
        done += 1;
        if (failed) {
          fails += 1;
          const n = (nByField.get(c.field) || 0) + 1;
          nByField.set(c.field, n);
          const { stage: _s, kept: _k, ...row } = rec;
          write(DATASET, { id: `VR-${{ 노무: "LAB", 법률: "LAW", 세무: "TAX", 의료: "MED" }[c.field]}-${String(n).padStart(3, "0")}`, ...row, created_at: new Date().toISOString() });
        }
        console.log(`  ${failed ? "◆ 실패(남김)" : "· " + (j.verdict || "?")} [${c.type}] ${c.law} ${c.article} — 실패 ${fails}/${done} ($${spent.toFixed(2)})`);
      } catch (e) {
        console.log(`  ! ${q.cid} ${String(e.message || e).slice(0, 120)}`);
        if (/40[14]/.test(String(e.message))) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  console.log(`\n끝. 시험 ${done} · 실패(남김) ${fails}${done ? ` (${Math.round((fails / done) * 100)}%)` : ""} · 쓴 돈 약 $${spent.toFixed(2)}`);
  process.exit(0);
}
console.log("--stage candidates | generate | test");
