// 베리라인 기업용 화면이 쓰는 주소들. 2026-10-26부터 기업용은 veriline.kr, 개인용(유메)은 www.yume-reamer.com 이고
// 둘 다 같은 서버가 띄운다(server/app.js가 주소로 첫 화면을 가른다).
//   YUME_URL     — 약관 · API 문서 · 지수 같은 서버 페이지가 있는 곳. 같은 서버라 기본은 빈 값(지금 주소 그대로).
//   API_ORIGIN   — 진단 신청 · 견적 API를 부를 서버. 같은 서버라 기본은 빈 값(같은 출처).
//   PERSONAL_URL — 개인용 검사(유메). 결제 창에 등록된 주소라 절대 주소로 간다.
//
// 단일 파일 미리보기(vite.artifact.config.js)처럼 다른 곳에서 띄울 때는 VITE_YUME_URL / VITE_YUME_API_ORIGIN / VITE_PERSONAL_URL 로 덮는다.
const env = import.meta.env || {};

// 기업용 사이트(veriline.kr)는 정적 서버(Railway business 서비스)가 띄운다 — API · 서버 페이지는 메인 서버(www.yume-reamer.com)에 있다.
// 그래서 기본값은 메인 서버 절대 주소(2026-10-27: 빈 값이면 정적 서버가 화면 파일을 돌려줘 진단 · 견적 양식이 막혔다).
const LOCAL = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname); // 로컬 미리보기는 같은 출처(개발 서버)
const MAIN = LOCAL ? "" : "https://www.yume-reamer.com";
export const YUME_URL = (env.VITE_YUME_URL || MAIN).replace(/\/+$/, "");
export const API_ORIGIN = (env.VITE_YUME_API_ORIGIN || YUME_URL).replace(/\/+$/, "");
export const PERSONAL_URL = `${(env.VITE_PERSONAL_URL || "https://www.yume-reamer.com").replace(/\/+$/, "")}/`;

// 문의 · 진단 · 견적 폼 아래 수집 고지(2026-10-28 외부 점검 — 이름 · 이메일을 받는 폼에 수집 목적 · 항목 · 보유 기간이 없었다).
// 개인정보처리방침(/privacy)의 "기업 문의 · 진단 · 견적" 줄과 같은 내용이다. 바꾸면 둘 다 바꾼다.
export const FORM_PRIVACY_NOTE = "수집 항목: 성함 · 회사명 · 이메일 · 서비스 주소 · 남기신 내용. 목적: 진단 · 견적 · 문의 답변. 보유: 접수일로부터 1년(계약하면 계약 기록은 관계 법령에 따른 기간).";
export const PRIVACY_URL = `${YUME_URL}/privacy`;
