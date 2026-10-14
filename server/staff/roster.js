// 조직도 — 대표 아래 비서실과 네 팀. 직원은 기안하고, 팀장(또는 다른 팀)이 검토하고, 대표는 결재만 한다.
//
// 2026-10-14 대표: "다 알아서 하고, 나는 보고서 읽고 발송 메일만 컨펌" — 그래서 밖으로 나가는 메일(과 은행 앱으로만 볼 수 있는
// 입금 확인)만 대표 결재이고, 나머지(후보 등록·약관 판정·오류 재확인)는 팀장 전결로 바로 처리한다(KINDS.auto).
//
//   대표 정원영 ─┬─ 비서실   유나(비서실장) · 서윤(메일) 아침 브리핑·급한 결재 알림 / 메일함 정리·답장 초안
//               ├─ 영업팀   지호(팀장) · 서연(리서처)  첫 메일·후속 / 기업 발굴
//               ├─ 법무팀   도윤                     약관 검토 · 나가는 문구 검토
//               ├─ 감사팀   하린(팀장) · 수아(QA)      질문 준비·채점 / 오류 후보 원문 대조
//               └─ 경영지원 민재(팀장)                 입금 확인 요청·보고서 발송·안부 메일
import * as research from "./jobs/research.js";
import * as tos from "./jobs/tos.js";
import * as prep from "./jobs/prep.js";
import * as qa from "./jobs/qa.js";
import * as sales from "./jobs/sales.js";
import * as ops from "./jobs/ops.js";
import * as secretary from "./jobs/secretary.js";
import * as inbox from "./jobs/inbox.js";
import { lintCopy } from "../auditDesk.js";

const MIN = 60_000;

export const CEO = { name: "정원영", title: "대표" };

export const TEAMS = {
  office: { label: "비서실", hue: 268 },
  sales: { label: "영업팀", hue: 24 },
  legal: { label: "법무팀", hue: 200 },
  audit: { label: "감사팀", hue: 158 },
  ops: { label: "경영지원팀", hue: 45 },
};

// ai: Claude를 부르는 직원(엔진이 멈추면 쉰다). schedule: every(간격) 또는 daily(한국 시각) + hours(근무 시간대) + weekdays.
export const ROSTER = {
  yuna: { name: "유나", title: "비서실장", team: "office", lead: true, duty: "매일 아침 브리핑 · 급한 결재 알림", job: secretary, schedule: { daily: { h: 8, m: 30 } }, ai: false, defaults: { autonomy: "auto" }, autoOnly: true },
  seoyun: { name: "서윤", title: "비서(메일)", team: "office", reportsTo: "yuna", duty: "대표 메일함 정리 · 답장 초안 결재 · 수신 거부 처리", job: inbox, schedule: { every: 10 * 60_000 }, ai: true, defaults: { autonomy: "auto" }, autoOnly: true },
  jiho: { name: "지호", title: "영업팀장", team: "sales", lead: true, duty: "재확인 끝난 감사의 첫 메일 · 7일 뒤 후속 1회", job: sales, schedule: { every: 15 * MIN }, ai: false, defaults: { autonomy: "approve", dailyCap: 10 }, approveOnly: true },
  seoyeon: { name: "서연", title: "리서처", team: "sales", reportsTo: "jiho", duty: "한국어 AI 상담 서비스를 웹에서 찾아 감사 후보로", job: research, schedule: { daily: { h: 10, m: 0 }, weekdays: true }, ai: true, defaults: { autonomy: "auto", dailyCap: 3 }, autoOnly: true },
  doyun: { name: "도윤", title: "법무 담당", team: "legal", lead: true, duty: "후보 회사 이용약관 검토 · 나가는 메일 문구 검토", job: tos, schedule: { every: 30 * MIN, hours: [8, 22] }, ai: true, defaults: { autonomy: "auto", dailyCap: 3 }, autoOnly: true },
  harin: { name: "하린", title: "감사팀장", team: "audit", lead: true, duty: "질문 세트 준비 · 답이 오면 채점 · 답 수집 요청", job: prep, schedule: { every: 10 * MIN }, ai: true, defaults: { autonomy: "auto", dailyCap: 2 }, autoOnly: true },
  sua: { name: "수아", title: "QA 검수", team: "audit", reportsTo: "harin", duty: "오류 후보를 법령 원문과 다시 대조해 재확인 결재", job: qa, schedule: { every: 15 * MIN }, ai: true, defaults: { autonomy: "auto" }, autoOnly: true },
  minjae: { name: "민재", title: "경영지원팀장", team: "ops", lead: true, duty: "입금 확인 요청 · 유료 보고서 발송 · 견적 안부 · 입금 안내", job: ops, schedule: { every: 30 * MIN }, ai: false, defaults: { autonomy: "approve" }, approveOnly: true },
};

