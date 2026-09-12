// 비법률 주장에 인용된 학술·서지 식별자(DOI·arXiv·PMID·ISBN)의 실재 여부를 확인한다
// (특허 청구항 9 — 학술문헌 식별자). 식별자가 공식 레지스트리에 있으면 출처로 붙이고,
// 없으면 부존재 신뢰도(NEC)를 산출해 부존재 확실이면 해당 주장을 false로 바꾼다.
import { checkIdentifier } from "./nec/identifiers.js";
import { coverageFor } from "./nec/searchSpace.js";
import { buildNecReport, NEC_WEIGHTS, T1_SKIP_SEARCH } from "./nec/nec.js";
import { SCHOLARLY_LOOKUP } from "./nec/scholarly.js";

const MAX_PER_CLAIM = 3;

export async function resolveIdentifierClaims(claims, { onProgress = () => {}, lookups = SCHOLARLY_LOOKUP } = {}) {
  return Promise.all(claims.map((c) => resolveClaim(c, onProgress, lookups)));
}

async function resolveClaim(claim, onProgress, lookups) {
  const ids = (Array.isArray(claim.identifiers) ? claim.identifiers : [])
    .filter((x) => x && lookups[x.type] && x.value)
    .slice(0, MAX_PER_CLAIM);
  if (ids.length === 0) {
    const { identifiers: _drop, ...rest } = claim;
    return rest;
  }

  const results = [];
  for (const raw of ids) {
    const ident = checkIdentifier(raw);
    const lookup = lookups[raw.type];
    if (ident.F > T1_SKIP_SEARCH) {
      const nec = buildNecReport({ identifier: ident, spaceKey: raw.type, skippedSearch: true, weights: NEC_WEIGHTS.scholarly });
      results.push({ type: raw.type, value: ident.canonical, status: "nonexistent", nec });
      continue;
    }
    onProgress(`${lookup.label} ${ident.canonical} 실재 여부 확인 중…`);
    const r = await lookup.fn(ident.canonical);
    if (!r.ok) {
      results.push({ type: raw.type, value: ident.canonical, status: "lookup_failed" });
      continue;
    }
    if (r.found) {
      results.push({ type: raw.type, value: ident.canonical, status: "found", title: r.title, url: r.url });
      continue;
    }
    const coverage = coverageFor(raw.type, [{ id: lookup.source, ok: true }]);
    const nec = buildNecReport({ identifier: ident, spaceKey: raw.type, coverage, weights: NEC_WEIGHTS.scholarly });
    results.push({ type: raw.type, value: ident.canonical, status: nec.grade, nec });
  }

  const { identifiers: _drop, ...base } = claim;
  const foundSources = results
    .filter((r) => r.status === "found")
    .map((r) => ({ title: `${lookups[r.type].label} ${r.value}${r.title ? ` — ${r.title}` : ""}`, url: r.url }));
  const worst = results
    .filter((r) => r.nec)
    .sort((a, b) => b.nec.score - a.nec.score)[0];
  const identifierSummary = results.map(({ nec: _n, ...r }) => r);

  if (worst && worst.nec.grade === "nonexistent") {
    return {
      ...base,
      verdict: "false",
      verified_via: "nec",
      explanation: `인용된 ${lookups[worst.type].label} ‘${worst.value}’은(는) 존재하지 않을 가능성이 높습니다(부존재 신뢰도 ${worst.nec.score}). ${worst.nec.summary}`,
      sources: [...foundSources, ...(base.sources || [])],
      nec: worst.nec,
      identifiers: identifierSummary,
    };
  }
  return {
    ...base,
    sources: [...foundSources, ...(base.sources || [])],
    ...(worst ? { nec: worst.nec } : {}),
    identifiers: identifierSummary,
  };
}
