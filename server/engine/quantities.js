// 베리라인 엔진 — 수치 · 제재 대조기(코드가 하는 확인). 2026-10-25.
//
// 왜 필요한가: "법제처 API + 강한 모델"만으로는 모델이 숫자를 '비슷하게' 읽고 넘어간다. 실제 감사에서 AI가 틀린 자리는
// 거의 전부 숫자 · 기간 · 제재 종류였다(2주↔1주, 5년↔3년, 벌금 500만 원↔과태료 100만 원 이하).
// 이 모듈은 모델 없이, 글의 수치와 조문의 수치를 단위까지 맞춰 비교하고 제재 종류(형벌 · 행정질서벌)를 가른다.
// 결과는 판정이 아니라 '반드시 확인해야 할 후보'다 — 대조 모델이 후보마다 조문으로 답하게 하고,
// 확정된 오류에는 코드 확인 결과를 근거로 붙인다(사람이 다시 볼 때 무엇이 어긋났는지 바로 보이게).

// 단위 → [차원, 기준 단위로 바꾸는 배수]
const UNITS = [
  [/^억\s*원$/, "money", 1e8],
  [/^천만\s*원$/, "money", 1e7],
  [/^백만\s*원$/, "money", 1e6],
  [/^만\s*원$/, "money", 1e4],
  [/^원$/, "money", 1],
  [/^(퍼센트|%)$/, "percent", 1],
  [/^개월$/, "month", 1],
  [/^년$/, "month", 12],
  [/^(주일|주)$/, "day", 7],
  [/^일$/, "day", 1],
  [/^시간$/, "hour", 1],
  [/^(회|번)$/, "count", 1],
  [/^세$/, "age", 1],
  [/^배$/, "times", 1],
  [/^(명|인)$/, "people", 1],
];

const QTY = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(억\s*원|천만\s*원|백만\s*원|만\s*원|원|퍼센트|%|개월|주일|주|일|년|시간|회|번|세|배|명|인)(?![가-힣]{0,1}(?:차|째|호|항|조|번지))/g;
const FRACTION = /(\d+)\s*분의\s*(\d+)/g;
// 돈 단위가 '만'으로 끝나고 '원'이 뒤에 떨어져 있는 경우("500만 원")도 QTY가 받는다. "2026년"처럼 연도는 날짜라 뺀다.
const isCalendarYear = (value, unit) => unit === "년" && value >= 1900 && value <= 2100;

/** 글 속 수치를 단위까지 뽑는다: [{raw, value, unit, dim, base, index}] */
export function extractQuantities(text) {
  const s = String(text || "");
  const out = [];
  for (const m of s.matchAll(QTY)) {
    const value = Number(m[1].replace(/,/g, ""));
    const unit = m[2].replace(/\s+/g, " ");
    if (!Number.isFinite(value) || isCalendarYear(value, unit.trim())) continue;
    const def = UNITS.find(([re]) => re.test(unit.trim()));
    if (!def) continue;
    // "1일"이 날짜("10월 1일")인 경우는 뺀다
    if (def[1] === "day" && /월\s*$/.test(s.slice(Math.max(0, m.index - 4), m.index))) continue;
    out.push({ raw: m[0].trim(), value, unit: unit.trim(), dim: def[1], base: value * def[2], index: m.index });
  }
  for (const m of s.matchAll(FRACTION)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 0) out.push({ raw: m[0].trim(), value: b / a, unit: "분의", dim: "ratio", base: b / a, index: m.index });
  }
  return out.sort((x, y) => x.index - y.index);
}

// 제재 종류 — 벌금 · 징역 · 금고는 형벌, 과태료는 행정질서벌, 과징금은 행정제재. 섞어 말하면 틀린 안내다.
const SANCTIONS = [["징역", /징역/], ["금고", /금고(?!\s*형?\s*이상)/], ["벌금", /벌금/], ["과태료", /과태료/], ["과징금", /과징금/]];
export function sanctionKinds(text) {
  const s = String(text || "");
  return SANCTIONS.filter(([, re]) => re.test(s)).map(([k]) => k);
}
const CRIMINAL = new Set(["징역", "금고", "벌금"]);
const classOf = (k) => (CRIMINAL.has(k) ? "형벌" : k === "과태료" ? "행정질서벌" : "행정제재");

const sameBase = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// 수치 바로 뒤의 말(띄어쓰기 · 문장부호 무시) — "3회에 한정하여"의 "에한정하" 같은 꼬리. 같은 꼬리에 다른 수치가 붙어 있으면
// 같은 규정을 다른 값으로 말한 것이다(조문 전체에 같은 수치가 우연히 다른 자리에 있어도 잡는다).
export function tailOf(text, q, len = 6) {
  return String(text || "").slice(q.index + q.raw.length, q.index + q.raw.length + 24).replace(/[^가-힣]/g, "").slice(0, len);
}
const sameTailIn = (claimText, q, articleText) => {
  const tail = tailOf(claimText, q);
  if (tail.length < 3) return [];
  return extractQuantities(articleText).filter((x) => x.dim === q.dim).filter((x) => { const t = tailOf(articleText, x); return t.length >= 3 && (t.startsWith(tail.slice(0, 4)) || tail.startsWith(t.slice(0, 4))); });
};
/** 같은 꼬리 자리에 글과 같은 값이 있는가. */
export function contextMatch(claimText, q, articleText) {
  return sameTailIn(claimText, q, articleText).some((x) => sameBase(x.base, q.base));
}
/** 같은 꼬리 · 같은 단위인데 값이 다른 조문 수치(있으면 그 수치). */
export function contextMismatch(claimText, q, articleText) {
  const tail = tailOf(claimText, q);
  if (tail.length < 3) return null;
  const aq = extractQuantities(articleText).filter((x) => x.dim === q.dim);
  const sameTail = aq.filter((x) => { const t = tailOf(articleText, x); return t.length >= 3 && (t.startsWith(tail.slice(0, 4)) || tail.startsWith(t.slice(0, 4))); });
  if (!sameTail.length || sameTail.some((x) => sameBase(x.base, q.base))) return null;
  return sameTail[0];
}

