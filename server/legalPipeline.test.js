// 오프라인(단, 법제처 API는 실제 호출) 파이프라인 배선 테스트.
// Anthropic API 키가 아직 없으므로 grounding(claude.js) 부분만 스텁으로 대체하고,
// 법제처 국가법령정보 공동활용 API는 실제 OC 코드로 진짜 호출한다.
// 실행: npm run test:legal
import "dotenv/config";
import assert from "node:assert/strict";
import { resolveLegalClaims } from "./legalPipeline.js";
import { groundLegalClaim } from "./claude.js";

// 실제 Claude 호출 없이 파이프라인 배선만 확인하기 위한 스텁 — 진짜 판정이 아님을 explanation에 명시한다.
async function stubGround(claimText, officialText) {
  return { verdict: "confirmed", explanation: `[STUB grounding] 공식 텍스트 확인됨: ${officialText.slice(0, 60)}...` };
}

const claims = [
  {
    text: "민법 제750조는 고의 또는 과실로 타인에게 손해를 가한 자에게 배상 책임을 지운다.",
    domain: "법률",
    verdict: "pending_legal_check",
    explanation: "",
    sources: [],
    legal_ref: { type: "statute", law_name: "민법", article: "750조" },
  },
  {
    text: "대한민국 존재하지않는특별법 제1조에 따르면 모든 국민은 우주여행을 할 권리가 있다.",
    domain: "법률",
    verdict: "pending_legal_check",
    explanation: "",
    sources: [],
    legal_ref: { type: "statute", law_name: "존재하지않는특별법", article: "1조" },
  },
  {
    text: "대법원 2016다254467 판결은 채권조사확정재판에 대한 이의의 소에 관한 판단이다.",
    domain: "법률",
    verdict: "pending_legal_check",
    explanation: "",
    sources: [],
    legal_ref: { type: "case", case_number: "2016다254467" },
  },
  {
    text: "비타민 C를 하루 10g 이상 섭취하면 감기를 완전히 예방할 수 있다.",
    domain: "의료",
    verdict: "false",
    explanation: "과다 섭취는 예방 효과가 없고 오히려 부작용 위험이 있다는 것이 정설이다.",
    sources: [{ title: "예시 출처", url: "https://example.com" }],
  },
];

const run = async () => {
  console.log("=== 1) OC 코드 있는 상태로 실행 (실제 law.go.kr 호출) ===");
  const resolved = await resolveLegalClaims(claims, { ground: stubGround });
  resolved.forEach((c, i) => {
    console.log(`\n[${i}] domain=${c.domain} verdict=${c.verdict} verified_via=${c.verified_via ?? "(비법률, 미변경)"}`);
    console.log(`    설명: ${c.explanation}`);
    console.log(`    출처: ${JSON.stringify(c.sources)}`);
  });

  // 검증 1: 실재하는 민법 750조 → 공식 확인, 출처 있음, 시행일자 포함
  assert.equal(resolved[0].verified_via, "official");
  assert.ok(resolved[0].sources.length > 0, "민법 750조는 출처가 있어야 함");
  assert.ok(!resolved[0].sources[0].url.includes("OC="), "공개 링크에 OC 코드가 노출되면 안 됨");
  assert.ok(resolved[0].effective_date, "현행 조문 시행일자가 함께 표시되어야 함");

  // 검증 2: 존재하지 않는 법률 → false 처리
  assert.equal(resolved[1].verdict, "false");
  assert.equal(resolved[1].verified_via, "official");

  // 검증 3: 실재하는 판례 → 공식 확인, 출처 있음
  assert.equal(resolved[2].verified_via, "official");
  assert.ok(resolved[2].sources.length > 0, "판례는 출처가 있어야 함");

  // 검증 4: 비법률(의료) claim은 절대 건드리지 않아야 함
  assert.deepEqual(resolved[3], claims[3], "비법률 claim은 그대로 통과해야 함");

  console.log("\n=== 2) OC 코드 없는 상태 시뮬레이션 (폴백 동작 확인) ===");
  const savedOC = process.env.LAW_OC;
  delete process.env.LAW_OC;
  const withoutOC = await resolveLegalClaims([claims[0]], { ground: stubGround });
  console.log(withoutOC[0].explanation);
  assert.equal(withoutOC[0].verified_via, "unavailable");
  assert.match(withoutOC[0].explanation, /OC 코드/);
  process.env.LAW_OC = savedOC;

  console.log("\n=== 3) 회귀 재현: 개정 전 조문을 인용한 주장 (실제 Claude grounding 사용) ===");
  const outdatedClaim = {
    text: "아청법 제2조 1호는 19세 미만자를 아동청소년으로 정의하되, 19세가 되는 해 1월 1일을 맞이한 자는 제외한다.",
    domain: "법률",
    verdict: "pending_legal_check",
    explanation: "",
    sources: [],
    legal_ref: { type: "statute", law_name: "아동ㆍ청소년의 성보호에 관한 법률", article: "2조" },
  };
  if (process.env.ANTHROPIC_API_KEY) {
    const [resolvedOutdated] = await resolveLegalClaims([outdatedClaim], { ground: groundLegalClaim });
    console.log(`설명: ${resolvedOutdated.explanation}`);
    console.log(`출처: ${JSON.stringify(resolvedOutdated.sources)}`);
    console.log(`시행일자: ${resolvedOutdated.effective_date}`);
    assert.equal(resolvedOutdated.verdict, "false", "개정 전(폐지된) 조문 문구를 인용한 주장은 false로 판정되어야 함");
    assert.equal(resolvedOutdated.verified_via, "official");
    assert.ok(resolvedOutdated.effective_date, "현행 조문 시행일자가 함께 표시되어야 함");
    assert.ok(!resolvedOutdated.sources[0].url.includes("286829"), "아직 시행되지 않은 개정판(MST) 링크가 나오면 안 됨");
  } else {
    console.log("ANTHROPIC_API_KEY가 없어 실제 grounding 회귀 테스트는 건너뜁니다.");
  }

  console.log("\n모든 검증 통과 ✅");
};

run().catch((e) => {
  console.error("테스트 실패 ❌", e);
  process.exit(1);
});
