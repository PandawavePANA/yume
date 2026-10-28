// 인용이 붙은 주장을 "출처"와 "내용"으로 나눠 판정한다(2026-10-28 외부 점검 핸드오프 P0 · P1).
//
// 사고 사례: "헌법재판소 2023헌마4471 결정에 따라 5인 미만 사업장도 부당해고 구제신청이 가능해졌다".
// 가짜 결정번호는 부존재 신뢰도 0.77로 잡았는데, 판정이 주장 전체에 "사실과 다름" 하나로 붙었고,
// 고친 문장 단계가 출처만 지운 "5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있다"를 내놨다.
// 내용도 틀린 말이다(근로기준법 제11조②, 시행령 별표 1 — 제23조①·제28조 미적용).
// 출처가 가짜라는 사실은 내용이 맞다는 뜻도, 틀렸다는 뜻도 아니다. 둘을 따로 적는다.
//
// 규칙
//   1. 출처 판정은 세 단계: 존재 확인(여기 오지 않음) / 존재하지 않음 확정(점수 ≥ NEC_CONFIRM) / 확인 불가.
//      특허 등급(T₂ = 0.7, nec.js)은 그대로 두고, 사용자에게 "틀렸다"고 말하는 문턱만 따로 높인다.
//   2. 내용 판정은 법령 원문 대조(statuteReview)가 조문 인용을 잠근 경우에만 "거짓"이다. 그 밖에는 "확인 안 됨".
//   3. 고친 문장은 원문 근거가 있는 값으로만 쓴다. 근거가 없으면 "수정 불가 · 사람 확인 필요"(fix_status: needs_human).
//
// DB · 모델을 부르지 않는 순수 함수만 둔다 — 파이프라인 밖에서 이 규율만 따로 시험한다.

const envNum = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 1 ? Number(v) : d);
/** "존재하지 않음"으로 확정해 사용자에게 틀렸다고 말하는 부존재 신뢰도 문턱. 미만은 "확인 불가". */
export const NEC_CONFIRM = envNum(process.env.NEC_CONFIRM, 0.9);

const squash = (s) => String(s || "").replace(/[\s"'“”‘’「」『』()（）.,·:;!?~-]/g, "");

// ── 사건번호로 어느 기관에서 다시 확인할지 ─────────────────────────────
// 헌법재판소 사건부호(헌가·헌나·헌다·헌라·헌마·헌바·헌사·헌아)는 헌재 판례검색, 나머지는 대법원 판결서 열람.
const CCOURT = /\d{2,4}\s*헌\s*[가나다라마바사아]\s*\d+/;
export function isConstitutionalCase(value) {
  return CCOURT.test(String(value || ""));
}
export function courtTip(value) {
  if (isConstitutionalCase(value)) return " 헌법재판소 결정은 헌법재판소 판례검색(search.ccourt.go.kr)에서 사건번호로 한 번 더 확인할 수 있습니다.";
  return " 실제 판결서는 대법원 사법정보공개포털 ‘판결서 인터넷열람’에서 사건번호로 한 번 더 확인할 수 있습니다(형사 2013년·민사 등 2015년 이후 확정 판결 수록).";
}

// ── 인용을 떼고 내용만 남긴다 ───────────────────────────────────────
// "헌법재판소 2023헌마4471 결정에 따라 X" → "X". 인용 표현 뒤에 붙는 연결어까지 같이 뗀다.
const ISSUER = /(?:(?:대법원|헌법재판소|헌재|[가-힣]{1,8}(?:고등|지방)?법원|국세청|고용노동부|법제처)\s*)?(?:예규|고시|판례|판결|결정|해석)?\s*$/;
const LINKS = /^\s*호?\s*(?:판결|결정|선고|예규|해석|질의회신|고시|사건)?\s*(?:의|은|는|이|가)?\s*(?:취지|판시)?\s*(?:에\s*따라|에\s*따르면|에\s*의하면|에\s*의해|로|으로|에서|은|는|이|가|도)?\s*[,，]?\s*/;
export function stripCitation(text, cited) {
  const s = String(text || "").trim();
  const c = String(cited || "").replace(/\s+/g, "");
  if (!c) return s;
  // 공백을 무시하고 찾는다("2023 헌마 4471"도 같은 인용이다). 찾은 글자 위치를 원문 위치로 되돌린다.
  const idx = [];
  for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i])) idx.push(i);
  const at = idx.map((i) => s[i]).join("").indexOf(c);
  if (at < 0) return s;
  const start = idx[at];
  const end = idx[at + c.length - 1] + 1;
  const head = s.slice(0, start).replace(ISSUER, "").trim();
  const rest = s.slice(end).replace(LINKS, "").trim();
  return [head, rest].filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim() || s;
}

