import test from "node:test";
import assert from "node:assert/strict";
import { gatherKoreaData, ecosKeyStats, drugInfo, _clearKoreaDataCache } from "../koreaData.js";
import { checkEverydayFacts, judgeFromData } from "../answerCheck.js";

const ok = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

test("키가 없으면 아무것도 부르지 않는다", async () => {
  delete process.env.ECOS_API_KEY;
  delete process.env.DATA_GO_KR_KEY;
  _clearKoreaDataCache();
  const got = await gatherKoreaData([{ claim: "기준금리 3.0%", field: "economy" }], { fetchImpl: () => assert.fail("부르지 않는다") });
  assert.deepEqual(got, []);
});

test("ECOS 100대 지표와 e약은요를 원자료 그대로 모은다(필드 이름에 기대지 않는다)", async () => {
  process.env.ECOS_API_KEY = "k1";
  process.env.DATA_GO_KR_KEY = "k2";
  _clearKoreaDataCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("ecos.bok.or.kr")) return ok({ KeyStatisticList: { row: [{ KEYSTAT_NAME: "한국은행 기준금리", DATA_VALUE: "3", UNIT_NAME: "%" }] } })();
    return ok({ body: { items: [{ itemName: "타이레놀정500밀리그람", useMethodQesitm: "1일 최대 4,000mg을 넘기지 마십시오." }] } })();
  };
  const got = await gatherKoreaData([{ claim: "기준금리는 5%", field: "economy" }, { claim: "타이레놀 최대 6,000mg", field: "medical", drug: "타이레놀" }], { fetchImpl });
  assert.equal(got.length, 2);
  assert.ok(calls[0].includes("/KeyStatisticList/k1/json/kr/1/100"));
  assert.ok(calls[1].includes("itemName=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80"));
  assert.match(got[1].url, /nedrug\.mfds\.go\.kr/);
  // 캐시: 다시 불러도 기관 API를 또 부르지 않는다
  await ecosKeyStats({ fetchImpl: () => assert.fail("캐시") });
  await drugInfo("타이레놀", { fetchImpl: () => assert.fail("캐시") });
});

test("원자료 판정: 근거 문장이 원자료에 없으면 인정하지 않는다", async () => {
  const data = [{ source: "식약처 e약은요 — 타이레놀", url: "https://nedrug.mfds.go.kr/x", text: JSON.stringify([{ useMethodQesitm: "1일 최대 4,000mg을 넘기지 마십시오." }]) }];
  const claims = [{ quote: "6,000mg", claim: "최대 6,000mg" }, { quote: "하루 8정", claim: "하루 8정" }];
  const json = async () => ({ json: { results: [{ i: 1, verdict: "contradicted", correct: "4,000mg", src: 1, quote: "1일 최대 4,000mg을 넘기지 마십시오." }, { i: 2, verdict: "supported", src: 1, quote: "하루 최대 8정까지 복용" }] } });
  const r = await judgeFromData(claims, data, { json });
  assert.equal(r[0].verdict, "contradicted");
  assert.equal(r[0].official, true);
  assert.equal(r[0].via, "data");
  assert.equal(r[1].verdict, "unverified");
});

test("원자료로 결론 난 주장은 공식 사이트·웹 검색을 건너뛴다", async () => {
  const labels = [];
  const json = async ({ label }) => {
    labels.push(label);
    if (label === "check_extract") return { json: { claims: [{ quote: "기준금리는 연 5.0%", claim: "기준금리 5.0%", kind: "number", field: "economy" }] }, urls: new Set() };
    if (label === "check_data") return { json: { results: [{ i: 1, verdict: "contradicted", correct: "연 3.00%", src: 1, quote: "\"KEYSTAT_NAME\":\"한국은행 기준금리\",\"DATA_VALUE\":\"3\"" }] } };
    return assert.fail(`부르지 않는다: ${label}`);
  };
  const koreaData = async () => [{ source: "한국은행 ECOS", url: "https://ecos.bok.or.kr/", text: JSON.stringify([{ KEYSTAT_NAME: "한국은행 기준금리", DATA_VALUE: "3" }]) }];
  const r = await checkEverydayFacts("현재 한국은행 기준금리는 연 5.0%예요.", { json, koreaData });
  assert.deepEqual(labels, ["check_extract", "check_data"]);
  assert.equal(r.results[0].verdict, "contradicted");
  assert.equal(r.results[0].url, "https://ecos.bok.or.kr/");
});

test("DART: zip 안의 고유번호 표를 풀어 회사 이름으로 찾고, 기업개황 · 재무를 원자료로 준다", async () => {
  const zlib = await import("node:zlib");
  const { unzipFirst, parseCorpCodes, companyData, _resetDart } = await import("../dart.js");
  const xml = "<result><list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code></list><list><corp_code>00999999</corp_code><corp_name>삼성전자</corp_name><stock_code> </stock_code></list></result>";
  // 아주 작은 zip 하나를 만든다(파일 하나, deflate)
  const data = zlib.deflateRawSync(Buffer.from(xml));
  const name = Buffer.from("CORPCODE.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(xml.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt32LE(cdOff, 16);
  const zip = Buffer.concat([local, name, data, cd, name, eocd]);
  assert.equal(unzipFirst(zip).toString(), xml);
  assert.equal(parseCorpCodes(xml).get("삼성전자")[0].code, "00126380"); // 상장사가 먼저
  process.env.DART_API_KEY = "test";
  _resetDart();
  const fetchImpl = async (url) => {
    if (url.includes("corpCode.xml")) return new Response(zip, { status: 200 });
    if (url.includes("company.json")) return new Response(JSON.stringify({ status: "000", corp_name: "삼성전자", ceo_nm: "대표", est_dt: "19690113" }), { status: 200 });
    if (url.includes("fnlttSinglAcnt.json")) return new Response(JSON.stringify({ status: "000", list: [{ fs_div: "CFS", fs_nm: "연결재무제표", account_nm: "매출액", thstrm_amount: "300,000,000", frmtrm_amount: "250,000,000" }] }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const d = await companyData("(주)삼성전자", { wantFinance: true, fetchImpl, now: new Date("2026-10-17") });
  assert.match(d.source, /DART/);
  assert.match(d.text, /19690113/);
  assert.match(d.text, /매출액/);
  delete process.env.DART_API_KEY;
  _resetDart();
});
