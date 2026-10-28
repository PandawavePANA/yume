// 베리라인 화면이 쓰는 주소들. veriline.kr 하나가 기업용 첫 화면 · 개인 검사(/check) · API · 약관 같은 서버 페이지를 모두 띄운다.
//   SITE_URL    — 서버 페이지(약관 · API 문서 · 지수)의 앞부분. 같은 서버라 기본은 빈 값(같은 출처).
//   API_ORIGIN  — 진단 신청 · 견적 API를 부를 서버. 기본은 같은 출처.
//   CONSOLE_URL — 개인 검사 · 계정 · API 키 화면(/check).
// 단일 파일 미리보기(vite.artifact.config.js)처럼 다른 곳에서 띄울 때는 VITE_SITE_URL / VITE_API_ORIGIN으로 덮는다.
const env = import.meta.env || {};

// 2026-10-29 대표 "yume-reamer 도메인 버린다": veriline.kr 하나가 화면 · API · 서버 페이지를 모두 띄운다(server/app.js).
// 그래서 기본은 같은 출처(빈 값). 다른 곳에서 띄우는 미리보기만 환경변수로 절대 주소를 준다.
export const SITE_URL = (env.VITE_SITE_URL || "").replace(/\/+$/, "");
export const API_ORIGIN = (env.VITE_API_ORIGIN || SITE_URL).replace(/\/+$/, "");
// 개인 검사 · 계정 · API 키 화면 — veriline.kr/check(예전 유메 첫 화면).
export const CONSOLE_URL = `${SITE_URL}/check`;

// 문의 · 진단 · 견적 폼 아래 수집 고지(2026-10-28 외부 점검 — 이름 · 이메일을 받는 폼에 수집 목적 · 항목 · 보유 기간이 없었다).
// 개인정보처리방침(/privacy)의 "기업 문의 · 진단 · 견적" 줄과 같은 내용이다. 바꾸면 둘 다 바꾼다.
export const FORM_PRIVACY_NOTE = "수집 항목: 성함 · 회사명 · 이메일 · 서비스 주소 · 남기신 내용. 목적: 진단 · 견적 · 문의 답변. 보유: 접수일로부터 1년(계약하면 계약 기록은 관계 법령에 따른 기간).";
export const PRIVACY_URL = `${SITE_URL}/privacy`;
