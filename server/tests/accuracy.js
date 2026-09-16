import "dotenv/config";
// 정확도 회귀 측정 — 비용을 건드릴 때마다 여기를 돌린다.
//
// 실행: npm run test:accuracy   (실제 Claude·법제처를 호출한다. API 잔액이 필요하다.)
//
// 왜 필요한가. 비용을 줄이는 변경은 거의 전부 정확도와 맞바꾸는 거래다 — 검색을 덜 하고,
// 싼 모델을 쓰고, 컨텍스트를 줄인다. 그런데 유메에서 정확도는 제품 그 자체라, 얼마를
// 아꼈는지만 보고 결정하면 팔 물건을 깎아 먹는다. 그래서 "정답을 아는 입력"을 통과시켜
// 놓친 것과 든 돈을 같이 본다.
//
// 기준선(catch rate)이 떨어지면 그 변경은 되돌려야 한다. 돈을 아꼈는지와 무관하게.
import { runVerification } from "../verifyPipeline.js";
import { newVerificationId } from "../verificationStore.js";

// 정답을 아는 사례. 지어낸 것은 반드시 잡아야 하고(놓치면 제품이 거짓말한 것),
// 맞는 것은 맞다고 해야 한다(틀리면 사용자가 멀쩡한 정보를 버린다).
const CASES = [
  {
    id: "fake-statute",
    text: "민법 제9999조는 채권의 소멸시효를 30년으로 정하고 있습니다.",
    expect: "false",
    why: "민법에 제9999조는 없다. 지어낸 조문을 설명하면 놓친 것이다.",
    critical: true,
  },
  {
    id: "fake-case",
    text: "대법원 2019다999991 판결은 전세보증금 반환 의무를 임대인에게만 부과했습니다.",
    expect: "false",
    why: "실재하지 않는 사건번호. 부존재 신뢰도가 잡아야 한다.",
    critical: true,
  },
  {
    id: "real-statute-correct",
    text: "민법 제750조는 고의 또는 과실로 인한 위법행위로 타인에게 손해를 가한 자에게 배상 책임을 지웁니다.",
    expect: "confirmed",
    why: "현행 조문과 일치한다. false로 뒤집으면 멀쩡한 정보를 버리게 된다.",
    critical: true,
  },
  {
    id: "real-statute-distorted",
    text: "민법 제750조는 고의로 타인에게 손해를 가한 경우에만 배상 책임을 지우며, 과실은 제외합니다.",
    expect: "false",
    why: "조문은 '고의 또는 과실'이다. 요건 하나가 빠진 인용을 잡아내는지 본다.",
    critical: true,
  },
  {
    id: "fake-admin-rule",
    text: "공정위 고시 제2019-77호 제3조는 가맹점 로열티 상한을 매출의 10%로 정하고 있습니다.",
    expect: "false",
    why: "실재하지 않는 행정규칙. 발령번호 조회 경로가 살아 있는지 함께 본다.",
    critical: true,
  },
  {
    id: "fabricated-statistic",
    text: "2024년 대구 중구 안경 공방의 평균 객단가는 18만 7천원으로 집계되었습니다.",
    expect: "false",
    why: "그런 집계가 없다. 식별자가 없는 일반 주장의 부존재 판정이 도는지 본다.",
    critical: false,
  },
  {
    id: "true-statistic",
    text: "대한민국의 2023년 합계출산율은 0.72명입니다.",
    expect: "confirmed",
    why: "통계청이 발표한 수치. 웹 검증이 정상 동작하는지 본다.",
    critical: true,
  },
  {
    id: "genuinely-unknowable",
    text: "리머라는 비상장 회사의 2025년 내부 영업이익률은 12%입니다.",
    expect: "uncertain",
    why: "정의상 공개되지 않는 정보. 여기서 false로 단정하면 근거 없이 남을 거짓말쟁이로 만든다.",
    critical: true,
  },
];

const PRICE_NOTE = "* 원가는 [cost] 로그와 같은 기준으로 계산한 추정치입니다.";

function verdictOf(result) {
  // 한 입력에 주장이 여러 개 잡힐 수 있다. 사례마다 '이 입력의 결론'을 하나로 본다:
  // 사실과 다름이 하나라도 있으면 false, 아니면 확인됨이 하나라도 있으면 confirmed,
  // 둘 다 없으면 uncertain.
  const vs = (result?.claims || []).map((c) => c.verdict);
  if (vs.includes("false")) return "false";
  if (vs.includes("confirmed")) return "confirmed";
  return "uncertain";
}

async function runCase(c) {
  const id = newVerificationId();
  const started = Date.now();
  try {
    const { result } = await runVerification({ id, text: c.text, source: "accuracy", onProgress: () => {} });
    const got = verdictOf(result);
    return {
      ...c,
      got,
      pass: got === c.expect,
      elapsedMs: Date.now() - started,
      claims: (result?.claims || []).map((x) => ({ verdict: x.verdict, via: x.verified_via, text: x.text?.slice(0, 50) })),
    };
  } catch (e) {
    return { ...c, got: "ERROR", pass: false, error: e.message, elapsedMs: Date.now() - started };
  }
}

const mark = (r) => (r.pass ? "✅" : r.critical ? "❌" : "⚠️ ");

async function main() {
  console.log("정확도 회귀 측정 — 정답을 아는 입력 " + CASES.length + "건\n");
  const results = [];
  for (const c of CASES) {
    const r = await runCase(c);
    results.push(r);
    console.log(`${mark(r)} ${r.id.padEnd(22)} 기대 ${r.expect.padEnd(10)} 결과 ${String(r.got).padEnd(10)} ${(r.elapsedMs / 1000).toFixed(1)}s`);
    if (!r.pass) {
      console.log(`     ${r.why}`);
      if (r.error) console.log(`     오류: ${r.error}`);
      for (const cl of r.claims || []) console.log(`     · [${cl.verdict}/${cl.via}] ${cl.text}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const criticalFailed = results.filter((r) => !r.pass && r.critical);
  const rate = Math.round((passed / results.length) * 1000) / 10;

  console.log("\n" + "=".repeat(64));
  console.log(`통과 ${passed}/${results.length} (${rate}%)`);
  if (criticalFailed.length) {
    console.log(`\n핵심 사례 실패 ${criticalFailed.length}건 — ${criticalFailed.map((r) => r.id).join(", ")}`);
    console.log("비용을 얼마나 아꼈든 이 변경은 되돌려야 합니다.");
  } else {
    console.log("핵심 사례 전부 통과.");
  }
  console.log(PRICE_NOTE);
  console.log("검증별 실제 원가는 서버 로그의 [cost] 줄을 보세요.");

  process.exit(criticalFailed.length ? 1 : 0);
}

main();
