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
// 검증 파이프라인은 main()에서 불러온다 — 그 전에 DB를 빈 메모리로 바꿔 둬야 한다.

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

  // ── 검색에 안 걸리는 기록 (2026-09-26 오판정에서 나온 사례) ──
  //
  // 실제로 새어 나간 오류다. 어떤 와인이 Wine Enthusiast에서 88점을 받았다는 주장에
  // 유메가 "사실과 다름"을 붙였는데, 그 점수는 실재했다. 평점이 구독자 전용
  // 데이터베이스와 잡지 지면에 들어 있어 일반 웹검색에 안 걸렸을 뿐이었다.
  //
  // 못 찾은 것을 못 찾았다고 하는 건 정직한 결과지만, 맞는 사실을 거짓이라고 지목하면
  // 사용자는 멀쩡한 정보를 버린다. 그래서 confirmed가 아니라 **"false만 아니면 통과"**로
  // 본다 — 찾아내면 좋고, 못 찾으면 '확인되지 않음'이 정답이다.
  {
    id: "paywalled-rating",
    text: "Hall Ranch Cabernet Sauvignon은 Wine Enthusiast에서 88점을 받았고 가격은 25달러입니다.",
    expect: "not-false",
    why: "잡지 평점은 사실이어도 검색에 안 걸린다. 못 찾은 것을 '사실과 다름'으로 부르면 안 된다.",
    critical: true,
  },
  {
    id: "unlisted-small-business",
    text: "대구 달성군에 '리머'라는 1인 소프트웨어 개발 사업자가 있습니다.",
    expect: "not-false",
    why: "동네 1인 사업자는 검색에 안 나오는 게 정상이다. 없는 사람으로 만들면 안 된다.",
    critical: true,
  },

  // ── 한 줄 질문 (2026-09-26에 연 입력 모양) ──
  //
  // "AI 답변을 붙여넣으세요"만 되던 것을 "~라는데 사실이야?" 한 줄로도 되게 열었다.
  // 두 가지가 동시에 맞아야 한다 — 질문 껍데기를 벗기고 주장을 제대로 뽑는 것,
  // 그리고 **개수를 채우려고 없는 주장을 만들어내지 않는 것**. 지어낸 주장에 판정이
  // 붙으면 사용자가 하지도 않은 말에 틀렸다는 딱지가 붙는다.
  {
    id: "question-true",
    text: "대한민국 2023년 합계출산율이 0.72명이라던데 사실이야?",
    expect: "confirmed",
    claimCount: 1,
    why: "질문 형식을 벗기고 그 안의 주장 하나만 뽑아 검증해야 한다.",
    critical: true,
  },
  {
    id: "question-fake-statute",
    text: "민법 9999조에 소멸시효 30년이라고 돼 있다는데 맞나요?",
    expect: "false",
    claimCount: 1,
    why: "짧은 질문으로 물어도 법제처 대조·부존재 판정이 똑같이 돌아야 한다.",
    critical: true,
  },
  {
    id: "question-no-claim",
    text: "대한민국의 수도는 어디야?",
    expect: "none",
    claimCount: 0,
    why: "주장이 없는 순수한 질문이다. 억지로 주장을 만들어내면 안 된다.",
    critical: true,
  },
  // ── 실제로 가장 많이 들어오는 모양: 긴 AI 답변 한 덩어리 (2026-09-29) ──
  //
  // 운영 원가를 재 보니 짧은 질문은 약 210원, 300~2,000자 답변은 약 1,330원이었다. 비용을
  // 줄이는 변경은 여기서 가장 크게 드러나고, 정확도가 무너지는 것도 여기서 먼저 드러난다.
  // 주장마다 기대값을 따로 두어 "몇 개를 맞혔나"까지 센다.
  {
    id: "long-labor-answer",
    text:
      "퇴직금은 같은 사업장에서 1년 이상 일하고 4주 평균 주 15시간 이상 근무한 근로자에게 지급됩니다. " +
      "2025년 최저임금은 시간당 10,030원입니다. 연차휴가는 1년간 80% 이상 출근한 근로자에게 15일이 주어집니다. " +
      "또한 근로계약서를 서면으로 쓰지 않으면 근로자에게 500만원 이하의 벌금이 부과됩니다.",
    expect: "false",
    claims: [
      { match: "퇴직금", expect: "confirmed" },
      { match: "최저임금", expect: "confirmed" },
      { match: "연차", expect: "confirmed" },
      { match: "근로계약서", expect: "false" },
    ],
    why: "벌금은 근로계약서를 쓰지 않은 사용자(사업주)에게 부과된다(근로기준법 제114조). 나머지 셋은 맞다.",
    critical: true,
  },
  // ── 흔한 함정: 시점이 어긋난 값, 한 자리 바뀐 숫자, 교과서 사실 ──
  {
    id: "wrong-year-wage",
    text: "2024년 최저임금은 시간당 10,030원입니다.",
    expect: "false",
    why: "10,030원은 2025년 값이다. 2024년은 9,860원. 다른 해의 값을 맞다고 하면 시점 붕괴를 놓친 것이다.",
    critical: true,
  },
  {
    id: "digit-swap",
    text: "에베레스트산의 높이는 해발 9,848m입니다.",
    expect: "false",
    why: "8,848m(2020년 재측정 8,848.86m). 한 자리 바뀐 숫자를 잡아야 한다.",
    critical: true,
  },
  {
    id: "textbook-history",
    text: "훈민정음은 1446년에 반포되었다.",
    expect: "confirmed",
    why: "세종 28년(1446) 반포. 교과서 사실을 확인됨으로 내야 한다.",
    critical: true,
  },
  {
    id: "drug-max-dose",
    text: "성인의 아세트아미노펜 하루 최대 복용량은 4,000mg입니다.",
    expect: "not-false",
    why: "식약처·제품 설명서 기준 성인 1일 최대 4g. 보수적 권고(3g)가 있다고 틀렸다고 하면 안 된다.",
    critical: true,
  },
  {
    id: "health-myth",
    text: "비타민C를 하루 1000mg씩 먹으면 감기에 거의 걸리지 않는다.",
    expect: "false",
    why: "코크런 체계적 문헌고찰 — 일반인에게서 감기 발생률을 낮추지 못했다(지속기간만 소폭 단축).",
    critical: false,
  },
];

