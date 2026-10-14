// 대표 할 일 — 대표만 할 수 있는 일(계정·DNS·홈택스·충전처럼 대표 본인 인증이 필요한 일)을 투두로 관리한다.
//
// 2026-10-14 대표: "내가 당일에 해야 하는 일들도 결재에 올려놔, 투두리스트처럼 — 업무 결재랑은 시각적으로 분류되게."
// 그래서 결재함과 따로, AI 본사의 "오늘 할 일" 탭에 체크리스트로 보인다(결재 문서 모양이 아니다).
//   · 완료 — check_key가 있으면 서버가 정말 됐는지 확인하고 닫는다(예: 메일 도메인은 실제로 보내 본다).
//   · 내일로 — 하루 미룬다.
//   · due_date — 그날부터 보인다(예: 11/1 일반과세 시작). after_key — 앞 일이 끝나야 보인다.
// 비서실(서윤)이 10분마다 정리하고, 아침 브리핑(유나)에 오늘 할 일이 들어간다.
import { all, now, one, run } from "../db.js";
import { getSetting, setSetting } from "../auditDesk.js";
import { gmailConfigured } from "./gmail.js";
import { engineStopped } from "../upstream.js";
import { COMPANY } from "../renderPages.js";

const DOC = "사업기획/아침할일_유메메일도메인인증.md";
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
const tomorrow = () => kstDay(Date.now() + 86_400_000);

// 처음 한 번 넣어 두는 할 일. key가 같으면 다시 넣지 않는다(대표가 끝낸 일은 다시 생기지 않는다).
export const SEED = [
  {
    key: "outreach_domain",
    title: "유메 메일 도메인(yume-reamer.com) 인증",
    steps: "1. resend.com → Domains → Add Domain → yume-reamer.com (Tokyo)\n2. 호스팅어 DNS에 Resend가 보여 주는 3줄 + _dmarc 1줄 추가\n3. Resend에서 Verify가 초록색이 되면 '완료'를 누르세요 — 서버가 유메 주소로 시험 메일을 보내 보고, 성공하면 첫 메일 발송이 바로 열립니다.",
    link: DOC,
    check_key: "outreach_domain",
  },
  {
    key: "gmail",
    title: "대표 메일함(Gmail) 연결 — 앱 비밀번호",
    steps: "1. reamer@d-reamer.com 2단계 인증 켜기\n2. Gmail 설정 → IMAP 사용\n3. myaccount.google.com/apppasswords 에서 앱 비밀번호(16자리) 만들기\n4. Railway → yume → Variables 에 GMAIL_USER=reamer@d-reamer.com, GMAIL_APP_PASSWORD=16자리 (직접 넣기)\n연결되면 '완료' — 서버가 연결을 확인합니다.",
    link: DOC,
    check_key: "gmail",
  },
  {
    key: "anthropic_reload",
    title: "Anthropic 잔액 충전 · 자동 충전 켜기",
    steps: "console.anthropic.com → Billing → 충전 + Auto reload 켜기.\n잔액이 바닥나면 AI 직원·검사·이니시스 심사 결제가 함께 멈춥니다. 지금 키는 테스트용이라 새 키를 만들면 Claude에게 알려 주세요(옛 키는 폐기).",
    link: "https://console.anthropic.com/settings/billing",
  },
  {
    key: "biz_address",
    title: "홈택스 사업자등록 소재지 정정 (테크노상업로 112, 204호)",
    steps: "홈택스 → 신청/제출 → 사업자등록 정정 → 사업장 소재지. 무상사용승낙서(어머니 명의) 또는 임대차계약서 첨부.\n정정이 끝나면 Claude에게 '주소 바꿔'라고 하면 사이트 주소를 바꿉니다.",
    link: "https://www.hometax.go.kr",
  },
  {
    key: "inicis_address",
    title: "이니시스 가맹점·보증보험 주소 변경",
    steps: "사업자등록 정정이 끝났으니 이니시스 담당자(조선아)에게 변경된 사업자등록증을 보내 주소 변경을 요청하고, 보증보험 증권 주소도 바꾸세요.",
    after_key: "biz_address",
  },
  {
    key: "kmong_mvp",
    title: "크몽 '모두의 창업 시제품·MVP 제작' 서비스 등록",
    steps: "마켓등록/크몽/09_모두의창업시제품_MVP제작/ 폴더의 이미지와 등록문구.txt를 그대로 올리면 됩니다.",
  },
  {
    key: "b2b_terms",
    title: "기업 이용 조건 한 번 읽어 보기 (환불·책임 한도·관할)",
    steps: "제가 쓴 초안입니다. 9조(해지·환불), 10조(책임 한도 3개월분), 12조(대구지법 관할)만 보시고 바꿀 곳이 있으면 Claude에게 알려 주세요.",
    link: "https://www.yume-reamer.com/b2b/terms",
  },
  { key: "modu_result", title: "모두의 창업 발표 확인", steps: "결과를 확인하고 Claude에게 알려 주세요(지원금 일정에 맞춰 계획을 고칩니다).", due_date: "2026-10-15" },
  { key: "tax_general", title: "일반과세 시작 — 이제 세금계산서를 발급할 수 있어요", steps: "오늘부터 공급분은 홈택스에서 전자세금계산서를 발급합니다(작업 리스트·기업 거래 화면의 '세금계산서 정보 복사' 사용). 그 전 공급분은 현금영수증으로.", due_date: "2026-11-01" },
  { key: "sojin_loan", title: "업력 90일 — 소진공 신용취약 소상공인 자금 직접대출 신청 가능", steps: "소상공인정책자금 누리집(ols.semas.or.kr)에서 직접대출로 신청. 대리대출은 보증서가 필요해 어렵습니다.", due_date: "2026-12-15", link: "https://ols.semas.or.kr" },
];

