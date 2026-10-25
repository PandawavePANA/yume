import test from "node:test";
import assert from "node:assert/strict";
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
const { hasPii, recheckOpen, recordReport, recordSignals, signalStats } = await import("../learnSignals.js");
const { all, run } = await import("../db.js");

test("학습 신호: 확인 안 됨 · 바로잡음만 사실 문장으로, 계산 · 개인정보는 남기지 않는다", async () => {
  await run("DELETE FROM engine_signals");
  const v = {
    hedged: [{ quote: "경북대 수시 원서 접수는 9월 8일부터예요", claim: "경북대 수시 원서 접수는 9월 8일부터", field: "education" }, { quote: "제 번호 010-1234-5678 로 연락", claim: "010-1234-5678", field: "general" }],
    fixes: [{ type: "fact", quote: "최저임금은 1만 원이에요", problem: "실제로는 10,320원", field: "labor", url: "https://www.moel.go.kr" }, { type: "math", quote: "3 × 3 = 10", problem: "계산이 틀렸어요" }],
  };
  assert.equal(await recordSignals(v, { client: "key:1", now: 1000 }), 2);
  await recordSignals(v, { client: "key:1", now: 2000 }); // 같은 문장은 횟수만 는다
  const rows = await all("SELECT kind, field, hits, note FROM engine_signals ORDER BY kind");
  assert.deepEqual(rows.map((r) => [r.kind, r.field, Number(r.hits)]), [["fixed", "labor", 2], ["hedged", "education", 2]]);
  assert.equal(hasPii("a@b.kr 로 보내"), true);
  assert.deepEqual(await recordReport({ quote: "짧" }, {}), { skipped: true, reason: "문장이 너무 짧거나 길거나, 개인정보로 보이는 부분이 있어요" });
  assert.deepEqual(await recordReport({ quote: "근로자의 날은 5월 2일이에요", correct: "5월 1일" }, { client: "key:1", now: 3000 }), { ok: true });
});

test("밤사이 재확인: 확인되면 저장소로(배움), 신고와 엇갈리면 대표 검토, 세 번 못 찾으면 그만", async () => {
  const saved = [];
  const check = async (text) => ({
    results: /경북대/.test(text) ? [{ verdict: "supported", url: "https://ipsi.knu.ac.kr", correct: "" }]
      : /근로자의 날/.test(text) ? [{ verdict: "supported", url: "https://www.law.go.kr" }] : [{ verdict: "unverified" }],
  });
  const save = async (pairs) => (saved.push(...pairs), pairs.length);
  const day = 24 * 3600 * 1000;
  const r = await recheckOpen({ limit: 10, now: 10 * day, check, save });
  assert.equal(r.checked, 2);
  assert.equal(r.learned, 1);
  assert.equal(r.disputed, 1); // 사용자는 틀렸다고 했지만 베리라인은 맞다고 봄 → 대표 검토
  assert.equal(saved.length, 2);
  assert.ok(saved.some(([c]) => c.field === "education")); // 신고된 것을 먼저, 그다음 많이 나온 확인 안 됨
  const st = await signalStats(10 * day);
  assert.equal(st.review.length, 1);
  assert.equal(st.learned.length, 1);
  // 못 찾는 문장: 일주일마다 다시, 세 번째에 그만
  await run("INSERT INTO engine_signals (key, kind, field, claim, quote, status, first_at, last_at) VALUES ('x', 'hedged', 'general', '아무도 모르는 사실', '아무도 모르는 사실', 'open', 1, 1)");
  for (let i = 0; i < 3; i++) await recheckOpen({ limit: 10, now: (20 + i * 8) * day, check, save });
  const x = (await all("SELECT status, attempts FROM engine_signals WHERE key = 'x'"))[0];
  assert.equal(x.status, "unresolvable");
  assert.equal(Number(x.attempts), 3);
});
