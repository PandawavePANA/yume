// 전체 채팅(로비).
//
// 왜 만드는가 — 공헌도는 이미 있었지만 랭킹 화면을 따로 열어야 보였다. 혼자 보는
// 숫자는 잘 안 움직인다. 말이 오가는 자리에서 이름 옆에 등수가 붙으면 그때부터
// 그 숫자가 의미를 갖는다. 게임에서 전체 채팅 옆 순위가 하는 일이 정확히 그것이다.
//
// 공개된 자리라서 제품 안의 다른 어떤 화면보다 조심할 것이 많다.
//   · 로그인 + 휴대폰 본인확인을 마친 사람만 쓴다. 검증과 같은 문이다.
//   · 이름은 닉네임만 나간다. 이메일은 이 파일 어디에도 실리지 않는다.
//   · 링크는 자동으로 걸지 않는다(화면에서 그냥 글자로 그린다). 채팅이 광고판이
//     되는 가장 빠른 길이 자동 링크다.
//   · 지우지 않고 내린다(hidden). 왜 내렸는지 나중에 확인할 수 있어야 한다.
import { all, now, one, run } from "./db.js";
import { POINTS, handleFor, tierOf, topRankMap, total } from "./contribution.js";

// 채팅에 들어오는 문턱 — 검증 4회분의 공헌도.
//
// 계정만 만들고 바로 떠드는 것을 막는 가장 싼 방법이다. 휴대폰 본인확인이 이미 앞에
// 있지만 그건 "사람인가"만 보고, 이건 "이 제품을 써 본 사람인가"를 본다.
//
// **분기 점수가 아니라 누적 점수로 본다.** 등수와 색은 분기마다 초기화되지만
// 문턱까지 초기화하면, 분기가 바뀐 날 아침에 오래 쓰던 사람들이 전부 말을 못 하게 된다.
// 한 번 증명한 것은 다시 증명하게 하지 않는다.
export const CHAT_MIN_POINTS = POINTS.verify * 4;

export const MAX_BODY = 200;
// 한 화면에 보이는 양. 더 올리면 새로 들어온 사람이 지난 대화를 한참 스크롤하게 된다.
export const PAGE = 60;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * 최근 대화. after를 주면 그 뒤에 생긴 것만 준다(폴링용).
 *
 * 등수는 메시지마다 조회하지 않고 상위 100명 지도를 한 번 받아 붙인다.
 * 색이 갈리는 경계가 100위라 101위부터는 등수를 몰라도 화면이 같다.
 */
export async function recent({ after = 0 } = {}) {
  const rows = after
    ? await all(
        `SELECT m.id, m.user_id, m.body, m.created_at, u.display_name
           FROM lobby_messages m JOIN users u ON u.id = m.user_id
          WHERE m.hidden = FALSE AND m.id > :after
          ORDER BY m.id LIMIT :page`,
        { after, page: PAGE },
      )
    : (
        await all(
          `SELECT m.id, m.user_id, m.body, m.created_at, u.display_name
             FROM lobby_messages m JOIN users u ON u.id = m.user_id
            WHERE m.hidden = FALSE
            ORDER BY m.id DESC LIMIT :page`,
          { page: PAGE },
        )
      ).reverse();

  const ranks = await topRankMap();
  return rows.map((r) => decorate(r, ranks));
}

function decorate(row, ranks) {
  const userId = Number(row.user_id);
  const rank = ranks.get(userId) || null;
  const tier = tierOf(rank);
  return {
    id: Number(row.id),
    userId,
    name: handleFor({ id: userId, display_name: row.display_name }),
    body: row.body,
    at: Number(row.created_at),
    rank,
    // 색은 서버가 정한다. 화면마다 다른 색을 쓰면 같은 등수가 다르게 보인다.
    color: tier?.color || null,
    tier: tier?.key || null,
  };
}

export async function say(user, raw) {
  const body = clean(raw).slice(0, MAX_BODY);
  if (!body) return { error: "내용을 입력해주세요." };

  // 문턱은 화면에서도 막지만 여기서 다시 본다. 화면은 우회할 수 있다.
  const earned = await total(user.id, null);
  if (earned < CHAT_MIN_POINTS) {
    const left = Math.ceil((CHAT_MIN_POINTS - earned) / POINTS.verify);
    return { error: `검증을 ${left}번 더 하시면 채팅에 참여할 수 있어요.`, code: "NEED_POINTS" };
  }

  const t = now();
  const row = await run(
    "INSERT INTO lobby_messages (user_id, body, created_at) VALUES (:uid, :body, :t) RETURNING id",
    { uid: user.id, body, t },
  );
  const ranks = await topRankMap();
  return {
    ok: true,
    message: decorate({ id: row.rows[0]?.id, user_id: user.id, body, created_at: t, display_name: user.display_name }, ranks),
  };
}

/** 내 등수와 점수. 채팅 머리에 "나"를 보여 주는 데 쓴다. */
export async function meIn(user) {
  // 점수가 둘이다 — 화면에 보이는 등수는 이번 분기, 채팅 문턱은 누적.
  const [points, earned] = await Promise.all([total(user.id), total(user.id, null)]);
  const ranks = await topRankMap();
  const rank = ranks.get(Number(user.id)) || null;
  const tier = tierOf(rank);
  return {
    name: handleFor(user),
    points,
    rank,
    color: tier?.color || null,
    tier: tier?.key || null,
    earned,
    canChat: earned >= CHAT_MIN_POINTS && !!user.identity_verified_at,
    needPoints: Math.max(0, CHAT_MIN_POINTS - earned),
    needVerifications: Math.max(0, Math.ceil((CHAT_MIN_POINTS - earned) / POINTS.verify)),
    identityRequired: !user.identity_verified_at,
    minPoints: CHAT_MIN_POINTS,
  };
}

/** 운영자가 한 줄 내린다. 지우지 않는 이유는 위 머리말에 적었다. */
export async function hide(id, adminUserId) {
  const r = await run("UPDATE lobby_messages SET hidden = TRUE, hidden_by = :by WHERE id = :id AND hidden = FALSE", {
    id: Number(id),
    by: adminUserId || null,
  });
  return r.changes > 0;
}

export function listForReview(limit = 100) {
  return all(
    `SELECT m.id, m.body, m.hidden, m.created_at, u.display_name, u.email
       FROM lobby_messages m JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC LIMIT :limit`,
    { limit },
  );
}

export const messageCount = async () =>
  Number((await one("SELECT COUNT(*) AS n FROM lobby_messages WHERE hidden = FALSE"))?.n || 0);
