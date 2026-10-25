// 법령 전문 대조 — 글 전체를, 관련 현행 조문 전체와 한 자리에서 읽는다.
//
// 왜 따로 두나 (2026-10-16 로무앤톡 벤치):
//   베리라인의 주장 단위 판정은 글을 주장으로 쪼갠 뒤 하나씩 따로 본다. 그래서
//   ① 쪼개는 단계가 놓친 말("그건 법정 제도라기보다 회사 자율 제도일 수 있다" 같은 흐린 문장)은 아예 대조되지 않았고,
//   ② 같은 글 뒤쪽에서 예외를 설명했는데 앞 문장만 떼어 "틀렸다"고 했다.
//   "법제처에서 조문을 가져와 글 전체와 함께 강한 모델에게 묻는" 단순한 방식이 이 둘을 모두 이겼다.
//   그래서 베리라인도 글 전체를 읽는 단계를 두되, 단순한 방식보다 두 가지를 더 한다.
//     - 더 넓게 찾는다: 인용·약칭·모델 추정에 더해, 그 법령의 **전체 조문**에서 글의 말과 겹치는 조문,
//       벌칙·과태료 조문, 삭제·효력 상실 표시, 위임된 시행령까지 가져온다(모델이 조문 번호를 몰라도 찾는다).
//     - 더 엄하게 거른다: 지적마다 글의 문장과 조문 문장을 **한 글자도 바꾸지 않은 인용**으로 묶고(코드가 확인),
//       처음 판정을 모르는 두 번째 검토자가 "글이 맞을 수 있는 이유"를 먼저 찾게 한 뒤에만 틀렸다고 낸다.
//   주장 단위 판정이 낸 '사실과 다름'(법률)도 같은 두 번째 검토를 거친다 — 맞는 답을 틀렸다고 하는 것이
//   베리라인이 낼 수 있는 가장 해로운 오류이기 때문이다.
import { callClaudeJson, todayLine } from "./claude.js";
import { searchStatute, getStatuteArticlesAll } from "./lawApi.js";
import { LAW_ALIASES, normalizeLawName, resolveLawAlias } from "./nec/identifiers.js";
import { withLinkedProvisions, delegationsIn } from "./legalLinks.js";
import { numericAudit, signalsBlock } from "./engine/quantities.js";
import { traceAmendment } from "./engine/amendmentTrace.js";

const MAX_LAWS = 4;
const MAX_ANSWER_CHARS = 6000;
const MAX_CONTEXT_CHARS = 16000;
const ARTICLE_CLIP = 1800;
const LEXICAL_PER_LAW = 4;

