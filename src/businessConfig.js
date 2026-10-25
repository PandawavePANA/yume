// 베리라인 기업용 화면이 쓰는 주소들. 2026-10-26부터 기업용은 veriline.kr, 개인용(유메)은 www.yume-reamer.com 이고
// 둘 다 같은 서버가 띄운다(server/app.js가 주소로 첫 화면을 가른다).
//   YUME_URL     — 약관 · API 문서 · 지수 같은 서버 페이지가 있는 곳. 같은 서버라 기본은 빈 값(지금 주소 그대로).
//   API_ORIGIN   — 진단 신청 · 견적 API를 부를 서버. 같은 서버라 기본은 빈 값(같은 출처).
//   PERSONAL_URL — 개인용 검사(유메). 결제 창에 등록된 주소라 절대 주소로 간다.
//
// 단일 파일 미리보기(vite.artifact.config.js)처럼 다른 곳에서 띄울 때는 VITE_YUME_URL / VITE_YUME_API_ORIGIN / VITE_PERSONAL_URL 로 덮는다.
const env = import.meta.env || {};

export const YUME_URL = (env.VITE_YUME_URL || "").replace(/\/+$/, "");
export const API_ORIGIN = (env.VITE_YUME_API_ORIGIN || YUME_URL).replace(/\/+$/, "");
export const PERSONAL_URL = `${(env.VITE_PERSONAL_URL || "https://www.yume-reamer.com").replace(/\/+$/, "")}/`;
