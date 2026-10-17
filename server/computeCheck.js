// 검산 — 답 속에서 코드로 100% 판정할 수 있는 것은 모델에 묻지 않고 코드가 본다(2026-10-17).
//   ① 계산식   "10,320원 × 209시간 = 2,156,880원", "(300만 + 50만) × 12 = 4,200만 원", "2,000,000원 × 9% = 180,000원"
//   ② 요일     "2026년 10월 17일(토)", "2026년 3월 1일은 일요일"
//   ③ 올해     "올해(2025년)" — 오늘이 2026년이면 틀림(모델은 학습 시점의 해를 올해로 착각한다)
// 비용 0원 · 1ms 안팎. 틀린 곳은 fixes 로 넘겨 고쳐 쓰기 단계가 뒤따르는 숫자까지 함께 바로잡게 한다.

const KST = (now) => new Date(now + 9 * 3600 * 1000);
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// ── 숫자 읽기 ──
// 1,234.5 · 300만 · 1억 2,000만 · 9% · 1.5배 — 단위 낱말(원 · 시간 · 일 · 개월 · 명 · 개)은 건너뛴다.
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const KNUM = String.raw`(?:(?:${NUM})\s?억\s?)?(?:(?:${NUM})\s?만\s?)?(?:${NUM})?`;
const UNIT = String.raw`(?:\s?(?:원|시간|일|개월|달|주|년|명|개|회|건|평|㎡|m²|km|kg|배|%|퍼센트))?`;

export function parseKoreanNumber(s) {
  const t = String(s).replace(/\s/g, "");
  if (!/\d/.test(t)) return null;
  let total = 0;
  let rest = t;
  const take = (unit, mul) => {
    const m = rest.match(new RegExp(`^(${NUM})${unit}`));
    if (m) {
      total += Number(m[1].replace(/,/g, "")) * mul;
      rest = rest.slice(m[0].length);
    }
  };
  take("억", 1e8);
  take("만", 1e4);
  const m = rest.match(new RegExp(`^(${NUM})`));
  if (m) {
    total += Number(m[1].replace(/,/g, ""));
    rest = rest.slice(m[0].length);
  }
  return rest.replace(/^(원|시간|일|개월|달|주|년|명|개|회|건|평|㎡|m²|km|kg|배)/, "") === "" || /^%|^퍼센트/.test(rest) ? total : null;
}

// ── 식 계산(사칙연산 · 괄호 · 퍼센트) ──
function evaluate(tokens) {
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const out = [];
  const ops = [];
  for (const tk of tokens) {
    if (typeof tk === "number") out.push(tk);
    else if (tk === "(") ops.push(tk);
    else if (tk === ")") {
      while (ops.length && ops.at(-1) !== "(") out.push(ops.pop());
      if (ops.pop() !== "(") return null;
    } else {
      while (ops.length && ops.at(-1) !== "(" && prec[ops.at(-1)] >= prec[tk]) out.push(ops.pop());
      ops.push(tk);
    }
  }
  while (ops.length) {
    const o = ops.pop();
    if (o === "(") return null;
    out.push(o);
  }
  const st = [];
  for (const x of out) {
    if (typeof x === "number") st.push(x);
    else {
      const b = st.pop();
      const a = st.pop();
      if (a == null || b == null) return null;
      st.push(x === "+" ? a + b : x === "-" ? a - b : x === "*" ? a * b : b === 0 ? NaN : a / b);
    }
  }
  return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null;
}

/** "10,320원 × 209시간" → 토큰. 연산자가 하나도 없거나 읽을 수 없으면 null. */
export function tokenize(expr) {
  const tokens = [];
  let s = expr.trim();
  let ops = 0;
  let hasPct = false;
  let hasAdd = false;
  const numRe = new RegExp(`^(${KNUM})(${UNIT})`);
  while (s.length) {
    s = s.replace(/^\s+/, "");
    if (!s) break;
    const c = s[0];
    if (c === "(" || c === "（") { tokens.push("("); s = s.slice(1); continue; }
    if (c === ")" || c === "）") { tokens.push(")"); s = s.slice(1); continue; }
    if ("×xX*".includes(c)) { tokens.push("*"); ops += 1; s = s.slice(1); continue; }
    if ("÷/".includes(c)) { tokens.push("/"); ops += 1; s = s.slice(1); continue; }
    if (c === "+") { tokens.push("+"); ops += 1; hasAdd = true; s = s.slice(1); continue; }
    if ("-−–".includes(c)) { tokens.push("-"); ops += 1; hasAdd = true; s = s.slice(1); continue; }
    const m = s.match(numRe);
    if (!m || !m[0].trim() || !/\d/.test(m[1])) return null;
    let v = parseKoreanNumber(m[1]);
    if (v == null) return null;
    if (/%|퍼센트/.test(m[2])) { v /= 100; hasPct = true; }
    tokens.push(v);
    s = s.slice(m[0].length);
  }
  // 퍼센트를 더하고 빼는 식("10만 + 5%")은 뜻이 둘이라 보지 않는다
  if (!ops || (hasPct && hasAdd)) return null;
  return tokens;
}