// ── 인용 주장 하나를 나눈다 ─────────────────────────────────────────
// source_check는 claimStance.applyStance가 existence를 지우면서 남긴다(부존재 판정을 받은 식별자).
// 조문 단위 부존재(법령은 있는데 그 조문이 현행 본문에 없음)는 현행 원문을 직접 본 판정이라 나누지 않는다.
export function splitCitationClaim(c) {
  const sc = c?.source_check;
  if (!sc || c.domain !== "법률" || c.stance === "denies" || sc.kind === "article" || sc.deleted) return c;
  const label = sc.label || sc.target;
  const score = Number(sc.score);
  const confirmed = Number.isFinite(score) && score >= NEC_CONFIRM;
  const status = confirmed ? "absent_confirmed" : "unverifiable";
  const content = stripCitation(c.quote || c.text, label);
  const scoreNote = Number.isFinite(score) ? `부존재 신뢰도 ${score}` : "부존재 신뢰도 산출";
  const sourceLine = confirmed
    ? `출처 ‘${label}’은(는) 존재하지 않습니다(${scoreNote}).`
    : `출처 ‘${label}’은(는) 확인 불가입니다 — 공식 DB와 웹에서 찾지 못했지만 ${scoreNote}가 확정 기준 ${NEC_CONFIRM}에 못 미칩니다.`;
  const tip = sc.kind === "case" ? courtTip(label) : "";
  const source_check = { ...sc, status, threshold: NEC_CONFIRM };
  const nec = c.nec ? { ...c.nec, display_grade: status, gradeLabel: confirmed ? "존재하지 않음" : "확인 불가" } : c.nec;
  const base = { ...c, nec, source_check, content_claim: content };

  // 내용은 법령 원문 대조가 조문 인용을 잠근 경우에만 거짓이다(statuteReview.applyStatuteReview).
  if (c.statute_review === "confirmed_error") {
    return { ...base, verdict: "false", content_verdict: "false", explanation: `${sourceLine} 내용: ${c.explanation || ""}`.trim() };
  }
  const unverifiedLine = `이 출처에 기댄 내용("${content}")은 법령 원문으로 따로 확인되지 않았습니다 — 실재와 내용을 확인하기 전에는 사실로 쓰지 마세요.${tip}`;
  if (confirmed) {
    return { ...base, verdict: "false", verified_via: "nec", content_verdict: "unverified", fix_status: "needs_human", explanation: `${sourceLine} ${unverifiedLine}` };
  }
  const { suggested_fix: _f, ...rest } = base;
  return { ...rest, verdict: "uncertain", verified_via: "nec", uncertain_reason: "no_evidence", content_verdict: "unverified", fix_status: "needs_human", explanation: `${sourceLine} ${unverifiedLine}` };
}

export function splitCitationClaims(claims) {
  return (claims || []).map(splitCitationClaim);
}

// ── 고친 문장 게이트 ────────────────────────────────────────────────
// 법률 주장의 고친 문장은 원문 근거(법령 원문 인용이 붙은 판정)가 있을 때만 만든다.
// 사이트의 "고친 부분은 베리라인이 책임집니다"(기업 이용 조건 제10조의2)와 같은 범위다.
const GROUNDED_VIA = new Set(["official", "reference"]);
const hasQuotedSource = (c) => (c.sources || []).some((s) => s && String(s.quote || "").trim().length >= 6);
export function fixAllowed(c) {
  if (c.verdict !== "false" || c.fix_status === "needs_human") return false;
  if (c.domain !== "법률") return true;
  if (c.statute_review === "confirmed_error") return true;
  return GROUNDED_VIA.has(c.verified_via) && hasQuotedSource(c);
}

