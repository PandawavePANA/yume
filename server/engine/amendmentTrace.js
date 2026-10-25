// 베리라인 엔진 — 개정 추적. 2026-10-25.
//
// AI가 법을 틀리게 말하는 가장 흔한 이유는 "옛 법"이다. 학습 시점의 조문을 그대로 말한다.
// 현행 조문과 대조해 틀렸다고만 하면 고객은 "왜 틀렸는지"를 모른다. 이 모듈은 확정된 오류의 수치가
// 바로 전 버전들(연혁)에는 있었는지 찾아, "개정 전 내용 — 2025.2.23 시행 개정으로 바뀜"처럼 원인과 시점을 붙인다.
// 이것이 '현행 조문만 붙여 묻는' 방식으로는 나오지 않는 정보다(그 방식은 옛 버전을 보지 않는다).
// 법제처 호출은 최대 8번(버전마다 조문 1개), 실패하면 조용히 건너뛴다(판정은 이미 현행 조문으로 끝났다).
import { getStatuteArticleAt, listStatuteVersions } from "../lawApi.js";
import { contextMatch, contextMismatch, extractQuantities, sanctionKinds } from "./quantities.js";

const MAX_CALLS = 8;
const squash = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, "");
const fmt = (d) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${Number(d.slice(4, 6))}.${Number(d.slice(6))}` : d);

/** 글의 값(수치 · 제재)이 옛 조문에 있고 현행 조문에는 없는가. */
export function matchesOld(claimText, oldText, currentText) {
  const cq = extractQuantities(claimText);
  const oq = extractQuantities(oldText);
  const nq = extractQuantities(currentText);
  const has = (list, q) => list.some((x) => x.dim === q.dim && Math.abs(x.base - q.base) < 1e-9);
  const hit = cq.find((q) => has(oq, q) && !has(nq, q));
  if (hit) return { by: "number", value: hit.raw };
  // 같은 값이 현행 조문 다른 자리에도 있으면 위에서 못 잡는다 — 같은 꼬리("에 한정하여")로 맞춰 본다:
  // 옛 조문은 그 자리에 글의 값을, 현행 조문은 그 자리에 다른 값을 둔다.
  const ctxHit = cq.find((q) => contextMatch(claimText, q, oldText) && contextMismatch(claimText, q, currentText));
  if (ctxHit) return { by: "number", value: ctxHit.raw };
  const cs = sanctionKinds(claimText);
  const os = new Set(sanctionKinds(oldText));
  const ns = new Set(sanctionKinds(currentText));
  const s = cs.find((k) => os.has(k) && !ns.has(k));
  return s ? { by: "sanction", value: s } : null;
}

/**
 * @param {{law:string, no:number, branch?:number|null, claimText:string, currentText:string}} x
 * @returns {Promise<null|{outdated:true, value:string, oldEffective:string, changedOn:string, note:string}>}
 */
export async function traceAmendment(x, { versionsFn = listStatuteVersions, articleFn = getStatuteArticleAt } = {}) {
  if (!x?.law || !x?.no || !x.claimText) return null;
  const versions = await versionsFn(x.law).catch(() => []);
  const cur = versions.findIndex((v) => v.status === "현행");
  if (cur < 0) return null;
  // 연혁은 다른 조문만 바뀐 개정도 많다 — 이 조문 문언이 실제로 달라진 버전만 본다(법제처 호출은 최대 MAX_CALLS번).
  const older = versions.slice(cur + 1, cur + 1 + MAX_CALLS);
  let lastText = squash(x.currentText);
  let since = versions[cur].effective; // lastText 문언이 적어도 이때부터 있었다
  for (const v of older) {
    const art = await articleFn(v.mst, v.effective, x.no, x.branch || null).catch(() => null);
    if (!art?.found) continue;
    const t = squash(art.text);
    if (t === lastText) { since = v.effective; continue; }
    const m = matchesOld(x.claimText, art.text, x.currentText);
    if (m) {
      return {
        outdated: true,
        value: m.value,
        oldEffective: v.effective,
        changedOn: since,
        note: `개정 전 내용입니다 — "${m.value}"는 ${fmt(v.effective)} 시행본의 문언이고, ${fmt(since)} 시행 개정으로 바뀌었습니다.`,
      };
    }
    lastText = t;
    since = v.effective;
  }
  return null;
}