// 글에 법령 이야기가 있는지(주장 추출이 '법률'로 분류하지 못해도) — 이게 없으면 이 단계는 돌지 않는다.
// 2026-10-26 비교 시험: "남녀고용평등법상 명단 공표", "국세기본법상 … (제81조의7)", "푸른씨앗 퇴직연금"이 이 낱말 목록에 안 걸려
// 법령 대조가 아예 돌지 않았다(놓친 9건 중 3건). 낱말 목록보다 모양으로 잡는다 — 법 이름 + 상/에 따라/제N조, 이름 꼬리가 법인 법령명, 조문 번호만 있어도.
export const LAW_HINT = /(법|법률|시행령|시행규칙)\s*제?\s*\d+\s*조|\(\s*제\s*\d+\s*조|제\s*\d+\s*조(?:의\s*\d+)?\s*(?:제\s*\d+\s*항|에\s*따라|에\s*따르면|에\s*의하면|위반)|[가-힣]{2,}(?:법|법률)(?:상|에\s*(?:따라|따르면|의하면|서)|\s*제\s*\d|\s*시행령|\s*시행규칙|\s*위반)|[가-힣]{1,}\s?(?:기본|특별|보호|관리|보장|진흥|촉진|처벌|규제|평등|안전|위생|복지|징수|특례|보험)법|「[^」]{2,40}」|퇴직연금|세무조사|법인세|지방소득세|중간예납|분할납부|손금|익금|과세표준|납부기한|신고기한|세무서장|기부금|명단\s*공(?:표|개)|반의사불벌|공소|이행강제금|영업정지|허가\s*취소|과태료|벌금|징역|퇴직금|연차|해고|육아휴직|출산휴가|구직급여|최저임금|근로계약|임금체불|산재|고용보험|청약철회|임대차|보증금|세액공제|소득공제|연말정산|종합소득세|양도소득세|양도세|취득세|재산세|종합부동산세|종부세|상속세|증여세|부가가치세|공제율|세율|월세액|근로장려금|자녀장려금|실업급여|주휴수당|기초연금|국민연금|건강보험료|가산세|원천징수|간이과세|면세사업자|의료법|약사법|의료기관|진료기록|처방전|비급여|본인부담|요양급여|의약품|응급의료|감염병|의료인|면허\s*취소|자격정지/;

const squash = (s) => String(s || "").replace(/[\s"'“”‘’「」『』《》〈〉()[\]·ㆍ,.:;…~\-—–]/g, "");

/** 지적에 붙은 인용이 원문 안에 정말 있는지(띄어쓰기·따옴표·문장부호 차이는 무시). */
export function quoteIn(haystack, quote, min = 6) {
  const q = squash(quote);
  if (q.length < min) return false;
  return squash(haystack).includes(q);
}

const articleLabel = (a) => `제${a.no}조${a.branch ? `의${a.branch}` : ""}`;
export const articleUrl = (law, a) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}/${encodeURIComponent(articleLabel(a))}`;

// ── 1. 어떤 법령인가 ─────────────────────────────────────────────
const CITE = /「([^」]{2,60})」\s*(?:제\s*(\d+)\s*조(?:\s*의\s*(\d+))?)?|([가-힣ㆍ·]{2,30}?(?:법률|법|시행령|시행규칙))\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
const NOT_A_LAW = new Set(["이법", "동법", "같은법", "해당법", "관련법", "노동법", "개별법", "특별법", "일반법", "현행법", "개정법", "위법", "불법", "방법", "입법", "사법"]);

/** 글에 이름이 그대로 적힌 법령·조문. */
export function citedInText(text) {
  const out = [];
  for (const m of String(text || "").matchAll(CITE)) {
    const law = (m[1] || m[4] || "").trim();
    const no = Number(m[2] || m[5]) || null;
    const branch = Number(m[3] || m[6]) || null;
    if (!law || NOT_A_LAW.has(normalizeLawName(law))) continue;
    out.push({ law, no, branch });
  }
  // 조문 번호 없이 약칭만 쓴 경우("남녀고용평등법에 따르면")
  const flat = normalizeLawName(text);
  for (const alias of Object.keys(LAW_ALIASES)) if (flat.includes(alias)) out.push({ law: alias, no: null, branch: null });
  return out;
}

const PICK_SYSTEM = `너는 한국 법령 검토자다. 주어진 글이 근거로 삼는(또는 삼아야 하는) 한국 법령과 조문을 고른다. JSON만 출력한다.`;

async function pickArticles(answer, ledger) {
  // 조문 고르기는 후보를 넓게 뽑는 일이라(낱말 겹침 순위가 뒤를 받친다) 깊이 생각하지 않게 한다 —
  // 기본 깊이로는 이것만 10초가 걸려 법령 질문 답이 늦었다(2026-10-17 측정). 판정(대조 · 반론)은 그대로 깊게.
  const r = await callClaudeJson({
    strong: true,
    effort: "low",
    maxTokens: 700,
    ledger,
    label: "statute_pick",
    system: PICK_SYSTEM,
    user: `${todayLine()}아래 글의 법률적 내용을 확인하려면 어떤 현행 법령의 어떤 조문을 봐야 하는가? 글이 조문을 적지 않았어도 내용상 해당하는 조문을 추정해 넣어라. 처벌·과태료 이야기가 있으면 벌칙·과태료 조문도 넣어라. 법령은 정식 명칭으로, 최대 4개 법령·8개 조문.
출력: {"articles":[{"law":"법령 정식 명칭","article":"제N조 또는 제N조의M"}]}

글:
${answer}`,
  });
  return (r?.articles || [])
    .map((a) => {
      const m = String(a.article || "").match(/(\d+)\s*조(?:\s*의\s*(\d+))?/);
      return { law: String(a.law || "").trim(), no: m ? Number(m[1]) : null, branch: m && m[2] ? Number(m[2]) : null };
    })
    .filter((a) => a.law);
}

// ── 2. 어떤 조문인가 ─────────────────────────────────────────────
const STOP = new Set(
  "있습니다 합니다 됩니다 경우 따라 대한 관련 내용 규정 조문 법률 법령 사항 해당 다음 이상 이하 이내 또는 그리고 하는 있는 없는 같은 위한 통해 위해 수 있 등 및 그 이 저 것 때 중 후 전 각 매 더 정확한 답변 문의 안내 확인 필요 기준 정도 경우에는 경우에 대해 대하여 관하여 따른 따라서 그러나 하지만 다만 또한 현재 현행 개정 시행".split(" "),
);
const UNIT = /\d+(?:\.\d+)?\s*(?:일|주|개월|년|회|원|만원|만\s*원|시간|퍼센트|%|분의\s*\d+|세|배)/g;

export function lexicalTerms(text) {
  const words = (String(text).match(/[가-힣]{2,}/g) || []).map((w) => w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|이나|나|께|에게|한테|하고|이라|라|이며|며)$/, "")).filter((w) => w.length >= 2 && !STOP.has(w));
  const units = (String(text).match(UNIT) || []).map((u) => u.replace(/\s+/g, ""));
  return { words: [...new Set(words)], units: [...new Set(units)] };
}

/** 법령 조문 목록에서 글과 겹치는 조문을 점수로 고른다(조문 번호를 몰라도 찾게). */
export function rankArticles(articles, terms) {
  const df = new Map();
  for (const w of terms.words) df.set(w, articles.filter((a) => a.text.includes(w) || a.title.includes(w)).length);
  return articles
    .filter((a) => !a.deleted)
    .map((a) => {
      let score = 0;
      for (const w of terms.words) {
        const d = df.get(w) || 0;
        if (!d) continue;
        const idf = 1 / Math.log(2 + d);
        if (a.title.includes(w)) score += 3 * idf;
        if (a.text.includes(w)) score += idf;
      }
      const flat = a.text.replace(/\s+/g, "");
      for (const u of terms.units) if (flat.includes(u)) score += 0.6;
      return { a, score };
    })
    .filter((x) => x.score > 0.8)
    .sort((x, y) => y.score - x.score);
}

const PENALTY_TALK = /(벌금|과태료|징역|처벌|벌칙|형사처벌|제재|과징금)/;
const PENALTY_TITLE = /(벌칙|과태료|양벌)/;

function articleBlock(id, law, a, extra = "") {
  const marks = [a.deleted ? "[삭제된 조문]" : "", a.expired ? "[효력 상실]" : ""].filter(Boolean).join(" ");
  const eff = /^\d{8}$/.test(a.effectiveDate || "") ? ` (시행 ${a.effectiveDate.slice(0, 4)}.${a.effectiveDate.slice(4, 6)}.${a.effectiveDate.slice(6)})` : "";
  const body = a.text.length > ARTICLE_CLIP ? a.text.slice(0, ARTICLE_CLIP) + "…" : a.text;
  return `[${id}] ${law} ${articleLabel(a)}${a.title ? `(${a.title})` : ""}${eff} ${marks}\n${body}${extra ? `\n${extra}` : ""}`.trim();
}

/** 글과 관련된 현행 조문을 모은다. { laws, articles:[{id, law, no, branch, title, text, url, block}] } */
/** 두 번 모은 조문을 합친다(같은 법령·조문은 하나로, 번호는 A1부터 다시). */
export function mergeGathered(a, b) {
  const seen = new Set();
  const articles = [];
  for (const x of [...(a?.articles || []), ...(b?.articles || [])]) {
    const k = `${normalizeLawName(x.law)}-${x.no}-${x.branch || 0}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const id = `A${articles.length + 1}`;
    articles.push({ ...x, id, block: x.block.replace(/^\[A\d+\]/, `[${id}]`) });
  }
  const laws = [...new Map([...(a?.laws || []), ...(b?.laws || [])].map((l) => [normalizeLawName(l.name), l])).values()];
  const missing = [...new Map([...(a?.missing || []), ...(b?.missing || [])].map((m) => [`${normalizeLawName(m.law)}-${m.no}-${m.branch || 0}`, m])).values()];
  return { laws, articles, missing };
}

