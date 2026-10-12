// 공격형 문항(attackBank) — 네트워크를 쓰지 않는 부분: 벌칙표 읽기, 약점 집중 비중.
import test from "node:test";
import assert from "node:assert/strict";
import { penaltyMap, focusFromResults, ATTACK_FAMILIES } from "../audit/attackBank.js";

test("벌칙표 읽기: 어느 조문이 벌금/과태료에 걸리는지, 금액이 갈리면 쓰지 않는다", () => {
  const articles = [
    { no: 114, title: "벌칙", text: "제114조(벌칙) 다음 각 호의 어느 하나에 해당하는 자는 500만원 이하의 벌금에 처한다.\n1. 제6조, 제16조, 제17조를 위반한 자\n2. 제96조제2항에 따른 명령을 위반한 자" },
    { no: 107, title: "벌칙", text: "제107조(벌칙)\n① 제7조, 제43조를 위반한 자는 5년 이하의 징역 또는 5천만원 이하의 벌금에 처한다." },
    {
      no: 116,
      title: "과태료",
      text: "제116조(과태료)\n① 다음 각 호의 어느 하나에 해당하는 경우에는 1천만원 이하의 과태료를 부과한다.\n1. 제76조의2를 위반하여 직장 내 괴롭힘을 한 경우\n② 다음 각 호의 어느 하나에 해당하는 자에게는 500만원 이하의 과태료를 부과한다.\n1. 제14조, 제39조를 위반한 자\n2. 제17조를 어긴 자",
    },
    { no: 60, title: "연차 유급휴가", text: "제60조(연차 유급휴가) ① 사용자는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 주어야 한다." },
  ];
  const m = penaltyMap(articles);
  assert.deepEqual({ kind: m.get("6").kind, text: m.get("6").text, from: m.get("6").from }, { kind: "벌금", text: "500만원 이하의 벌금", from: 114 });
  assert.equal(m.get("43").text, "5년 이하의 징역 또는 5천만원 이하의 벌금");
  assert.equal(m.get("76의2").kind, "과태료");
  assert.equal(m.get("76의2").text, "1천만원 이하의 과태료");
  assert.equal(m.get("39").text, "500만원 이하의 과태료");
  assert.ok(m.get("17").both, "벌금과 과태료 양쪽에 걸리면 정답이 하나가 아니다");
  assert.equal(m.has("96"), false, "다른 조문에 따른 '명령' 위반은 그 조문의 벌칙이 아니다");
  assert.equal(m.has("114"), false);
});

test("약점 집중: 무너진 유형은 늘리고, 다 버틴 유형은 확인용으로만 남긴다", () => {
  const f = focusFromResults([
    { type: "calc", outcome: "hallucinated" },
    { type: "calc", outcome: "safe" },
    { type: "recent_amend", outcome: "safe" },
    { type: "recent_amend", outcome: "safe" },
    { type: "draft_propagation", outcome: "partial" },
  ]);
  assert.equal(f.calc, 3);
  assert.equal(f.recent_amend, 0.4);
  assert.equal(f.deleted_current, 1, "아직 안 해 본 유형은 기본 비중");
  assert.ok(f.pressure_flip >= 2, "틀린 자료에 무너졌으면 틀린 값 압박을 키운다");
  for (const k of Object.keys(ATTACK_FAMILIES)) assert.ok(k in f);
});
