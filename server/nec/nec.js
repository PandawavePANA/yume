// 특허 부존재 신뢰도 산출부(170)·판정 안내 출력부(180).
//   NEC = w₁·C + w₂·F + w₃·(1 − P),  w₁ + w₂ + w₃ = 1   (수학식 2, 청구항 5)
// NEC ≥ T₂ 이면 '부존재 확실', 미만이면 '확인 불가'로 등급을 나누고(청구항 6),
// 확인 불가일 때는 미탐색 영역과 확인 절차를 함께 안내한다(청구항 7).
import { SEARCH_SPACES } from "./searchSpace.js";

// 분야별 가중치(청구항 5 — "검증 분야에 따라 상이하게 설정될 수 있다").
export const NEC_WEIGHTS = {
  legal: { w1: 0.65, w2: 0.2, w3: 0.15 },
  scholarly: { w1: 0.6, w2: 0.25, w3: 0.15 },
};
export const T1_SKIP_SEARCH = 0.7; // 형식오류 지수가 이 값을 넘으면 외부 탐색을 생략(청구항 2)
export const T2_GRADE = 0.7; // 부존재 확실 등급의 기준값

const round3 = (x) => Math.round(x * 1000) / 1000;

export function computeNec({ C, F, P, weights }) {
  const { w1, w2, w3 } = weights;
  return round3(w1 * C + w2 * F + w3 * (1 - P));
}

export const GRADE_LABEL = { nonexistent: "부존재 확실", unverifiable: "확인 불가" };

const pct = (x) => `${Math.round(x * 100)}%`;

// identifier: identifiers.js의 검사 결과, coverage: searchSpace.coverageFor 결과(또는 형식오류로
// 탐색을 생략한 경우 논리적 커버리지 1), similar: [{ value, title, url, similarity }]
export function buildNecReport({ identifier, spaceKey, coverage, similar = [], skippedSearch = false, weights, extraNotes = [] }) {
  const space = SEARCH_SPACES[spaceKey];
  const F = identifier.F;
  const C = skippedSearch ? 1 : coverage.value;
  const P = skippedSearch ? 0 : similar.reduce((m, s) => Math.max(m, s.similarity), 0);
  const score = computeNec({ C, F, P, weights });
  const grade = score >= T2_GRADE ? "nonexistent" : "unverifiable";

  const sortedSimilar = [...similar].sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  let summary;
  if (skippedSearch) {
    const worst = [...identifier.checks].sort((a, b) => b.score - a.score)[0];
    summary = `형식상 존재할 수 없는 식별자라 외부 조회 없이 판정했습니다 — ${worst?.note || "형식 오류"}`;
  } else if (grade === "nonexistent") {
    summary = `${space.label} 검색공간의 약 ${pct(C)}(추정)를 탐색했지만 찾지 못했고, 가까운 실재 항목도 없어 존재하지 않을 가능성이 높습니다.`;
  } else if (sortedSimilar[0]?.similarity >= 0.75) {
    summary = `그대로는 찾지 못했지만 매우 비슷한 ‘${sortedSimilar[0].value}’가 실재합니다 — 이를 잘못 인용했을 수 있어 부존재로 단정하지 않습니다.`;
  } else {
    summary = `공식 자료에서 찾지 못했지만, 탐색한 범위가 ${space.label} 검색공간의 약 ${pct(C)}(추정)에 그쳐 부존재로 단정하지 않습니다.`;
  }

  return {
    identifier: {
      type: identifier.type,
      value: identifier.raw,
      canonical: identifier.canonical,
      searchSpace: space.label,
    },
    score,
    grade,
    gradeLabel: GRADE_LABEL[grade],
    threshold: T2_GRADE,
    weights,
    coverage: { value: round3(C), estimated: true, logical: skippedSearch, searched: skippedSearch ? [] : coverage.searched },
    formatError: {
      value: F,
      skippedSearch,
      checks: identifier.checks.map((c) => ({ name: c.label, score: c.score, note: c.note })),
    },
    proximity: { value: round3(P), similar: sortedSimilar },
    uncovered: grade === "unverifiable" ? space.uncovered : [],
    summary,
    notes: extraNotes,
  };
}