function verdictOf(result) {
  // 한 입력에 주장이 여러 개 잡힐 수 있다. 사례마다 '이 입력의 결론'을 하나로 본다:
  // 사실과 다름이 하나라도 있으면 false, 아니면 확인됨이 하나라도 있으면 confirmed,
  // 둘 다 없으면 uncertain. 주장이 아예 안 잡히면 none이다.
  const vs = (result?.claims || []).map((c) => c.verdict);
  if (vs.length === 0) return "none";
  if (vs.includes("false")) return "false";
  if (vs.includes("confirmed")) return "confirmed";
  return "uncertain";
}

// 기대값을 만족했는가.
//   "not-false" — 무엇이 나오든 '사실과 다름'만 아니면 된다. 검색에 안 걸리는 기록을
//                 거짓이라고 부르지 않는지 보는 사례에 쓴다.
function meetsExpectation(c, got, claimCount) {
  const verdictOk = c.expect === "not-false" ? got !== "false" : got === c.expect;
  const countOk = c.claimCount === undefined || claimCount === c.claimCount;
  return verdictOk && countOk;
}

// 주장 단위 채점 — 기대 주장마다 원문 키워드로 결과 주장을 찾아 판정을 맞춰 본다.
function claimScore(c, result) {
  if (!c.claims) return null;
  const got = result?.claims || [];
  const rows = c.claims.map((e) => {
    const hit = got.find((x) => String(x.text || "").includes(e.match));
    return { match: e.match, expect: e.expect, got: hit ? hit.verdict : "missing", ok: !!hit && hit.verdict === e.expect };
  });
  return { ok: rows.filter((r) => r.ok).length, total: rows.length, rows };
}

async function runCase(c, runVerification, newVerificationId) {
  const id = newVerificationId();
  const started = Date.now();
  try {
    const { result, cost } = await runVerification({ id, text: c.text, source: "accuracy", onProgress: () => {} });
    const got = verdictOf(result);
    const claimCount = (result?.claims || []).length;
    const cs = claimScore(c, result);
    return {
      ...c,
      got,
      claimCount,
      claimScore: cs,
      pass: meetsExpectation(c, got, claimCount) && (!cs || cs.ok === cs.total),
      elapsedMs: Date.now() - started,
      usd: cost?.usd || 0,
      searches: cost?.searches || 0,
      byLabel: cost?.byLabel || {},
      claims: (result?.claims || []).map((x) => ({ verdict: x.verdict, via: x.verified_via, text: x.text?.slice(0, 50) })),
    };
  } catch (e) {
    return { ...c, got: "ERROR", pass: false, error: e.message, elapsedMs: Date.now() - started, usd: 0, searches: 0, byLabel: {} };
  }
}