export async function gatherArticles(answer, claims = [], { ledger = null, pick = pickArticles } = {}) {
  const wanted = [];
  for (const c of claims) {
    const r = c?.legal_ref;
    if (c?.domain === "법률" && r?.type === "statute" && r.law_name) {
      const m = String(r.article || "").match(/(\d+)\s*조(?:\s*의\s*(\d+))?/);
      wanted.push({ law: r.law_name, no: m ? Number(m[1]) : null, branch: m && m[2] ? Number(m[2]) : null, from: "claim" });
    }
  }
  wanted.push(...citedInText(answer).map((x) => ({ ...x, from: "text" })));
  try {
    wanted.push(...(await pick(answer, ledger)).map((x) => ({ ...x, from: "pick" })));
  } catch {
    /* 추정은 덤 — 실패해도 글에 적힌 인용으로 간다 */
  }

  // 법령별로 묶는다(약칭은 정식 명칭으로). 글에 적힌 법령이 먼저다.
  const order = { text: 0, claim: 1, pick: 2 };
  wanted.sort((a, b) => order[a.from] - order[b.from]);
  const byLaw = new Map();
  for (const w of wanted) {
    const name = resolveLawAlias(w.law) || w.law;
    const key = normalizeLawName(name);
    if (!byLaw.has(key)) byLaw.set(key, { name, refs: [] });
    if (w.no) byLaw.get(key).refs.push({ no: w.no, branch: w.branch, from: w.from });
  }
  // 글에 적힌 조문 번호가 그 법령에 아예 없으면(마지막 조문보다 크거나, 없는 가지조문) 따로 모은다 — 2026-10-26 비교 시험에서
  // "마약류 관리에 관한 법률 제70조(과태료)"를 지어낸 답을 그냥 넘겼다(본칙 마지막은 제69조). 조문이 없으니 대조할 본문도 없어 검토자가 볼 수 없었다.
  const missing = [];

  const terms = lexicalTerms(answer);
  const penaltyTalk = PENALTY_TALK.test(answer);
  const laws = [];
  const picked = [];
  const entries = [...byLaw.values()].slice(0, MAX_LAWS + 2);
  // 법령마다 찾기 · 조문 받기를 동시에 한다(차례로 받으면 법령 4개에 4초 — 2026-10-17 측정). 고르는 순서는 그대로.
  const fetched = await Promise.all(entries.map(async ({ name }) => {
    const s = await searchStatute(name).catch(() => null);
    if (!s?.ok || !s.found || s.versionStatus !== "current") return null;
    const all = await getStatuteArticlesAll(s.mst).catch(() => null);
    return all?.ok && all.articles?.length ? { s, all } : null;
  }));
  for (const [k, { refs }] of entries.entries()) {
    if (laws.length >= MAX_LAWS) break;
    if (!fetched[k]) continue;
    const { s, all } = fetched[k];
    const law = s.lawNameOfficial;
    laws.push({ name: law, url: s.detailUrl });
    const take = new Map();
    const keyOf = (a) => `${a.no}-${a.branch || 0}`;
    // ① 인용·추정된 조문(삭제된 것도 그대로 — 삭제 사실이 판정 근거다)
    const lastNo = all.articles.reduce((m, x) => (x.branch ? m : Math.max(m, x.no)), 0);
    for (const r of refs) {
      const a = all.articles.find((x) => x.no === r.no && (x.branch || 0) === (r.branch || 0));
      if (a) take.set(keyOf(a), { a, why: "cited" });
      else if (r.from === "text" && lastNo && (r.no > lastNo || (r.branch && all.articles.some((x) => x.no === r.no)))) {
        const last = all.articles.find((x) => x.no === lastNo && !x.branch);
        if (!missing.some((m) => m.law === law && m.no === r.no && (m.branch || 0) === (r.branch || 0))) missing.push({ law, no: r.no, branch: r.branch || null, lastNo, lastTitle: last?.title || "", url: s.detailUrl });
      }
    }
    // ② 벌칙·과태료 — 처벌 이야기가 있으면, 인용된 조문을 위반 대상으로 적은 벌칙 조문
    if (penaltyTalk) {
      const nos = refs.map((r) => r.no).filter(Boolean);
      const pen = all.articles.filter((a) => PENALTY_TITLE.test(a.title) && !a.deleted);
      const hit = pen.filter((a) => nos.some((n) => new RegExp(`제\\s*${n}\\s*조(?!의)`).test(a.text)));
      for (const a of (hit.length ? hit : pen).slice(0, 3)) take.set(keyOf(a), { a, why: "penalty" });
    }
    // ③ 글과 말이 겹치는 조문 — 모델이 조문 번호를 몰라도 찾는다
    for (const { a } of rankArticles(all.articles, terms).slice(0, LEXICAL_PER_LAW)) if (!take.has(keyOf(a))) take.set(keyOf(a), { a, why: "lexical" });
    for (const { a, why } of take.values()) picked.push({ law, lawUrl: s.detailUrl, a, why });
  }

  // 위임(시행령)은 인용된 조문 중 맡긴 데가 있는 것만, 최대 2개.
  const rank = { cited: 0, penalty: 1, lexical: 2 };
  picked.sort((x, y) => rank[x.why] - rank[y.why]);
  let delegated = 0;
  const articles = [];
  let used = 0;
  for (const p of picked) {
    let extra = "";
    if (p.why === "cited" && delegated < 2 && delegationsIn(p.a.text).length) {
      delegated++;
      const linked = await withLinkedProvisions({ lawName: p.law, article: { no: p.a.no, branch: p.a.branch || null }, text: p.a.text, claimText: answer.slice(0, 600) }).catch(() => null);
      if (linked?.links?.length) extra = linked.links.map((l) => `${l.heading}\n${l.text}`).join("\n");
    }
    const id = `A${articles.length + 1}`;
    const block = articleBlock(id, p.law, p.a, extra);
    if (used + block.length > MAX_CONTEXT_CHARS && articles.length) break;
    used += block.length;
    articles.push({ id, law: p.law, no: p.a.no, branch: p.a.branch || null, title: p.a.title, text: `${p.a.text}\n${extra}`, deleted: !!p.a.deleted, url: articleUrl(p.law, p.a), why: p.why, block });
  }
  return { laws, articles, missing };
}

