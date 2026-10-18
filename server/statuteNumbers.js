// 조문 숫자 대조(2026-10-18) — 법·제도 답의 숫자가 이미 받아 온 현행 조문에 그대로 있으면 '확인됨'으로 본다.
//
// 왜: 월세 세액공제 답("총급여 8,000만 원 이하 · 5,500만 원 이하 17% · 한도 1,000만 원")이 맞았는데도,
// 조문 검토(statuteReview)는 '틀린 곳'만 찾고 맞은 곳을 확인됨으로 남기지 않아 일상 사실 확인(웹, 10초 한도)에서
// '확인 안 됨'이 되고, 답이 "1,000만 원 안팎으로 알려져 있어요"처럼 흐려졌다. 조문은 이미 손에 있으니 숫자만 맞춰 보면 된다(0원 · 1ms).
//
// 조문은 "8천만원" · "5천500만원" · "100분의 17" · "1천만원", 답은 "8,000만 원" · "5,500만 원" · "17%" · "1,000만 원"으로 쓴다.
// 둘 다 같은 꼴(₩80000000 · %17 · 85m2 · 7일 …)로 바꿔 모은다. 숫자가 하나도 없는 문장은 이 방법으로 판단하지 않는다.

const UNIT = { "㎡": "m2", "m²": "m2", "m2": "m2", "제곱미터": "m2", 일: "일", 개월: "개월", 년: "년", 세: "세", 시간: "시간", 주: "주", 회: "회", 명: "명", 배: "배" };

/** 천 · 백 자리 한글 숫자를 아라비아 숫자로("5천500만원" → "5500만원", "8천만원" → "8000만원"). */
function normalize(s) {
  return String(s || "")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .replace(/(\d+)\s*천\s*(\d{1,3})?(?=\s*(?:만|억|원))/g, (_, a, b) => String(Number(a) * 1000 + Number(b || 0)))
    .replace(/(\d+)\s*백\s*(\d{1,2})?(?=\s*(?:만|억|원))/g, (_, a, b) => String(Number(a) * 100 + Number(b || 0)));
}

/** 글 속 숫자를 단위와 함께 모은다. */
export function numbersIn(text) {
  const t = normalize(text);
  const out = new Set();
  for (const m of t.matchAll(/100분의\s*(\d+(?:\.\d+)?)/g)) out.add(`%${Number(m[1])}`);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로(?!그))/g)) out.add(`%${Number(m[1])}`);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*억(?:\s*(\d+)\s*만)?/g)) out.add(`₩${Math.round(Number(m[1]) * 1e8 + Number(m[2] || 0) * 1e4)}`);
  for (const m of t.matchAll(/(?<!억\s*)(?<![\d.])(\d+(?:\.\d+)?)\s*만(?!\s*\d)/g)) out.add(`₩${Math.round(Number(m[1]) * 1e4)}`);
  for (const m of t.matchAll(/(?<![\d.])(\d+)\s*원/g)) out.add(`₩${Number(m[1])}`);
  for (const m of t.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(㎡|m²|m2|제곱미터|개월|시간|일|년|세|주|회|명|배)/g)) out.add(`${Number(m[1])}${UNIT[m[2]]}`);
  return out;
}

/**
 * '확인 안 됨'으로 남은 문장 중 숫자가 모두 조문에 있는 것을 골라낸다.
 * @returns {{ keep: object[], confirmed: {item: object, article: object}[] }}
 */
export function confirmByStatute(hedged, articles, fixedQuotes = new Set()) {
  const per = (articles || []).map((a) => ({ a, nums: numbersIn(`${a.text || a.block || ""}`) }));
  const lawNums = new Set(per.flatMap((p) => [...p.nums]));
  const keep = [];
  const confirmed = [];
  for (const h of hedged || []) {
    const nums = [...numbersIn(h.quote || h.claim)];
    if (!nums.length || fixedQuotes.has(h.quote) || !nums.every((n) => lawNums.has(n))) {
      keep.push(h);
      continue;
    }
    // 숫자를 가장 많이 담은 조문을 근거로 단다
    const best = per.map((p) => ({ ...p, hit: nums.filter((n) => p.nums.has(n)).length })).sort((x, y) => y.hit - x.hit)[0];
    confirmed.push({ item: h, article: best?.a || null });
  }
  return { keep, confirmed };
}