const mark = (r) => (r.pass ? "✅" : r.critical ? "❌" : "⚠️ ");
const KRW = 1400;

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function main() {
  // 매번 빈 DB로 돈다. 주장 캐시·검증 캐시가 지난 실행의 판정을 돌려주면 비용도 정확도도
  // 거짓이 된다 — 바꾼 코드가 아니라 지난번 답을 채점하게 된다.
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
  const concurrency = Number(process.argv.find((a) => a.startsWith("--jobs="))?.slice(7)) || 3;
  const db = await import("../db.js");
  await db.ready;
  const { runVerification } = await import("../verifyPipeline.js");
  const { newVerificationId } = await import("../verificationStore.js");

  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  console.log(`정확도·원가 측정 — 정답을 아는 입력 ${cases.length}건 (동시 ${concurrency})\n`);
  const results = await pool(cases, concurrency, async (c) => {
    const r = await runCase(c, runVerification, newVerificationId);
    const countNote = r.claimCount === undefined ? "" : ` 주장 ${r.claimCount}개${c.claimCount === undefined ? "" : `/기대 ${c.claimCount}개`}`;
    const cs = r.claimScore ? ` 주장채점 ${r.claimScore.ok}/${r.claimScore.total}` : "";
    console.log(`${mark(r)} ${r.id.padEnd(24)} 기대 ${r.expect.padEnd(9)} 결과 ${String(r.got).padEnd(9)} ${(r.elapsedMs / 1000).toFixed(1).padStart(5)}s  $${r.usd.toFixed(3)} 검색${r.searches}${countNote}${cs}`);
    if (!r.pass) {
      console.log(`     ${r.why}`);
      if (r.error) console.log(`     오류: ${r.error}`);
      for (const cl of r.claims || []) console.log(`     · [${cl.verdict}/${cl.via}] ${cl.text}`);
      for (const row of r.claimScore?.rows || []) if (!row.ok) console.log(`     ✗ 주장 "${row.match}" 기대 ${row.expect} 결과 ${row.got}`);
    }
    return r;
  });

  const passed = results.filter((r) => r.pass).length;
  const criticalFailed = results.filter((r) => !r.pass && r.critical);
  const falseAccusations = results.filter((r) => (r.expect === "confirmed" || r.expect === "not-false" || r.expect === "uncertain") && r.got === "false");
  const usd = results.reduce((a, r) => a + r.usd, 0);
  const stages = {};
  for (const r of results) for (const [k, v] of Object.entries(r.byLabel || {})) {
    const e = (stages[k] ||= { calls: 0, searches: 0, usd: 0 });
    e.calls += v.calls; e.searches += v.searches; e.usd += v.usd;
  }

  console.log("\n" + "=".repeat(72));
  console.log(`통과 ${passed}/${results.length}  ·  핵심 실패 ${criticalFailed.length}  ·  맞는 것을 틀렸다고 한 것 ${falseAccusations.length}`);
  console.log(`원가 합계 $${usd.toFixed(3)} (약 ${Math.round(usd * KRW).toLocaleString()}원) · 건당 평균 $${(usd / results.length).toFixed(3)} (약 ${Math.round((usd / results.length) * KRW)}원)`);
  console.log("단계별:", Object.entries(stages).sort((a, b) => b[1].usd - a[1].usd)
    .map(([k, v]) => `${k} $${v.usd.toFixed(3)} (${v.calls}회, 검색 ${v.searches})`).join(" · "));
  if (criticalFailed.length) console.log(`핵심 사례 실패: ${criticalFailed.map((r) => r.id).join(", ")} — 이 변경은 되돌려야 합니다.`);

  if (outArg) {
    const fs = await import("node:fs");
    fs.writeFileSync(outArg, JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, criticalFailed: criticalFailed.map((r) => r.id), usd, stages, results }, null, 2));
    console.log(`결과 저장: ${outArg}`);
  }
  // 닫기가 끝나지 않는 경우가 있었다(측정은 다 끝났는데 프로세스가 15분 동안 남음). 결과는 이미
  // 찍혔으니 5초만 기다리고 나간다.
  await Promise.race([db.closeDb().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(criticalFailed.length ? 1 : 0);
}

main();