// ── 3. 글 전체 대조 ─────────────────────────────────────────────
const REVIEW_SYSTEM = `너는 한국 법령 대조 검토자다. 아래 [현행 조문]만을 근거로, [글]에서 현행 법령과 어긋나는 말을 찾는다. 네 기억이나 일반 상식으로 판단하지 않는다. JSON만 출력한다.

원칙
- 글 전체를 읽고 판단한다. 같은 글의 다른 곳에서 조건·예외·정정을 밝혔으면 그 문장은 틀린 것이 아니다.
- [현행 조문]으로 틀렸음을 보일 수 있는 것만 적는다. 관련 조문이 주어지지 않았으면 적지 않는다.
- 단정하지 않은 문장도 법적 사실을 말하면 대상이다: "법정 제도가 아니라 회사 자율 제도일 수 있다", "처벌 규정은 없다", "개정된 사실은 없다".
- 수치·기간·횟수·요건·대상·처벌 종류(벌금/과태료)·시행 여부·조문 번호를 본다. [삭제된 조문]·[효력 상실]을 현행처럼 말하면 틀린 것이다.
- 조문 문언을 그대로 옮긴 말(예: "1년 이내")은, 글이 "최대·오직·만"처럼 더 넓은 법정 기준을 부정하지 않는 한 틀린 것이 아니다. 빠뜨린 것(완전하지 않음)만으로는 적지 않는다.
- 횟수·기간 셈처럼 해석이 갈릴 수 있으면("3회 나누어 사용" = 최대 4번에 걸쳐 사용) 글의 해석이 합리적이면 적지 않는다.
- 내용은 맞는데 조문 번호만 틀리면 kind를 wrong_citation으로 적는다.
- 회사가 법보다 유리하게 정하는 자체 제도는 그 자체로 위법이 아니다. 다만 법정 제도를 없다고 하거나 법정 기준을 다르게 말하면 틀린 것이다.
- 상담 권유·면책 문구·예시 문장은 대상이 아니다.
- [질문]이 주어지면 질문자의 전제("2회 연속 맞죠?", "과태료죠?")를 [현행 조문]과 비교한다. 전제가 조문과 다른데 글이 "네, 맞습니다"처럼 그 전제를 확인해 주거나 전제의 틀린 값을 그대로 받아 쓰면, 그 문장을 issues에 넣는다(answer_quote는 글의 문장 그대로).

법령 문언 읽기 관례
- "N회에 한정하여 나누어 사용할 수 있다"는 N번 나눌 수 있다는 뜻이라 최대 N+1번에 걸쳐 쓴다(예: 육아휴직 3회 분할 = 총 4번 사용, 2024년 정부 발표 "분할 4번까지"). 글이 "총 N+1회"라고 해도 틀린 것이 아니다.
- "이내·이상·이하"는 기준값을 포함하고, "초과·미만"은 포함하지 않는다.
- "~할 수 있다"는 권리·재량이고 "~하여야 한다"는 의무다. 둘을 바꿔 말한 것만 틀린 것이다.

출력 형식
{"issues":[{"answer_quote":"글에서 문제 되는 부분을 한 글자도 바꾸지 않고(150자 이내)","problem":"무엇이 틀렸고 현행 규정은 무엇인지(120자 이내)","kind":"contradiction|outdated|deleted_or_nonexistent|denies_existing|wrong_penalty|wrong_citation","article":"A번호","article_quote":"그 조문에서 근거 문장을 한 글자도 바꾸지 않고(200자 이내)","confidence":"high|medium|low"}]}
틀린 곳이 없으면 {"issues":[]}.`;

