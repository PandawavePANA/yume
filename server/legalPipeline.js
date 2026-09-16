// domain === "법률" claim만 골라 법제처 공식 데이터로 조회하고, 조회된 실제 텍스트를
// 근거로 grounding 판정을 내린 뒤 원래 claim에 병합한다.
//
// 인용된 법령·판례를 공식 DB에서 찾지 못했을 때는 특허 「검색공간 완전성 기반 부존재
// 신뢰도 정량화」 방식으로 판정한다 — "못 찾음"을 곧바로 "없음(false)"으로 치환하지 않고,
// 식별자 형식오류 F·탐색 커버리지 C·유사 항목 근접도 P로 부존재 신뢰도(NEC)를 산출해
//   · NEC ≥ T₂  → 부존재 확실: 지어낸 법령·판례로 보고 false
//   · NEC <  T₂ → 확인 불가: 웹 탐색으로 검색공간을 넓혀 다시 산출하고, 미탐색 영역을 안내
// 비법률 claim은 손대지 않고 그대로 통과시킨다.
import {
  hasOC,
  searchStatute,
  searchLawCandidatesByStem,
  getStatuteArticle,
  searchPrecedent,
  getPrecedentDetail,
  findCitations,
  searchConstitutional,
  getConstitutionalDetail,
  searchAdminRule,
  searchOrdinance,
  findAdminRuleByNumber,
  getAdminRuleArticle,
} from "./lawApi.js";
import { groundLegalClaim as defaultGround, verifyLegalClaimViaWeb as defaultWebVerify } from "./claude.js";
import {
  checkCaseNumber,
  checkStatute,
  checkArticleAgainstLaw,
  normalizeLawName,
  resolveLawAlias,
} from "./nec/identifiers.js";
import { caseSpaceKey, coverageFor } from "./nec/searchSpace.js";
import { lawNameSimilarity, caseSimilarity, caseVariants } from "./nec/similarity.js";
import { buildNecReport, NEC_WEIGHTS, T1_SKIP_SEARCH } from "./nec/nec.js";

const WEIGHTS = NEC_WEIGHTS.legal;

