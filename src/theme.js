// 유메 공용 디자인 토큰. 홈·개인 화면·기업 페이지가 같은 값을 쓴다 — 색을 새로 들이지
// 말고 여기 값을 재사용할 것. 화면이 하나에서 셋으로 늘면서 YumeDashboard 밖으로 꺼냈다.

export const EASE_APPLE = [0.22, 1, 0.36, 1];

// 디자인 토큰 — 유메의 파스텔 퍼플은 그대로, 애플 제품 페이지처럼 여백·타이포·유리 질감으로
// 고급스러움을 낸다. 색을 새로 들이지 말고 여기 값을 재사용할 것.
export const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  accentSoft: "#8B6FD8",
  brand: "linear-gradient(135deg, #B49AEE 0%, #6B4FA8 100%)",
  brandText: "linear-gradient(135deg, #A88BEA 0%, #6B4FA8 100%)",
  button: "linear-gradient(180deg, #8467CF 0%, #6B4FA8 100%)",
  hairline: "rgba(60, 40, 110, 0.10)",
  hairlineLight: "rgba(255, 255, 255, 0.7)",
  surface: "rgba(255, 255, 255, 0.84)",
  glass: "saturate(180%) blur(24px)",
  shadowCard: "0 1px 2px rgba(40,20,90,0.04), 0 8px 24px rgba(60,35,120,0.06), 0 32px 80px rgba(107,79,168,0.13)",
  shadowSoft: "0 1px 2px rgba(40,20,90,0.04), 0 12px 32px rgba(60,35,120,0.07)",
  backdrop: "rgba(24, 16, 44, 0.32)",
  sectionTitle: { fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.1, color: "#1D1A24", margin: 0 },
  lead: { fontSize: "clamp(17px, 1.6vw, 21px)", lineHeight: 1.6, color: "#5E5870", letterSpacing: "-0.01em" },
};