export async function reviewStatutes(text, claims = [], { ledger = null, onProgress = () => {}, pick = pickArticles, gathered = null, effort = null, question = "" } = {}) {
  const answer = String(text || "").slice(0, MAX_ANSWER_CHARS);
  // 베리라인 AI처럼 질문 단계에서 이미 조문을 모았으면 그대로 쓴다(같은 조문을 두 번 받지 않는다).
  if (!gathered) onProgress("관련 현행 법령 조문을 모으는 중…");
  const { laws, articles } = gathered || (await gatherArticles(answer, claims, { ledger, pick }));
  if (!articles.length) return { ran: false, laws, articles, issues: [] };
  onProgress(`현행 조문 ${articles.length}개와 글 전체를 대조하는 중…`);
  // 베리라인 엔진: 모델에게 묻기 전에 코드가 수치 · 제재를 단위까지 맞춰 본다(server/engine/quantities.js).
  const signals = numericAudit(answer, articles);
  const hint = signalsBlock(signals);
  const r = await callClaudeJson({
    strong: true,
    effort,
    maxTokens: 2500,
    ledger,
    label: "statute_review",
    system: REVIEW_SYSTEM,
    user: `${todayLine()}[현행 조문]\n${articles.map((a) => a.block).join("\n\n")}\n\n${questionBlock(question)}[글]\n${answer}${hint ? `\n\n${hint}` : ""}`,
  });
  const issues = lockIssues(r?.issues || [], answer, articles);
  return { ran: true, laws, articles, issues, signals };
}

