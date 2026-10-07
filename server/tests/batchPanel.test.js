// 일괄 검증 화면이 입력을 항목으로 나누는 규칙. 돈이 걸린 자리라 잘못 나누면
// 고객이 의도한 것보다 많은 크레딧을 쓰거나, 한 건으로 뭉뚱그려져 검증이 흐려진다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../../src/components/yume/BatchPanel.jsx", import.meta.url), "utf8");
const grab = (name) => {
  const at = src.indexOf(`export function ${name}`);
  assert.ok(at >= 0, `${name} 없음`);
  // 함수 하나를 통째로 떼어 낸다(다음 export 직전까지).
  const next = src.indexOf("\nexport ", at + 1);
  return src.slice(at, next < 0 ? src.length : next).replace("export ", "");
};
const mod = new Function(`${grab("splitItems")}\n${grab("parseCsv")}\n${grab("pickTextColumn")}\nreturn { splitItems, parseCsv, pickTextColumn };`)();

test("붙여넣기 — 빈 줄이 있으면 문단, 없으면 줄 단위", () => {
  assert.deepEqual(mod.splitItems("첫째\n둘째\n셋째"), ["첫째", "둘째", "셋째"]);
  assert.deepEqual(mod.splitItems("첫 문단\n이어지는 줄\n\n둘째 문단"), ["첫 문단\n이어지는 줄", "둘째 문단"]);
  assert.deepEqual(mod.splitItems("   \n  \n"), []);
});

test("CSV — 따옴표 안의 쉼표와 줄바꿈을 지킨다", () => {
  const rows = mod.parseCsv('번호,내용\n1,"쉼표, 포함된 문장"\n2,"줄\n바꿈"');
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], "쉼표, 포함된 문장");
  assert.equal(rows[2][1], "줄\n바꿈");
});

test("CSV — 가장 긴 칸을 본문으로 고르고 머리글을 뺀다", () => {
  const rows = mod.parseCsv('id,답변\n1,"아세트아미노펜 하루 최대 4000mg입니다"\n2,"민법 제750조는 불법행위를 규정합니다"');
  const picked = mod.pickTextColumn(rows);
  assert.equal(picked.length, 2, "머리글 줄은 빠져야 함");
  assert.ok(picked[0].includes("아세트아미노펜"));
  assert.ok(!picked.some((p) => p === "id" || p === "답변"));
});

test("CSV — 칸이 하나뿐이면 그대로 쓴다", () => {
  assert.deepEqual(mod.pickTextColumn(mod.parseCsv("첫 줄\n둘째 줄")), ["첫 줄", "둘째 줄"]);
});
