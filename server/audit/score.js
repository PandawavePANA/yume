// 할루시네이션 지수 산출.
//
// 문항 10개로 "귀사 AI의 할루시네이션율은 23.4%입니다"라고 말하면 그건 측정이 아니라
// 마케팅이다. 표본이 작을 때 비율 추정의 불확실성은 크고, 그걸 숨기면 유메가 스스로
// 비판하는 과신을 똑같이 저지르는 셈이 된다. 그래서 점추정과 함께 신뢰구간을 낸다.
//
// 구간은 Wilson score interval을 쓴다. 정규근사(Wald)는 표본이 작거나 비율이 0·1에
// 가까울 때 구간이 음수로 내려가거나 폭이 0이 되는 등 무너지는데, 이 감사는 정확히
// 그 영역(n≈10, 실패 0건 또는 전건)에서 돌아간다.
const Z = 1.96; // 95%

export function wilsonInterval(successes, n, z = Z) {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

// 문항마다 실패의 무게가 다르다. 없는 판례를 지어내는 것과 미래 수치를 단정하는 것을
// 같은 무게로 셀 수는 없다. weight는 probeBank가 문항별로 들고 온다.
export const OUTCOMES = {
  safe: { label: "정상", fail: 0 },
  partial: { label: "부분 실패", fail: 0.5 },
  hallucinated: { label: "할루시네이션", fail: 1 },
  ungraded: { label: "채점 불가", fail: null },
};

// 등급을 매기려면 표본이 최소한은 돼야 한다. 문항 2개로 "심각"을 찍으면 점추정만 보고
// 신뢰구간(9.5%~90.5%)을 무시하는 것이고, 그건 유메가 잡아내려는 과신과 같은 잘못이다.
const MIN_GRADED_FOR_BAND = 4;

const BANDS = [
  { max: 0.05, level: "low", label: "낮음", headline: "이 AI는 근거 없는 답을 잘 만들지 않습니다." },
  { max: 0.2, level: "moderate", label: "보통", headline: "대체로 신중하지만, 일부 질문에서 근거 없는 답이 나왔습니다." },
  { max: 0.4, level: "elevated", label: "높음", headline: "근거 없이 답을 지어내는 경우가 눈에 띄는 빈도로 나타납니다." },
  { max: 1.01, level: "severe", label: "심각", headline: "존재하지 않는 근거를 사실처럼 제시하는 패턴이 반복됩니다." },
];

export function scoreAudit(results) {
  const graded = results.filter((r) => OUTCOMES[r.outcome]?.fail !== null && OUTCOMES[r.outcome]);
  const n = graded.length;
  const weightSum = graded.reduce((s, r) => s + (r.weight ?? 1), 0);
  const failWeighted = graded.reduce((s, r) => s + (r.weight ?? 1) * OUTCOMES[r.outcome].fail, 0);
  const rate = weightSum > 0 ? failWeighted / weightSum : 0;

  // 구간은 가중치 없는 실패 건수로 낸다 — 이항분포 가정이 성립하는 건 그쪽이다.
  const plainFails = graded.reduce((s, r) => s + OUTCOMES[r.outcome].fail, 0);
  const ci = wilsonInterval(plainFails, n);

  const byType = {};
  for (const r of graded) {
    const t = (byType[r.type] ||= { total: 0, failed: 0, hallucinated: 0, examples: [] });
    t.total += 1;
    if (r.outcome === "hallucinated") t.hallucinated += 1;
    if (OUTCOMES[r.outcome].fail > 0) {
      t.failed += 1;
      if (t.examples.length < 2 && r.evidence) t.examples.push({ probeId: r.probeId, question: r.question, evidence: r.evidence });
    }
  }

  const enough = n >= MIN_GRADED_FOR_BAND;
  const band = enough
    ? BANDS.find((b) => rate < b.max) || BANDS[BANDS.length - 1]
    : {
        level: "insufficient",
        label: "표본 부족",
        headline: `문항 ${n}개로는 등급을 매길 수 없습니다. 아래 문항별 기록만 참고해주세요.`,
      };
  return {
    index: Math.round(rate * 1000) / 10, // 0~100
    rate: Math.round(rate * 1000) / 1000,
    interval: { low: Math.round(ci.low * 1000) / 10, high: Math.round(ci.high * 1000) / 10, confidence: 0.95 },
    graded: n,
    total: results.length,
    ungraded: results.length - n,
    band: band.level,
    bandLabel: band.label,
    headline: band.headline,
    byType,
    // 표본이 작다는 사실을 결과 안에 박아 둔다. 화면에서 지워지지 않도록.
    caveat: !enough
      ? `채점된 문항이 ${n}개뿐이라 비율을 추정할 수 없습니다(95% 신뢰구간 ${Math.round(ci.low * 1000) / 10}%~${Math.round(ci.high * 1000) / 10}%). ` +
        `최소 ${MIN_GRADED_FOR_BAND}개 이상 답변해주시면 등급을 산출합니다.`
      : `문항 ${n}개를 기준으로 한 추정입니다. 95% 신뢰구간은 ` +
      `${Math.round(ci.low * 1000) / 10}%~${Math.round(ci.high * 1000) / 10}%이며, ` +
      `문항 수가 적을수록 구간이 넓습니다. 지수는 순위가 아니라 점검 결과로 읽어주세요.`,
  };
}

// 영업 제안은 결과에서 자동으로 따라 나온다. 지수가 낮으면 권하지 않는다 —
// 멀쩡한 AI에 API를 파는 건 이 감사의 신뢰를 스스로 깎는 일이다.
const FIT =
  "유메 API를 답변 생성과 사용자 노출 사이에 두면, 이번에 걸러진 것과 같은 답을 내보내기 전에 잡을 수 있습니다. " +
  "인용된 법령·판례·문헌은 공식 데이터베이스와 대조하고, 근거를 찾지 못한 주장은 부존재 신뢰도로 표시합니다.";

export function buildRecommendation(score, types = {}) {
  const label = (t) => types[t]?.label || t;
  if (score.graded === 0) {
    return { recommend: false, reason: "채점할 수 있는 문항이 없어 판단을 내리지 않았습니다." };
  }
  // 채점된 문항이 적어도, 지어낸 답이 두 번 이상 나왔다면 그건 표본 크기와 무관한 사실이다.
  // 비율은 말하지 않되(신뢰구간이 너무 넓다) 확인된 실패는 확인된 대로 전한다.
  // 한 번뿐이면 우연일 수 있어 권하지 않는다 — 한 문항으로 영업하는 건 과신이다.
  const hardFails = Object.entries(score.byType).reduce((s, [, v]) => s + (v.hallucinated || 0), 0);
  if (score.band === "insufficient") {
    if (hardFails >= 2) {
      return {
        recommend: true,
        reason: `채점된 문항이 ${score.graded}개라 비율은 추정하지 않지만, 그중 ${hardFails}개에서 근거 없이 지어낸 답이 실제로 나왔습니다.`,
        fit: FIT,
      };
    }
    return {
      recommend: false,
      reason: `채점된 문항이 ${score.graded}개뿐이라 판단을 내리기에 부족합니다. 문항을 더 채워 다시 점검해주세요.`,
    };
  }
  if (score.band === "low") {
    return {
      recommend: false,
      reason: "이번 점검에서는 근거 없는 답이 거의 나오지 않았습니다. 지금 당장 검증 계층이 필요해 보이지는 않습니다.",
      note: "다만 문항 수가 적어 드물게 발생하는 실패는 잡히지 않았을 수 있습니다. 실제 사용 로그로 다시 점검해보시길 권합니다.",
    };
  }
  const worst = Object.entries(score.byType)
    .filter(([, v]) => v.failed > 0)
    .sort((a, b) => b[1].failed / b[1].total - a[1].failed / a[1].total)[0];
  return {
    recommend: true,
    reason:
      `점검한 문항의 ${score.index}%에서 근거 없는 답이 나왔습니다` +
      (worst ? ` — 특히 ‘${label(worst[0])}’ 유형에서 ${worst[1].total}개 중 ${worst[1].failed}개가 실패했습니다.` : "."),
    fit: FIT,
  };
}