/** 문장을 나눈다(한국어 종결 · 줄바꿈 · 목록). */
export function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?。])\s+|(?<=다\.|요\.|음\.|함\.)\s*|\n+/)
    .map((x) => x.replace(/^[\s\-*•·\d.)]+/, "").trim())
    .filter((x) => x.length >= 6);
}

const STOP = new Set(["경우", "때문", "정도", "이상", "이하", "이내", "미만", "초과", "그리고", "하지만", "다만", "또는", "있습니다", "합니다", "됩니다", "수", "것", "등", "및", "이", "그", "해당", "관련", "따라", "따른", "대한", "위한"]);
const tokens = (s) => new Set((String(s || "").match(/[가-힣]{2,}/g) || []).map((w) => w.replace(/(은|는|이|가|을|를|에|에서|의|로|으로|와|과|도|만|까지|부터|이나|나|입니다|합니다|됩니다|하면|되면|해야|하여)$/, "")).filter((w) => w.length >= 2 && !STOP.has(w)));

/** 문장에 가장 가까운 조문(공유 낱말 수) — 2개 이상 겹쳐야 짝으로 본다. */
function nearestArticle(sentence, articles) {
  const t = tokens(sentence);
  let best = null;
  for (const a of articles) {
    const at = tokens(`${a.title || ""} ${a.text || ""}`);
    let n = 0;
    for (const w of t) if (at.has(w)) n += 1;
    if (!best || n > best.n) best = { a, n };
  }
  return best && best.n >= 2 ? best.a : null;
}

/**
 * 글과 조문 사이의 수치 · 제재 불일치 후보. 판정이 아니라 대조 모델이 반드시 짚어야 할 자리다.
 * @returns [{kind:"number"|"sanction", sentence, claim, article, articleValues, note}]
 */
export function numericAudit(answer, articles, { max = 6 } = {}) {
  const out = [];
  if (!articles?.length) return out;
  for (const sentence of splitSentences(answer)) {
    if (out.length >= max) break;
    const qs = extractQuantities(sentence);
    const sk = sanctionKinds(sentence);
    if (!qs.length && !sk.length) continue;
    const art = nearestArticle(sentence, articles);
    if (!art) continue;
    const aq = extractQuantities(art.text);
    for (const q of qs) {
      const same = aq.filter((x) => x.dim === q.dim);
      if (!same.length) continue; // 조문에 같은 종류의 수치가 없으면 다른 조문 이야기일 수 있다 — 후보로 올리지 않는다
      const ctx = contextMismatch(sentence, q, art.text);
      if (ctx) {
        out.push({ kind: "number", sentence, claim: q.raw, article: art.id, articleValues: [ctx.raw], note: `글은 "${q.raw}${tailOf(sentence, q, 6)}…"라 했는데 ${art.law} ${art.no ? `제${art.no}조` : ""}는 같은 자리에 ${ctx.raw}를 정한다` });
        if (out.length >= max) break;
        continue;
      }
      if (same.some((x) => sameBase(x.base, q.base))) continue;
      out.push({ kind: "number", sentence, claim: q.raw, article: art.id, articleValues: [...new Set(same.map((x) => x.raw))].slice(0, 5), note: `글의 ${q.raw}와 같은 값이 ${art.law} ${art.no ? `제${art.no}조` : ""}에 없다(조문의 같은 단위 값: ${[...new Set(same.map((x) => x.raw))].slice(0, 5).join(", ")})` });
      if (out.length >= max) break;
    }
    if (sk.length) {
      const ak = sanctionKinds(art.text);
      const claimClasses = new Set(sk.map(classOf));
      const artClasses = new Set(ak.map(classOf));
      if (ak.length && ![...claimClasses].some((c) => artClasses.has(c))) {
        out.push({ kind: "sanction", sentence, claim: sk.join("·"), article: art.id, articleValues: ak, note: `글은 ${sk.join("·")}(${[...claimClasses].join("·")})라 했는데 ${art.law} 조문은 ${ak.join("·")}(${[...artClasses].join("·")})를 정한다` });
      }
    }
  }
  return out;
}

/** 대조 모델에게 줄 후보 목록 문단. 없으면 빈 문자열. */
export function signalsBlock(signals) {
  if (!signals?.length) return "";
  const lines = signals.map((s, i) => `- [N${i + 1}] 글: "${s.sentence.slice(0, 140)}" → ${s.note} (관련 조문 ${s.article})`);
  return `[코드가 찾은 수치 · 제재 불일치 후보]\n아래는 코드가 단위까지 맞춰 비교한 결과다. 후보가 틀렸을 수 있다(다른 조문 이야기일 수 있음). 후보마다 [현행 조문]으로 확인해, 실제로 어긋나면 issues에 넣고 아니면 넣지 않는다.\n${lines.join("\n")}`;
}