/** 결과 숫자를 답에 적힌 꼴(쉼표 · 소수 자리 · 만 단위)에 맞춰 적는다. */
export function formatLike(value, sample) {
  const s = String(sample).trim();
  const unit = (s.match(/(원|시간|일|개월|달|주|년|명|개|회|건|평|㎡|m²|km|kg|배|%|퍼센트)$/) || [""])[0];
  if (unit === "%" || unit === "퍼센트") value *= 100;
  const body = s.slice(0, s.length - unit.length).trim();
  const dec = (body.match(/\.(\d+)\s*(만|억)?$/) || body.match(/\.(\d+)$/) || [, ""])[1].length;
  const fmt = (v, d) => {
    const r = Number(v.toFixed(d));
    return d ? r.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : Math.round(r).toLocaleString("en-US");
  };
  let out;
  if (/억/.test(body) && value >= 1e8) {
    const eok = Math.floor(value / 1e8);
    const man = Math.round((value - eok * 1e8) / 1e4);
    out = man ? `${eok.toLocaleString("en-US")}억 ${man.toLocaleString("en-US")}만` : `${eok.toLocaleString("en-US")}억`;
  } else if (/만$/.test(body)) out = `${fmt(value / 1e4, dec)}만`;
  else out = /,/.test(body) || value >= 10000 ? fmt(value, dec) : fmt(value, dec).replace(/,/g, "");
  const sp = /\s(원|시간|일|개월|명|개)$/.test(s) ? " " : "";
  return `${out}${unit ? sp + unit : ""}`;
}

/** 답 속 계산식 검산. 돌려주는 값: [{ quote, expr, stated, actual, ok, correct }] */
export function checkArithmetic(text) {
  const results = [];
  const body = String(text || "").replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));
  const piece = String.raw`[\d(（][^=\n≈]*?`;
  const re = new RegExp(String.raw`(${piece})\s*(=|≈|≒)\s*((?:약\s?)?(?:[가-힣]{1,6}\s)?)(${KNUM}${UNIT})`, "g");
  for (const line of body.split("\n")) {
    for (const m of line.matchAll(re)) {
      // 왼쪽 식: 숫자 · 연산자 · 괄호 · 단위만 남긴 마지막 덩어리(앞 글은 떼어 낸다)
      const left = (m[1].match(new RegExp(String.raw`(?:[(（]\s*)*(?:${KNUM})${UNIT}(?:\s*[)）])*(?:\s*[×xX*÷/+\-−–]\s*(?:[(（]\s*)*(?:${KNUM})${UNIT}(?:\s*[)）])*)+\s*$`)) || [])[0];
      if (!left) continue;
      // 식 바로 앞 · 결과 바로 뒤에 범위 · 숫자가 이어지면(3~5일 × 2 = 6~10일) 식의 일부만 떼어 읽은 것이다
      const before = line.slice(0, m.index + m[1].length - left.length).replace(/\s+$/, "").slice(-1);
      const after = line.slice(m.index + m[0].length).slice(0, 1);
      if (/[\d~∼\-–.,:/]/.test(before) || /[~∼\-–\d]/.test(after)) continue;
      // 날짜 · 번호(2026-10-17, 10/17, 02-123-4567)는 계산이 아니다
      if (/^\s*\d{2,4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,4}\s*$/.test(left) || /^\s*\d{1,2}\/\d{1,2}\s*$/.test(left)) continue;
      // 연산자 양옆에 띄어쓰기가 없는 '-' · '/' 하나짜리(예: 3-4, 1/2)는 범위 · 분수일 수 있어 보지 않는다
      if (/^[^×xX*÷+]*$/.test(left) && !/\s[-−–/]\s/.test(left)) continue;
      const tokens = tokenize(left);
      if (!tokens) continue;
      const actual = evaluate(tokens);
      const stated = parseKoreanNumber(m[4].replace(/(퍼센트|%)$/, ""));
      if (actual == null || stated == null) continue;
      const pct = /%|퍼센트/.test(m[4]);
      const statedVal = pct ? stated / 100 : stated;
      const approx = /약/.test(m[3] || "") || m[2] !== "=";
      // 반올림 · 버림을 감안한다: 적힌 자리수의 한 칸(예: 11,962원 → 1원, 4,200만 → 1만, 18.5% → 0.1%p)
      // + 상대 0.2%(약 · ≈ 이면 2%) — 이보다 크게 다르면 계산이 틀린 것이다
      const numPart = m[4].replace(/\s/g, "");
      const decs = ((numPart.match(/\.(\d+)/) || [, ""])[1] || "").length;
      const scale = (/억\d*$|억$/.test(numPart.replace(/(원|시간|일|개월|달|주|년|명|개|회|건|평|㎡|m²|km|kg|배|%|퍼센트)$/, "")) ? 1e8 : /만$/.test(numPart.replace(/(원|시간|일|개월|달|주|년|명|개|회|건|평|㎡|m²|km|kg|배|%|퍼센트)$/, "")) ? 1e4 : 1) * (pct ? 0.01 : 1);
      const roundTol = scale * 10 ** -decs;
      const diff = Math.abs(actual - statedVal);
      const ok = diff <= roundTol || diff <= Math.abs(actual) * (approx ? 0.02 : 0.002);
      results.push({ quote: `${left.trim()} ${m[2]} ${m[3] || ""}${m[4].trim()}`.replace(/\s+/g, " "), stated: statedVal, actual, ok, correct: formatLike(actual, m[4]) });
    }
  }
  return results;
}

