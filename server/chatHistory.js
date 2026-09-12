import { all, now, run } from "./db.js";

// 카카오톡 스킬 요청은 서로 독립적이라, 사용자별 최근 대화를 DB에 두고 다음 요청에
// 함께 넣어 대화가 이어지게 한다. 웹 AI 위젯 대화도 같은 테이블에 남긴다(관리자 확인용).
const MAX_TURNS = 12;

export async function getHistory(clientKey) {
  if (!clientKey) return [];
  const rows = await all("SELECT role, content FROM chat_messages WHERE client_key = :k ORDER BY id DESC LIMIT :n", { k: clientKey, n: MAX_TURNS });
  return rows.reverse();
}

export async function appendTurns(clientKey, turns, { channel = "web", userId = null } = {}) {
  if (!clientKey) return;
  const t = now();
  for (const turn of turns) {
    await run(
      "INSERT INTO chat_messages (channel, client_key, user_id, role, content, created_at) VALUES (:ch, :k, :uid, :role, :content, :t)",
      { ch: channel, k: clientKey, uid: userId, role: turn.role, content: String(turn.content).slice(0, 8000), t },
    );
  }
}

export function listConversations({ limit = 50, channel = null } = {}) {
  return all(
    `SELECT client_key, MAX(channel) AS channel, MAX(user_id) AS user_id, COUNT(*) AS turns, MAX(created_at) AS last_at
       FROM chat_messages ${channel ? "WHERE channel = :channel" : ""}
      GROUP BY client_key ORDER BY last_at DESC LIMIT :limit`,
    channel ? { limit, channel } : { limit },
  );
}

export async function getConversation(clientKey, limit = 200) {
  const rows = await all("SELECT role, content, created_at FROM chat_messages WHERE client_key = :k ORDER BY id DESC LIMIT :limit", {
    k: clientKey,
    limit,
  });
  return rows.reverse();
}
