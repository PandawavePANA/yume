// 정적 파일 캐시 규칙.
//
// 이름에 해시가 붙은 파일은 1년 동안 묻지도 말고 쓰라고 보낸다 — 내용이 바뀌면 이름이
// 바뀌므로 같은 이름은 영원히 같다. 반대로 index.html은 매번 물어봐야 한다. 옛 index.html을
// 쥐고 있으면 새 배포에서 사라진 옛 JS를 찾다가 흰 화면이 된다.
//
// 두 규칙이 뒤바뀌면 둘 다 조용히 나빠진다. 앞쪽이 풀리면 느려지기만 하고, 뒤쪽이 굳으면
// 배포할 때마다 일부 사람에게만 화면이 안 뜬다. 어느 쪽도 에러를 내지 않는다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "..", "..", "dist");
const hasBuild = fs.existsSync(path.join(distDir, "index.html"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-cache-"));
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

// 빌드 없이 테스트만 돌리는 환경(CI 등)에서는 dist가 없다. 그때는 확인할 것이 없으므로 건너뛴다.
const maybe = hasBuild ? test : test.skip;

maybe("해시가 붙은 파일은 1년 동안 묻지 않고 쓴다", async () => {
  const asset = fs.readdirSync(path.join(distDir, "assets")).find((f) => f.endsWith(".js"));
  assert.ok(asset, "빌드된 JS가 있어야 한다");
  const r = await fetch(`${base}/assets/${asset}`);
  assert.equal(r.status, 200);
  const cc = r.headers.get("cache-control") || "";
  assert.match(cc, /max-age=31536000/);
  assert.match(cc, /immutable/);
});

maybe("index.html은 매번 새로 확인한다", async () => {
  for (const url of ["/", "/some/deep/route"]) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, url);
    const cc = r.headers.get("cache-control") || "";
    assert.match(cc, /no-cache/, `${url}는 no-cache여야 한다 — 옛 화면을 쥐면 흰 화면이 된다`);
    assert.doesNotMatch(cc, /immutable|max-age=31536000/, url);
  }
});

maybe("이름이 고정된 파일은 하루만 둔다", async () => {
  const fixed = ["robots.txt", "favicon.png"].find((f) => fs.existsSync(path.join(distDir, f)));
  assert.ok(fixed, "이름이 고정된 파일이 하나는 있어야 한다");
  const r = await fetch(`${base}/${fixed}`);
  const cc = r.headers.get("cache-control") || "";
  assert.match(cc, /max-age=86400/);
  assert.doesNotMatch(cc, /immutable/, "이름이 안 바뀌는 파일을 영원히 굳히면 고쳐도 안 바뀐다");
});

maybe("API 응답에는 이 규칙이 붙지 않는다", async () => {
  const r = await fetch(`${base}/api/health`);
  const cc = r.headers.get("cache-control") || "";
  assert.doesNotMatch(cc, /immutable|max-age=31536000/);
});