/** 요일 검산: 해가 적힌 날짜 + (요일) 또는 '~은 X요일'. */
export function checkWeekdays(text) {
  const out = [];
  const re = /(\d{4})\s?년\s?(\d{1,2})\s?월\s?(\d{1,2})\s?일\s*(?:\(\s*([월화수목금토일])\s*\)|(?:은|는|이|,)?\s*([월화수목금토일])요일)/g;
  for (const m of String(text || "").matchAll(re)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      out.push({ quote: m[0], ok: false, problem: `${y}년 ${mo}월 ${d}일은 없는 날짜예요` });
      continue;
    }
    const stated = m[4] || m[5];
    const actual = WEEK[dt.getUTCDay()];
    out.push({ quote: m[0], ok: stated === actual, problem: `${y}년 ${mo}월 ${d}일은 ${actual}요일이에요` });
  }
  return out;
}

/** '올해(2025년)'처럼 올해를 잘못 아는 곳. */
export function checkThisYear(text, now = Date.now()) {
  const year = KST(now).getUTCFullYear();
  const out = [];
  const re = /(올해|금년|현재|지금)\s*(?:\(\s*|은\s*|는\s*|인\s*|이\s*)(\d{4})\s?년/g;
  for (const m of String(text || "").matchAll(re)) {
    const y = Number(m[2]);
    if (y !== year && Math.abs(y - year) <= 3) out.push({ quote: m[0], ok: false, problem: `올해는 ${year}년이에요(오늘 ${KST(now).toISOString().slice(0, 10)})` });
  }
  return out;
}

/** checkAnswer 가 부르는 한 번에 보기. fixes 는 verification.fixes 꼴. */
export function computeCheck(text, { now = Date.now() } = {}) {
  const math = checkArithmetic(text);
  const days = checkWeekdays(text);
  const years = checkThisYear(text, now);
  const fixes = [
    ...math.filter((r) => !r.ok).map((r) => ({ type: "math", quote: r.quote, problem: `계산이 틀렸어요 — 바른 값은 ${r.correct}`, hint: "코드로 다시 계산한 값이다. 이 값을 쓰는 뒤 문장의 숫자도 함께 고칠 것", field: "math" })),
    ...days.filter((r) => !r.ok).map((r) => ({ type: "date", quote: r.quote, problem: r.problem, hint: "요일(또는 날짜)만 바로잡고 문장은 지우지 말 것", field: "date" })),
    ...years.map((r) => ({ type: "date", quote: r.quote, problem: r.problem, hint: "연도만 바로잡고 문장은 지우지 말 것", field: "date" })),
  ];
  return { fixes, checked: math.length + days.length + years.length, mathChecked: math.length, mathWrong: math.filter((r) => !r.ok).length };
}
