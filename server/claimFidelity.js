// 주장이 원문의 조건을 잃지 않았는지 — "누구에게"·숫자가 빠진 주장은 다른 주장이다.
//
// 추출 단계는 원문을 주장 문장으로 옮겨 적는다. 그때 조건 하나가 빠지면 검증은 원문이 아니라
// 고쳐 쓴 문장을 확인하게 된다. 실제로 "근로계약서를 쓰지 않으면 **근로자에게** 500만원 이하의
// 벌금"이 "근로계약서를 쓰지 않으면 500만원 이하의 벌금"으로 옮겨져, 틀린 말(벌금은 사업주에게
// 부과된다)이 '확인됨'으로 나갔다. 프롬프트 규칙("조건을 그대로 옮겨라")만으로는 막지 못했다.
//
// 그래서 기계적으로 대조한다. 원문 부분(quote)에 있는 대상 표현("○○에게")과 숫자가 주장 문장에
// 없으면 그 주장만 골라, 빠진 조건을 되살린 문장으로 고쳐 쓰게 한다. 빠진 게 없으면 모델을
// 부르지 않는다(대부분의 검증이 여기에 해당한다).
//
// 판정이 이미 난 주장(웹 검증은 추출과 같은 호출에서 판정한다)은 고치지 않는다 — 그 판정은
// 그 문장을 두고 내린 것이다. 법률 대조 대기·확인되지 않음처럼 아직 판정 전인 주장만 고친다.

// "근로자에게", "사업주에게서", "고객한테", "대표께"
const TARGET = /([가-힣A-Za-z0-9]{1,12})(?:에게서|에게|한테서|한테|께서|께)(?![가-힣])/g;
// 단정의 세기를 바꾸는 말. "아스피린은 암을 **확실히** 예방하므로 **모든** 성인은 매일 복용해야"가
// "아스피린은 암을 예방하는 효과가 있다"로 옮겨지면, 틀린 말이 맞는 말로 바뀐 채 검증된다.
const ABSOLUTE = ["확실히", "반드시", "무조건", "절대", "전혀", "항상", "언제나", "모든", "모두", "100%", "완전히", "유일한", "유일하게", "최초", "세계 최초", "가장"];
// 숫자는 쉼표·소수점을 떼고 본다(10,030 = 10030).
const NUMBER = /\d[\d,.]*\d|\d/g;

const normNum = (n) => n.replace(/,/g, "").replace(/\.$/, "");
const squash = (s) => String(s || "").replace(/\s+/g, "");

// 주장 문장이 원문 부분에서 잃어버린 조건들. 없으면 빈 배열.
export function droppedConditions(claim) {
  const quote = String(claim?.quote || "");
  const text = String(claim?.text || "");
  if (!quote || !text) return [];
  const t = squash(text);
  const lost = [];
  for (const m of quote.matchAll(TARGET)) {
    if (!t.includes(m[1])) lost.push(m[0]);
  }
  for (const w of ABSOLUTE) {
    if (quote.includes(w) && !text.includes(w)) lost.push(w);
  }
  const have = new Set((text.match(NUMBER) || []).map(normNum));
  for (const n of quote.match(NUMBER) || []) {
    if (!have.has(normNum(n))) lost.push(n);
  }
  return [...new Set(lost)];
}

const PENDING = new Set(["pending_legal_check", "uncertain"]);

const FIDELITY_PROMPT = `주장 문장이 원문에 있던 조건을 빠뜨렸습니다. 각 항목마다, 빠진 조건을 되살린 주장 문장을 쓰세요.

- 원문에 적힌 대상("○○에게")·수치·연도·단정하는 말("확실히", "모든", "반드시", "가장")과 권고("~해야 한다")를 **원문 그대로** 넣으세요. 틀려 보여도 고치지 마세요 — 맞는지는 다음 단계가 확인합니다.
- 주장이 다루던 사실 하나만 담으세요. 원문의 다른 사실을 끌어와 합치지 마세요. 빠진 조건이 이 주장과 상관없는 다른 사실의 것이면 그 항목은 빈 문자열로 두세요.
- 100자 이내.

반드시 JSON으로만: {"fixes":[{"n":1,"text":"고친 주장"}]}`;

// claims 배열에서 조건을 잃은 판정 전 주장만 고쳐 돌려준다. 실패하면 그대로 돌려준다.
export async function restoreConditions(claims, { call, ledger = null } = {}) {
  const targets = claims
    .map((c, i) => ({ c, i, lost: PENDING.has(c.verdict) ? droppedConditions(c) : [] }))
    .filter((x) => x.lost.length > 0);
  if (!targets.length || !call) return claims;
  const list = targets
    .map(({ c, lost }, k) => `${k + 1}. 원문: ${c.quote}\n   주장: ${c.text}\n   빠진 조건: ${lost.join(", ")}`)
    .join("\n\n");
  let parsed;
  try {
    parsed = await call({ system: FIDELITY_PROMPT, user: list, maxTokens: 800, ledger, label: "fidelity" });
  } catch {
    return claims;
  }
  const byN = new Map((Array.isArray(parsed?.fixes) ? parsed.fixes : []).map((f) => [Number(f.n), String(f.text || "").trim()]));
  const out = [...claims];
  targets.forEach(({ c, i, lost }, k) => {
    const fixed = byN.get(k + 1);
    if (!fixed || fixed.length > 120) return;
    // 고친 문장이 정말 빠진 조건을 담았을 때만 받는다. 모델이 다른 말로 또 고쳐 쓰면 버린다.
    const stillLost = droppedConditions({ ...c, text: fixed }).filter((x) => lost.includes(x));
    if (stillLost.length >= lost.length) return;
    out[i] = { ...c, text: fixed, restored_from: c.text };
  });
  return out;
}