/** 인용을 코드로 확인한다 — 글의 문장과 조문 문장이 둘 다 실제로 있어야 지적이 남는다. */
export function lockIssues(raw, answer, articles) {
  const out = [];
  for (const it of raw) {
    if (!it || it.confidence === "low") continue;
    if (!quoteIn(answer, it.answer_quote)) continue;
    const art = articles.find((a) => a.id === String(it.article || "").trim()) || articles.find((a) => quoteIn(a.text, it.article_quote, 8));
    if (!art || !quoteIn(art.text, it.article_quote, 8)) continue;
    if (out.some((o) => squash(o.answer_quote) === squash(it.answer_quote))) continue;
    out.push({ ...it, article: art.id, law: art.law, articleLabel: articleLabel(art), url: art.url });
  }
  return out;
}

// ── 4. 두 번째 검토 — 글 편에 서서 반론부터 ───────────────────────────
const DEFENSE_SYSTEM = `너는 두 번째 검토자다. 첫 검토자가 [글]에서 현행 법령과 어긋난다고 지목한 곳들을 받는다. 너의 일은 먼저 글 편에 서서, 글이 맞을 수 있는 이유를 [현행 조문]과 글 전체에서 찾는 것이다. 그래도 틀렸을 때만 error로 낸다. 네 기억이 아니라 [현행 조문]만 근거로 한다. JSON만 출력한다.

반론으로 볼 것
- 같은 글의 다른 곳에서 조건·예외·연장·정정을 밝혔는가?
- 첫 검토자가 글을 잘못 읽었는가(글은 다른 대상·다른 시점·회사 자체 제도 이야기를 했는가)?
- 주어진 다른 조문(시행령·예외·특례·부칙)이 글을 뒷받침하는가?
- 셈·해석이 갈리는 문제인데 글의 해석이 합리적인가?
- 조문 문언을 그대로 옮긴 말인데 "불완전하다"는 이유로 지목됐는가?

법령 문언 읽기 관례
- "N회에 한정하여 나누어 사용할 수 있다"는 N번 나눌 수 있다는 뜻이라 최대 N+1번에 걸쳐 쓴다(예: 육아휴직 3회 분할 = 총 4번 사용, 2024년 정부 발표 "분할 4번까지"). 글이 "총 N+1회"라고 해도 틀린 것이 아니다.
- "이내·이상·이하"는 기준값을 포함하고, "초과·미만"은 포함하지 않는다.
- "~할 수 있다"는 권리·재량이고 "~하여야 한다"는 의무다. 둘을 바꿔 말한 것만 틀린 것이다.

결정
- error: 반론을 다 해 봐도, 글을 읽은 사람이 현행 법령을 잘못 알게 된다. 그 근거가 되는 조문 문장을 그대로 인용한다.
- ok: 주어진 조문이 글의 말을 뒷받침한다. 뒷받침하는 조문 문장을 그대로 인용한다.
- unclear: 주어진 조문만으로는 어느 쪽도 확정할 수 없다.

출력: {"decisions":[{"id":"후보 번호","decision":"error|ok|unclear","reason":"한두 문장(120자 이내). error면 현행 규정을 적는다","article":"A번호","article_quote":"조문 문장 그대로(200자 이내)"}]}`;

