// 베리라인 주소 — 고객이 보는 모든 링크(메일 · 견적서 · 보고서 · API 문서 · 마크)의 앞부분은 여기서만 정한다.
//
// 2026-10-29 대표: "yume-reamer 도메인 버린다. veriline.kr 소속 링크로." 그래서 기본값은 https://veriline.kr이고,
// 운영 환경변수(PUBLIC_BASE_URL)에 옛 주소가 남아 있어도 옛 주소는 쓰지 않는다 — 메일에 한번 박힌 링크는 고쳐 보낼 수 없다.
// 옛 주소(LEGACY_HOSTS)로 들어온 화면 요청은 app.js가 veriline.kr로 301 넘기고, API(/v1 · /api)만 기존 키 · 웹훅 호환으로 받는다.
const clean = (v) => String(v || "").trim().replace(/\/+$/, "");
const LEGACY = /yume-reamer\.com/i;

export const SITE_HOST = clean(process.env.VERILINE_HOST || "veriline.kr").toLowerCase();
export const LEGACY_HOSTS = new Set(["yume-reamer.com", "www.yume-reamer.com", "business.yume-reamer.com"]);

// 도메인 이전 스위치(2026-10-29 밤). veriline.kr이 아직 정적 기업용 화면(Railway business 서비스)에 붙어 있으면
// 옛 주소를 veriline.kr로 301 넘기는 순간 개인 검사 · 보고서 · 약관 · 콘솔이 전부 기업용 첫 화면으로 떨어진다(실제로 그랬다).
// 그래서 운영에서 VERILINE_ON_APP=off인 동안은 넘기지 않고, 고객 링크도 지금 실제로 열리는 옛 주소로 만든다.
// veriline.kr을 이 서버(yume 서비스)에 붙이고 나면 변수를 지운다 — 그때부터 301 · veriline.kr 링크. 그 전 링크는 301로 이어진다.
export const VERILINE_ON_APP = process.env.VERILINE_ON_APP !== "off";
const LIVE_LEGACY_ORIGIN = "https://www.yume-reamer.com";

/** 고객에게 나가는 링크의 앞부분(끝 / 없음). 로컬 개발에서 요청 호스트를 쓰고 싶으면 req를 넘긴다. */
export function siteOrigin(req = null) {
  const env = clean(process.env.PUBLIC_BASE_URL);
  if (env && !LEGACY.test(env)) return env;
  const host = String(req?.get?.("host") || "");
  if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host)) return `${req.protocol}://${host}`;
  return VERILINE_ON_APP ? `https://${SITE_HOST}` : LIVE_LEGACY_ORIGIN;
}

/** 개인 검사 · 계정 · API 키 화면(예전 유메 첫 화면). veriline.kr/check 아래에서 연다. */
export const consolePath = (query = "") => `/check${query ? `?${query}` : ""}`;

/** 외부 사이트를 읽을 때 쓰는 이름. 상대 서버 로그에 남는다. */
export const BOT_UA = (name = "VerilineFactCheck") => `Mozilla/5.0 (compatible; ${name}/1.0; +https://${SITE_HOST})`;
