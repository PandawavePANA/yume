// 사업자 정보 한 곳.
//
// 전자상거래법 제10조(신원정보의 표시)와 결제대행 심사가 같은 항목을 요구한다 —
// 상호 · 대표자 · 사업자등록번호 · 주소 · 전화번호. 베리라인(개인용) · 기업용 · 리머
// 세 사이트가 전부 같은 값을 보여줘야 하므로, 세 군데에 나눠 적지 않고 여기에 모은다.
// 주소가 바뀌면 여기만 고친다.
//
// 주민등록번호는 넣지 않는다. 사업자등록증에는 찍혀 있지만 공개 항목이 아니고,
// 이 파일은 프런트엔드 번들에 그대로 들어간다.
const env = import.meta.env || {};

export const BUSINESS = {
  name: "리머",
  nameEn: "REAMER",
  ceo: "정원영",
  regNo: "627-03-03900",
  address: "대구광역시 달성군 유가읍 테크노상업로 112, 204호",
  // 2026-10-29 베리라인 독립: 사업자 연락 메일은 베리라인 메일함. 리머 외주 화면은 REAMER_EMAIL을 쓴다.
  email: "contact@veriline.kr",

  // 유선번호. 결제·본인인증 심사가 "유선번호만 가능"으로 못박은 항목이라 휴대폰 번호는
  // 쓸 수 없다. 주소·사업자번호와 같은 이유로 기본값을 박아 둔다 — 환경변수를 빠뜨린
  // 배포에서 이 줄이 통째로 사라지면 심사가 그대로 반려된다.
  tel: env.VITE_BUSINESS_TEL || "053-557-3415",

  // 통신판매업 신고번호. 간이과세자는 면제 대상일 수 있어, 없으면 아예 표시하지 않는다.
  // 없는 번호를 적어두는 것보다 빠뜨리는 쪽이 낫다.
  mailOrderNo: env.VITE_MAIL_ORDER_NO || "",
};

// 베리라인 기업용 화면(veriline.kr)에 보여 줄 연락처 — 2026-10-27 Google Workspace 별칭 도메인으로 연 주소.
// 사업자 신원정보(BUSINESS.email)와 같은 메일함으로 들어온다. 리머 · 이니시스 심사 쪽은 BUSINESS.email을 그대로 쓴다.
export const VERILINE_EMAIL = BUSINESS.email;
// 리머 외주(d-reamer.com · 개발 의뢰 대화방) 전용 연락처 — 베리라인 화면에는 쓰지 않는다.
export const REAMER_EMAIL = "reamer@d-reamer.com";

// 민원 책임 고지 — KG이니시스 포인트충전 입점 조건으로 사이트 하단에 늘 보여야 한다.
// 서버 페이지(server/renderPages.js)에도 같은 문장이 있다. 바꾸면 둘 다 고칠 것.
export const COMPLAINT_NOTICE = `모든 거래에 대한 책임과 환불, 민원 등은 ${BUSINESS.name}에서 진행합니다.`;
export const COMPLAINT_CONTACT = `${BUSINESS.ceo} · ${BUSINESS.tel} · ${BUSINESS.email}`;
export const COMPLAINT_OFFICER = `민원담당자 ${COMPLAINT_CONTACT}`;

// tel: 링크에는 하이픈이 없어야 일부 단말에서 제대로 걸린다.
export const telHref = BUSINESS.tel ? `tel:${BUSINESS.tel.replace(/[^0-9+]/g, "")}` : "";

export const COPYRIGHT = `Copyright © 2026 ${BUSINESS.name}(${BUSINESS.nameEn}). All rights reserved.`;

// 한 줄로 이어 붙일 때 쓴다. 값이 없는 항목은 빼고 이어서, 가운뎃점만 남는 일이 없게 한다.
export function businessLine(parts) {
  return parts.filter(Boolean).join(" · ");
}
