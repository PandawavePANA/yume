// domain === "법률" claim만 골라 법제처 공식 데이터로 조회하고,
// 조회된 실제 텍스트를 근거로 grounding 판정을 내린 뒤 원래 claim에 병합한다.
// 조문/판례 번호를 특정하지 못하거나 공식 조회가 실패해도 "모른다"로 끝내지 않고,
// 웹 검색 폴백(verifyLegalClaimViaWeb)으로 최선의 답을 낸다.
// 비법률 claim은 손대지 않고 그대로 통과시킨다.
import { hasOC, searchStatute, getStatuteArticle, searchPrecedent, getPrecedentDetail } from "./lawApi.js";
import { groundLegalClaim as defaultGround, verifyLegalClaimViaWeb as defaultWebVerify } from "./claude.js";

export async function resolveLegalClaims(claims, { ground = defaultGround, webVerify = defaultWebVerify, onProgress = () => {} } = {}) {
  return Promise.all(
    claims.map((claim) => (claim.domain === "법률" ? resolveOne(claim, ground, webVerify, onProgress) : claim))
  );
}

async function resolveOne(claim, ground, webVerify, onProgress) {
  if (!hasOC()) {
    return webFallback(claim, webVerify, onProgress);
  }

  const ref = claim.legal_ref || { type: "unspecified" };
  try {
    if (ref.type === "statute" && ref.law_name) return await resolveStatute(claim, ref, ground, webVerify, onProgress);
    if (ref.type === "case" && ref.case_number) return await resolvePrecedent(claim, ref, ground, webVerify, onProgress);
    return await webFallback(claim, webVerify, onProgress);
  } catch (e) {
    return webFallback(claim, webVerify, onProgress);
  }
}

async function resolveStatute(claim, ref, ground, webVerify, onProgress) {
  onProgress(`법제처에서 "${ref.law_name}" 조회 중…`);
  const search = await searchStatute(ref.law_name);
  if (!search.ok) return webFallback(claim, webVerify, onProgress);
  if (!search.found) {
    return official(claim, "false", `법제처 국가법령정보에서 "${ref.law_name}"이라는 법령을 찾을 수 없습니다.`, []);
  }
  if (search.versionStatus !== "current") {
    // 현재 시행 중인 버전을 단정할 수 없는 상태(폐지되어 연혁만 남았거나, 아직 시행 전인
    // 개정판만 검색됨) — 함부로 confirmed/false로 단정하지 않고 정직하게 uncertain 처리.
    const note = search.versionStatus === "upcoming_only"
      ? "검색된 버전이 아직 시행되지 않은 개정 예정 조문뿐이라"
      : "현재 시행 중인 버전을 확인할 수 없고 과거(연혁) 조문만 검색되어";
    return official(
      claim, "uncertain",
      `"${search.lawNameOfficial}"의 개정 이력을 법제처 API에서 명확히 확인할 수 없습니다(${note}). 최신 조문과의 일치 여부는 미확인입니다.`,
      [{ title: search.lawNameOfficial, url: search.detailUrl }]
    );
  }
  if (!ref.article) {
    return official(
      claim, "uncertain",
      `"${search.lawNameOfficial}" 법령은 실재하지만, 구체적인 조문 번호가 없어 조문 내용까지는 확인하지 못했습니다.`,
      [{ title: search.lawNameOfficial, url: search.detailUrl }],
      search.effectiveDate
    );
  }
  const article = await getStatuteArticle(search.mst, ref.article);
  if (!article.ok) return webFallback(claim, webVerify, onProgress);
  if (!article.found) {
    return official(
      claim, "false",
      `"${search.lawNameOfficial}"에서 "${ref.article}"에 해당하는, 현재 시행 중인 조문을 찾을 수 없습니다. 조문 번호가 삭제·이동되었거나 존재하지 않는 조문일 수 있습니다.`,
      [{ title: search.lawNameOfficial, url: search.detailUrl }],
      search.effectiveDate
    );
  }
  onProgress(`"${search.lawNameOfficial}" 제${ref.article} 공식 조문과 대조 중…`);
  const effectiveDate = article.effectiveDate || search.effectiveDate;
  const grounded = await ground(claim.text, article.text, {
    label: `법제처 국가법령정보 - ${search.lawNameOfficial}`,
    effectiveDate: formatDate(effectiveDate),
  });
  return official(
    claim, grounded.verdict || "uncertain", grounded.explanation || article.text,
    [{ title: `${search.lawNameOfficial}${article.title ? " - " + article.title : ""}`, url: search.detailUrl }],
    effectiveDate
  );
}

function formatDate(raw) {
  if (!raw || !/^\d{8}$/.test(raw)) return "";
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}.`;
}

async function resolvePrecedent(claim, ref, ground, webVerify, onProgress) {
  onProgress(`대법원 판례 ${ref.case_number} 조회 중…`);
  const search = await searchPrecedent(ref.case_number);
  if (!search.ok) return webFallback(claim, webVerify, onProgress);
  if (!search.found) {
    return official(claim, "false", `법제처 판례 데이터베이스에서 사건번호 "${ref.case_number}"를 찾을 수 없습니다.`, []);
  }
  const detail = await getPrecedentDetail(search.precId);
  if (!detail.ok || !detail.found) return webFallback(claim, webVerify, onProgress);
  onProgress(`판례 ${detail.caseNumber} 원문과 대조 중…`);
  const grounded = await ground(claim.text, detail.text, { label: `대법원 판례 ${detail.caseNumber}` });
  return official(
    claim, grounded.verdict || "uncertain", grounded.explanation || detail.text.slice(0, 150),
    [{ title: `${detail.court} ${detail.caseNumber} ${detail.caseName || ""}`.trim(), url: search.detailUrl }]
  );
}

async function webFallback(claim, webVerify, onProgress) {
  onProgress(`공식 데이터로 특정할 수 없어, 웹에서 "${claim.text.slice(0, 24)}${claim.text.length > 24 ? "…" : ""}" 관련 최신 자료 확인 중…`);
  try {
    const result = await webVerify(claim.text);
    return { ...claim, verdict: result.verdict, verified_via: "web", explanation: result.explanation, sources: result.sources || [] };
  } catch (e) {
    return unavailable(claim, `공식 데이터와 웹 검색 모두 확인하지 못했습니다: ${e.message}`);
  }
}

function official(claim, verdict, explanation, sources, effectiveDateRaw) {
  const effective_date = formatDate(effectiveDateRaw);
  return { ...claim, verdict, verified_via: "official", explanation, sources, ...(effective_date ? { effective_date } : {}) };
}

function unavailable(claim, explanation) {
  return { ...claim, verdict: "uncertain", verified_via: "unavailable", explanation, sources: [] };
}
