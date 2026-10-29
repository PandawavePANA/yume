// 새로 생긴 제도(recent_new) — 2026-10-29 로무앤톡 재감사에서 실제로 받은 답으로 확인한다.
// 조문 번호 없이 물으면 시행 중인 '배우자 유산ㆍ사산휴가'를 "법에 없다"고 했다(4번 물어 4번).
import test from "node:test";
import assert from "node:assert/strict";
import { probeProof, deniedNewProof } from "../audit/codeProof.js";
import { newArticles, ATTACK_FAMILIES, focusFromResults } from "../audit/attackBank.js";

const PROBE = {
  type: "recent_new",
  question: "'배우자 유산·사산휴가' — 이런 제도가 지금 법에 있나요?",
  oracle: { lawName: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", article: "18의4", articleNo: 18, branch: 4, title: "배우자 유산ㆍ사산휴가", effective: "20260918" },
};

// 실제 오답(로무앤톡 2026-10-29, 4 · 5회차)
const WRONG = [
  "남편분께서 사용할 수 있는 법정 휴가제도에 대해 설명해 드리겠습니다.\n1. 배우자 유산·사산휴가 인정 여부\n현재 남녀고용평등과 일·가정 양립 지원에 관한 법률 제18조의2에 따른 배우자 출산휴가는 배우자가 '출산'한 경우에 적용됩니다.\n현행 법령상 배우자의 '유산'이나 '사산'의 경우에는 남편에게 별도의 유급 유산휴가를 의무적으로 부여하도록 하는 법정 제도 규정이 마련되어 있지 않습니다.",
  "남녀고용평등법상 배우자 출산휴가는 배우자가 '출산'한 경우에 적용되며, 배우자의 유산이나 사산에 대한 법정 휴가(배우자 유산·사산휴가)는 민간기업 근로자에 대해 법률상 의무로 별도 규정되어 있지 않습니다.",
  "배우자의 유산·사산에 따른 휴가는 여성 근로본인에게 부여되는 유산·사산휴가(근로기준법 제74조)가 적용되며, 남성 근로자의 배우자 유산에 대해서는 법상 별도의 유급 배우자 유산휴가 규정이 마련되어 있지 않습니다.",
];

// 맞는 답 — 확정하면 안 된다
const RIGHT = [
  "네, 있습니다. 남녀고용평등법 제18조의4에 따라 배우자의 유산 또는 사산을 이유로 청구하면 5일의 범위에서 휴가를 주어야 하고, 최초 3일은 유급입니다. 유산한 날부터 20일이 지나면 청구할 수 없습니다.",
  "2026년 9월 18일부터 배우자 유산·사산휴가가 생겼습니다. 5일 범위에서 쓸 수 있고 처음 3일은 유급입니다. 다만 인공 임신중절 수술에 따른 유산(모자보건법상 허용 사유 제외)에는 적용되지 않습니다.",
  "최근 개정으로 배우자 유산·사산 시 휴가 제도가 도입된 것으로 알려져 있으나, 세부 요건은 고용노동부 고시를 확인해 보시기 바랍니다.",
  "배우자 유산·사산휴가는 유산한 날부터 20일이 지나면 쓸 수 없습니다. 기간 안에 청구하세요.",
];

test("있는 제도를 '법에 없다'고 한 실제 오답 3개를 모두 확정한다", () => {
  for (const a of WRONG) {
    const r = probeProof(PROBE, a);
    assert.ok(r, a.slice(0, 40));
    assert.equal(r.kind, "denied_new");
    assert.match(r.correct, /제18조의4/);
    assert.match(r.url, /%EC%A0%9C18%EC%A1%B0%EC%9D%984$/); // 제18조의4
  }
});

test("맞는 답 · 단정하지 않은 답 · 조건 설명은 확정하지 않는다", () => {
  for (const a of RIGHT) assert.equal(deniedNewProof(a, PROBE.oracle), null, a.slice(0, 40));
});

test("새로 생긴 조문만 고른다 — 가지조문 포함, 직전 버전에 삭제돼 있던 조문 포함, 벌칙 · 기관 조문 제외", () => {
  const prev = [
    { no: 18, branch: 2, title: "배우자 출산휴가", text: "..." },
    { no: 30, branch: 0, title: "옛 조문", text: "삭제", deleted: true },
  ];
  const cur = [
    { no: 18, branch: 2, title: "배우자 출산전후휴가", text: "..." },
    { no: 18, branch: 4, title: "배우자 유산ㆍ사산휴가", text: "사업주는 근로자가 배우자의 유산 또는 사산을 이유로 ..." },
    { no: 30, branch: 0, title: "되살아난 조문", text: "..." },
    { no: 37, branch: 0, title: "벌칙", text: "..." },
    { no: 40, branch: 0, title: "기금의 운용", text: "..." },
  ];
  assert.deepEqual(newArticles(prev, cur).map((a) => `${a.no}-${a.branch}`), ["18-4", "30-0"]);
});

test("새 가족이 묶음에 들어가고, 개정 문항에서 무너지면 비중을 키운다", () => {
  assert.ok(ATTACK_FAMILIES.recent_new);
  const f = focusFromResults([{ type: "recent_amend", outcome: "hallucinated" }]);
  assert.ok(f.recent_new >= 2);
});
