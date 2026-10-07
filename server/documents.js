// 긴 문서 검사 — 기업이 실제로 검사하는 단위.
//
// 검증 한 건은 1만 자까지다. 보도자료 한 장은 들어가지만 상품 설명서·약관·보고서는 넘는다.
// "나눠서 넣으세요"라고 하면 고객이 직접 자르다가 문장 중간을 끊고, 결과를 다시 합치다 그만둔다.
// 그래서 서버가 문단 경계에서 나누고(조각마다 검증 1건), 결과를 원문 기준으로 다시 합친다.
//
//   · 위치(span)는 조각 안의 위치에 조각 시작점을 더해 원문 전체 기준으로 돌려준다.
//   · 고친 문장(suggested_fix)을 원문에 실제로 반영한 "고친 본문"을 함께 만든다 —
//     기업이 결과를 받고 하는 일이 결국 그것이다.
//   · 과금은 조각 수만큼(조각 1개 = 검증 1건). 한도가 모자라면 한 조각도 시작하지 않는다.
//   · 기준 자료·자사명·웹훅·멱등 키는 단건 API와 같은 규칙이다.
import crypto from "node:crypto";
import { all, now, one, run } from "./db.js";
import { finishApiUsage, quotaUsage, recordApiUsage } from "./apiKeys.js";
import { getVerification, newVerificationId } from "./verificationStore.js";
import { extractFileText } from "./fileText.js";
import { startVerificationsLimited } from "./verifyPipeline.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { applyFixes, splitDocument } from "./documentText.js";

export { applyFixes, splitDocument };
export const MAX_DOCUMENT_CHARS = 100_000;
const CHUNK_CONCURRENCY = 3;

export const newDocumentId = () => `doc_${crypto.randomBytes(8).toString("hex")}`;

// 요청 본문에서 검사할 글을 꺼낸다 — text 또는 file({ name, content_base64 }).
// 파일 형식이 틀리면 FileTextError를 던진다(부르는 쪽이 400으로 돌려준다).
export async function documentInput(body) {
  if (typeof body?.text === "string" && body.text.trim()) {
    return { text: body.text.replace(/\r\n?/g, "\n").trim(), title: typeof body.title === "string" ? body.title : "" };
  }
  const f = body?.file;
  if (f && typeof f.content_base64 === "string" && f.content_base64) {
    const buffer = Buffer.from(f.content_base64, "base64");
    const text = await extractFileText({ name: typeof f.name === "string" ? f.name : "", buffer });
    return { text, title: (typeof body.title === "string" && body.title) || f.name || "" };
  }
  return { error: "text 또는 file({ name, content_base64 })을 보내주세요." };
}

// 웹훅으로 보낼 모습. 원문(text)은 보낸 쪽이 이미 갖고 있으니 뺀다(최대 10만 자).
export async function documentPayload(id) {
  const got = await getDocumentView(id);
  if (!got) return null;
  const { text: _t, ...rest } = got.view;
  return rest;
}

