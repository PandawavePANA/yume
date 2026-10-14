// 현장 요원 — 서버 쪽 자리. 두 가지를 한다.
//   ① 질문 검수: 답을 받으러 가기 전에 준비된 질문을 기준 AI로 시험해, 기준 AI도 맞히는 쉬운 문항을 어려운 것으로 바꾼다
//      (qreview.js). 이게 끝나야 답 수집(현장 요원 PC 또는 대표)이 시작된다.
//   ② PC 확인: 대표 PC에서 도는 답 수집 도구(scripts/field-agent.mjs)가 살아 있는지 심장 박동을 보고, 맡길 일이 쌓였는데
//      PC가 꺼져 있으면 대표에게 알린다(하루 한 번).
import { all } from "../../db.js";
import { getSetting } from "../../auditDesk.js";
import { reviewQuestions, waitingReview } from "./qreview.js";

const STALE_MS = 15 * 60_000;

export async function heartbeat() {
  const at = Number(await getSetting("field_agent:heartbeat").catch(() => 0)) || 0;
  const note = (await getSetting("field_agent:status").catch(() => "")) || "";
  return { at, alive: Date.now() - at < STALE_MS, note };
}

export async function run(ctx) {
  const notes = [];
  for (const a of await waitingReview(2)) {
    const r = await reviewQuestions(a, ctx.deps);
    await ctx.log(`${a.company} 질문 검수 — ${r.note}`, { ref: `audit:${a.id}`, costUsd: r.usd });
    notes.push(`${a.company} 질문 검수`);
  }
  const hb = await heartbeat();
  const queued = await all("SELECT id, company FROM ai_audits WHERE collect_status IN ('queued','running') AND closed_at IS NULL");
  if (hb.alive) return { note: [...notes, hb.note || `PC 연결됨 · 맡은 감사 ${queued.length}건`].join(" · ") };
  if (queued.length) {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    await ctx.propose({
      kind: "field_offline",
      title: `현장 요원(PC)이 꺼져 있어요 — 답 수집 대기 ${queued.length}건`,
      summary: `${queued.map((q) => q.company).join(", ")}의 답 수집이 기다리고 있습니다. PC를 켜면 시작프로그램으로 현장 요원이 자동으로 뜹니다(또는 바탕화면 '유메 현장요원 시작').\n마지막 연결: ${hb.at ? new Date(hb.at + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ") : "없음"}`,
      payload: { count: queued.length },
      dedupe: `field_offline:${day}`,
    });
  }
  return { note: [...notes, hb.at ? "PC 연결 끊김" : "PC에서 아직 시작 안 함"].join(" · ") };
}
