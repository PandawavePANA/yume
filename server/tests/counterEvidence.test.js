// 못 찾은 것을 틀렸다고 부르지 않는다.
//
// 실제로 새어 나간 오류에서 출발한 테스트다. Wine Enthusiast가 어떤 와인에 88점을 줬다는
// 주장에 유메가 "사실과 다름"을 붙였는데, 그 점수는 실재했다. 평점이 구독자 전용
// 데이터베이스와 잡지 지면에 들어 있어 일반 웹검색에 안 걸렸을 뿐이었다.
import test from "node:test";
import assert from "node:assert/strict";
import { accusationGrounds, restsOnAbsence } from "../counterEvidence.js";
import { sanitizeClaim } from "../claimGuard.js";

test("못 찾았다는 말은 반박이 아니다", () => {
  const absent = [
    "Wine Enthusiast에서 이 와인의 88점 리뷰를 확인할 수 없습니다.",
    "검색 결과 해당 평점 기록이 없습니다.",
    "James Suckling 리뷰는 검색에 나오지 않습니다.",
    "관련 논문을 찾지 못했습니다.",
    "어디에서도 이 수치를 찾을 수 없었습니다.",
    "공식 자료에 해당 언급이 없어 존재하지 않는 것으로 보입니다.",
  ];
  for (const t of absent) assert.equal(accusationGrounds(t), "absence", t);
});

test("반박은 '그럼 실제로는 무엇인가'를 댄다", () => {
  const contra = [
    "Wine Enthusiast는 이 와인에 90점을 줬으며, 88점이 아닙니다.",
    "실제로는 2021년이 아니라 2019년에 제정되었습니다.",
    "발표 주체는 금감원이 아니라 금융위입니다.",
    "통계청 자료에서 18.7만원으로 확인되어 주장과 다릅니다.",
  ];
  for (const t of contra) assert.equal(accusationGrounds(t), "contradiction", t);
});

test("둘 다 들어 있으면 반박으로 본다", () => {
  // "A에는 없고 실제로는 B다"는 반박이다.
  assert.equal(accusationGrounds("해당 목록에는 없고, 실제 수상작은 다른 작품입니다."), "contradiction");
});

test("어느 쪽도 아니면 단정하지 않는다", () => {
  assert.equal(accusationGrounds(""), "unclear");
  assert.equal(accusationGrounds("주장과 근거가 일치하지 않습니다."), "unclear");
  assert.equal(restsOnAbsence("해당 제품은 단종되었다는 공식 공지가 있습니다."), false);
});

test("못 찾음에 기댄 '사실과 다름'은 '확인되지 않음'으로 내린다", () => {
  const c = sanitizeClaim({
    text: "이 와인은 Wine Enthusiast에서 88점을 받았다",
    domain: "일반",
    verdict: "false",
    verified_via: "web",
    explanation: "Wine Enthusiast 데이터베이스에서 해당 리뷰를 확인할 수 없습니다.",
    sources: [{ title: "Wine Enthusiast", url: "https://www.wineenthusiast.com" }],
  });
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.unbacked_verdict, "false");
  assert.match(c.explanation, /반박하는 자료를 찾은 것이 아니라/);
  assert.match(c.explanation, /유료 데이터베이스/, "왜 검색에 안 걸릴 수 있는지도 말해준다");
  assert.match(c.explanation, /확인할 수 없습니다/, "처음 검토 내용은 버리지 않는다");
});

test("실제 값을 댄 '사실과 다름'은 그대로 둔다", () => {
  const c = sanitizeClaim({
    text: "이 와인은 Wine Enthusiast에서 88점을 받았다",
    domain: "일반",
    verdict: "false",
    verified_via: "web",
    explanation: "Wine Enthusiast는 이 와인에 90점을 줬습니다. 88점이 아닙니다.",
    sources: [{ title: "Wine Enthusiast", url: "https://www.wineenthusiast.com/x" }],
  });
  assert.equal(c.verdict, "false");
  assert.equal(c.unbacked_verdict, undefined);
});

test("부존재 신뢰도 판정은 이 검사를 받지 않는다", () => {
  // nec은 '기록이 없다'를 판정으로 쓰는 유일한 경로다. 어느 공간을 얼마나 덮었는지를
  // 수치로 재고 임계값을 넘을 때만 판정하므로, 설명문이 '못 찾았다'인 것이 정상이다.
  const c = sanitizeClaim({
    text: "2024년 대구 중구 안경 공방 평균 객단가는 18만 7천원",
    domain: "일반",
    verdict: "false",
    verified_via: "nec",
    explanation: "정부·공공기관 공식 기록을 통틀어 이 주장을 뒷받침하는 기록을 찾지 못했습니다.",
    sources: [],
  });
  assert.equal(c.verdict, "false");
});

test("법제처 조문 대조도 이 검사를 받지 않는다", () => {
  const c = sanitizeClaim({
    text: "민법 제750조는 계약 해제를 규정한다",
    domain: "법률",
    verdict: "false",
    verified_via: "official",
    explanation: "제750조 원문에 계약 해제에 관한 언급이 없습니다.",
    sources: [],
  });
  assert.equal(c.verdict, "false");
});
