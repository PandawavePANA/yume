// 현장 요원 — 대표 PC에서 도는 답 수집 도구(scripts/field-agent.mjs)의 서버 쪽 자리.
//
// 현장 요원은 대표 PC의 Edge(전용 프로필, 대표가 직접 로그인)로 상대 서비스 화면에 질문을 한 건씩 넣는다. 서버는
// PC를 직접 움직일 수 없으니, 여기서는 현장 요원이 살아 있는지(심장 박동)만 보고, 맡길 일이 쌓였는데 PC가 꺼져 있으면
// 대표에게 알린다(하루 한 번).
import { all } from "../../db.js";
import { getSetting } from "../../auditDesk.js";

const STALE_MS = 15 * 60_000;

export async function heartbeat() {
  const at = Number(await getSetting("field_agent:heartbeat").catch(() => 0)) || 0;
  const note = (await getSetting("field_agent:status").catch(() => "")) || "";
  return { at, alive: Date.now() - at < STALE_MS, note };
}

export async function run(ctx) {
  const hb = await heartbeat();
  const queued = await all("SELECT id, company FROM ai_audits WHERE collect_status IN ('queued','running') AND closed_at IS NULL");
  if (hb.alive) return { note: hb.note || `PC 연결됨 · 맡은 감사 ${queued.length}건` };
  if (queued.length) {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    await ctx.propose({
      kind: "field_offline",
      title: `현장 요원(PC)이 꺼져 있어요 — 답 수집 대기 ${queued.length}건`,
      summary: `${queued.map((q) => q.company).join(", ")}의 답 수집이 기다리고 있습니다. 대표 PC에서 바탕화면 '유메 현장요원 시작'을 실행해 두면 근무 시간(06:00~19:30) 동안 알아서 질문을 넣습니다.\n마지막 연결: ${hb.at ? new Date(hb.at + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ") : "없음"}`,
      payload: { count: queued.length },
      dedupe: `field_offline:${day}`,
    });
  }
  return { note: hb.at ? "PC 연결 끊김" : "PC에서 아직 시작 안 함" };
}
