// YUME 검증 마크 — 발급·갱신·철회·조회. 규칙은 trustMarkRules.js, 공개 화면은 renderMarkPage.js.
//
// 발급은 문서 검사(documents.js) 결과로만 한다. 웹 화면과 API(/v1/documents/:id/mark)가
// 같은 함수를 부른다. 같은 계정이 같은 글(원문 지문이 같은 글)로 다시 발급하면 새 마크를 만들지
// 않고 기존 마크를 갱신한다 — 고객 홈페이지에 붙어 있는 마크 코드(주소)가 그대로 살아 있어야 한다.
import { all, now, one, run } from "./db.js";
import { getDocumentView } from "./documents.js";
import { MARK_VALID_MS, markEligibility, markHash, markSnapshot, markStatus, newMarkId } from "./trustMarkRules.js";

// 마크 주소의 앞부분. 고객 홈페이지에 박히는 주소라 운영 도메인이 기본이고, 로컬 개발에서만 요청 호스트를 쓴다.
export function markBase(req = null) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = String(req?.get?.("host") || "");
  if (/^(localhost|127\.|\[::1\])/.test(host)) return `${req.protocol}://${host}`;
  return "https://www.yume-reamer.com";
}

// 외부(고객·API)에 내보내는 마크 모습.
export function publicMark(row, base = markBase()) {
  const url = `${base}/v/${row.id}`;
  const status = markStatus(row);
  return {
    id: row.id,
    object: "mark",
    status,
    title: row.title || null,
    claims: JSON.parse(row.claims_json || "[]").length,
    text_hash: row.text_hash,
    issued_at: new Date(Number(row.issued_at)).toISOString(),
    first_issued_at: new Date(Number(row.first_issued_at)).toISOString(),
    expires_at: new Date(Number(row.expires_at)).toISOString(),
    renewals: Number(row.renewals || 0),
    revoked_at: row.revoked_at ? new Date(Number(row.revoked_at)).toISOString() : null,
    url,
    certificate_url: `${url}/certificate`,
    badge_url: `${url}/badge.svg`,
    // 원문을 감싼 요소의 글자를 지문과 대조해, 글이 바뀌면 "원문 변경됨"으로 바꿔 보여 준다.
    embed_html: `<div data-yume-mark="${row.id}">\n  <!-- 검증받은 글을 이 안에 그대로 두세요 -->\n</div>\n<script src="${base}/v/embed.js" async></script>`,
    // 스크립트를 쓸 수 없는 곳(블로그·메일·PDF)용. 상태만 보여 주고 원문 변경은 감지하지 못한다.
    badge_html: `<a href="${url}" target="_blank" rel="noopener"><img src="${url}/badge.svg" alt="YUME 검증" height="30"></a>`,
  };
}

export const getMark = (id) => one("SELECT * FROM trust_marks WHERE id = :id", { id });

export function listUserMarks(userId, limit = 50) {
  return all("SELECT * FROM trust_marks WHERE user_id = :u ORDER BY issued_at DESC LIMIT :limit", { u: userId, limit });
}

// 이 문서로 발급할 수 있는지 + 같은 글로 이미 받은 마크(있으면 갱신 대상).
export async function markStateForDocument(view, userId, base = markBase()) {
  const eligibility = markEligibility(view);
  const hash = markHash(view.text || "");
  const existing = userId
    ? await one("SELECT * FROM trust_marks WHERE user_id = :u AND text_hash = :h AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1", { u: userId, h: hash })
    : null;
  return { ...eligibility, existing: existing ? publicMark(existing, base) : null };
}

/**
 * 문서 검사 결과로 마크를 발급(또는 갱신)한다.
 * owner: { userId } — 문서를 만든 계정. 웹 문서는 user_id, API 문서는 만든 키의 계정으로 확인한다
 * (조회 API와 같은 규칙 — 같은 계정의 다른 키로도 발급할 수 있다).
 * 반환: { mark, renewed } 또는 { error: { status, code, message, blockers? } }
 */
export async function issueMark(docId, owner, { publish = false, base = markBase() } = {}) {
  const got = await getDocumentView(String(docId || ""));
  const docOwner = got
    ? got.doc.user_id ?? (got.doc.api_key_id ? (await one("SELECT user_id FROM api_keys WHERE id = :k", { k: got.doc.api_key_id }))?.user_id : null)
    : null;
  if (!got || docOwner == null || Number(docOwner) !== Number(owner.userId)) {
    return { error: { status: 404, code: "not_found", message: "문서를 찾을 수 없습니다." } };
  }
  if (publish !== true) {
    return { error: { status: 400, code: "publish_consent_required", message: "검증 마크를 받으면 이 글과 검증 결과가 공개 검증 페이지에 게시됩니다. 동의하시면 publish: true로 보내주세요." } };
  }
  const { view } = got;
  const ok = markEligibility(view);
  if (!ok.ok) return { error: { status: 422, code: "not_eligible", message: ok.reason, blockers: ok.blockers } };

  const userId = Number(docOwner);

  const hash = markHash(view.text);
  const claims = JSON.stringify(markSnapshot(view.result.claims));
  const t = now();
  const existing = await one(
    "SELECT * FROM trust_marks WHERE user_id = :u AND text_hash = :h AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1",
    { u: userId, h: hash },
  );
  if (existing) {
    // 같은 글을 다시 검사해 통과했다 — 주소는 그대로 두고 판정·근거·유효기간만 새로 쓴다.
    await run(
      `UPDATE trust_marks SET document_id = :d, title = COALESCE(:title, title), claims_json = :c, issued_at = :t,
         expires_at = :e, renewals = renewals + 1 WHERE id = :id`,
      { d: view.id, title: view.title || null, c: claims, t, e: t + MARK_VALID_MS, id: existing.id },
    );
    return { mark: publicMark(await getMark(existing.id), base), renewed: true };
  }
  const id = newMarkId();
  await run(
    `INSERT INTO trust_marks (id, user_id, document_id, title, text, text_hash, claims_json, first_issued_at, issued_at, expires_at, created_at)
     VALUES (:id, :u, :d, :title, :text, :h, :c, :t, :t, :e, :t)`,
    { id, u: userId, d: view.id, title: view.title || null, text: view.text, h: hash, c: claims, t, e: t + MARK_VALID_MS },
  );
  return { mark: publicMark(await getMark(id), base), renewed: false };
}

// 철회 — 발급받은 계정이 내리거나(글을 내렸을 때), 운영자가 내린다(정정 제보가 채택됐을 때).
// 기록은 지우지 않는다. 이미 퍼진 마크를 누른 사람이 "철회됨"을 봐야 하기 때문이다.
// 원문은 지워 공개를 멈춘다.
export async function revokeMark(id, { userId = null, reason = "", base = markBase() } = {}) {
  const row = await getMark(String(id || ""));
  if (!row || (userId != null && Number(row.user_id) !== Number(userId))) return { error: "마크를 찾을 수 없어요." };
  if (row.revoked_at) return { mark: publicMark(row, base) };
  await run("UPDATE trust_marks SET revoked_at = :t, revoked_reason = :r, text = '' WHERE id = :id", {
    t: now(), r: String(reason || (userId != null ? "발급자가 철회" : "운영자가 철회")).slice(0, 300), id: row.id,
  });
  return { mark: publicMark(await getMark(row.id), base) };
}
