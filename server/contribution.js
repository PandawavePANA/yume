// 기여도 — 이 사람이 유메를 얼마나 나아지게 했는가.
//
// 크레딧과 헷갈리면 안 된다. 크레딧은 검증을 돌리는 데 쓰고 없어지는 재화고,
// 기여도는 없어지지 않는 누적 점수다. 검증을 많이 돌린다고 제품이 좋아지지는 않지만,
// AI가 지어낸 걸 찾아내서 넘겨주면 좋아진다. 그래서 점수 차이를 크게 뒀다.
//
//   검증 10점   — 돌려본 것 자체는 작게 친다
//   초대 30점   — 데려온 친구가 실제로 검증을 한 번 마친 것
//   발견 50점   — 사실과 다른 주장이 실제로 잡힌 검증
//   제보 1000점 — 그걸 공유 링크와 함께 넘겨줘서 운영자 검토를 통과한 것
//
// 초대를 검증(10)보다 높고 발견(50)보다 낮게 둔 이유가 있다. 찾아낼 수 있는 사람을
// 한 명 늘리는 일은 검증 한 번보다 크지만, 직접 찾아낸 것보다 크면 안 된다 — 그러면
// 랭킹이 "많이 찾아낸 사람"이 아니라 "많이 데려온 사람"의 보드가 되고, 그 순간 이
// 점수판이 재겠다고 한 것을 재지 못한다. 크레딧과 같은 조건(친구의 첫 검증 완료,
// 월 상한, 같은 IP는 검토 보류)을 그대로 쓰므로 파밍 경로도 따로 생기지 않는다.
//
// 제보만 두 자릿수 배수인 이유는, 그것만이 우리에게 남는 데이터이기 때문이다. 검증과
// 발견은 사용자가 자기 일을 하다 생기는 부산물이지만 제보는 따로 품이 든다.
//
// 중요 — 제보 점수는 "제출"이 아니라 "승인"에 준다. 제출만으로 1000점이면 아무 링크나
// 넣고 순위를 올릴 수 있고, 그 순간 랭킹은 기여도가 아니라 성실함의 반대를 재게 된다.
// 이미 만들어 둔 중복 차단·운영자 검토를 그대로 거치게 한다.
import { all, one, run, now } from "./db.js";
import { grant as grantCredits } from "./credits.js";

export const POINTS = {
  verify: 10,
  referral: 30,
  finding: 50,
  report: 1000,
};

export const REASON_LABEL = {
  verify: "검증",
  referral: "친구 초대",
  finding: "사실과 다른 주장 발견",
  report: "제보 승인",
  adjust: "운영자 조정",
};

// 랭킹에 올릴 이름은 가입할 때 정한 닉네임이다. 이메일은 절대 보드로 나가지 않는다.
// 옛 계정처럼 닉네임이 비어 있으면 계정 id로 만든 고정 핸들을 쓴다 — 매번 달라지면
// 어제 본 1등이 오늘 다른 사람처럼 보인다.
const HANDLE_WORDS = ["검증가", "관찰자", "대조자", "확인자", "탐색자", "기록자"];

export function handleFor(user) {
  const name = String(user?.display_name || "").trim();
  if (name) return name;
  const id = Number(user?.id) || 0;
  return `${HANDLE_WORDS[id % HANDLE_WORDS.length]}${String(1000 + ((id * 7919) % 9000))}`;
}

// 닉네임 규칙. 랭킹에 그대로 걸리는 이름이라 남을 사칭하거나 읽기 어려운 형태를 막는다.
const NICKNAME_BANNED = /(운영자|관리자|admin|yume|유메|공식)/i;

export function nicknameProblem(raw) {
  const name = String(raw || "").trim();
  if (name.length < 2) return "닉네임은 2자 이상으로 지어주세요.";
  if (name.length > 16) return "닉네임은 16자까지 쓸 수 있어요.";
  if (!/^[가-힣a-zA-Z0-9._-]+$/.test(name)) return "닉네임에는 한글·영문·숫자와 . _ - 만 쓸 수 있어요.";
  if (NICKNAME_BANNED.test(name)) return "운영자로 오해할 수 있는 닉네임은 쓸 수 없어요.";
  return null;
}

export async function nicknameTaken(name) {
  return !!(await one("SELECT id FROM users WHERE LOWER(display_name) = LOWER(:name)", { name: String(name).trim() }));
}

// ── 분기 ──────────────────────────────────────────────────────────────
// 랭킹과 보상은 분기마다 초기화된다. 기록을 지우지 않고 "이번 분기 것만 센다" —
// 지난 분기 수상 내역과 적립 경위가 남아야 나중에 이의가 들어와도 확인할 수 있다.
export function periodOf(at = Date.now()) {
  const kst = new Date(at + 9 * 60 * 60 * 1000);
  return kst.getUTCFullYear() + "-Q" + (Math.floor(kst.getUTCMonth() / 3) + 1);
}

