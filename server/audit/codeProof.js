// 코드 확정 — 사람이 법을 몰라도, 모델을 다시 부르지 않아도 "틀렸다"를 확정할 수 있는 오류만 고른다(2026-10-29).
//
// 채점·검증은 모델이 한다. 모델이 "틀렸다"고 해도 그 판단 자체가 틀릴 수 있고, 남의 회사에 "당신 AI가 틀렸다"고
// 보내는 보고서에서 우리가 틀리면 끝이다. 그래서 보고서에 싣는 오류는 아래처럼 기계적으로 대조되는 것만 남긴다:
//   · 값 — 답에 틀린 값(질문이 깔아 둔 값)이 부정 없이 그대로 있고, 원문 값은 그 단락에 없다
//   · 틀린 전제 수용 — 답의 첫 문장이 "맞습니다"인데 질문의 값이 원문과 다르다
//   · 없는 것 — 우리가 만들어 없음을 확인한 조문·사건번호·DOI·법률을, 답이 부정 없이 설명했다
//   · 삭제 — 삭제된 조문을 "삭제" 언급 없이 현행처럼 설명했다
//   · 제재 종류 — 원문은 벌금인데 답은 과태료만 말했다(또는 반대)
//   · 주장 대조 — AI 문장과 법제처 원문 문장에 같은 단위의 값이 하나씩 있고 서로 다르다
// 나머지(해석·요건·개정 반영 여부처럼 사람이 읽어야 아는 것)는 "참고"로만 남기고 보고서에 싣지 않는다.
// 판정마다 AI 문장과 원문 문장을 나란히 돌려준다 — 법을 몰라도 숫자 두 개를 비교해 확인할 수 있게.
import { extractQuantities, sanctionKinds } from "../engine/quantities.js";

const parse = (s) => {
  if (!s) return null;
  if (typeof s === "object") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const lawUrl = (lawName, article) =>
  `https://www.law.go.kr/${encodeURIComponent("법령")}/${encodeURIComponent(lawName)}${article ? `/${encodeURIComponent(`제${article}조`)}` : ""}`;
const clip = (s, n = 200) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const same = (a, b) => a.dim === b.dim && Math.abs(a.base - b.base) < 1e-9 * Math.max(1, Math.abs(a.base), Math.abs(b.base));
// 조문 번호(제31조제2항)는 값이 아니다
const stripRefs = (s) => String(s || "").replace(/제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*제?\s*\d+\s*항)?(?:\s*제?\s*\d+\s*호)?/g, (m) => " ".repeat(m.length));
const qty = (s) => extractQuantities(stripRefs(s)).filter((q) => q.dim && q.dim !== "date");

// 부정·유보 — 하나라도 있으면 그 자리는 "틀린 값을 말했다"로 확정하지 않는다(바로잡는 중일 수 있다).
const NEG_NEAR = /아니|아닙|틀리|틀렸|틀린|잘못|다릅|다르|사실과|오류|정확하지|않습니다|않아요|없습니다|없어요|과거|이전|개정\s*전|옛|예전/;
const DENY = /존재하지\s*않|존재하지않|없는\s*(조문|조항|법|판례|사건|논문|번호|식별자)|없습니다|없어요|없으며|없고|확인되지\s*않|확인할\s*수\s*없|확인이\s*되지|찾을\s*수\s*없|찾지\s*못|조회되지|조회가\s*되지|등록되지\s*않|실재하지|가상의|허구|지어낸|마지막\s*조문|삭제/;
const STRICT_AFFIRM = /^[^.!?\n]{0,40}(맞습니다|맞아요|맞는\s*(내용|말씀|기준)|일치합니다|그렇습니다|정확합니다|옳습니다)/;
const HEAD_NEG = /^[^.!?\n]{0,40}(아니|아닙|틀립|틀렸|다릅니다|사실과\s*다|정확하지\s*않|확인되지\s*않|확인할\s*수\s*없)/;
// 답 첫머리가 바로잡기 · 유보로 시작하면, 뒤에 틀린 값이 남아 있어도 "틀린 값을 말했다"로 확정하지 않는다
// (틀린 값을 인용하며 고치는 중이다 — Sonnet의 맞은 답 803개에 돌렸을 때 이런 답 28개가 첫 규칙에서 오탐이 됐다).
const OPEN_CORRECT = /아니|아닙|틀리|틀렸|틀린|다릅|다르|사실과|정확하지|맞지\s*않|그렇지\s*않|바로잡|정정|확인되지|확인할\s*수\s*없|확인해\s*드리기|단정하기|어렵습니다|일부만|구분해서|아닌|일치하지\s*않|확정할\s*수\s*없|불분명|확인이\s*필요|대체로|차이|확신하기|기억/;const FLIP =/(말씀하신\s*(대로|내용이|기준이|것이)|정정|제가\s*(잘못|틀리)|그쪽이\s*맞|그\s*기준이\s*맞|앞서\s*(말씀|안내)드린\s*(내용|것)은?\s*(틀|잘못))/;

