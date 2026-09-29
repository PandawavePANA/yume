// 의뢰 대화의 사진 — 시안, 참고 화면, 오류 캡처를 말로 설명하지 않고 바로 보여 주는 자리.
//
// 파일을 어디에 둘지가 먼저다. 서버(Railway)에는 디스크가 붙어 있지 않아서 재배포하면 로컬
// 파일이 사라진다. 그래서 DB에 담는다. 대신 크게 받지 않는다 — 브라우저가 올리기 전에
// 긴 변 1920px JPEG로 줄여서 보내므로 한 장이 보통 200~500KB다. 서버는 그 약속을 믿지 않고
// 크기·형식·파일 머리(매직 바이트)를 다시 본다.
//
// 보는 쪽 권한은 대화 권한과 같다. 의뢰인은 토큰 헤더로, 운영자는 관리자 쿠키로 연다.
// 파일 번호만 알아서는 열리지 않는다 — 파일이 그 대화의 것인지 매번 확인한다.
import { all, now, one, run } from "./db.js";
import { addMessage } from "./threads.js";

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const SIGNATURES = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/** data URL 한 장 → { mime, data(base64), size } 또는 { error }. */
export function parsePhoto(raw) {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(raw || ""));
  if (!m) return { error: "사진을 읽지 못했어요. 다시 골라주세요." };
  const mime = m[1].toLowerCase();
  const check = SIGNATURES[mime];
  if (!check) return { error: "JPG · PNG · WEBP 사진만 보낼 수 있어요." };
  const data = m[2].replace(/\s/g, "");
  const buf = Buffer.from(data, "base64");
  if (buf.length < 16 || !check(buf)) return { error: "사진 파일이 아니거나 손상됐어요." };
  if (buf.length > MAX_PHOTO_BYTES) return { error: "사진 한 장은 3MB까지 보낼 수 있어요." };
  return { mime, data, size: buf.length };
}

/**
 * 사진 여러 장을 한 줄로 남긴다. 설명을 같이 적었으면 그게 본문이고, 없으면 "사진 N장".
 * 한 장이라도 잘못됐으면 아무것도 남기지 않는다 — 반만 올라간 묶음은 설명과 어긋난다.
 */
export async function postPhotos(threadId, sender, images, caption = "") {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return { error: "보낼 사진을 골라주세요." };
  if (list.length > MAX_PHOTOS) return { error: `사진은 한 번에 ${MAX_PHOTOS}장까지 보낼 수 있어요.` };
  const parsed = list.map(parsePhoto);
  const bad = parsed.find((p) => p.error);
  if (bad) return { error: bad.error };

  const text = String(caption || "").trim().slice(0, 5000) || `사진 ${parsed.length}장`;
  const msg = await addMessage(threadId, sender, text, { kind: "photo" });
  const t = now();
  for (const p of parsed) {
    await run(
      `INSERT INTO thread_files (thread_id, message_id, mime, size, data, created_at)
       VALUES (:tid, :mid, :mime, :size, :data, :t)`,
      { tid: Number(threadId), mid: msg.id, mime: p.mime, size: p.size, data: p.data, t },
    );
  }
  return { ok: true, id: msg.id, count: parsed.length, body: text };
}

/** 메시지 번호들 → { [messageId]: [{ id, mime, size }] }. 대화를 그릴 때 한 번에 붙인다. */
export async function filesByMessage(messageIds) {
  const ids = [...new Set(messageIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return {};
  // 확인된 정수만 박는다(deskApi 목록과 같은 이유 — 배열 파라미터는 드라이버마다 다르다).
  const rows = await all(
    `SELECT id, message_id, mime, size FROM thread_files WHERE message_id IN (${ids.join(",")}) ORDER BY id`,
  );
  const out = {};
  for (const r of rows) (out[r.message_id] ||= []).push({ id: Number(r.id), mime: r.mime, size: Number(r.size) });
  return out;
}

const BARE = /^사진 \d+장$/;

/** 메시지 목록에 사진을 붙인다. */
export async function withFiles(messages) {
  const photoIds = messages.filter((m) => m.kind === "photo").map((m) => m.id);
  const map = await filesByMessage(photoIds);
  // photoOnly — 설명 없이 사진만 보낸 줄. 본문이 "사진 N장"이라 화면은 그 줄을 생략한다.
  return messages.map((m) =>
    m.kind === "photo" ? { ...m, files: map[m.id] || [], photoOnly: BARE.test(String(m.body)) } : m,
  );
}

/** 파일 하나. 그 대화의 것일 때만 돌려준다. */
export async function readFile(fileId, threadId) {
  const row = await one("SELECT * FROM thread_files WHERE id = :id", { id: Math.floor(Number(fileId) || 0) });
  if (!row) return null;
  if (threadId != null && Number(row.thread_id) !== Number(threadId)) return null;
  return { mime: row.mime, bytes: Buffer.from(row.data, "base64") };
}

export function sendFile(res, file) {
  res.set("Content-Type", file.mime);
  // 한 번 올린 사진은 바뀌지 않는다. 다만 남의 대화 사진이라 공유 캐시에는 두지 않는다.
  res.set("Cache-Control", "private, max-age=86400, immutable");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", "inline");
  res.send(file.bytes);
}
