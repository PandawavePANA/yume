// 있는 걸 없다고 하는 주장도, 없는 걸 있다고 하는 주장도 똑같이 잡는다.
//
// 부존재 판정 경로(판례·조문·DOI, 일반 주장의 부존재 신뢰도)는 "인용한 대상이 공식 자료에 있나"를
// 확인한다. 예전에는 그 결과를 곧바로 판정으로 썼다 — 대상이 없으면 "사실과 다름". 그런데 주장이
// "그런 판례는 존재하지 않는다"라면 대상이 없다는 확인은 주장이 **맞다**는 뜻이다. 거꾸로 "민법에는
// 제750조가 없다"는 대상이 실재하면 틀린 말이다. AI가 다른 AI의 답을 고쳐 주는 글, "그런 통계는
// 발표된 적 없다"는 답변이 모두 이 모양이다. 방향을 보지 않으면 맞는 정정을 거짓이라 하고,
// 실재하는 권리·근거를 "없다"고 한 답은 놓친다. 후자가 더 해롭다 — 사용자가 쓸 수 있는 것을 버린다.
//
// 그래서 파이프라인은 "대상이 있다/없다"라는 사실만 existence로 남기고, 판정은 여기서 주장의
// 방향(absence_of — 추출 단계가 채운다)과 맞춰 정한다. 이 파일은 db를 부르지 않는다.

// 추출 결과가 없을 때(예전 캐시 등)만 쓰는 보조 판별. "책임이 없다"처럼 내용으로서의 "없다"는
// 잡지 않도록, 존재·조회를 부정하는 표현만 본다.
const DENIAL_RE = /(존재하지\s*않|실재하지\s*않|찾을\s*수\s*없|조회되지\s*않|검색되지\s*않|확인되지\s*않는\s*(판례|사건|조문|문헌|논문|자료|통계)|(발표|공표|선고|제정|출간|등재)된\s*적(이)?\s*없|없는\s*(조문|조항|판례|사건번호|문헌|논문|법령|통계)|(조문|조항|판례|사건번호|문헌|논문|법령|통계|DOI|항|호)(은|는|이|가)?\s*없(다|습니다|음))/i;

/** 이 주장이 "무엇이 없다"고 말하면 그 대상을, 아니면 null. */
export function absenceTarget(claim) {
  const t = typeof claim?.absence_of === "string" ? claim.absence_of.trim() : "";
  if (t) return t;
  if (claim && "absence_of" in claim) return null; // 추출 단계가 "없음"으로 답했다
  return DENIAL_RE.test(String(claim?.text || "")) ? String(claim.text) : null;
}

export const isDenial = (claim) => absenceTarget(claim) != null;

// 대상 비교용 열쇠. 사건번호·DOI는 그 부분만, 나머지(법령 조문)는 띄어쓰기·괄호·"제"를 뺀 글자.
export function targetKey(s) {
  const str = String(s || "");
  const doi = str.match(/10\.\d{4,9}\/[^\s"'’”)]+/i);
  if (doi) return `doi:${doi[0].toLowerCase().replace(/[.,]+$/, "")}`;
  const cs = str.match(/(\d{2,4})\s*([가-힣]{1,3})\s*(\d{1,7})/);
  if (cs && !/조/.test(cs[2])) return `case:${cs[1]}${cs[2]}${cs[3]}`;
  return str
    .toLowerCase()
    .replace(/[\s「」『』"'‘’“”()[\].,·:]/g, "")
    .replace(/제(\d)/g, "$1");
}

/**
 * 대상이 같은지. 같을 때만 판정을 뒤집는다 — "민법 제750조 제3항이 없다"에 "민법 제750조가 있다"는
 * 결과를 대면 안 된다(그 판단은 조문 원문 대조가 한다).
 * 주장 문장 전체가 대상으로 넘어온 경우(보조 판별)는 그 안에 대상이 들어 있으면 같다고 본다.
 */
export function sameTarget(target, found) {
  const a = targetKey(target);
  const b = targetKey(found);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith("case:") || b.startsWith("doi:")) return a === b || String(target).replace(/\s/g, "").includes(b.slice(b.indexOf(":") + 1));
  return false;
}

/**
 * 파이프라인이 남긴 existence({ status: "absent"|"present", target, label, sources, score })를
 * 주장의 방향과 맞춰 판정으로 바꾼다. existence는 내부용이라 결과에서 지운다.
 */
export function applyStance(claim) {
  if (!claim || !claim.existence) return claim;
  const { existence: ex, ...c } = claim;
  const target = absenceTarget(c);
  if (!target || !sameTarget(target, ex.target)) return c;
  const label = ex.label || ex.target;
  if (ex.status === "absent") {
    return {
      ...c,
      verdict: "confirmed",
      verified_via: "nec",
      stance: "denies",
      explanation: `‘${label}’은(는) 공식 자료 어디에서도 확인되지 않습니다${ex.score != null ? `(부존재 신뢰도 ${ex.score})` : ""}. "없다"는 이 주장은 맞습니다.`,
      ...(ex.sources?.length ? { sources: ex.sources } : {}),
    };
  }
  if (ex.status === "present") {
    const src = (ex.sources || []).filter((s) => s && s.url);
    return {
      ...c,
      verdict: "false",
      verified_via: c.verified_via === "nec" || !c.verified_via ? "official" : c.verified_via,
      stance: "denies",
      explanation: `‘${label}’은(는) 실제로 존재합니다${src[0]?.title ? `(${src[0].title})` : ""}. "없다"는 이 주장은 사실과 다릅니다.`,
      sources: [...src, ...(c.sources || []).filter((s) => !src.some((x) => x.url === s.url))].slice(0, 4),
    };
  }
  return c;
}
