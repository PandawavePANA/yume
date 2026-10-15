// 회귀 테스트: 2026-10-13 감사 #3(로무앤톡)에서 맞는 법률 주장 세 개를 '사실과 다름'으로 판정한 오류.
//
// 1) 근로기준법 제37조 지연이자 "연 100분의 20" — 법률은 "100분의 40 이내 … 대통령령으로 정하는 이율",
//    실제 이율은 시행령 제17조. 법률 조문만 보고 판정했다.
// 2) 근퇴법 제2조4호 평균임금 — "「근로기준법」 제2조제1항제6호에 따른 평균임금을 말한다". 참조를 안 따라갔다.
// 3) "남녀고용평등법 제19조②" — 2007년까지 쓰인 옛 이름이라 연혁본(MST 78237)이 정확히 걸렸고,
//    현행 법령은 약칭(법령약칭명)으로만 걸려 버려졌다.
//
// 법제처 응답은 실제 응답(2026-10-13 조회)의 모양을 그대로 옮긴 가짜다. 대조 모델(ground)은 받은 텍스트에
// 주장의 수치가 있으면 confirmed, 없으면 false를 내는 스텁 — 고치기 전에는 이 스텁이 false를 냈다.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resolveLegalClaims } from "../legalPipeline.js";
import { delegationsIn, referencesIn } from "../legalLinks.js";
import { searchStatute } from "../lawApi.js";
import { clearLawCache } from "../lawCache.js";

const realFetch = globalThis.fetch;
const realOC = process.env.LAW_OC;
const calls = [];

const law = (o) => ({
  현행연혁코드: o.status,
  법령일련번호: o.mst,
  법령명한글: o.name,
  법령약칭명: o.abbrev || "",
  법령ID: o.id,
  시행일자: o.ef,
  법령상세링크: `/DRF/lawService.do?OC=fake&target=eflaw&MST=${o.mst}&type=HTML&efYd=${o.ef}`,
});

