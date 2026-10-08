// YUME 검증 마크 — 규칙만 모은 곳(db를 부르지 않는다. 테스트가 DB 없이 돈다).
//
// 마크는 "이 글의 사실 주장이 모두 공개 원문으로 확인됐다"는 표시다. 한 번이라도 틀린 글에
// 붙으면 마크 전체의 값어치가 사라지므로 발급 기준은 엄격하게 둔다.
//
//   · 모든 주장이 '확인됨'이고 확신도가 high여야 한다 — 출처 페이지에서 근거 문장을 서버가
//     직접 확인했고(evidenceLock.js), 처음 판정을 모르는 독립 검토도 같은 결론이거나,
//     법령 원문·부존재 신뢰도·기준 자료 대조처럼 스스로 근거를 갖는 판정.
//   · '사실과 다름'·'확인되지 않음'(근거 없음 포함)이 하나라도 있으면 발급하지 않는다.
//   · 사실 주장이 하나도 없는 글(의견·감상)에는 발급하지 않는다. 확인한 게 없으니까.
//
// 마크는 "보증"이 아니라 "검증"이다. 무엇을, 언제, 어떤 원문으로 확인했는지 공개하는 것이
// 마크의 힘이고, 글쓴이·회사·상품을 보증하지 않는다. 사실은 바뀌므로 유효기간을 둔다.
import crypto from "node:crypto";

export const MARK_VALID_DAYS = 90;
export const MARK_VALID_MS = MARK_VALID_DAYS * 24 * 3600 * 1000;

// 원문 지문. 같은 글을 웹 페이지에 붙이면 줄바꿈·띄어쓰기가 DOCX와 달라지므로 공백은 모두
// 지우고 비교한다. 글자(숫자·문장부호 포함)가 하나라도 바뀌면 지문이 바뀐다.
// ⚠ 브라우저 쪽(renderMarkPage.js의 EMBED_JS·원문 대조)도 똑같이 정규화한다. 바꾸면 둘 다.
export const MARK_NORMALIZE_SOURCE = String.raw`/[\s​-‍⁠﻿]+/g`;
const NORMALIZE = /[\s​-‍⁠﻿]+/g;
export const markText = (text) => String(text || "").normalize("NFC").replace(NORMALIZE, "");
export const markHash = (text) => crypto.createHash("sha256").update(markText(text), "utf8").digest("hex");

export const newMarkId = () => `ym${crypto.randomBytes(7).toString("base64url").replace(/[-_]/g, "x")}`;
export const validMarkId = (id) => /^ym[A-Za-z0-9]{6,20}$/.test(String(id || ""));

const WHY = {
  false: "사실과 다른 내용이 있습니다",
  uncertain: "근거를 확인하지 못한 내용이 있습니다",
  medium: "출처 원문에서 근거 문장을 직접 확인하지 못했습니다",
};

/**
 * 문서 검사 결과(getDocumentView의 view)로 마크를 줄 수 있는지 판단한다.
 * 반환: { ok, reason?, blockers: [{ index, text, why }] }
 */
export function markEligibility(view) {
  if (!view || view.status !== "done" || !view.result) {
    return { ok: false, reason: "검사가 끝나지 않았거나 일부를 검사하지 못했습니다. 전체 검사가 끝난 문서에만 발급합니다.", blockers: [] };
  }
  const claims = view.result.claims || [];
  if (!claims.length) {
    return { ok: false, reason: "확인할 사실 주장이 없습니다. 검증 마크는 사실 주장이 담긴 글에만 발급합니다.", blockers: [] };
  }
  const blockers = [];
  claims.forEach((c, index) => {
    if (c.verdict === "false") blockers.push({ index, text: c.text, why: WHY.false });
    else if (c.verdict !== "confirmed") blockers.push({ index, text: c.text, why: WHY.uncertain });
    else if (c.confidence !== "high") blockers.push({ index, text: c.text, why: WHY.medium });
  });
  if (blockers.length) {
    return { ok: false, reason: `주장 ${claims.length}개 중 ${blockers.length}개가 기준을 넘지 못했습니다. 고친 뒤 다시 검사하면 발급할 수 있습니다.`, blockers };
  }
  return { ok: true, blockers: [] };
}

