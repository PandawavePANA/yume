// 금융감독원 전자공시(DART) 원자료 — 회사 이름으로 기업개황(대표자 · 설립일 · 주소 · 업종)과 최근 사업보고서 주요 재무(매출 · 영업이익 · 순이익)를 받는다.
//
// DART 는 회사를 '고유번호(corp_code)'로만 찾는다. 회사 이름 → 고유번호 표(corpCode.xml, zip 한 개)를 하루에 한 번 받아 메모리에 둔다.
// 키(DART_API_KEY)는 대표가 베리라인 본사 할 일 칸에 넣는다. 키가 없거나 조회가 실패하면 조용히 건너뛴다(검색 확인이 뒤를 받친다).
import zlib from "node:zlib";

const API = "https://opendart.fss.or.kr/api";
const DAY = 24 * 3600 * 1000;
let corpIndex = null; // { at, byName: Map(정규화 이름 → [{ code, name, stock }]) }
const cache = new Map();

export const dartEnabled = () => !!process.env.DART_API_KEY;
const norm = (s) => String(s || "").replace(/\(주\)|㈜|주식회사|\s|\.|,/g, "").toLowerCase();

/** zip 안의 첫 파일을 푼다(중앙 디렉터리를 읽는다 — 지역 헤더의 크기가 0인 zip 도 있다). */
export function unzipFirst(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip 이 아니에요");
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("zip 목록이 이상해요");
  const method = buf.readUInt16LE(cdOffset + 10);
  const size = buf.readUInt32LE(cdOffset + 20);
  const local = buf.readUInt32LE(cdOffset + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  return method === 0 ? data : zlib.inflateRawSync(data);
}

/** corpCode.xml → 이름 색인. 상장사(종목코드 있음)를 앞에 둔다. */
export function parseCorpCodes(xml) {
  const byName = new Map();
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const get = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1]?.trim() || "";
    const code = get("corp_code");
    const name = get("corp_name");
    if (!code || !name) continue;
    const key = norm(name);
    const list = byName.get(key) || [];
    list.push({ code, name, stock: get("stock_code") });
    byName.set(key, list);
  }
  for (const list of byName.values()) list.sort((a, b) => (b.stock ? 1 : 0) - (a.stock ? 1 : 0));
  return byName;
}

async function loadIndex(fetchImpl) {
  if (corpIndex && Date.now() - corpIndex.at < DAY) return corpIndex;
  const r = await fetchImpl(`${API}/corpCode.xml?crtfc_key=${encodeURIComponent(process.env.DART_API_KEY)}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`DART 고유번호 표 ${r.status}`);
  const xml = unzipFirst(Buffer.from(await r.arrayBuffer())).toString("utf8");
  corpIndex = { at: Date.now(), byName: parseCorpCodes(xml) };
  return corpIndex;
}

/** 회사 이름으로 고유번호. 정확히 같은 이름 → 없으면 null(비슷한 이름으로 넘겨짚지 않는다). */
export async function findCorp(name, { fetchImpl = fetch } = {}) {
  const idx = await loadIndex(fetchImpl);
  return idx.byName.get(norm(name))?.[0] || null;
}

async function getJson(url, fetchImpl) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`DART ${r.status}`);
  const d = await r.json();
  if (d.status && d.status !== "000") throw new Error(`DART ${d.status} ${d.message || ""}`);
  return d;
}

const FIN = /매출|영업이익|순이익|당기순|자산|부채|자본|실적|흑자|적자/;

/** 회사 하나의 공식 원자료. 돌려주는 값: { source, url, text } | null */
export async function companyData(name, { wantFinance = false, fetchImpl = fetch, now = new Date() } = {}) {
  if (!dartEnabled()) return null;
  const key = `${norm(name)}|${wantFinance ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.value;
  const corp = await findCorp(name, { fetchImpl });
  if (!corp) return null;
  const k = encodeURIComponent(process.env.DART_API_KEY);
  const parts = [];
  const info = await getJson(`${API}/company.json?crtfc_key=${k}&corp_code=${corp.code}`, fetchImpl).catch(() => null);
  if (info) {
    const pick = ["corp_name", "corp_name_eng", "stock_name", "stock_code", "ceo_nm", "corp_cls", "jurir_no", "bizr_no", "adres", "hm_url", "induty_code", "est_dt", "acc_mt"];
    parts.push(`[기업개황] ${JSON.stringify(Object.fromEntries(pick.filter((p) => info[p]).map((p) => [p, info[p]])))}`);
  }
  if (wantFinance) {
    // 가장 최근 사업보고서(지난해 → 그 전해)
    for (const y of [now.getFullYear() - 1, now.getFullYear() - 2]) {
      const fin = await getJson(`${API}/fnlttSinglAcnt.json?crtfc_key=${k}&corp_code=${corp.code}&bsns_year=${y}&reprt_code=11011`, fetchImpl).catch(() => null);
      const rows = (fin?.list || []).filter((r) => r.fs_div === "CFS" || r.fs_div === "OFS").slice(0, 24).map((r) => ({ 연도: y, 구분: r.fs_nm, 계정: r.account_nm, 당기: r.thstrm_amount, 전기: r.frmtrm_amount, 단위: "원" }));
      if (rows.length) {
        parts.push(`[${y}년 사업보고서 주요 재무] ${JSON.stringify(rows)}`);
        break;
      }
    }
  }
  const value = parts.length ? { source: `금융감독원 전자공시(DART) — ${corp.name}`, url: `https://dart.fss.or.kr/dsab007/main.do?textCrpNm=${encodeURIComponent(corp.name)}`, text: parts.join("\n").slice(0, 14000) } : null;
  if (value) cache.set(key, { at: Date.now(), value });
  return value;
}

export { FIN as DART_FINANCE_HINT };
export const _resetDart = () => {
  corpIndex = null;
  cache.clear();
};
