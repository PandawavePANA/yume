// 기업용 사이트는 유메 본체와 다른 도메인에 배포된다. 그래서 두 개의 주소를 알아야 한다.
//   YUME_URL  — 개인용 서비스와 약관·API 문서가 있는 곳(링크 대상)
//   API_ORIGIN — 무료 점검 API를 부를 서버. 교차 출처라 절대 주소여야 하고,
//                서버 쪽 AUDIT_ALLOWED_ORIGINS에 이 사이트 주소가 들어 있어야 한다.
//
// 빌드할 때 VITE_YUME_URL / VITE_YUME_API_ORIGIN 으로 덮어쓸 수 있다. 도메인이 바뀌면
// 코드를 고치지 말고 배포 환경변수만 바꾸면 된다.
const env = import.meta.env || {};

export const YUME_URL = (env.VITE_YUME_URL || "https://www.yume-reamer.com").replace(/\/+$/, "");
export const API_ORIGIN = (env.VITE_YUME_API_ORIGIN || YUME_URL).replace(/\/+$/, "");