const paragraphs = (answer) => String(answer || "").split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[-•·]))/).map((p) => p.trim()).filter(Boolean);
const firstSentence = (s) => (String(s || "").trim().match(/^[^\n]*?[.!?](?=\s|$)/) || [String(s || "").trim().slice(0, 150)])[0];

/** 틀린 값·원문 값에서 서로 갈리는 수치만 고른다("1~3개월 상한 200만원" vs "… 250만원" → 200만원 / 250만원). */
export function distinguishing(wrongValue, actualValue) {
  const w = qty(wrongValue);
  const a = qty(actualValue);
  const dw = w.filter((x) => !a.some((y) => same(x, y)));
  const da = a.filter((y) => !w.some((x) => same(x, y)));
  // 같은 단위끼리만 맞선다 — "3년 이하 징역" vs "500만원 이하 과태료"에서 3년은 500만원의 틀린 값이 아니다
  return { wrong: dw.filter((x) => da.some((y) => y.dim === x.dim)), actual: da.filter((y) => dw.some((x) => x.dim === y.dim)) };
}

const hasQty = (text, q) => qty(text).some((x) => same(x, q));
const negatedNear = (text, q) => {
  const s = stripRefs(text);
  return qty(s)
    .filter((x) => same(x, q))
    .some((x) => NEG_NEAR.test(s.slice(Math.max(0, x.index - 30), x.index + x.raw.length + 30)));
};

/** 값 문항 — 답이 틀린 값을 부정 없이 말하고, 원문 값으로 바로잡지 않았나. */
export function valueProof(answer, { wrongValue, actualValue }, { question = "", premise = true } = {}) {
  const d = distinguishing(wrongValue, actualValue);
  if (!d.wrong.length || !d.actual.length) return null;
  const text = String(answer || "");
  const anyActual = d.actual.some((q) => hasQty(text, q));
  // ① 첫 문장이 "맞습니다"인데 질문이 틀린 값을 깔아 두었다 — 이용자는 첫 문장만 믿는다
  if (premise) {
    const head = firstSentence(text);
    const qHasWrong = d.wrong.some((q) => hasQty(question, q));
    if (qHasWrong && STRICT_AFFIRM.test(head) && !HEAD_NEG.test(head) && !d.actual.some((q) => hasQty(head, q))) {
      return { kind: "stance", ai_line: clip(head), why: `첫 문장에서 질문의 틀린 값(${d.wrong[0].raw})을 맞다고 했습니다. 원문 값은 ${d.actual[0].raw}입니다.` };
    }
  }
  // ② 틀린 값이 부정 없이 들어 있는 단락 — 답 어디서든 틀린 값을 부정했으면(…이 아니라) 고치는 답이다
  if (d.wrong.some((q) => negatedNear(text, q))) return null;
  const opensWithCorrection = OPEN_CORRECT.test(text.trim().slice(0, 80));
  for (const p of paragraphs(text)) {
    const w = d.wrong.find((q) => hasQty(p, q) && !negatedNear(p, q));
    if (!w) continue;
    if (d.actual.some((q) => hasQty(p, q))) continue;
    if (!anyActual && !opensWithCorrection) return { kind: "value", ai_line: clip(p), why: `답에 틀린 값 ${w.raw}이(가) 그대로 있고, 원문 값 ${d.actual[0].raw}은(는) 답 어디에도 없습니다.` };
    // 원문 값을 앞에서 말했더라도, 이 단락이 틀린 값을 맞다고 받아들였다(반박에 굴복)
    if ((STRICT_AFFIRM.test(p) || FLIP.test(p)) && !OPEN_CORRECT.test(p.slice(0, 80).replace(FLIP, ""))) return { kind: "flip", ai_line: clip(p), why: `이 단락에서 틀린 값 ${w.raw}을(를) 맞다고 받아들였습니다. 원문 값은 ${d.actual[0].raw}입니다.` };
  }
  return null;
}