const VIA = {
  official: "법령 원문 대조(법제처)",
  reference: "발급 기업이 제출한 기준 자료와 대조",
  nec: "공식 기록 존재 여부 확인",
  web: "공개 출처 원문 대조",
  research: "공개 출처 원문 대조",
  legal_web: "공개 출처 원문 대조",
  cache: "공개 출처 원문 대조",
};
export const viaLabel = (via) => VIA[via] || "공개 출처 원문 대조";

// 공개 페이지에 싣는 주장 모습. 내부 판단 흔적(locked_out 등)은 싣지 않는다.
// 기준 자료 대조 주장은 그 자료가 비공개이므로 출처 대신 그렇다고만 적는다.
export function markSnapshot(claims) {
  return (claims || []).map((c) => {
    const ref = c.verified_via === "reference";
    const sources = ref
      ? []
      : (c.sources || [])
          .filter((s) => s && s.url)
          .slice(0, 3)
          .map((s) => ({ title: String(s.title || s.url).slice(0, 160), url: String(s.url).slice(0, 500), quote: s.quote ? String(s.quote).slice(0, 400) : "" }));
    const ev = c.evidence && c.evidence.status === "verified" && !ref ? { url: c.evidence.url || "", quote: String(c.evidence.quote || "").slice(0, 400) } : null;
    return {
      text: String(c.text || "").slice(0, 500),
      quote: String(c.quote || "").slice(0, 500),
      via: c.verified_via || "web",
      via_label: viaLabel(c.verified_via),
      evidence: ev,
      sources,
      explanation: String(c.explanation || "").slice(0, 400),
    };
  });
}

/** valid · expired(재확인 필요) · revoked(철회) */
export function markStatus(mark, at = Date.now()) {
  if (!mark) return "missing";
  if (mark.revoked_at) return "revoked";
  if (Number(mark.expires_at) <= at) return "expired";
  return "valid";
}

export const STATUS_LABEL = {
  valid: "검증됨",
  expired: "재확인 필요",
  revoked: "철회됨",
  changed: "원문 변경됨",
  missing: "기록 없음",
};
export const STATUS_COLOR = {
  valid: "#2E7D56",
  expired: "#B4690E",
  revoked: "#8B8694",
  changed: "#B3312F",
  missing: "#8B8694",
};

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// 이미지로 붙이는 배지(스크립트를 못 쓰는 블로그·PDF·메일용). 원문 변경은 감지할 수 없고 상태만 보여 준다.
export function badgeSvg(status) {
  const label = STATUS_LABEL[status] || STATUS_LABEL.missing;
  const color = STATUS_COLOR[status] || STATUS_COLOR.missing;
  const right = 18 + label.length * 13;
  const w = 104 + right;
  const icon = status === "valid" ? "M8 14.5l4 4 8-9" : "M14 9v6M14 19v.01";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="30" viewBox="0 0 ${w} 30" role="img" aria-label="YUME 검증: ${escXml(label)}">
<title>YUME 검증: ${escXml(label)}</title>
<rect width="${w}" height="30" rx="15" fill="#1F1B2E"/>
<rect x="104" width="${right}" height="30" rx="15" fill="${color}"/>
<rect x="104" width="15" height="30" fill="${color}"/>
<circle cx="15" cy="15" r="9" fill="#A88BEA"/>
<path d="${icon}" transform="translate(1 1) scale(0.93)" stroke="#1F1B2E" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="30" y="19.5" fill="#fff" font-family="-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif" font-size="12.5" font-weight="700" letter-spacing="0.4">YUME 검증</text>
<text x="${104 + right / 2}" y="19.5" fill="#fff" text-anchor="middle" font-family="-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif" font-size="12.5" font-weight="700">${escXml(label)}</text>
</svg>`;
}
