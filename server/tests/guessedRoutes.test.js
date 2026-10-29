// 짐작해서 치는 주소 · llms.txt · 없는 주소 404 (2026-10-29 운영 점검에서 없는 주소가 모두 200이던 것을 고침)
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hasBuild = fs.existsSync(path.join(here, "..", "..", "dist", "index.html"));
const maybe = hasBuild ? test : test.skip;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-guess-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");

let server;
let base;
before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

maybe("짐작한 주소는 맞는 자리로 301", async () => {
  for (const [from, to] of [["/developers", "/docs/api"], ["/pricing", "/#pricing"], ["/contact", "/#diagnosis"], ["/console", "/check"]]) {
    const r = await fetch(base + from, { redirect: "manual" });
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get("location"), to, from);
  }
});

maybe("llms.txt는 화면이 아니라 텍스트", async () => {
  const r = await fetch(`${base}/llms.txt`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") || "", /text\/plain/);
  const t = await r.text();
  assert.match(t, /^# 베리라인/);
  assert.doesNotMatch(t, /<html/i);
});

maybe("없는 주소는 404 · noindex, 있는 화면은 200", async () => {
  const miss = await fetch(`${base}/no-such-page-xyz`);
  assert.equal(miss.status, 404);
  assert.match(miss.headers.get("x-robots-tag") || "", /noindex/);
  for (const ok of ["/", "/check"]) assert.equal((await fetch(base + ok)).status, 200, ok);
});