/** 처음 보는 할 일만 넣는다. */
export async function seed() {
  const t = now();
  for (const s of SEED) {
    await run(
      `INSERT INTO owner_todos (key, title, steps, link, due_date, after_key, check_key, created_at)
       VALUES (:k, :ti, :st, :li, :du, :af, :ck, :t) ON CONFLICT (key) DO NOTHING`,
      { k: s.key, ti: s.title, st: s.steps || "", li: s.link || "", du: s.due_date || null, af: s.after_key || null, ck: s.check_key || null, t },
    );
  }
}

// ── 서버가 직접 확인할 수 있는 할 일 ─────────────────────────────────────
// 유메 도메인 주소로 보낸 시험 메일이 성공했으면 그 주소를 저장해 둔다 — 환경변수를 다시 넣지 않아도 첫 메일 발송이 열린다.
export const OUTREACH_SETTING = "outreach_from";
const OUTREACH_ADDR = () => `${COMPANY.ceo} (유메) <hello@yume-reamer.com>`;

async function checkDone(key, deps = {}) {
  if (key === "gmail") return gmailConfigured() ? { ok: true } : { ok: false, why: "서버에 GMAIL_USER·GMAIL_APP_PASSWORD가 아직 보이지 않아요(Railway에 넣으면 1~2분 뒤 반영)." };
  if (key === "engine") return engineStopped() ? { ok: false, why: "검사 엔진이 아직 멈춰 있어요." } : { ok: true };
  if (key === "outreach_domain") {
    if (process.env.MAIL_FROM_YUME || (await getSetting(OUTREACH_SETTING).catch(() => null))) return { ok: true };
    if (!deps.sendMail) return { ok: false, why: "확인할 수 없어요." };
    try {
      const to = process.env.STAFF_CEO_EMAIL || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";
      await deps.sendMail({ from: OUTREACH_ADDR(), to, subject: "[유메] 메일 도메인 인증 확인", text: "yume-reamer.com 주소로 보낸 시험 메일입니다. 이 메일이 왔다면 첫 메일 발송이 열렸습니다." });
      await setSetting(OUTREACH_SETTING, OUTREACH_ADDR());
      return { ok: true };
    } catch (e) {
      return { ok: false, why: `아직 인증되지 않았어요 — Resend: ${String(e.message || e).slice(0, 160)}` };
    }
  }
  return { ok: true };
}

