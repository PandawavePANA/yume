// 다인 — 엔진팀 '엔진 학습'(2026-10-18 대표 "미르미에서 쌓인 데이터가 유메를 발전시키는 구조").
// 미르미 등에서 모인 학습 신호(learnSignals.js) 가운데 많이 나온 '확인 안 됨'과 신고된 문장을 매일 아침 더 깊게 다시 확인한다.
// 확인되면 확인된 사실 저장소에 들어가 다음부터는 바로 판정된다. 사용자가 틀렸다고 했는데 유메는 맞다고 보는 문장은 대표 검토로 남긴다.
import { recheckOpen, signalStats } from "../../learnSignals.js";

export async function run(ctx) {
  const limit = ctx.cap(10);
  const r = await recheckOpen({ limit });
  const st = await signalStats().catch(() => null);
  const open = (st?.kinds || []).filter((k) => k.status === "open").reduce((n, k) => n + k.n, 0);
  const note = r.checked
    ? `다시 확인 ${r.checked}개 — 배움 ${r.learned} · 아직 못 찾음 ${r.still} · 찾을 수 없음 ${r.unresolvable}${r.disputed ? ` · 신고와 엇갈림 ${r.disputed}(대표 검토)` : ""} · 남은 신호 ${open}`
    : `다시 확인할 신호가 없어요(남은 신호 ${open})`;
  await ctx.log(note, { level: r.disputed ? "warn" : "info" });
  return { note };
}