/** 고칠 수 없는 '사실과 다름'에 표시를 단다. 고친 문장 단계 앞에서 부른다. */
export function markUnfixable(claims) {
  return (claims || []).map((c) => (c.verdict === "false" && !fixAllowed(c) && !c.fix_status ? { ...c, fix_status: "needs_human" } : c));
}

/**
 * 모델이 쓴 고친 문장을 마지막으로 거른다. 둘 다 이번 사고의 모양이다.
 *   - 확인 안 된 내용을 그대로 단정한다(content_claim이 고친 문장에 그대로 들어 있다)
 *   - 존재하지 않는 출처를 그대로 다시 쓴다
 */
export function fixPasses(c, fix) {
  const f = squash(fix);
  if (!f) return false;
  if (c.content_verdict && c.content_verdict !== "true" && c.content_claim && f.includes(squash(c.content_claim))) return false;
  const cited = c.source_check?.label || c.source_check?.target;
  if (cited && f.includes(squash(cited))) return false;
  return true;
}

// ── 세부 분야 ──────────────────────────────────────────────────────
// domain은 통계 · 요금 · 데이터셋이 기대는 큰 갈래라 그대로 두고(claimGuard.DOMAINS), 화면에 보이는 세부 분야를 따로 단다.
// 근거 법령 이름이 가장 정확하고, 없으면 주장 낱말로 고른다.
const FIELD_BY_LAW = [
  ["노무", /근로기준법|최저임금법|고용보험법|산업재해보상보험법|근로자퇴직급여|퇴직급여\s*보장법|남녀고용평등|임금채권보장법|노동조합|파견근로자|기간제|산업안전보건법|직업안정법|고용상\s*연령차별|근로자의날|고용정책/],
  ["세무", /소득세법|법인세법|부가가치세법|조세특례제한법|상속세\s*및\s*증여세법|국세기본법|국세징수법|지방세|종합부동산세법|개별소비세법|조세범/],
  ["부동산", /주택임대차보호법|상가건물\s*임대차보호법|공인중개사법|부동산\s*거래신고|집합건물/],
  ["의료", /의료법|약사법|국민건강보험법|응급의료|감염병|의료기기법|정신건강/],
  ["형사", /형법|형사소송법|특정범죄|성폭력범죄|도로교통법/],
  ["민사", /민법|민사소송법|민사집행법|가사소송법|소액사건/],
];
const FIELD_BY_WORD = [
  ["노무", /퇴직금|연차|해고|최저임금|실업급여|구직급여|육아휴직|출산(?:전후)?휴가|주휴|임금체불|근로계약|통상임금|연장근로|산재|5인\s*미만|부당해고|대지급금/],
  ["세무", /양도(?:소득)?세|종합소득세|부가가치세|간이과세|증여세|상속세|연말정산|세액공제|소득공제|원천징수|가산세|성실신고/],
  ["부동산", /전세|임대차|보증금|대항력|최우선변제|갱신요구|소액임차인|임차권등기/],
  ["형사", /고소|친고죄|공소시효|벌금형|징역형/],
  ["민사", /항소|지급명령|소멸시효|손해배상|성년/],
];
export function fieldOf(c) {
  if (!c || c.domain !== "법률") return null;
  const lawText = [c.legal_ref?.law, c.legal_ref?.name, ...(c.sources || []).map((s) => s?.title), c.explanation].filter(Boolean).join(" ");
  const own = String(c.quote || c.text || "");
  for (const [f, re] of FIELD_BY_LAW) if (re.test(own)) return f;
  for (const [f, re] of FIELD_BY_WORD) if (re.test(own)) return f;
  for (const [f, re] of FIELD_BY_LAW) if (re.test(lawText)) return f;
  return null;
}
export function withField(c) {
  const field = fieldOf(c);
  return field ? { ...c, field } : c;
}