/** 정리 — 확인 가능한 일은 됐으면 닫는다. 반환: 지금 보여 줄 할 일 목록. */
export async function sync(deps = {}) {
  await seed();
  const today = kstDay();
  for (const t of await all("SELECT * FROM owner_todos WHERE status = 'open' AND check_key IS NOT NULL")) {
    // 시험 메일을 보내야 하는 확인(도메인)은 대표가 '완료'를 눌렀을 때만 한다 — 여기서는 저장된 값만 본다.
    const r = t.check_key === "outreach_domain" ? await checkDone(t.check_key, {}) : await checkDone(t.check_key, deps);
    if (r.ok) await run("UPDATE owner_todos SET status = 'done', done_at = :t WHERE id = :id", { id: t.id, t: now() });
  }
  return list(today);
}

/** 오늘 보여 줄 할 일(열려 있고, 날짜가 됐고, 미룬 날이 지났고, 앞 일이 끝난 것). */
export async function list(today = kstDay()) {
  const rows = await all("SELECT * FROM owner_todos WHERE status = 'open' ORDER BY (due_date IS NULL), due_date, id");
  const done = new Set((await all("SELECT key FROM owner_todos WHERE status = 'done'")).map((r) => r.key));
  return rows
    .filter((t) => (!t.due_date || t.due_date <= today) && (!t.snooze_until || t.snooze_until <= today) && (!t.after_key || done.has(t.after_key)))
    .map(shape);
}

const shape = (t) => ({ id: Number(t.id), key: t.key, title: t.title, steps: t.steps, link: t.link, due_date: t.due_date, check: !!t.check_key, created_at: Number(t.created_at), age: Math.max(0, Math.floor((now() - Number(t.created_at)) / 86_400_000)) });

/** 다가오는 할 일(날짜가 아직인 것) — 화면 아래 "곧 할 일". */
export async function upcoming(today = kstDay()) {
  return (await all("SELECT * FROM owner_todos WHERE status = 'open' AND due_date > :d ORDER BY due_date LIMIT 5", { d: today })).map(shape);
}

export async function complete(id, deps = {}) {
  const t = await one("SELECT * FROM owner_todos WHERE id = :id", { id: Number(id) || 0 });
  if (!t) return { error: "할 일을 찾을 수 없어요." };
  if (t.status === "done") return { ok: true, result: "이미 끝낸 일" };
  if (t.check_key) {
    const r = await checkDone(t.check_key, deps);
    if (!r.ok) return { error: r.why };
  }
  await run("UPDATE owner_todos SET status = 'done', done_at = :t WHERE id = :id", { id: t.id, t: now() });
  return { ok: true, result: t.check_key === "outreach_domain" ? "확인 완료 — 유메 주소로 시험 메일을 보냈고, 첫 메일 발송이 열렸습니다" : "완료" };
}

export async function snooze(id) {
  const r = await run("UPDATE owner_todos SET snooze_until = :d WHERE id = :id AND status = 'open'", { id: Number(id) || 0, d: tomorrow() });
  return r.changes ? { ok: true } : { error: "할 일을 찾을 수 없어요." };
}

/** 대표(또는 Claude)가 직접 넣는 할 일. */
export async function add({ title, steps = "", due_date = null, link = "" }) {
  const ti = String(title || "").trim().slice(0, 200);
  if (!ti) return { error: "할 일을 적어 주세요." };
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(due_date || "")) ? due_date : null;
  const key = `custom:${now()}:${Math.random().toString(36).slice(2, 7)}`;
  await run("INSERT INTO owner_todos (key, title, steps, link, due_date, created_at) VALUES (:k, :t, :s, :l, :d, :c)", { k: key, t: ti, s: String(steps).slice(0, 2000), l: String(link).slice(0, 400), d: due, c: now() });
  return { ok: true };
}
