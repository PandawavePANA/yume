// 감사 세션·리포트가 서버 재시작을 넘겨 살아남는지.
//
// 예전에는 둘 다 모듈 안의 Map에 있었다. 배포할 때마다 진행 중이던 감사가 통째로
// 사라져서, 문항을 받아 자기 AI에 넣고 돌아온 사람이 "세션이 만료됐다"는 말을 들었다.
// 실제로 그 일이 일어났다. 여기서 보는 건 "DB에 있는가" 하나다 — 모듈 메모리에 있으면
// 재시작을 못 넘기고, DB에 있으면 넘긴다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-audit-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");

let server;
let base;
before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

let ipSeq = 0;
const post = (url, body) =>
  fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.7.0.${(ipSeq += 1)}` },
    body: JSON.stringify(body),
  });

test("발급한 문항은 DB에 남는다 — 재시작해도 채점할 수 있어야 한다", async () => {
  const res = await post("/api/audit/probes", { domain: "법률", subject: "테스트 AI" });
  // 오라클 조회가 필요한 문항은 네트워크 없이 조용히 빠지지만, 순수 문항이 남아
  // 발급 자체는 성공해야 한다.
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.session_id);
  assert.ok(data.probes.length > 0);

  // 정답은 절대 내려가지 않는다. 내려가면 그대로 붙여넣어 만점을 만들 수 있다.
  for (const p of data.probes) {
    assert.equal(p.groundTruth, undefined);
    assert.equal(p.oracle, undefined);
  }

  const row = await db.one("SELECT * FROM audit_sessions WHERE id = :id", { id: data.session_id });
  assert.ok(row, "세션이 DB에 있어야 한다 — 메모리에만 있으면 배포 한 번에 사라진다");
  // 채점에 필요한 정답은 서버 쪽에 그대로 보관된다.
  const probes = JSON.parse(row.probes);
  assert.equal(probes.length, data.probes.length);
});

test("채점하면 세션은 지워지고 리포트가 DB에 남아 링크로 열린다", async () => {
  const issued = await (await post("/api/audit/probes", { domain: "법률" })).json();
  const answers = Object.fromEntries(issued.probes.map((p) => [p.id, "확인된 근거가 없어 답변드리기 어렵습니다."]));

  const graded = await post("/api/audit/grade", { session_id: issued.session_id, answers });
  assert.equal(graded.status, 200);
  const report = await graded.json();
  assert.ok(report.report_id);

  assert.equal(
    (await db.one("SELECT COUNT(*) AS n FROM audit_sessions WHERE id = :id", { id: issued.session_id })).n,
    0,
    "채점이 끝난 세션은 남겨두지 않는다",
  );
  assert.ok(await db.one("SELECT * FROM audit_reports WHERE id = :id", { id: report.report_id }));

  // 안내한 대로 링크가 열려야 한다. 7일이라고 적어두고 배포 한 번에 죽으면 안 된다.
  const page = await fetch(`${base}${report.report_url}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
});

test("없는 세션으로 채점하면 410으로 돌려보낸다", async () => {
  const res = await post("/api/audit/grade", { session_id: "없는세션00000000", answers: { p1: "답" } });
  assert.equal(res.status, 410);
  assert.match((await res.json()).error, /만료/);
});
