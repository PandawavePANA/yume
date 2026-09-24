// 린트 설정 — 목적은 하나다. **화면이 통째로 죽는 고장을 배포 전에 잡는 것.**
//
// 2026-09-23: `useRef`를 import에서 빠뜨려 운영 사이트가 흰 화면이었다. 서버 테스트 220개가
// 전부 초록이었고 빌드도 통과했다. 번들러는 없는 이름을 그대로 두고 지나가기 때문이다.
// 2026-09-24: 요금제 결제가 끝나는 자리에 `checkoutab_`라는 없는 이름이 있었다. 포트원 키가
// 아직 없어 실행되지 않았을 뿐, 키를 넣는 순간 결제 직후 화면이 죽는 코드였다.
//
// 둘 다 `no-undef` 하나로 잡힌다. 그래서 스타일 규칙은 켜지 않는다 — 고치라는 잔소리가 많으면
// 정작 중요한 경고가 묻힌다. 여기 있는 규칙은 전부 "이거 걸리면 사용자 화면이 깨진다" 뿐이다.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      // 훅을 조건문·반복문 안에서 부르면 렌더 순서가 어긋나 화면이 깨진다.
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["server/**/*.js", "scripts/**/*.mjs", "*.config.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { "no-undef": "error" },
  },
];