// 이번 분기가 끝나는 시각(KST 기준). 화면에 남은 기간을 보여주는 데 쓴다.
export function periodEndsAt(at = Date.now()) {
  const kst = new Date(at + 9 * 60 * 60 * 1000);
  const q = Math.floor(kst.getUTCMonth() / 3);
  return Date.UTC(kst.getUTCFullYear(), (q + 1) * 3, 1) - 9 * 60 * 60 * 1000;
}

// 분기 보상. 1~3위는 물건이라 운영자가 직접 보내고, 4~10위는 크레딧이라 마감할 때
// 지급된다. 서버가 물건을 사거나 돈을 보내는 일은 없다.
// 크레딧 보상은 정가(600원)를 기준으로 다시 잡았다. 100/40이던 값은 분기마다
// 400 크레딧, 즉 **84,000원의 원가**가 나가는 구조였다 — 골드바 세 개보다 이쪽이 더 컸다.
// 30/15면 분기 135 크레딧(원가 28,350원)이고, 정가로는 4~5위 18,000원 · 6~10위 9,000원어치라
// 상으로서의 무게는 오히려 또렷해진다.
// 크레딧 보상은 월 지급량에 맞춘다. 예전 값(4~5위 1,000 / 6~10위 300)은 지급량이
// 스탠다드 3,000이던 시절에 정한 것이라, 지금 기준으로는 전문가 요금제 1년치를
// 분기마다 열 명에게 뿌리는 셈이 된다. 상은 눈에 띄어야 하지만 원가를 넘으면 안 된다.
export const QUARTER_REWARDS = [
  { from: 1, to: 1, kind: "goldbar", label: "미니 골드바 3.75g (한 돈)", credits: 0 },
  { from: 2, to: 3, kind: "goldbar", label: "미니 골드바 1g", credits: 0 },
  { from: 4, to: 5, kind: "credits", label: "30 크레딧", credits: 30 },
  { from: 6, to: 10, kind: "credits", label: "15 크레딧", credits: 15 },
];

export const rewardForRank = (rank) => QUARTER_REWARDS.find((r) => rank >= r.from && rank <= r.to) || null;

// 기본은 이번 분기 점수다. 랭킹이 분기마다 초기화되므로 화면의 "내 점수"도 같은
// 기준이어야 한다. 누적 전체가 필요하면 period에 null을 넘긴다.
export async function total(userId, period = periodOf()) {
  const row = period
    ? await one("SELECT COALESCE(SUM(points), 0) AS n FROM contribution_ledger WHERE user_id = :userId AND period = :period", { userId, period })
    : await one("SELECT COALESCE(SUM(points), 0) AS n FROM contribution_ledger WHERE user_id = :userId", { userId });
  return row?.n || 0;
}

export function listLedger(userId, limit = 50) {
  return all(
    "SELECT id, points, reason, ref, memo, created_at FROM contribution_ledger WHERE user_id = :userId ORDER BY id DESC LIMIT :limit",
    { userId, limit },
  );
}

// ref가 있으면 같은 건으로 두 번 쌓이지 않는다(부분 유니크 인덱스 + ON CONFLICT).
// 검증 한 건이 재시도로 두 번 기록되는 일이 실제로 생기므로 DB에서 막는다.
export async function award(userId, reason, points, { ref = null, memo = null } = {}) {
  if (!userId || !points) return false;
  const r = await run(
    `INSERT INTO contribution_ledger (user_id, points, reason, ref, memo, period, created_at)
     VALUES (:userId, :points, :reason, :ref, :memo, :period, :t)
     ON CONFLICT (user_id, reason, ref) WHERE ref IS NOT NULL DO NOTHING
     RETURNING id`,
    { userId, points, reason, ref, memo, period: periodOf(), t: now() },
  );
  return r.rows.length > 0;
}

// 검증이 끝난 뒤 한 번 호출한다. 검증 자체 10점에, 사실과 다른 주장이 실제로
// 잡혔으면 발견 50점을 더한다. 여러 건이 잡혀도 검증 한 건당 한 번만 준다 —
// 주장 수로 점수가 곱해지면 긴 글을 붙여넣는 게 최적 전략이 되어 버린다.
export async function awardForVerification(userId, verificationId, claims = []) {
  if (!userId) return { verify: false, finding: false };
  const ref = `verification:${verificationId}`;
  const verify = await award(userId, "verify", POINTS.verify, { ref });
  const found = (Array.isArray(claims) ? claims : []).filter((c) => c?.verdict === "false");
  let finding = false;
  if (found.length > 0) {
    finding = await award(userId, "finding", POINTS.finding, {
      ref,
      memo: found.length > 1 ? `${found[0].text?.slice(0, 60)} 외 ${found.length - 1}건` : found[0]?.text?.slice(0, 80),
    });
  }
  return { verify, finding, foundCount: found.length };
}

