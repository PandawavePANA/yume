import { all, now, one, run, tx } from "./db.js";
import { PLANS, effectivePlan } from "./plans.js";

// 크레딧 — 검증을 돌리는 데 쓰는 재화. 클로드와 같은 구조다.
//   · 요금제마다 매달 정해진 양이 들어온다.
//   · 다 쓰면 최고 등급 구독이라도 추가로 사야 한다. 구독은 무제한이 아니다.
//   · 검증 1건에 1크레딧.
//
// 기여도(contribution.js)와 헷갈리지 말 것. 이쪽은 쓰면 없어지는 재화이고, 기여도는
// 없어지지 않는 누적 점수다. 원장도 테이블도 따로다 — 한데 섞으면 검증을 돌릴 때마다
// 랭킹이 내려가는 이상한 일이 생긴다.
//
// 절대 잊지 말 것:
//  · 지급·차감은 전부 원장(credit_ledger)에 남기고, 잔액은 원장 합으로만 구한다.
//  · 결제 없이 크레딧을 늘려주지 않는다. 추가 구매는 "신청"만 받고 입금 확인 후
//    운영자가 직접 지급한다(관리자 대시보드). 자동 결제·송금은 넣지 말 것.
//  · 현금 환급은 없다. 크레딧을 현금으로 바꿔주면 전자금융거래법상 선불전자지급수단에
//    해당해 금융위 등록 대상이 될 수 있다.

// 1 크레딧 = 100원 상당.
export const CREDIT_KRW = 100;

// 요금제별 월 지급량. 여기가 유일한 기준이고 화면은 이 값을 받아 표시만 한다.
// 검증 1건의 실측 원가는 0.05~0.23달러, 중앙값 약 0.15달러다(apiCost.js가 건마다
// 기록한다). 환율 1,400원이면 건당 약 210원이다. 월 지급량은 이 원가에서 거꾸로
// 잡았다 — 요금제를 전부 소진해도 원가율이 55%를 넘지 않는 선이다.
//
// 예전 값(무료 100, 스탠다드 3,000, 전문가 10,000)은 이 계산을 하지 않고 정한
// 숫자였다. 스탠다드를 다 쓰면 9,000원을 받고 63만원을 쓰는 구조여서, 많이 팔릴수록
// 손실이 커졌다. 쓰는 만큼 원가가 나가는 서비스에서 지급량은 가격만큼 중요한 값이다.
export const CREDIT_COST_KRW = 210;

export const PLAN_CREDITS = {
  free: 10,
  standard: 25,
  expert: 75,
  business: 260,
};

// 입력이 길수록 주장이 많고 검색도 많아져 원가가 그만큼 올라간다. 길이와 무관하게
// 1건을 1크레딧으로 받으면 긴 문서를 붙여넣는 쪽이 짧게 쓰는 쪽에게 보조를 받는다.
// 그래서 2,000자를 한 칸으로 끊어 차감한다 — 요청을 받은 시점에 이미 아는 값이라
// 사용자에게 미리 알려줄 수 있고, 최대 입력 10,000자이므로 한 번에 5크레딧이 상한이다.
export const CHARS_PER_CREDIT = 2000;

export function creditsFor(chars) {
  const n = Number(chars) || 0;
  return Math.max(1, Math.ceil(n / CHARS_PER_CREDIT));
}

// 추가 구매 팩. 결제 연동 전이라 화면에서는 신청만 받고, 입금이 확인되면 운영자가 지급한다.
// 추가 구매는 구독보다 건당 단가가 높다. 예산을 미리 정한 구독 쪽이 우리도 예측이
// 되고 사용자도 싸기 때문에, 구독으로 가는 게 서로 이득이 되도록 두었다.
export const CREDIT_PACKS = [
  { key: "pack_20", label: "20 크레딧", credits: 20, krw: 12000 },
  { key: "pack_60", label: "60 크레딧", credits: 60, krw: 33000 },
  { key: "pack_200", label: "200 크레딧", credits: 200, krw: 100000 },
];

export const packItem = (key) => CREDIT_PACKS.find((i) => i.key === key) || null;

// 추천 보상은 크레딧으로 준다 — 친구를 데려오면 더 써볼 수 있게 하는 게 자연스럽다.
// 제보 보상은 크레딧이 아니라 기여도 점수다(contribution.js).
export const REFERRAL_CREDITS = 10;
export const REFERRAL_MONTHLY_CAP = 20;

// 이번 달 구독분이 들어왔는지 확인하고, 없으면 넣는다.
// ref를 "plan:{요금제}:{YYYY-MM}"으로 잡아 원장 유니크 제약이 중복 지급을 막는다.
// 달이 바뀌면 자동으로 새 ref가 되므로 별도의 정산 작업(cron)이 필요 없다 —
// 사용자가 검증을 시작할 때 이 함수가 먼저 불리면서 그 자리에서 채워진다.
function periodKey(at = new Date()) {
  // 지급 기준은 한국 시간이다. 월말 자정 근처에서 UTC로 계산하면 하루 어긋난다.
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function ensureMonthlyGrant(user) {
  if (!user?.id) return 0;
  const plan = effectivePlan(user);
  const amount = PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;
  const ref = `plan:${plan}:${periodKey()}`;
  const r = await run(
    `INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at)
     VALUES (:userId, :delta, 'plan_grant', :ref, :memo, :t)
     ON CONFLICT DO NOTHING RETURNING id`,
    { userId: user.id, delta: amount, ref, memo: `${PLANS[plan]?.label || plan} 요금제 월 지급`, t: now() },
  );
  return r.rows.length ? amount : 0;
}

export async function balance(userId) {
  return (await one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = :userId", { userId }))?.n || 0;
}

export function listLedger(userId, limit = 50) {
  return all("SELECT id, delta, reason, ref, memo, created_at FROM credit_ledger WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", {
    userId,
    limit,
  });
}

// 지급. 같은 건으로 두 번 지급되지 않아야 하는 경우는 호출부에서 ref로 확인한다.
export async function grant(userId, delta, reason, { ref = null, memo = null, q = null } = {}) {
  const exec = q || { run };
  await exec.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at) VALUES (:userId, :delta, :reason, :ref, :memo, :t)", {
    userId,
    delta,
    reason,
    ref,
    memo,
    t: now(),
  });
}

