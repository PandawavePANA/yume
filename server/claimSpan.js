// 주장이 원문의 어디에 있는지.
//
// 기업이 받는 건 판정 목록이 아니라 "이 문서의 이 문장이 틀렸다"다. 보도자료·상품 설명·
// 상담 스크립트를 고치는 사람은 판정 옆에 위치가 있어야 곧장 그 줄로 간다. API로 붙이는
// 쪽도 같다 — 자기 화면에서 그 부분에 밑줄을 그으려면 글자 위치가 필요하다.
//
// 추출 단계가 원문 그대로의 발췌(quote)를 함께 돌려주고, 위치는 여기서 계산한다.
// 모델에게 글자 위치를 세게 하면 틀린다. 발췌를 원문에서 찾는 건 서버가 정확히 한다.
// 다만 모델이 공백·줄바꿈을 조금 다르게 옮기는 일이 잦아, 공백을 무시하고 맞춘다.

// 공백을 뺀 글자열과, 그 글자 하나하나가 원문 몇 번째 글자였는지.
function compact(s) {
  let out = "";
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    out += ch;
    map.push(i);
  }
  return { out, map };
}

// 따옴표 모양은 모델이 바꿔 옮기는 일이 많아 같은 것으로 본다.
const fold = (s) => s.replace(/[“”„‟"]/g, '"').replace(/[‘’‚‛']/g, "'");

export function locateQuote(text, quote) {
  if (typeof text !== "string" || typeof quote !== "string") return null;
  const q = fold(quote).trim();
  if (q.length < 4) return null;
  const t = fold(text);
  const exact = t.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length };
  const a = compact(t);
  const b = compact(q);
  if (b.out.length < 4) return null;
  const at = a.out.indexOf(b.out);
  if (at < 0) return null;
  return { start: a.map[at], end: a.map[at + b.out.length - 1] + 1 };
}

// 찾은 것만 위치를 단다. 못 찾은 발췌는 버린다 — 원문에 없는 문장을 원문이라고 내보내면 안 된다.
export function attachSpans(text, claims) {
  return claims.map((c) => {
    const { quote, span: _old, ...rest } = c;
    const span = quote ? locateQuote(text, quote) : null;
    return span ? { ...rest, quote: text.slice(span.start, span.end), span } : rest;
  });
}