// 2026-10-26 비교 시험: 질문자가 틀린 전제를 깔고 물었는데 답이 "네, 맞습니다"로 받아 주면, 답만 보는 검토자는 틀린 곳을 찾지 못했다.
// 질문을 함께 보여 주되 판정 대상은 여전히 글이다(질문 문장은 issues에 넣지 않는다).
const questionBlock = (q) => (String(q || "").trim() ? `[질문(판정 대상 아님 — 질문자의 전제를 조문과 비교하는 데만 쓴다)]\n${String(q).slice(0, 2000)}\n\n` : "");

export async function defend(text, articles, candidates, { ledger = null, effort = null, question = "" } = {}) {
  if (!candidates.length) return [];
  const answer = String(text || "").slice(0, MAX_ANSWER_CHARS);
  const list = candidates.map((c) => `- [${c.id}] 글: "${c.answer_quote}"\n  지목 사유: ${c.problem}`).join("\n");
  const r = await callClaudeJson({
    strong: true,
    effort,
    maxTokens: 2500,
    ledger,
    label: "statute_defense",
    system: DEFENSE_SYSTEM,
    user: `${todayLine()}[현행 조문]\n${articles.map((a) => a.block).join("\n\n")}\n\n${questionBlock(question)}[글]\n${answer}\n\n[지목된 곳]\n${list}`,
  });
  const byId = new Map((r?.decisions || []).map((d) => [String(d.id).replace(/[[\]]/g, "").trim(), d]));
  return candidates.map((c) => {
    const d = byId.get(c.id) || { decision: "unclear", reason: "" };
    const art = articles.find((a) => a.id === String(d.article || "").trim()) || articles.find((a) => quoteIn(a.text, d.article_quote, 8));
    const locked = !!art && quoteIn(art.text, d.article_quote, 8);
    // 인용을 대지 못한 ok는 근거 없는 변호다 — unclear로 낮춘다. error는 첫 검토의 잠긴 인용이 있으면 그대로 둔다.
    let decision = d.decision;
    if (decision === "ok" && !locked) decision = "unclear";
    if (decision === "error" && !locked && !c.locked) decision = "unclear";
    return { ...c, decision, reason: String(d.reason || "").trim(), proof: locked ? { law: art.law, label: articleLabel(art), url: art.url, quote: String(d.article_quote).trim() } : c.proof || null };
  });
}

// ── 5. 주장 목록에 합친다 ───────────────────────────────────────
const overlaps = (a, b) => {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  const probe = (s) => s.slice(0, Math.min(24, s.length));
  return x.includes(probe(y)) || y.includes(probe(x));
};

// 부존재 판정(지어낸 판례·법령)은 "대상이 있나"를 공식 DB 탐색으로 정한 것이라 여기서 다시 보지 않는다.
const reviewable = (c) => c.verdict === "false" && c.domain === "법률" && c.verified_via !== "nec" && !c.from_reference;

