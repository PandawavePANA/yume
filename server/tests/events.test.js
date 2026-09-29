// 유입 측정 — 광고를 켜기 전에 "어디서 온 사람이 어디까지 갔나"를 셀 수 있어야 한다.
process.env.PGLITE_DIR = "memory://";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const db = await import("../db.js");
const { recordEvent, funnel, trackingFrom } = await import("../events.js");

before(() => db.ready);
after(() => db.closeDb());

const req = (anon, src) => ({ get: (h) => ({ "x-yume-anon": anon, "x-yume-src": src })[h.toLowerCase()] });

test("헤더에서 익명 id와 출처를 읽고, 이상한 값은 버린다", () => {
  assert.deepEqual(trackingFrom(req("abcdef123456", "Naver|CPC|Launch 1")), { anon: "abcdef123456", source: "naver", medium: "cpc", campaign: "launch1" });
  assert.equal(trackingFrom(req("<script>", "")).anon, null);
  assert.equal(trackingFrom(req("", "")).source, "direct");
});

test("출처별로 방문 → 첫 확인 → 가입 → 결제를 센다", async () => {
  const a = req("anonaaaa0001", "naver|cpc|launch");
  const b = req("anonbbbb0002", "naver|cpc|launch");
  const c = req("anoncccc0003", "direct||");
  await recordEvent("visit", { req: a });
  await recordEvent("visit", { req: a }); // 같은 브라우저가 두 번 와도 방문은 1
  await recordEvent("visit", { req: b });
  await recordEvent("visit", { req: c });
  await recordEvent("check", { req: a });
  await recordEvent("check", { req: a });
  await recordEvent("signup", { req: a, userId: 501 });
  await recordEvent("purchase", { userId: 501, amount: 12000 });
  await recordEvent("purchase", { userId: 999, amount: 9900 }); // 측정 전에 가입한 회원

  const rows = await funnel(7);
  const naver = rows.find((r) => r.source === "naver");
  assert.deepEqual(
    { visits: naver.visits, checkers: naver.checkers, signups: naver.signups, buyers: naver.buyers, revenue: naver.revenue },
    { visits: 2, checkers: 1, signups: 1, buyers: 1, revenue: 12000 },
  );
  assert.equal(rows.find((r) => r.source === "direct").visits, 1);
  assert.equal(rows.find((r) => r.source === "(기존 회원)").revenue, 9900);
});
