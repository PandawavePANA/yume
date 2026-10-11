// OpenAPI 명세가 실제 라우터와 어긋나지 않는지 — 경로를 추가하고 명세를 빠뜨리면 여기서 걸린다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openApiSpec } from "../openapi.js";

test("명세의 경로가 apiV1 라우터의 경로와 같다", () => {
  const src = fs.readFileSync(new URL("../apiV1.js", import.meta.url), "utf8");
  const routes = [...src.matchAll(/router\.(get|post)\("([^"]+)"/g)]
    .map(([, m, p]) => `${m} /v1${p}`.replace(/:(\w+)/g, "{$1}"))
    .filter((r) => !r.endsWith("/v1/") && !r.endsWith("/openapi.json"));
  const spec = openApiSpec("https://example.test");
  const documented = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`));
  assert.deepEqual([...documented].sort(), [...new Set(routes)].sort());
});

test("명세는 JSON으로 직렬화되고 모든 $ref가 풀린다", () => {
  const spec = openApiSpec();
  const text = JSON.stringify(spec);
  for (const [, kind, name] of text.matchAll(/"#\/components\/(schemas|responses|parameters)\/(\w+)"/g)) {
    assert.ok(spec.components[kind][name], `${kind}/${name}`);
  }
  assert.equal(spec.openapi, "3.1.0");
});