// 진행 문구는 화면에서 한 줄로 고정돼 넘치면 말줄임된다. 법령·행정규칙 이름이
// 길면 뒤에 붙는 "제N조 조문과 대조 중" 쪽이 잘려 무슨 일을 하는지 안 보이므로,
// 이름을 먼저 줄여 핵심이 남게 한다.
const short = (name, n = 14) => {
  const t = String(name || "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const CASE_IN_TEXT = /(\d{2,4})\s?([가-힣]{1,3})\s?(\d{2,7})/;

export async function resolveLegalClaims(claims, { ground = defaultGround, webVerify = defaultWebVerify, onProgress = () => {} } = {}) {
  return Promise.all(
    claims.map((claim) => (claim.domain === "법률" ? resolveOne(claim, { ground, webVerify, onProgress }) : claim)),
  );
}

async function resolveOne(claim, ctx) {
  if (!hasOC()) return webFallback(claim, ctx);

  let ref = claim.legal_ref || { type: "unspecified" };
  // 추출 단계에서 판례를 특정하지 못했어도 본문에 사건번호가 그대로 있으면 살려 쓴다.
  if (ref.type !== "case" && ref.type !== "statute") {
    const m = claim.text.match(CASE_IN_TEXT);
    if (m && checkCaseNumber(m[0]).level) ref = { type: "case", case_number: m[0] };
  }
  try {
    if (ref.type === "statute" && ref.law_name) return await resolveStatute(claim, ref, ctx);
    if (ref.type === "case" && ref.case_number) return await resolveCase(claim, ref, ctx);
    return await webFallback(claim, ctx);
  } catch (e) {
    return webFallback(claim, ctx);
  }
}

// ───────────────────────── 법령 ─────────────────────────
// 행정규칙은 "공정거래위원회 고시 제2022-4호"처럼 제목이 아니라 발령번호로 인용되는 일이
// 많다. 이 형태는 '고시'로 끝나지 않으므로 접미사만 보면 일반 법령으로 잘못 분류되고,
// 법령 검색공간(법률·대통령령·총리령·부령)에서 못 찾았다는 이유로 실재하는 고시가
// '부존재'로 판정된다. 그래서 종류어가 이름 안 어디에 있든 잡아낸다.
const ADMIN_RULE_KIND = /(고시|훈령|예규)/;

const ISSUE_NO = /제?\s*(\d{4})\s*[-–—−]\s*(\d+)\s*호/;

// 발령번호를 기준점으로 잡고 그 앞쪽에서 종류어와 발령기관을 찾는다.
// 추출 단계가 인용을 정식 제목으로 풀어 쓰는 경우가 있어
// ("통신판매업 신고 면제 기준에 대한 고시(공정거래위원회고시 제2022-4호)"),
// 맨 앞을 기관으로 단정하면 안 된다 — 번호에 가장 가까운 종류어를 기준으로 삼는다.
export function parseAdminRuleCitation(name) {
  const raw = String(name || "").trim();
  const no = raw.match(ISSUE_NO);
  if (!no) return null;
  const before = raw.slice(0, no.index);
  const kinds = [...before.matchAll(new RegExp(ADMIN_RULE_KIND, "g"))];
  if (kinds.length === 0) return null;
  const kind = kinds[kinds.length - 1];
  // 기관 후보는 번호 앞 전체를 넘긴다 — resolveAdminRuleOrg가 가장 오른쪽 기관을 골라낸다.
  return { org: before, kind: kind[1], issueNo: `${no[1]}-${no[2]}` };
}

export function statuteKind(name) {
  const norm = normalizeLawName(name);
  if (/조례$/.test(norm) || (/규칙$/.test(norm) && /^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s/.test(name))) return "ordinance";
  if (/(고시|훈령|예규|지침|요령)$/.test(norm)) return "admin_rule";
  if (parseAdminRuleCitation(name)) return "admin_rule_numbered";
  return "statute";
}

async function resolveStatute(claim, ref, ctx) {
  const alias = resolveLawAlias(ref.law_name);
  const lawName = alias || ref.law_name.trim();
  const aliasNote = alias ? `‘${ref.law_name}’은(는) ‘${alias}’의 약칭이라 정식 명칭으로 조회했습니다. ` : "";
  const ident = checkStatute(lawName, ref.article);

  if (ident.F > T1_SKIP_SEARCH) {
    const nec = buildNecReport({ identifier: ident, spaceKey: "statute", skippedSearch: true, weights: WEIGHTS });
    return necOutcome(claim, nec, ctx);
  }

  const kind = statuteKind(lawName);
  if (kind === "ordinance") return resolveNonNationalRule(claim, ident, lawName, "ordinance", searchOrdinance, "law.go.kr:ordin", ctx);
  if (kind === "admin_rule_numbered") return resolveAdminRuleByNumber(claim, ident, lawName, ctx);

  ctx.onProgress(`법제처에서 "${lawName}" 조회 중…`);
  const search = await searchStatute(lawName);
  if (!search.ok) return webFallback(claim, ctx);

  if (search.found) return resolveFoundStatute(claim, ident, search, aliasNote, ctx);

  if (kind === "admin_rule") return resolveNonNationalRule(claim, ident, lawName, "admin_rule", searchAdminRule, "law.go.kr:admrul", ctx);

  // 공식 DB에 같은 이름의 법령이 없다 → 부분 일치로 걸린 법령들과의 근접도(P)를 본다.
  let candidates = search.candidates || [];
  if (candidates.length < 3) candidates = [...candidates, ...(await searchLawCandidatesByStem(lawName))];
  const similar = dedupeBy(candidates, (c) => c.lawNameOfficial)
    .map((c) => ({ value: c.lawNameOfficial, url: c.detailUrl, similarity: lawNameSimilarity(lawName, c.lawNameOfficial), _law: c }))
    .filter((s) => s.similarity >= 0.5)
    .sort((a, b) => b.similarity - a.similarity);

  // 매우 비슷한 실재 법령이 있으면(이름을 살짝 틀린 경우) 그 법령 조문과 대조해 본다.
  const best = similar[0];
  if (best && best.similarity >= 0.75 && ident.article) {
    ctx.onProgress(`가장 가까운 "${best.value}" 조문과 대조 중…`);
    const art = await getStatuteArticle(best._law.mst, ident.article.no, ident.article.branch);
    if (art.ok && art.found) {
      const coverage = coverageFor(ident.looksAbbreviated ? "statute_abbrev" : "statute", [{ id: "law.go.kr:law", ok: true }]);
      const nec = buildNecReport({ identifier: ident, spaceKey: ident.looksAbbreviated ? "statute_abbrev" : "statute", coverage, similar: stripInternal(similar), weights: WEIGHTS });
      const grounded = await ctx.ground(claim.text, art.text, { label: `법제처 국가법령정보 - ${best.value}`, effectiveDate: formatDate(art.effectiveDate) });
      return {
        ...claim,
        verdict: grounded.verdict || "uncertain",
        verified_via: "official",
        explanation: `‘${lawName}’은(는) 정식 법령명이 아니어서 가장 가까운 ‘${best.value}’ 기준으로 확인했습니다. ${grounded.explanation || ""}`.trim(),
        sources: [{ title: `${best.value}${art.title ? " - " + art.title : ""}`, url: best.url }],
        nec,
        ...dateField(art.effectiveDate),
      };
    }
  }

  const spaceKey = ident.looksAbbreviated ? "statute_abbrev" : "statute";
  const coverage = coverageFor(spaceKey, [{ id: "law.go.kr:law", ok: true }]);
  const nec = buildNecReport({ identifier: ident, spaceKey, coverage, similar: stripInternal(similar), weights: WEIGHTS });
  return necOutcome(claim, nec, ctx, { spaceKey, searched: [{ id: "law.go.kr:law", ok: true }], similar: stripInternal(similar), identifier: ident });
}

async function resolveFoundStatute(claim, ident, search, aliasNote, ctx) {
  if (search.versionStatus !== "current") {
    // 현재 시행 중인 버전을 단정할 수 없는 상태(폐지되어 연혁만 남았거나, 아직 시행 전인
    // 개정판만 검색됨) — 함부로 confirmed/false로 단정하지 않고 정직하게 uncertain 처리.
    const note = search.versionStatus === "upcoming_only"
      ? "검색된 버전이 아직 시행되지 않은 개정 예정 조문뿐이라"
      : "현재 시행 중인 버전을 확인할 수 없고 과거(연혁) 조문만 검색되어";
    // 버전이 애매해도 조문 본문 자체는 받아올 수 있다. 받아서 대조하고, 시점만 단서로 붙인다.
    // 예전에는 여기서 곧바로 uncertain으로 끝내 "모른다"가 그대로 사용자에게 나갔다.
    const src = [{ title: search.lawNameOfficial, url: search.detailUrl }];
    if (ident.article) {
      const art = await getStatuteArticle(search.mst, ident.article.no, ident.article.branch);
      if (art.ok && art.found) {
        const grounded = await ctx.ground(claim.text, art.text, {
          label: `법제처 국가법령정보 - ${search.lawNameOfficial}`,
          effectiveDate: formatDate(art.effectiveDate || search.effectiveDate),
        });
        return official(
          claim,
          grounded.verdict || "uncertain",
          `${aliasNote}${grounded.explanation || art.text} (${note} 시행 시점은 별도로 확인하세요.)`,
          src,
          art.effectiveDate || search.effectiveDate,
        );
      }
    }
    const web = await webFallback(claim, ctx);
    return { ...web, explanation: `${aliasNote}${web.explanation} (${note} 공식 조문 대조는 하지 못했습니다.)`, sources: [...src, ...(web.sources || [])] };
  }
  if (!ident.article) {
    // 법령이 실재하는 것은 공식 확인됐다. 조문 번호가 없다고 여기서 멈추지 말고,
    // 주장 내용 자체는 웹으로 확인해서 판정까지 간다.
    const src = [{ title: search.lawNameOfficial, url: search.detailUrl }];
    const web = await webFallback(claim, ctx);
    return {
      ...web,
      explanation: `${aliasNote}"${search.lawNameOfficial}" 법령은 법제처에서 실재가 확인됐습니다. 조문 번호가 특정되지 않아 내용은 웹 자료로 확인했습니다 — ${web.explanation}`,
      sources: [...src, ...(web.sources || [])],
      ...dateField(search.effectiveDate),
    };
  }
  const articleLabel = `제${ident.article.no}조${ident.article.branch ? `의${ident.article.branch}` : ""}`;
  const article = await getStatuteArticle(search.mst, ident.article.no, ident.article.branch);
  if (!article.ok) return webFallback(claim, ctx);
  if (!article.found) {
    // 법령은 있는데 그 조문이 현행 본문에 없다 — 조문 단위로 부존재 신뢰도를 산출한다.
    const artIdent = checkArticleAgainstLaw({ ...ident, canonical: `${search.lawNameOfficial} ${articleLabel}` }, article.maxArticleNo);
    const similar = (article.branches || [])
      .filter((b) => b !== ident.article.branch)
      .slice(0, 3)
      .map((b) => ({ value: `${search.lawNameOfficial} 제${ident.article.no}조의${b}`, url: search.detailUrl, similarity: 0.5 }));
    const coverage = coverageFor("article", [{ id: "law.go.kr:lawtext", ok: true }]);
    const nec = buildNecReport({ identifier: artIdent, spaceKey: "article", coverage, similar, weights: WEIGHTS });
    const sources = [{ title: search.lawNameOfficial, url: search.detailUrl }];
    if (nec.grade === "nonexistent") {
      return {
        ...claim,
        verdict: "false",
        verified_via: "nec",
        explanation: `${aliasNote}"${search.lawNameOfficial}"에는 현재 시행 중인 ${articleLabel}가 없습니다(부존재 신뢰도 ${nec.score}). 조문이 삭제·이동됐거나 존재하지 않는 조문입니다.`,
        sources,
        nec,
        ...dateField(search.effectiveDate),
      };
    }
    return necOutcome(claim, nec, ctx, { sources });
  }
  ctx.onProgress(`"${short(search.lawNameOfficial)}" ${articleLabel} 조문과 대조 중…`);
  const effectiveDate = article.effectiveDate || search.effectiveDate;
  const grounded = await ctx.ground(claim.text, article.text, {
    label: `법제처 국가법령정보 - ${search.lawNameOfficial}`,
    effectiveDate: formatDate(effectiveDate),
  });
  return official(
    claim,
    grounded.verdict || "uncertain",
    `${aliasNote}${grounded.explanation || article.text}`,
    [{ title: `${search.lawNameOfficial}${article.title ? " - " + article.title : ""}`, url: search.detailUrl }],
    effectiveDate,
  );
}

// 발령번호로 인용된 행정규칙(고시·훈령·예규). 법제처가 발령번호를 색인하지 않으므로
// 소관부처 목록을 훑어 번호를 직접 대조하고, 찾으면 조문 본문까지 받아 실제로 대조한다.
// 못 찾았을 때 '부존재'로 판정하는 것은 그 부처 목록을 끝까지 확인한 경우로 한정한다 —
// 부처를 특정하지 못했거나 목록이 상한을 넘으면 근거가 없는 것이므로 웹으로 넘긴다.
async function resolveAdminRuleByNumber(claim, ident, lawName, ctx) {
  const cite = parseAdminRuleCitation(lawName);
  ctx.onProgress(`행정규칙에서 "${short(lawName)}" 조회 중…`);
  const r = await findAdminRuleByNumber(cite.org, cite.kind, cite.issueNo);
  if (!r.ok || !r.resolved) return webFallback(claim, ctx, lawName);

  if (!r.found) {
    const coverage = coverageFor("admin_rule", [{ id: "law.go.kr:admrul", ok: true }]);
    const nec = buildNecReport({ identifier: ident, spaceKey: "admin_rule", coverage, similar: [], weights: WEIGHTS });
    return necOutcome(claim, nec, ctx, { spaceKey: "admin_rule", searched: [{ id: "law.go.kr:admrul", ok: true }], similar: [], identifier: ident });
  }

  const rule = r.item;
  const label = `${rule.owner} ${rule.kind} 제${rule.issueNo}호 「${rule.name}」`;
  const source = { title: `${rule.name} (${rule.kind} 제${rule.issueNo}호)`, url: rule.url };
  const article = ident.article;
  if (!article) {
    const web = await webFallback(claim, ctx);
    return { ...web, sources: [source, ...(web.sources || [])] };
  }

  const articleLabel = `제${article.no}조${article.branch ? `의${article.branch}` : ""}`;
  const art = await getAdminRuleArticle(rule.seq, article.no, article.branch);
  if (!art.ok) return webFallback(claim, ctx, lawName);
  if (!art.found) {
    const note = art.deleted
      ? `${articleLabel}는 삭제된 조문입니다.`
      : `${articleLabel}가 없습니다(마지막 조문은 제${art.maxArticleNo}조입니다).`;
    return official(claim, "false", `${label}는 실재하지만, 여기에는 ${note}`, [source], rule.effectiveDate);
  }

  ctx.onProgress(`"${short(rule.name)}" ${articleLabel} 조문과 대조 중…`);
  const grounded = await ctx.ground(claim.text, art.text, {
    label: `법제처 국가법령정보 - ${rule.name}`,
    effectiveDate: formatDate(art.effectiveDate || rule.effectiveDate),
  });
  const stale = rule.current ? "" : ` (이 ${rule.kind}는 현행이 아닙니다.)`;
  return official(
    claim,
    grounded.verdict || "uncertain",
    `${grounded.explanation || art.text}${stale}`,
    [{ ...source, title: `${rule.name}${art.title ? " - " + art.title : ""}` }],
    art.effectiveDate || rule.effectiveDate,
  );
}

// 자치법규·행정규칙은 조문 본문 대조 API가 따로라, 실재 여부만 공식 확인하고 내용은 웹으로 본다.
async function resolveNonNationalRule(claim, ident, name, spaceKey, searchFn, sourceId, ctx) {
  ctx.onProgress(`법제처에서 "${name}" 조회 중…`);
  const r = await searchFn(name);
  if (!r.ok) return webFallback(claim, ctx);
  if (r.found) {
    const web = await webFallback(claim, ctx);
    return { ...web, sources: [{ title: r.item.name, url: r.item.url }, ...(web.sources || [])] };
  }
  const similar = (r.candidates || [])
    .map((c) => ({ value: c.lawNameOfficial, url: c.detailUrl, similarity: lawNameSimilarity(name, c.lawNameOfficial) }))
    .filter((s) => s.similarity >= 0.5);
  const searched = [{ id: sourceId, ok: true }];
  const coverage = coverageFor(spaceKey, searched);
  const nec = buildNecReport({ identifier: ident, spaceKey, coverage, similar, weights: WEIGHTS });
  return necOutcome(claim, nec, ctx, { spaceKey, searched, similar, identifier: ident });
}

// ───────────────────────── 판례 ─────────────────────────
async function resolveCase(claim, ref, ctx) {
  const ident = checkCaseNumber(ref.case_number, ref.court);
  if (ident.F > T1_SKIP_SEARCH || !ident.code) {
    const nec = buildNecReport({ identifier: ident, spaceKey: caseSpaceKey(ident.level), skippedSearch: true, weights: WEIGHTS });
    return necOutcome(claim, nec, ctx);
  }
  const caseNo = ident.canonical;
  const isConstitutional = ident.level === "constitutional";
  ctx.onProgress(`${isConstitutional ? "헌법재판소 결정" : "판례"} ${caseNo} 조회 중…`);
  const search = isConstitutional ? await searchConstitutional(caseNo) : await searchPrecedent(caseNo);
  if (!search.ok) return webFallback(claim, ctx);

  if (search.found) {
    const detail = isConstitutional ? await getConstitutionalDetail(search.detcId) : await getPrecedentDetail(search.precId);
    if (!detail.ok || !detail.found || !detail.text) return webFallback(claim, ctx);
    const label = isConstitutional ? `헌법재판소 ${detail.caseNumber}` : `${detail.court || "대법원"} 판례 ${detail.caseNumber}`;
    ctx.onProgress(`${label} 원문과 대조 중…`);
    const grounded = await ctx.ground(claim.text, detail.text, { label });
    const fmtNote = ident.F > 0 ? ` (인용 표기 ‘${ref.case_number}’의 공식 표기는 ‘${caseNo}’입니다.)` : "";
    return official(
      claim,
      grounded.verdict || "uncertain",
      `${grounded.explanation || detail.text.slice(0, 150)}${fmtNote}`,
      [{ title: `${isConstitutional ? "헌법재판소" : detail.court} ${detail.caseNumber} ${detail.caseName || ""}`.trim(), url: search.detailUrl }],
    );
  }

  // 공식 DB에 없음 → 인용 기록과 근접 사건번호를 탐색해 커버리지·근접도를 구한다.
  ctx.onProgress(`${caseNo} 인용 기록과 유사 사건번호 확인 중…`);
  const searched = [{ id: isConstitutional ? "law.go.kr:detc" : "law.go.kr:prec", ok: true }];
  const similar = [];
  if (!isConstitutional) {
    const cit = await findCitations(caseNo);
    searched.push({ id: "law.go.kr:citation", ok: cit.ok });
    if (cit.ok && cit.cited) {
      const c = cit.citing[0];
      similar.push({ value: caseNo, title: `${c.court} ${c.caseNumber} 판결의 참조판례에 인용됨`, url: c.detailUrl, similarity: 1 });
    }
  }
  const variants = caseVariants(ident);
  const found = await Promise.all(
    variants.map(async (v) => {
      const vIdent = checkCaseNumber(v);
      const r = vIdent.level === "constitutional" ? await searchConstitutional(v) : await searchPrecedent(v);
      return r.ok && r.found ? { r, vIdent } : null;
    }),
  );
  for (const hit of found.filter(Boolean)) {
    similar.push({
      value: hit.r.caseNumber,
      title: [hit.r.court, hit.r.caseName].filter(Boolean).join(" "),
      url: hit.r.detailUrl,
      similarity: caseSimilarity(ident, hit.vIdent),
    });
  }
  const spaceKey = caseSpaceKey(ident.level);
  const coverage = coverageFor(spaceKey, searched);
  const nec = buildNecReport({ identifier: ident, spaceKey, coverage, similar, weights: WEIGHTS });
  return necOutcome(claim, nec, ctx, { spaceKey, searched, similar, identifier: ident });
}

// ───────────────────────── 판정 결합 ─────────────────────────
// 1차 NEC가 부존재 확실이면 바로 false. 확인 불가면 웹 탐색으로 검색공간을 넓혀(청구항 1의
// "하나 이상의 외부 참조 DB") 다시 산출한다. 웹에서 실재 흔적이 나오면 근접도 P=1로 반영.
async function necOutcome(claim, nec, ctx, widen = null) {
  const identLabel = nec.identifier.canonical;
  // 설명 문장에는 사용자가 본 표기 그대로(예: 1985헌마123), 웹 탐색에는 공식 표기를 쓴다.
  const cited = String(nec.identifier.value || identLabel).trim();
  if (nec.grade === "nonexistent") {
    return {
      ...claim,
      verdict: "false",
      verified_via: "nec",
      explanation: `인용된 ‘${cited}’은(는) 존재하지 않을 가능성이 높습니다(부존재 신뢰도 ${nec.score}). ${nec.summary}`,
      sources: widen?.sources || [],
      nec,
    };
  }
  if (!widen?.spaceKey) {
    const { identifier_found: _found, ...web } = await webFallback(claim, ctx, identLabel);
    return { ...web, nec, sources: [...(widen?.sources || []), ...(web.sources || [])] };
  }

  const web = await webFallback(claim, ctx, identLabel);
  const webOk = web.verified_via === "web";
  const similar = [...widen.similar];
  if (webOk && web.identifier_found) {
    similar.push({ value: identLabel, title: "웹 자료에서 실재 흔적 확인", url: web.sources?.[0]?.url || null, similarity: 1 });
  }
  const coverage = coverageFor(widen.spaceKey, [...widen.searched, { id: "web", ok: webOk }]);
  const nec2 = buildNecReport({ identifier: widen.identifier, spaceKey: widen.spaceKey, coverage, similar, weights: WEIGHTS });
  const { identifier_found: _f, ...webRest } = web;
  if (nec2.grade === "nonexistent") {
    return {
      ...webRest,
      verdict: "false",
      verified_via: "nec",
      explanation: `인용된 ‘${cited}’은(는) 공식 DB·인용 기록·웹 어디에서도 확인되지 않아 존재하지 않을 가능성이 높습니다(부존재 신뢰도 ${nec2.score}).`,
      sources: [...(widen.sources || []), ...(web.sources || [])],
      nec: nec2,
    };
  }
  return {
    ...webRest,
    verdict: web.verdict === "confirmed" && !web.identifier_found ? "uncertain" : web.verdict,
    explanation:
      web.verdict === "confirmed" && !web.identifier_found
        ? `공식 자료에서 ‘${cited}’을(를) 확인하지 못해 판단을 보류합니다. ${nec2.summary}`
        : web.explanation,
    sources: [...(widen.sources || []), ...(web.sources || [])],
    nec: nec2,
  };
}

async function webFallback(claim, ctx, identifier = null) {
  ctx.onProgress(`웹에서 "${claim.text.slice(0, 12)}${claim.text.length > 12 ? "…" : ""}" 관련 자료 확인 중…`);
  try {
    const result = await ctx.webVerify(claim.text, ctx.onProgress, { identifier });
    return {
      ...claim,
      verdict: result.verdict,
      verified_via: "web",
      explanation: result.explanation,
      sources: result.sources || [],
      ...(identifier ? { identifier_found: !!result.identifier_found } : {}),
    };
  } catch (e) {
    // 일시적 오류(타임아웃·레이트리밋)로 한 번 실패했다고 판단을 포기하지 않는다.
    try {
      const retry = await ctx.webVerify(claim.text, ctx.onProgress, { identifier });
      return {
        ...claim,
        verdict: retry.verdict,
        verified_via: "web",
        explanation: retry.explanation,
        sources: retry.sources || [],
        ...(identifier ? { identifier_found: !!retry.identifier_found } : {}),
      };
    } catch {
      // 여기까지 오면 마지막 관문(resolveUncertainClaims)이 한 번 더 시도한다.
      return unavailable(claim, `공식 데이터 조회와 웹 검색이 모두 실패했습니다(${e.message}). 잠시 후 다시 시도하면 확인될 수 있습니다.`);
    }
  }
}

function formatDate(raw) {
  if (!raw || !/^\d{8}$/.test(raw)) return "";
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}.`;
}

function dateField(raw) {
  const d = formatDate(raw);
  return d ? { effective_date: d } : {};
}

function official(claim, verdict, explanation, sources, effectiveDateRaw) {
  return { ...claim, verdict, verified_via: "official", explanation, sources, ...dateField(effectiveDateRaw) };
}

function unavailable(claim, explanation) {
  return { ...claim, verdict: "uncertain", verified_via: "unavailable", explanation, sources: [] };
}

function dedupeBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter((x) => (seen.has(keyFn(x)) ? false : seen.add(keyFn(x))));
}

function stripInternal(similar) {
  return similar.map(({ _law, ...rest }) => rest);
}