// 결재 문서 종류. drafter(기안) → reviewer(검토) → 대표(결재). work: 대표가 직접 손을 대야 하는 업무 요청.
// auto: 대표에게 올리지 않고 검토자(팀장) 전결로 바로 처리 — 기록은 결재함 이력에 남는다.
export const KINDS = {
  add_prospects: { label: "감사 후보 등록", drafter: "seoyeon", reviewer: "jiho", auto: true, apply: (p, i) => applyProspects(p, i) },
  tos_verdict: { label: "약관 판정", drafter: "doyun", reviewer: "jiho", auto: true, apply: (p) => tos.apply(p) },
  collect_answers: { label: "답 수집 요청", drafter: "harin", work: true, apply: async () => ({ ok: true, result: "대표가 답 수집을 맡음 — 답이 저장되면 감사팀이 채점을 이어 갑니다" }) },
  review_findings: { label: "오류 재확인", drafter: "sua", reviewer: "harin", auto: true, apply: (p, i) => qa.apply(p, i) },
  send_first: { label: "첫 메일 발송", drafter: "jiho", reviewer: "doyun", apply: (p, i, d) => sales.sendFirst(p, i, d) },
  send_followup: { label: "후속 메일", drafter: "jiho", reviewer: "doyun", apply: (p, i, d) => sales.sendFollowup(p, i, d) },
  confirm_payment: { label: "입금 확인", drafter: "minjae", urgent: true, apply: (p, i, d) => ops.confirmPaid(p, i, d) },
  deliver_report: { label: "보고서 발송", drafter: "minjae", reviewer: "harin", urgent: true, apply: (p, i, d) => ops.deliverReport(p, i, d) },
  quote_reminder: { label: "견적 안부 메일", drafter: "minjae", reviewer: "doyun", apply: (p, i, d) => ops.sendCustomerMail(p, i, d) },
  pay_reminder: { label: "입금 안내 메일", drafter: "minjae", apply: (p, i, d) => ops.sendCustomerMail(p, i, d) },
  reply_mail: { label: "답장", drafter: "seoyun", reviewer: "doyun", apply: (p, i, d) => sendReplyMail(p, i, d) },
};

/** 답장 결재 — 대표가 고친 본문(없으면 초안)을 대표 주소로, 원래 대화에 붙여 보낸다. 법무 문구 점검을 다시 한다. */
async function sendReplyMail(payload, input = {}, deps = {}) {
  const text = String(input.body ?? payload.draft ?? "").trim();
  if (!text) return { ok: false, result: "답장 본문이 비어 있어요." };
  if (/\[확인 필요/.test(text)) return { ok: false, result: "초안에 [확인 필요] 표시가 남아 있어요. 채워 넣고 다시 승인해 주세요." };
  const hits = lintCopy(text).filter((h) => /보증|인증|단정/.test(h.why));
  if (hits.length) return { ok: false, result: `법무 검토: ${hits.map((h) => `“${h.match}”`).join(", ")} 표현을 빼 주세요.` };
  const to = String(input.to || payload.to || "").trim();
  if (!to) return { ok: false, result: "받는 사람이 없어요." };
  await deps.gmailSend({ to, subject: payload.subject || "", text, inReplyTo: payload.messageId, references: payload.references, fromName: CEO.name });
  if (payload.uid) await deps.gmailMarkAnswered(payload.uid);
  return { ok: true, result: `${to}에게 답장 보냄(대표 메일함 보낸편지함에 남음)` };
}

async function applyProspects(payload, input = {}) {
  const all = payload.candidates || [];
  const pick = Array.isArray(input.pick) ? new Set(input.pick.map(Number)) : null;
  const list = pick ? all.filter((_, i) => pick.has(i)) : all;
  if (!list.length) return { ok: true, result: "고른 후보 없음" };
  const ids = await research.addProspects(list, ROSTER.seoyeon.name);
  return { ok: true, result: `감사 데스크에 ${ids.length}곳 등록${ids.length < list.length ? ` (이미 있던 ${list.length - ids.length}곳 제외)` : ""}` };
}

/** 결재선 — 문서마다 기안·검토·결재 칸. */
export function lineFor(kind) {
  const k = KINDS[kind] || {};
  const person = (id, role) => (id && ROSTER[id] ? { role, id, name: ROSTER[id].name, title: ROSTER[id].title, team: TEAMS[ROSTER[id].team].label } : null);
  return [person(k.drafter, "기안"), person(k.reviewer, "검토"), { role: "결재", id: "ceo", name: CEO.name, title: CEO.title, team: "" }].filter(Boolean);
}