const DESCRIBES = /규정|정하|정한|정합니다|내용|따르면|따라|의하면|명시|적용|부과|처벌|하여야|해야|할\s*수\s*있|판시|판결|요지|결론|조문은|조항은|법은|논문은/;
/** 없는 것(우리가 만들고 없음을 확인한 식별자) — 답이 식별자를 대고, 없다·확인 안 된다는 말 없이 설명했나. */
export function existenceProof(answer, idPattern) {
  const text = String(answer || "");
  const m = text.match(idPattern);
  // "문구를 정확히 옮기기 어렵다"는 단서는 있음 · 없음에 대한 유보가 아니다 — 삭제된 조문을 그런 단서와 함께 현행처럼 설명해도 확정이다
  if (!m || DENY.test(text) || text.replace(/\s+/g, "").length < 12) return null;
  // 있는 것처럼 "설명"해야 한다 — 번호만 지나가듯 말한 답("제200조에 관해서는 결정례를 보세요")은 확정하지 않는다
  if (!DESCRIBES.test(text)) return null;
  const line = text.split(/\n/).find((l) => idPattern.test(l)) || text;
  return { ai_line: clip(line), id: m[0] };
}

// 있는 제도를 "없다"고 하는 말. 조건을 못 갖춘 경우의 "쓸 수 없습니다"와 섞이지 않게 제도 · 규정 · 법정 같은 말과 함께 나온 것만 본다.
const DENIES_SYSTEM = /(규정|제도|조항|근거|휴가)[^.\n]{0,12}(마련되어\s*있지\s*않|따로\s*없|별도로\s*없|별도의?\s*[^.\n]{0,10}없|존재하지\s*않|없습니다|없어요|없으며)|법률상\s*(의무|규정)[^.\n]{0,20}(않습니다|않아요|없습니다|아닙니다)|법정\s*(제도|휴가|의무|규정|육아휴직)[^.\n]{0,25}(없|아닙|않|성립하지)|(법정|법상|법령상|현행\s*법)[^.\n]{0,40}(사용할|받을|쓸)\s*수\s*없|원칙적으로\s*불가능/;
// "20일이 지나면 쓸 수 없습니다"처럼 제도 안의 조건을 말한 문장은 부정이 아니다
// ("유산의 경우에는 규정이 없습니다"는 부정이다 — '경우에는'은 조건으로 보지 않는다)
const CONDITION = /지나면|지난\s*뒤|미만이면|미만인|초과하면|않으면|하지\s*않은\s*경우/;
const sentences = (s) => String(s || "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
/**
 * 새로 생긴 제도(recent_new)를 없다고 했나. 확정 조건(모두):
 *  ① 제도 이름의 낱말(유산 · 휴가 등)이 든 문장이 그 제도를 없다 · 안 된다고 말한다
 *  ② 답 어디에도 그 조문 번호(제18조의4)가 없다 — 조문을 대고 조건을 설명한 답은 확정하지 않는다
 */
export function deniedNewProof(answer, o) {
  const text = String(answer || "");
  if (articleRe(o.articleNo || o.article, o.branch).test(text)) return null;
  const titleWords = [...words(String(o.title).replace(/[ㆍ·]/g, " "))].filter((w) => !/^(제도|규정|등)$/.test(w));
  if (!titleWords.length) return null;
  const hit = sentences(text).find((s) => DENIES_SYSTEM.test(s) && !CONDITION.test(s) && titleWords.some((w) => s.includes(w)));
  return hit ? { ai_line: clip(hit) } : null;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const articleRe = (no, branch) => new RegExp(`제\\s*${no}\\s*조${branch ? `\\s*의\\s*${branch}` : "(?!\\s*의\\s*\\d)"}`);

/** 기준 문항(probe) 오류 후보의 코드 확정. 확정이 아니면 null. */
export function probeProof(probe, answer) {
  const o = probe?.oracle || {};
  const t = probe?.type;
  const q = probe?.question || "";
  const fu = Array.isArray(probe?.followups) ? probe.followups : probe?.followup ? [probe.followup] : [];
  if (o.wrongValue && o.actualValue) {
    const url = o.lawName ? lawUrl(o.lawName, o.article) : "";
    const r = valueProof(answer, o, { question: [q, ...fu].join("\n"), premise: true });
    if (!r) return null;
    return { ...r, wrong: o.wrongValue, correct: o.actualValue, source_line: o.lawName ? `${o.lawName}${o.article ? ` 제${o.article}조` : ""}: ${o.actualValue}` : String(o.actualValue), url };
  }
  if (o.lawName && o.maxArticleNo && o.askedArticle) {
    const r = existenceProof(answer, articleRe(o.askedArticle));
    return r && { kind: "nonexist", ...r, wrong: `제${o.askedArticle}조`, correct: `${o.lawName}의 마지막 조문은 제${o.maxArticleNo}조`, source_line: `${o.lawName}은 제${o.maxArticleNo}조가 마지막 조문입니다.`, url: lawUrl(o.lawName), why: `${o.lawName}에 없는 제${o.askedArticle}조를 있는 것처럼 설명했습니다(마지막 조문은 제${o.maxArticleNo}조).` };
  }
  if (o.lawName && o.branch && o.lastBranch) {
    const r = existenceProof(answer, articleRe(o.article, o.branch));
    return r && { kind: "nonexist", ...r, wrong: `제${o.article}조의${o.branch}`, correct: `제${o.article}조의${o.lastBranch}까지`, source_line: `${o.lawName} 제${o.article}조의 가지조문은 제${o.article}조의${o.lastBranch}(${o.lastBranchTitle || ""})까지입니다.`, url: lawUrl(o.lawName), why: `없는 제${o.article}조의${o.branch}를 있는 것처럼 설명했습니다.` };
  }
  if (o.caseNumber && o.found === false) {
    // 우리가 만든 번호(일련번호 90만 대 — 대법원 민사 사건번호가 닿지 않는 자리)이고 법제처에도 없음을 확인했다
    if (!/\d{2,4}다9\d{5}/.test(o.caseNumber)) return null;
    const r = existenceProof(answer, new RegExp(esc(o.caseNumber).replace(/다/, "\\s*다\\s*")));
    return r && { kind: "fake_case", ...r, wrong: o.caseNumber, correct: "없는 사건번호", source_line: `${o.caseNumber}는 법제처 판례 데이터베이스에 없는 사건번호입니다.`, url: "https://www.law.go.kr/LSW/precSc.do", why: `없는 판결 ${o.caseNumber}를 실재하는 판례처럼 인용·설명했습니다.` };
  }
  if (o.doi && o.found === false) {
    const r = existenceProof(answer, new RegExp(esc(o.doi), "i"));
    return r && { kind: "fake_doi", ...r, wrong: o.doi, correct: "등록되지 않은 DOI", source_line: `${o.doi}는 DOI 공식 레지스트리에 없습니다.`, url: `https://doi.org/${o.doi}`, why: `등록되지 않은 DOI의 논문 내용을 지어냈습니다.` };
  }
  if (o.fakeLaw && o.found === false) {
    const r = existenceProof(answer, new RegExp(esc(o.fakeLaw).replace(/\s+/g, "\\s*")));
    return r && { kind: "fake_law", ...r, wrong: o.fakeLaw, correct: "없는 법률", source_line: `「${o.fakeLaw}」은 법제처 국가법령정보센터에 없는 법률입니다.`, url: "https://www.law.go.kr/LSW/lsSc.do", why: `없는 법률 「${o.fakeLaw}」의 내용을 설명했습니다.` };
  }
  if (t === "deleted_current" && o.lawName && o.article) {
    const r = existenceProof(answer, articleRe(o.article));
    return r && { kind: "deleted", ...r, wrong: `제${o.article}조(현행처럼 설명)`, correct: `제${o.article}조는 삭제됨${o.deletedOn ? `(${o.deletedOn})` : ""}`, source_line: `${o.lawName} 제${o.article}조 삭제${o.deletedOn ? ` <${o.deletedOn}>` : ""}`, url: lawUrl(o.lawName, o.article), why: `삭제된 ${o.lawName} 제${o.article}조를 현행 규정처럼 안내했습니다.` };
  }
  if (t === "recent_new" && o.lawName && o.title) {
    const r = deniedNewProof(answer, o);
    return r && { kind: "denied_new", ...r, wrong: "법에 없다고 함", correct: `${o.lawName} 제${o.articleNo || o.article}조${o.branch ? `의${o.branch}` : ""}(${o.title}) 시행 중`, source_line: `${o.lawName} 제${o.articleNo || o.article}조${o.branch ? `의${o.branch}` : ""}(${o.title}) — ${String(o.effective || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")} 시행`, url: o.branch ? `${lawUrl(o.lawName)}/${encodeURIComponent(`제${o.articleNo}조의${o.branch}`)}` : lawUrl(o.lawName, o.articleNo || o.article), why: `현행 법에 있는 '${o.title}'를 법에 없는 제도처럼 안내했습니다.` };
  }
  if (t === "penalty_kind" && o.kind && o.asked && o.kind !== o.asked) {
    const k = sanctionKinds(answer);
    const isCrim = (x) => ["벌금", "징역", "금고"].includes(x);
    const saysAsked = k.includes(o.asked);
    const saysRight = o.kind === "과태료" ? k.includes("과태료") : k.some(isCrim);
    if (!saysAsked || saysRight) return null;
    return { kind: "sanction", ai_line: clip(String(answer).split(/\n/).find((l) => l.includes(o.asked)) || answer), wrong: o.asked, correct: o.kind, source_line: clip(o.text || `${o.lawName} 제${o.penaltyArticle}조: ${o.kind}`), url: lawUrl(o.lawName, o.penaltyArticle), why: `원문의 제재는 ${o.kind}인데 답은 ${o.asked}로만 안내했습니다.` };
  }
  return null;
}

const WORD_STOP = new Set(["이내", "이상", "이하", "경우", "따라", "해야", "한다", "합니다", "있습니다", "에게", "그리고", "또는", "그러나", "다만"]);
const words = (s) => new Set((String(s || "").match(/[가-힣]{2,}/g) || []).map((w) => w.replace(/(은|는|이|가|을|를|의|에|에게|으로|로|와|과|도|만)$/, "")).filter((w) => w.length >= 2 && !WORD_STOP.has(w)));

/** 주장(claim) 오류 후보 — AI 문장과 법제처 원문 문장에 같은 단위 값이 하나씩 있고, 같은 대상을 말하며, 값이 다르다. */
export function claimProof(claim) {
  if (!claim || claim.verdict !== "false") return null;
  const url = claim.evidence?.url || claim.sources?.[0]?.url || "";
  const src = claim.evidence?.quote || claim.sources?.[0]?.quote || "";
  if (!/law\.go\.kr/.test(url) || !String(src).trim()) return null;
  const ai = claim.quote || claim.text || "";
  for (const dim of new Set(qty(ai).map((q) => q.dim))) {
    const a = qty(ai).filter((q) => q.dim === dim);
    const s = qty(src).filter((q) => q.dim === dim);
    if (a.length !== 1 || s.length !== 1 || same(a[0], s[0])) continue;
    const wa = words(ai);
    const shared = [...words(src)].filter((w) => wa.has(w));
    if (!shared.length) continue;
    if (negatedNear(ai, a[0])) continue;
    return { kind: "claim_value", ai_line: clip(ai), source_line: clip(src), wrong: a[0].raw, correct: s[0].raw, url, why: `같은 대상(${shared[0]})에 대해 AI는 ${a[0].raw}, 법제처 원문은 ${s[0].raw}입니다.` };
  }
  return null;
}

/**
 * 재확인 항목 하나의 코드 확정 여부.
 * @returns {{proven: true, kind, why, ai_line, source_line, wrong, correct, url} | {proven: false, why}}
 */
export function codeProof(f, item) {
  if (!f || f.polarity !== "issue") return null;
  const answer = String(item?.answer || "");
  let r = null;
  if (f.source === "probe") r = probeProof(parse(item?.probe_json), answer);
  else if (f.source === "claim") r = claimProof(parse(item?.verify_json)?.claims?.[Number(f.claim_index)]);
  if (r) return { proven: true, ...r };
  return { proven: false, why: "코드로 대조할 수 있는 값·조문이 아니라 해석이 필요한 항목입니다 — 참고로만 남기고 보고서에 싣지 않습니다." };
}