// 추천이 성립했을 때 부른다. 크레딧 지급과 같은 자리에서 불리고 조건도 같다 —
// 여기서 따로 판단하지 않는 이유는, 두 보상이 서로 다른 조건으로 갈라지면 한쪽은
// 받고 한쪽은 못 받는 상태가 생겨 설명할 수 없게 되기 때문이다.
// ref를 추천 건 번호로 잡아, 검토 승인 경로로 두 번 불려도 한 번만 들어간다.
export async function awardForReferral(referrerId, referralId) {
  if (!referrerId || !referralId) return false;
  return award(referrerId, "referral", POINTS.referral, {
    ref: `referral:${referralId}`,
    memo: "초대한 친구가 첫 검증을 마침",
  });
}

// ── 랭킹 ──────────────────────────────────────────────────────────────
// 점수가 같으면 먼저 도달한 사람이 앞이다(마지막 적립 시각이 이른 쪽). 그렇게 하지
// 않으면 동점자 순서가 조회할 때마다 흔들려서 "어제 2등이었는데 오늘 3등"이 된다.
export async function leaderboard(limit = 50, period = periodOf()) {
  const rows = await all(
    `SELECT u.id, u.display_name, SUM(c.points) AS points, MAX(c.created_at) AS last_at
       FROM contribution_ledger c JOIN users u ON u.id = c.user_id
      WHERE u.status = 'active' AND c.period = :period
      GROUP BY u.id, u.display_name
     HAVING SUM(c.points) > 0
      ORDER BY points DESC, last_at ASC
      LIMIT :limit`,
    { limit, period },
  );
  return rows.map((r, i) => {
    const rank = i + 1;
    const reward = rewardForRank(rank);
    return {
      rank,
      userId: Number(r.id),
      name: handleFor(r),
      points: Number(r.points) || 0,
      reward: reward ? { kind: reward.kind, label: reward.label } : null,
    };
  });
}

// 내 순위. 전체를 다 불러와 세지 않고 "나보다 점수가 높은 사람 수 + 1"로 구한다.
export async function rankOf(userId, period = periodOf()) {
  const mine = await total(userId, period);
  if (mine <= 0) return { points: 0, rank: null, reward: null };
  const ahead = (
    await one(
      `SELECT COUNT(*) AS n FROM (
         SELECT c.user_id, SUM(c.points) AS p FROM contribution_ledger c JOIN users u ON u.id = c.user_id
          WHERE u.status = 'active' AND c.period = :period GROUP BY c.user_id HAVING SUM(c.points) > :mine
       ) t`,
      { mine, period },
    )
  )?.n;
  const rank = Number(ahead || 0) + 1;
  const reward = rewardForRank(rank);
  return { points: mine, rank, reward: reward ? { kind: reward.kind, label: reward.label } : null };
}

export async function contributionStats() {
  const awarded = (await one("SELECT COALESCE(SUM(points), 0) AS n FROM contribution_ledger"))?.n || 0;
  const contributors = (await one("SELECT COUNT(DISTINCT user_id) AS n FROM contribution_ledger"))?.n || 0;
  const reports = (await one("SELECT COUNT(*) AS n FROM contribution_ledger WHERE reason = 'report'"))?.n || 0;
  return { awarded: Number(awarded), contributors: Number(contributors), reports: Number(reports) };
}

// ── 분기 마감 ──────────────────────────────────────────────────────────
// 운영자가 직접 실행한다. 크레딧 보상(4~10위)은 여기서 지급되고, 골드바(1~3위)는
// 받는 사람만 기록해 둔다 — 물건은 운영자가 확인하고 보낸다. 서버가 물건을 사거나
// 돈을 보내는 일은 없다.
//
// 같은 분기를 두 번 마감해도 상은 한 번만 나간다(period+user 유니크, 크레딧은 ref).
export async function settleQuarter(period) {
  const board = await leaderboard(10, period);
  const settled = [];
  for (const row of board) {
    const reward = rewardForRank(row.rank);
    if (!reward) continue;
    const ins = await run(
      `INSERT INTO quarter_awards (period, user_id, rank, points, reward_kind, reward_label, credits, status, created_at)
       VALUES (:period, :userId, :rank, :points, :kind, :label, :credits, :status, :t)
       ON CONFLICT (period, user_id) DO NOTHING RETURNING id`,
      {
        period,
        userId: row.userId,
        rank: row.rank,
        points: row.points,
        kind: reward.kind,
        label: reward.label,
        credits: reward.credits,
        status: reward.kind === "credits" ? "granted" : "pending",
        t: now(),
      },
    );
    if (!ins.rows.length) continue;
    if (reward.credits > 0) {
      await grantCredits(row.userId, reward.credits, "quarter_award", {
        ref: "award:" + period + ":" + row.userId,
        memo: period + " 기여도 " + row.rank + "위",
      });
    }
    settled.push({ rank: row.rank, name: row.name, points: row.points, reward: reward.label, kind: reward.kind });
  }
  return { period, settled };
}

export function listQuarterAwards(period) {
  return all(
    `SELECT a.*, u.display_name FROM quarter_awards a JOIN users u ON u.id = a.user_id
      WHERE a.period = :period ORDER BY a.rank ASC`,
    { period },
  );
}