const LAWS = {
  근로기준법: law({ status: "현행", mst: "900001", name: "근로기준법", id: "001872", ef: "20261008" }),
  근로기준법시행령: law({ status: "현행", mst: "900002", name: "근로기준법 시행령", id: "003786", ef: "20251023", abbrev: "근로기준법 시행령" }),
  근퇴법: law({ status: "현행", mst: "900003", name: "근로자퇴직급여 보장법", id: "009898", ef: "20260701", abbrev: "퇴직급여법" }),
  고평법현행: law({ status: "현행", mst: "284457", name: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", id: "000130", ef: "20260918", abbrev: "남녀고용평등법" }),
  고평법예정: law({ status: "시행예정", mst: "286255", name: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", id: "000130", ef: "20261127", abbrev: "남녀고용평등법" }),
  고평법시행령: law({ status: "현행", mst: "288719", name: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률 시행령", id: "003140", ef: "20260918", abbrev: "남녀고용평등법 시행령" }),
  고평법옛이름: law({ status: "연혁", mst: "78237", name: "남녀고용평등법", id: "000130", ef: "20070411", abbrev: "남녀고용평등법" }),
};

// 검색어 → (eflaw, law) 결과. 법제처는 법령명뿐 아니라 약칭도 검색한다.
const SEARCH = {
  근로기준법: { eflaw: [LAWS.근로기준법, LAWS.근로기준법시행령], law: [LAWS.근로기준법, LAWS.근로기준법시행령] },
  근로기준법시행령: { eflaw: [LAWS.근로기준법시행령], law: [LAWS.근로기준법시행령] },
  근로자퇴직급여보장법: { eflaw: [LAWS.근퇴법], law: [LAWS.근퇴법] },
  근로자퇴직급여보장법시행령: { eflaw: [], law: [] },
  남녀고용평등법: {
    eflaw: [LAWS.고평법예정, LAWS.고평법현행, LAWS.고평법시행령, LAWS.고평법옛이름],
    law: [LAWS.고평법현행, LAWS.고평법시행령],
  },
  남녀고용평등과일가정양립지원에관한법률: { eflaw: [LAWS.고평법예정, LAWS.고평법현행, LAWS.고평법시행령], law: [LAWS.고평법현행, LAWS.고평법시행령] },
  남녀고용평등과일가정양립지원에관한법률시행령: { eflaw: [LAWS.고평법시행령], law: [LAWS.고평법시행령] },
};

const unit = (no, fields) => ({ 조문번호: String(no), 조문여부: "조문", ...fields });
const BODIES = {
  900001: [
    unit(2, {
      조문내용: "제2조(정의)",
      조문제목: "정의",
      항: [
        {
          항번호: "①",
          항내용: "① 이 법에서 사용하는 용어의 뜻은 다음과 같다.",
          호: [
            { 호번호: "1.", 호내용: "1. \"근로자\"란 직업의 종류와 관계없이 임금을 목적으로 사업이나 사업장에 근로를 제공하는 사람을 말한다." },
            { 호번호: "5.", 호내용: "5. \"임금\"이란 사용자가 근로의 대가로 근로자에게 임금, 봉급, 그 밖에 어떠한 명칭으로든지 지급하는 모든 금품을 말한다." },
            { 호번호: "6.", 호내용: "6. \"평균임금\"이란 이를 산정하여야 할 사유가 발생한 날 이전 3개월 동안에 그 근로자에게 지급된 임금의 총액을 그 기간의 총일수로 나눈 금액을 말한다." },
          ],
        },
        { 항번호: "②", 항내용: "② 제1항제6호에 따라 산출된 금액이 그 근로자의 통상임금보다 적으면 그 통상임금액을 평균임금으로 한다." },
      ],
    }),
    unit(37, {
      조문내용: "제37조(미지급 임금에 대한 지연이자)",
      조문제목: "미지급 임금에 대한 지연이자",
      조문시행일자: "20261008",
      항: [
        {
          항번호: "①",
          항내용:
            "① 사용자는 다음 각 호의 어느 하나에 해당하는 임금의 전부 또는 일부를 각 호에 따른 날까지 지급하지 아니한 경우 그 다음 날부터 지급하는 날까지의 지연 일수에 대하여 연 100분의 40 이내의 범위에서 「은행법」에 따른 은행이 적용하는 연체금리 등 경제 여건을 고려하여 대통령령으로 정하는 이율에 따른 지연이자를 지급하여야 한다.",
          호: [
            { 호번호: "1.", 호내용: "1. 제36조에 따라 지급하여야 하는 임금 및 「근로자퇴직급여 보장법」 제2조제5호에 따른 급여(일시금만 해당된다): 지급 사유가 발생한 날부터 14일이 되는 날" },
          ],
        },
        { 항번호: "③", 항내용: "③ 제1항은 사용자가 천재ㆍ사변, 그 밖에 대통령령으로 정하는 사유에 따라 임금 지급을 지연하는 경우 그 사유가 존속하는 기간에 대하여는 적용하지 아니한다." },
      ],
    }),
  ],
  900002: [
    unit(17, { 조문내용: "제17조(미지급 임금에 대한 지연이자의 이율) 법 제37조제1항 각 호 외의 부분에서 \"대통령령으로 정하는 이율\"이란 연 100분의 20을 말한다.", 조문제목: "미지급 임금에 대한 지연이자의 이율" }),
    unit(18, { 조문내용: "제18조(지연이자의 적용제외 사유) 법 제37조제3항에서 \"대통령령으로 정하는 사유\"란 다음 각 호의 어느 하나에 해당하는 경우를 말한다.", 조문제목: "지연이자의 적용제외 사유" }),
    // 가지조문(법 제37조의2)을 가리키는 시행령 조문은 제37조 대조에 붙이면 안 된다.
    unit(19, { 조문내용: "제19조(다른 조문) 법 제37조의2에서 \"대통령령으로 정하는 기준\"이란 무관한 기준을 말한다.", 조문제목: "다른 조문" }),
  ],
  900003: [
    unit(2, {
      조문내용: "제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.",
      조문제목: "정의",
      항: {
        호: [
          { 호번호: "1.", 호내용: "1. \"근로자\"란 「근로기준법」 제2조제1항제1호에 따른 근로자를 말한다." },
          { 호번호: "3.", 호내용: "3. \"임금\"이란 「근로기준법」 제2조제1항제5호에 따른 임금을 말한다." },
          { 호번호: "4.", 호내용: "4. \"평균임금\"이란 「근로기준법」 제2조제1항제6호에 따른 평균임금을 말한다." },
        ],
      },
    }),
  ],
  284457: [
    unit(19, {
      조문내용: "제19조(육아휴직)",
      조문제목: "육아휴직",
      항: [
        { 항번호: "①", 항내용: "① 사업주는 임신 중인 여성 근로자가 모성을 보호하거나 근로자가 만 8세 이하 또는 초등학교 2학년 이하의 자녀를 양육하기 위하여 휴직을 신청하는 경우에 이를 허용하여야 한다." },
        { 항번호: "②", 항내용: "② 육아휴직의 기간은 1년 이내로 한다. 다만, 같은 자녀를 대상으로 부모가 각각 3개월 이상 육아휴직을 사용한 경우의 부 또는 모는 6개월 이내에서 추가로 육아휴직을 사용할 수 있다. <개정 2024.10.22>" },
      ],
    }),
  ],
  // 2007년판 — 이것과 대조하면 "6개월 추가"가 없어 틀렸다고 나온다.
  78237: [unit(19, { 조문내용: "제19조(육아휴직) ① 사업주는 생후 3년 미만된 영유아가 있는 근로자가 그 영유아의 양육을 위하여 휴직을 신청하는 경우에 이를 허용하여야 한다. ② 육아휴직의 기간은 1년 이내로 한다.", 조문제목: "육아휴직" })],
};

before(() => {
  process.env.LAW_OC = "test-oc";
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const p = Object.fromEntries(u.searchParams);
    calls.push({ path: u.pathname.split("/").pop(), ...p });
    let data;
    if (u.pathname.endsWith("lawSearch.do")) {
      const items = SEARCH[p.query.replace(/[\s·ㆍ]/g, "")]?.[p.target] || [];
      data = { LawSearch: { totalCnt: String(items.length), law: items } };
    } else {
      const units = BODIES[p.MST];
      data = units ? { 법령: { 조문: { 조문단위: units } } } : {};
    }
    return { text: async () => JSON.stringify(data) };
  };
});
after(() => {
  globalThis.fetch = realFetch;
  if (realOC === undefined) delete process.env.LAW_OC;
  else process.env.LAW_OC = realOC;
});
beforeEach(() => {
  clearLawCache();
  calls.length = 0;
});

// 받은 공식 텍스트에 주장의 핵심 수치·표현이 있으면 confirmed — 대조 모델이 하는 일의 최소 모형.
function groundExpecting(needle) {
  const seen = [];
  const ground = async (claimText, officialText) => {
    seen.push(officialText);
    return officialText.includes(needle)
      ? { verdict: "confirmed", explanation: `공식 텍스트에 ‘${needle}’ 있음` }
      : { verdict: "false", explanation: `공식 텍스트에 ‘${needle}’ 없음` };
  };
  return { ground, seen };
}
const webVerify = async () => ({ verdict: "uncertain", explanation: "웹 스텁", sources: [] });
const legal = (text, law_name, article, quote = text) => ({ text, quote, domain: "법률", verdict: "pending_legal_check", sources: [], legal_ref: { type: "statute", law_name, article } });

test("#1 법률이 이율을 대통령령에 맡기면 시행령 조문까지 받아 대조한다", async () => {
  const { ground, seen } = groundExpecting("연 100분의 20");
  const claim = legal("근로기준법 제37조: 퇴직 후 14일 이내 미지급 시 연 100분의 20의 지연이자를 지급해야 한다.", "근로기준법", "제37조");
  const [out] = await resolveLegalClaims([claim], { ground, webVerify });
  assert.equal(out.verified_via, "official");
  assert.equal(out.verdict, "confirmed", out.explanation);
  assert.match(seen[0], /\[위임 규정 — 근로기준법 시행령 제17조\]/);
  assert.match(seen[0], /\[위임 규정 — 근로기준법 시행령 제18조\]/, "제37조③의 위임(사유)도 같이 붙는다");
  assert.doesNotMatch(seen[0], /제19조\(다른 조문\)/, "법 제37조의2를 가리키는 조문은 붙이지 않는다");
  assert.ok(out.sources.some((s) => s.title.startsWith("근로기준법 시행령")), "시행령도 출처로 남긴다");
});

test("#2 '「X」 제N조에 따른 …을 말한다'는 참조된 조문을 따라가 정의를 받아 온다", async () => {
  const { ground, seen } = groundExpecting("3개월 동안에 그 근로자에게 지급된 임금의 총액을 그 기간의 총일수로 나눈");
  const claim = legal(
    "근로자퇴직급여 보장법 제2조 제4호 및 근로기준법 제2조 제1항 제6호는 평균임금을 3개월 임금총액÷총일수로 정의한다.",
    "근로자퇴직급여 보장법",
    "제2조",
  );
  const [out] = await resolveLegalClaims([claim], { ground, webVerify });
  assert.equal(out.verdict, "confirmed", out.explanation);
  // 주장의 용어(평균임금)를 정의하는 참조가 붙고, 떼어 온 것은 그 호뿐이다.
  assert.match(seen[0], /\[참조 조문 — 근로기준법 제2조제1항제6호\]/);
  assert.doesNotMatch(seen[0], /통상임금액을 평균임금으로 한다/, "참조된 호만 떼어 온다(②항까지 끌고 오지 않는다)");
});

test("#3 옛 이름·약칭 '남녀고용평등법'은 연혁본(MST 78237)이 아니라 현행 법령으로 풀린다", async () => {
  const s = await searchStatute("남녀고용평등법");
  assert.equal(s.found, true);
  assert.equal(s.versionStatus, "current");
  assert.equal(s.mst, "284457");
  assert.equal(s.lawNameOfficial, "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률");

  clearLawCache();
  const { ground, seen } = groundExpecting("6개월 이내에서 추가로");
  const claim = legal("남녀고용평등법 제19조 제2항: 부모가 각각 3개월 이상 육아휴직을 사용하면 6개월을 추가로 사용할 수 있다.", "남녀고용평등법", "제19조");
  const [out] = await resolveLegalClaims([claim], { ground, webVerify });
  assert.equal(out.verdict, "confirmed", out.explanation);
  assert.equal(out.verified_via, "official");
  assert.ok(!calls.some((c) => c.MST === "78237"), "연혁본 본문을 받으면 안 된다");
  assert.match(seen[0], /6개월 이내에서 추가로/);
  assert.match(out.explanation, /현행 ‘남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률’/);
});

test("가운뎃점 표기(· / ㆍ)가 달라도 현행 법령을 찾는다", async () => {
  const s = await searchStatute("남녀고용평등과 일·가정 양립 지원에 관한 법률 시행령");
  assert.equal(s.versionStatus, "current");
  assert.equal(s.mst, "288719");
});

test("현행 버전이 없고 옛 이름만 남은 법령은 여전히 연혁으로 본다", async () => {
  // 법령ID가 같은 현행 버전이 검색에 없으면 연혁본을 현행이라 우기지 않는다.
  SEARCH["폐지된옛법"] = { eflaw: [law({ status: "연혁", mst: "11", name: "폐지된옛법", id: "999999", ef: "19990101" })], law: [] };
  const s = await searchStatute("폐지된옛법");
  assert.equal(s.versionStatus, "historical_only");
  delete SEARCH["폐지된옛법"];
});

test("위임·참조 문구 인식", () => {
  assert.deepEqual(delegationsIn("대통령령으로 정하는 이율에 따른"), ["시행령"]);
  assert.deepEqual(delegationsIn("고용노동부령으로 정한다"), ["시행규칙"]);
  assert.deepEqual(delegationsIn("「은행법」에 따른 은행"), []);

  const refs = referencesIn("4. \"평균임금\"이란 「근로기준법」 제2조제1항제6호에 따른 평균임금을 말한다.");
  assert.equal(refs.length, 1);
  assert.deepEqual({ ...refs[0] }, { law: "근로기준법", no: 2, branch: null, paragraph: 1, item: 6, term: "평균임금", label: "제2조제1항제6호" });
  // 이름만 든 것, 정의가 아닌 단순 언급은 따라가지 않는다.
  assert.equal(referencesIn("「은행법」에 따른 은행이 적용하는 연체금리").length, 0);
  assert.equal(referencesIn("「근로자퇴직급여 보장법」 제2조제5호에 따른 급여(일시금만 해당된다): 지급 사유").length, 0);
});

test("위임·참조가 없는 조문은 추가 조회 없이 그대로 대조한다", async () => {
  const { ground, seen } = groundExpecting("1년 이내");
  const claim = legal("남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률 제19조 제2항: 육아휴직 기간은 1년 이내다.", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "제19조");
  const [out] = await resolveLegalClaims([claim], { ground, webVerify });
  assert.equal(out.verdict, "confirmed");
  assert.doesNotMatch(seen[0], /\[(위임 규정|참조 조문)/);
  assert.ok(!calls.some((c) => /시행령/.test(c.query || "")), "시행령을 찾지 않는다");
});
