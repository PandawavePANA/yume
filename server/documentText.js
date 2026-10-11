// 문서 나누기·고친 문장 반영 — DB를 물지 않는 순수 함수만 모아 둔다(따로 시험할 수 있게).
// 검증 한 건의 입력 상한(verifyPipeline.js의 MAX_INPUT_CHARS와 같은 값). 여기서 그 모듈을
// 불러오면 DB까지 따라 들어와 이 함수들만 따로 시험할 수 없게 된다.
const MAX_INPUT_CHARS_LIMIT = 10_000;

// 조각 하나의 목표 길이. 상한(1만 자)보다 넉넉히 작게 잡아 문단 경계를 찾을 여유를 둔다.
export const CHUNK_TARGET = 7_000;

// 문서를 조각으로 나눈다. 원문 글자 위치(start, end)를 그대로 기억한다 — 합칠 때 쓴다.
// 자르는 자리는 빈 줄 → 줄바꿈 → 문장 끝 → 공백 순으로 찾는다. 문장 중간은 최후의 수단이다.
export function splitDocument(text, target = CHUNK_TARGET, hardMax = MAX_INPUT_CHARS_LIMIT) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= hardMax && text.length - start <= target * 1.4) {
      out.push({ start, end: text.length });
      break;
    }
    const lo = start + Math.floor(target * 0.6);
    const hi = Math.min(start + target, text.length);
    const window = text.slice(lo, hi);
    let cut = -1;
    for (const re of [/\n\s*\n/g, /\n/g, /[.!?。]\s|다\.\s|요\.\s/g, /\s/g]) {
      let last = -1;
      for (const m of window.matchAll(re)) last = m.index + m[0].length;
      if (last > 0) {
        cut = lo + last;
        break;
      }
    }
    if (cut <= start) cut = hi;
    out.push({ start, end: cut });
    start = cut;
  }
  // 공백뿐인 조각은 버린다(검증할 것이 없고 과금만 된다).
  return out.filter((c) => text.slice(c.start, c.end).trim());
}

// 고친 문장을 원문에 반영한다. 위치가 확실한 것만, 겹치지 않게, 뒤에서부터 바꾼다
// (앞에서 바꾸면 뒤쪽 위치가 밀린다).
export function applyFixes(text, claims) {
  const edits = claims
    .filter((c) => c.verdict === "false" && c.suggested_fix && c.span && text.slice(c.span.start, c.span.end) === c.quote)
    .sort((a, b) => a.span.start - b.span.start);
  const kept = [];
  for (const e of edits) if (!kept.length || e.span.start >= kept[kept.length - 1].span.end) kept.push(e);
  let out = text;
  for (const e of kept.reverse()) out = out.slice(0, e.span.start) + e.suggested_fix + out.slice(e.span.end);
  return { text: out, applied: kept.length };
}