export async function applyStatuteReview(text, claims, review, { ledger = null, onProgress = () => {}, defendFn = defend, traceFn = traceAmendment } = {}) {
  if (!review?.ran) return claims;
  const out = claims.map((c) => ({ ...c }));
  const cands = [];
  out.forEach((c, i) => {
    if (reviewable(c)) cands.push({ id: `C${i}`, source: "claim", index: i, answer_quote: c.quote || c.text, problem: c.explanation || "사실과 다름으로 판정됨", locked: false });
  });
  for (const it of review.issues) {
    const idx = out.findIndex((c) => overlaps(c.quote || c.text, it.answer_quote));
    // 주장 판정이 이미 같은 곳을 틀렸다고 했으면 후보 하나로 합친다(근거는 법령 대조 쪽 인용으로).
    const existing = cands.find((c) => c.source === "claim" && c.index === idx);
    const proof = { law: it.law, label: it.articleLabel, url: it.url, quote: it.article_quote };
    if (existing) Object.assign(existing, { problem: it.problem, locked: true, proof, kind: it.kind });
    else cands.push({ id: `R${cands.length}`, source: "review", index: idx, answer_quote: it.answer_quote, problem: it.problem, kind: it.kind, locked: true, proof });
  }
  if (!cands.length) return out;
  onProgress(`지목한 ${cands.length}곳을 다른 검토자가 반론부터 다시 보는 중…`);
  const decided = await defendFn(text, review.articles, cands, { ledger });

  // 베리라인 엔진: 확정된 오류마다 ① 코드 수치 대조 결과를 붙이고 ② 옛 법 그대로인지 개정 이력을 거슬러 본다.
  const traces = new Map();
  await Promise.all(decided.filter((d) => d.decision === "error" && d.proof).slice(0, 3).map(async (d) => {
    const art = (review.articles || []).find((a) => a.law === d.proof.law && articleLabel(a) === d.proof.label);
    if (!art?.no) return;
    const t = await traceFn({ law: art.law, no: art.no, branch: art.branch, claimText: d.answer_quote, currentText: art.text }).catch(() => null);
    if (t) traces.set(d.id, t);
  }));
  const codeCheckOf = (d) => (review.signals || []).find((s) => overlaps(s.sentence, d.answer_quote));

  const added = [];
  for (const d of decided) {
    const proofLine = d.proof ? ` 근거: ${d.proof.law} ${d.proof.label} “${d.proof.quote.slice(0, 160)}”` : "";
    const sources = d.proof ? [{ title: `${d.proof.law} ${d.proof.label}`, url: d.proof.url, quote: d.proof.quote }] : [];
    if (d.decision === "error") {
      const trace = traces.get(d.id) || null;
      const check = codeCheckOf(d);
      const explanation = `${d.reason || d.problem}${trace ? ` ${trace.note}` : ""}${proofLine}`.trim();
      const engine = { ...(trace ? { amendment: trace, error_kind: "outdated" } : {}), ...(check ? { code_check: { kind: check.kind, claim: check.claim, article_values: check.articleValues } } : {}) };
      if (d.index >= 0) {
        const c = out[d.index];
        out[d.index] = { ...c, verdict: "false", verified_via: "official", explanation, sources: [...sources, ...(c.sources || [])].slice(0, 4), statute_review: "confirmed_error", ...engine };
      } else {
        added.push({ text: d.answer_quote.slice(0, 120), quote: d.answer_quote, domain: "법률", verdict: "false", verified_via: "official", explanation, sources, statute_review: "found", ...engine });
      }
    } else if (d.source === "claim" && d.index >= 0) {
      const c = out[d.index];
      if (d.decision === "ok") {
        out[d.index] = { ...c, verdict: "confirmed", verified_via: "official", explanation: `${d.reason}${proofLine}`.trim(), sources: [...sources, ...(c.sources || [])].slice(0, 4), withdrawn_verdict: "false", statute_review: "cleared" };
      } else {
        out[d.index] = { ...c, verdict: "uncertain", withdrawn_verdict: "false", explanation: `처음에는 사실과 다르다고 봤지만, 글 전체와 현행 조문을 다시 대조하니 단정할 수 없습니다. ${d.reason || ""}`.trim(), statute_review: "unclear" };
      }
    }
  }
  return dedupeFalse([...out, ...added]);
}

// 같은 문장을 두 주장이 겹쳐 '사실과 다름'으로 지목하면(추출이 한 문장을 둘로 나눈 경우) 긴 쪽 하나만 남긴다.
export function dedupeFalse(claims) {
  const keyOf = (c) => squash(c.quote || c.text);
  return claims.filter((c, i) => {
    if (c.verdict !== "false") return true;
    const k = keyOf(c);
    return !claims.some((o, j) => j !== i && o.verdict === "false" && keyOf(o).length > k.length && keyOf(o).includes(k));
  });
}