// 차감 — 잔액이 모자라면 아무것도 쓰지 않고 false를 돌려준다. 같은 사람이 동시에 두 번
// 신청해도 잔액이 음수로 내려가지 않도록, 회원 행을 잠가서 한 사람의 차감을 직렬화한다
// (합계에는 FOR UPDATE를 걸 수 없어 잠글 대상이 따로 필요하다).
export async function spend(userId, amount, reason, { ref = null, memo = null } = {}) {
  return tx(async (q) => {
    await q.one("SELECT id FROM users WHERE id = :userId FOR UPDATE", { userId });
    const cur = (await q.one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = :userId", { userId }))?.n || 0;
    if (cur < amount) return false;
    await q.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at) VALUES (:userId, :delta, :reason, :ref, :memo, :t)", {
      userId,
      delta: -amount,
      reason,
      ref,
      memo,
      t: now(),
    });
    return true;
  });
}

// 검증 1건 차감. 없으면 false — 호출부가 "크레딧이 부족하다"고 안내한다.
export function spendOne(userId, ref) {
  return spend(userId, 1, "verify", { ref });
}

// 입력 길이만큼 차감한다. 반환값은 실제로 빠진 크레딧 수이며, 잔액이 모자라면 0이다
// (부분 차감은 하지 않는다 — 절반만 받고 검증을 못 해 주면 그게 더 나쁘다).
export async function spendForVerification(userId, chars, ref) {
  const cost = creditsFor(chars);
  return (await spend(userId, cost, "verify", { ref })) ? cost : 0;
}

// ── 추가 구매 신청 ──
// 결제 연동 전이라 여기서 크레딧을 주지 않는다. 신청만 남기고 입금이 확인되면
// 운영자가 관리자 대시보드에서 지급한다. 이 함수가 크레딧을 늘리는 일은 없어야 한다.
export async function requestCreditPack(user, packKey, contact) {
  const item = packItem(packKey);
  if (!item) return { error: "선택한 크레딧 팩을 찾을 수 없어요." };
  const to = String(contact || "").trim();
  if (to.length < 5) return { error: "연락받으실 휴대폰 번호나 이메일을 입력해주세요." };
  if (to.length > 200) return { error: "연락처가 너무 길어요." };
  const r = await run(
    `INSERT INTO redemptions (user_id, item_key, item_label, credits, contact, created_at)
     VALUES (:userId, :key, :label, :credits, :contact, :t) RETURNING *`,
    { userId: user.id, key: item.key, label: `${item.label} 구매 (${item.krw.toLocaleString()}원)`, credits: item.credits, contact: to, t: now() },
  );
  return { request: r.rows[0] };
}

export function listUserCreditRequests(userId, limit = 20) {
  return all("SELECT id, item_label, credits, status, created_at, handled_at FROM redemptions WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", {
    userId,
    limit,
  });
}

export function listCreditRequests(status = null, limit = 200) {
  return all(
    `SELECT r.*, u.email, u.name FROM redemptions r JOIN users u ON u.id = r.user_id
      ${status ? "WHERE r.status = :status" : ""} ORDER BY r.id DESC LIMIT :limit`,
    status ? { status, limit } : { limit },
  );
}

// 입금을 확인한 뒤 운영자가 지급한다. 여기서야 크레딧이 들어간다.
export async function handleCreditRequest(id, decision, adminNote) {
  const row = await one("SELECT * FROM redemptions WHERE id = :id", { id });
  if (!row) return { error: "구매 신청을 찾을 수 없어요." };
  if (row.status !== "requested") return { error: "이미 처리된 신청이에요." };
  const status = decision === "fulfill" ? "fulfilled" : "cancelled";
  // 버튼을 두 번 누르는 등 동시에 처리돼도 한 번만 넘어가도록 상태를 조건으로 건다.
  const upd = await run("UPDATE redemptions SET status = :status, admin_note = :note, handled_at = :t WHERE id = :id AND status = 'requested'", {
    id,
    status,
    note: adminNote ? String(adminNote).slice(0, 500) : null,
    t: now(),
  });
  if (!upd.changes) return { error: "이미 처리된 신청이에요." };
  if (status === "fulfilled") {
    await grant(row.user_id, row.credits, "purchase", { ref: `purchase:${id}`, memo: row.item_label });
  }
  return { ok: true, status };
}

export async function creditStats() {
  const issued = (await one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE delta > 0"))?.n || 0;
  const spent = (await one("SELECT COALESCE(SUM(-delta), 0) AS n FROM credit_ledger WHERE delta < 0"))?.n || 0;
  const pendingRedemptions = (await one("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'requested'"))?.n || 0;
  return { issued, spent, outstanding: issued - spent, outstandingKrw: (issued - spent) * CREDIT_KRW, pendingRedemptions };
}