// 시작. 실패하면 { error: { status, code, message } }.
export async function startDocument({ key, text, title = "", refs = [], organization = "", endpoint, source = "api", userId = null, docId = null, onAllDone = null }) {
  if (text.length > MAX_DOCUMENT_CHARS) {
    return { error: { status: 413, code: "document_too_long", message: `문서는 ${MAX_DOCUMENT_CHARS.toLocaleString()}자까지 검사할 수 있습니다(지금 ${text.length.toLocaleString()}자).` } };
  }
  const chunks = splitDocument(text);
  if (!chunks.length) return { error: { status: 400, code: "invalid_request", message: "검사할 내용이 없습니다." } };
  const ids = chunks.map(() => newVerificationId());

  // 한도: 조각 수만큼 남아 있어야 한다. 모자라면 한 조각도 시작하지 않는다.
  const used = Number(await quotaUsage(key));
  const remaining = Math.max(0, key.monthly_quota - used);
  if (remaining < chunks.length) {
    await recordApiUsage(key.id, { endpoint, statusCode: 429 });
    return {
      error: {
        status: 429,
        code: "quota_exceeded",
        message: `이 문서는 ${chunks.length}건(조각)으로 검사되는데 이번 달 남은 호출이 ${remaining}회입니다.`,
        extra: { needed: chunks.length, remaining },
      },
    };
  }

  const id = docId || newDocumentId();
  await run(
    `INSERT INTO documents (id, api_key_id, user_id, source, title, input, chunks_json, created_at)
     VALUES (:id, :k, :u, :s, :title, :input, :chunks, :t)`,
    {
      id, k: key.id, u: userId, s: source, title: String(title || "").slice(0, 120) || null, input: text,
      chunks: JSON.stringify(chunks.map((c, i) => ({ ...c, id: ids[i] }))), t: now(),
    },
  );
  const usageIds = [];
  for (const vid of ids) usageIds.push(await recordApiUsage(key.id, { verificationId: vid, endpoint, statusCode: 202, billable: true }));

  const dones = await startVerificationsLimited(
    chunks.map((c, i) => ({
      id: ids[i],
      text: text.slice(c.start, c.end),
      source: "api",
      userId: null,
      apiKeyId: key.id,
      clientKey: `key:${key.id}`,
      dataConsent: false,
      references: refs,
      organization,
    })),
    CHUNK_CONCURRENCY,
  );
  // 조각이 끝날 때마다 과금 행의 상태를 채운다(실패한 조각은 과금하지 않는다).
  dones.forEach((d, i) =>
    d.then(
      (r) => usageIds[i] && finishApiUsage(usageIds[i], { statusCode: 200, cached: !!r?.fromCache }),
      () => usageIds[i] && finishApiUsage(usageIds[i], { statusCode: 500, cached: false, billable: false }),
    ).catch(() => {}),
  );
  const all = Promise.allSettled(dones);
  if (onAllDone) all.then(() => onAllDone(id)).catch(() => {});
  return { id, chunks: chunks.length, all };
}

// 조각 결과를 원문 기준으로 합친 모습.
export async function getDocumentView(id, { withText = true } = {}) {
  const doc = await one("SELECT * FROM documents WHERE id = :id", { id });
  if (!doc) return null;
  const chunks = JSON.parse(doc.chunks_json);
  const parts = await Promise.all(chunks.map((c) => getVerification(c.id)));
  const claims = [];
  let done = 0;
  let failed = 0;
  parts.forEach((v, i) => {
    if (!v || v.status === "pending") return;
    if (v.status === "error") {
      failed += 1;
      return;
    }
    done += 1;
    const off = chunks[i].start;
    for (const c of v.result?.claims || []) {
      claims.push(c.span ? { ...c, span: { start: c.span.start + off, end: c.span.end + off }, part: i } : { ...c, part: i });
    }
  });
  claims.sort((a, b) => (a.span?.start ?? Infinity) - (b.span?.start ?? Infinity));
  const total = chunks.length;
  const status = done + failed < total ? "pending" : failed === total ? "error" : failed ? "partial" : "done";
  const view = {
    id: doc.id,
    object: "document",
    title: doc.title,
    status,
    created_at: new Date(Number(doc.created_at)).toISOString(),
    length: doc.input.length,
    parts: { total, done, failed },
    result:
      status === "pending"
        ? null
        : {
            verdict: buildOverallVerdict(claims),
            counts: {
              claims: claims.length,
              false: claims.filter((c) => c.verdict === "false").length,
              uncertain: claims.filter((c) => c.verdict === "uncertain").length,
              confirmed: claims.filter((c) => c.verdict === "confirmed").length,
            },
            claims,
          },
  };
  if (withText) {
    view.text = doc.input;
    if (view.result) {
      const fixed = applyFixes(doc.input, claims);
      view.result.corrected_text = fixed.text;
      view.result.fixes_applied = fixed.applied;
    }
  }
  return { view, doc };
}

export function listUserDocuments(userId, limit = 20) {
  return all(
    `SELECT id, title, created_at, LENGTH(input) AS length FROM documents WHERE user_id = :u ORDER BY created_at DESC LIMIT :limit`,
    { u: userId, limit },
  );
}
