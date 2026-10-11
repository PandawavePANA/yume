// 기업용 홈 — www.yume-reamer.com/business 와 business.yume-reamer.com 이 같은 화면이다.
//
// 유메의 정체성은 "AI 팩트체크 도구"가 아니라 AI 할루시네이션을 재는 곳이다(2026-10-11).
// 신용평가사가 부도율을 공개하고 개별 회사를 평가하듯, 유메는 세 가지를 한다.
//   검사 — 글 한 편의 근거를 원문과 대조(문서·API)
//   감사 — 회사의 AI 서비스를 표본으로 감사하고 사람이 재확인한 보고서(감사 데스크)
//   지수 — 같은 방법으로 잰 숫자를 주기마다 공개(YUME 할루시네이션 지수)
// 이 홈은 그 세 가지와 요금·도입·신뢰를 한 자리에 모은다. 위에서부터 "무엇을 하는 곳인가 →
// 귀사에 무엇을 해 주나 → 얼마이고 어떻게 시작하나 → 왜 믿어도 되나" 순서다.
//
// 증빙의 무게는 "보증한다"는 말이 아니라 기록에서 나온다 — 원문 링크, 신뢰구간, 고칠 수 없는 지문.
// 그래서 이 페이지는 "보증"이라는 말을 약속으로 쓰지 않는다. 숫자는 서버 요율표(API_RATES)와
// 지수 발행본(latest.json)에서만 읽는다 — 화면에 지어낸 숫자가 들어갈 자리가 없다.
import { useEffect, useState } from "react";
import AuditModal from "./components/yume/AuditModal.jsx";
import InquiryModal from "./components/business/InquiryModal.jsx";
import { CONTACT_EMAIL } from "./components/yume/api.js";
import { YUME_URL } from "./businessConfig.js";
import { BUSINESS, telHref, COPYRIGHT, businessLine, COMPLAINT_NOTICE, COMPLAINT_OFFICER } from "./businessInfo.js";
import { API_RATES } from "../server/apiRates.js";

const won = (n) => `${n.toLocaleString("ko-KR")}원`;
const pct = (v) => `${Number(v).toFixed(1)}%`;

const CSS = `
.bz { --paper:#F6F2FC; --sheet:#FFFFFF; --ink:#1D1A24; --ink2:#5E5870; --ink3:#958EA8; --line:rgba(60,40,110,.11);
  --accent:#6B4FA8; --accent-soft:rgba(139,111,216,.12); --deep:#1F1B2E; --deep2:#2A2440; --fail:#C2410C; --ok:#2F7D5B;
  --serif:'Noto Serif KR','Nanum Myeongjo',ui-serif,Georgia,serif;
  background:var(--paper); color:var(--ink); min-height:100dvh; word-break:keep-all; }
.bz *, .bz *::before, .bz *::after { box-sizing:border-box; }
.bz a { color:inherit; }
.bz :focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
.bz-wrap { width:min(1120px,100%); margin:0 auto; padding:0 20px; }
/* 상단 메뉴 */
.bz-nav { position:sticky; top:0; z-index:30; background:rgba(246,242,252,.86); backdrop-filter:blur(14px) saturate(140%); -webkit-backdrop-filter:blur(14px) saturate(140%); border-bottom:1px solid var(--line); padding-top:var(--yume-safe-top, 0px); }
.bz-nav .row { display:flex; align-items:center; gap:18px; height:60px; }
.bz-brand { text-decoration:none; display:flex; align-items:baseline; gap:8px; white-space:nowrap; }
.bz-brand b { font-size:14px; font-weight:800; letter-spacing:.24em; color:var(--accent); }
.bz-brand span { font-size:12.5px; color:var(--ink3); font-weight:600; }
.bz-links { display:flex; gap:4px; flex:1; }
.bz-links a { text-decoration:none; font-size:13.5px; color:var(--ink2); padding:7px 10px; border-radius:8px; white-space:nowrap; }
.bz-links a:hover { background:rgba(255,255,255,.7); color:var(--ink); }
.bz-nav .right { display:flex; gap:8px; align-items:center; margin-left:auto; }
@media (max-width: 940px) { .bz-links { display:none; } }
@media (max-width: 520px) { .bz-nav .personal { display:none; } .bz-brand span { display:none; } }
/* 버튼 */
.bz-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:12px 20px; border-radius:999px; border:0; cursor:pointer; font:inherit; font-size:14.5px; font-weight:650; text-decoration:none; white-space:nowrap; }
.bz-btn.primary { background:var(--accent); color:#fff; }
.bz-btn.primary:hover { background:#5C4296; }
.bz-btn.ghost { background:var(--accent-soft); color:var(--accent); }
.bz-btn.ghost:hover { background:rgba(139,111,216,.2); }
.bz-btn.dark { background:var(--deep); color:#fff; }
.bz-btn.light { background:rgba(255,255,255,.14); color:#fff; }
.bz-btn.sm { padding:8px 14px; font-size:13px; }
/* 히어로 */
.bz-hero { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); gap:clamp(24px,4vw,52px); align-items:center; padding:clamp(40px,7vw,84px) 0 clamp(36px,5vw,56px); }
@media (max-width: 900px) { .bz-hero { grid-template-columns:1fr; } }
.bz-eyebrow { font-size:12px; font-weight:750; letter-spacing:.14em; text-transform:uppercase; color:var(--ink3); }
.bz-hero h1 { font-size:clamp(32px,5vw,56px); font-weight:780; letter-spacing:-.04em; line-height:1.14; margin:14px 0 0; text-wrap:balance; }
.bz-tag { font-size:clamp(16px,1.8vw,20px); font-weight:650; color:var(--accent); margin:14px 0 0; letter-spacing:-.015em; }
.bz-hero p.lead { font-size:clamp(15.5px,1.6vw,18px); color:var(--ink2); line-height:1.75; margin:16px 0 0; max-width:54ch; }
.bz-ctas { display:flex; gap:10px; flex-wrap:wrap; margin-top:26px; }
/* 증거 패널 */
.bz-panel { background:var(--deep); color:#fff; border-radius:26px; padding:clamp(20px,3vw,28px); box-shadow:0 30px 80px rgba(31,27,46,.28); display:grid; gap:16px; }
.bz-panel .label { font-size:11.5px; font-weight:750; letter-spacing:.14em; color:#A88BEA; text-transform:uppercase; }
.bz-panel .num { font-family:var(--serif); font-weight:900; font-size:clamp(52px,7vw,76px); line-height:1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; margin-top:8px; }
.bz-panel .num.word { font-family:inherit; font-weight:800; font-size:clamp(34px,4.6vw,46px); letter-spacing:-.03em; }
.bz-panel .desc { font-size:13.5px; color:#CFC9DE; line-height:1.7; margin-top:8px; }
.bz-panel .link { color:#C9B6FF; font-weight:700; font-size:13.5px; text-decoration:none; }
.bz-receipt { background:var(--deep2); border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:14px 16px; font-size:13px; }
.bz-receipt .top { display:flex; justify-content:space-between; gap:8px; color:#9F97B8; font-size:11.5px; letter-spacing:.06em; }
.bz-receipt .claim { margin-top:8px; color:#EEEAF6; line-height:1.6; }
.bz-receipt .verdict { display:inline-block; margin-top:8px; padding:2px 9px; border-radius:999px; background:rgba(240,138,93,.18); color:#F6A27E; font-weight:700; font-size:12px; }
.bz-receipt .why { margin-top:6px; color:#B9B1CF; line-height:1.6; font-size:12.5px; }
/* 근거 띠 */
.bz-proof { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
.bz-proof div { padding:16px 16px 16px 0; font-size:13px; color:var(--ink2); line-height:1.55; }
.bz-proof b { display:block; color:var(--ink); font-size:13.5px; margin-bottom:2px; }
@media (max-width: 820px) { .bz-proof { grid-template-columns:repeat(2,minmax(0,1fr)); } }
/* 섹션 */
.bz-sec { padding:clamp(56px,8vw,96px) 0 0; scroll-margin-top:70px; }
.bz-sec h2 { font-size:clamp(25px,3.3vw,36px); font-weight:760; letter-spacing:-.035em; line-height:1.24; margin:12px 0 0; text-wrap:balance; max-width:26ch; }
.bz-sec .lede { font-size:clamp(15px,1.5vw,17px); color:var(--ink2); line-height:1.75; margin:12px 0 0; max-width:62ch; }
.bz-grid { display:grid; gap:12px; margin-top:22px; }
.g2 { grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
.g3 { grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); }
.g4 { grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); }
.bz-card { background:rgba(255,255,255,.88); border:1px solid var(--line); border-radius:18px; padding:18px 20px; display:flex; flex-direction:column; gap:7px; }
.bz-card.main { background:#fff; border:1.5px solid var(--accent); }
.bz-card .k { font-size:12px; font-weight:750; letter-spacing:.08em; color:var(--accent); }
.bz-card .t { font-size:16px; font-weight:720; letter-spacing:-.02em; line-height:1.4; }
.bz-card .d { font-size:13.5px; color:var(--ink2); line-height:1.68; }
.bz-card .f { margin-top:auto; padding-top:10px; font-size:12.5px; color:var(--ink3); border-top:1px dashed var(--line); }
.bz-card .act { margin-top:auto; padding-top:8px; }
.bz-pillar { text-decoration:none; }
.bz-pillar .big { font-size:30px; font-weight:800; letter-spacing:-.03em; color:var(--ink); }
.bz-pillar:hover { border-color:rgba(107,79,168,.35); }
.bz-note { font-size:13px; color:var(--ink3); line-height:1.75; margin-top:14px; }
.bz-sub { font-size:17px; font-weight:720; letter-spacing:-.02em; margin:34px 0 0; }
.bz-chips { display:flex; gap:7px; flex-wrap:wrap; margin-top:14px; }
.bz-chips span { font-size:12.5px; padding:5px 11px; border-radius:999px; background:#fff; border:1px solid var(--line); color:var(--ink2); }
.bz-code { margin-top:18px; border-radius:18px; overflow:hidden; background:var(--deep); }
.bz-code pre { margin:0; padding:18px 20px; overflow-x:auto; font-size:12.5px; line-height:1.7; color:#CFC9DE; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.bz-steps { list-style:none; padding:0; margin:22px 0 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
.bz-steps .n { font-size:12px; font-weight:750; color:var(--accent); letter-spacing:.08em; }
.bz-price { font-size:27px; font-weight:780; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.bz-price small { font-size:13px; font-weight:500; color:var(--ink3); letter-spacing:0; }
.bz-faq { margin-top:20px; border-top:1px solid var(--line); }
.bz-faq details { border-bottom:1px solid var(--line); padding:16px 2px; }
.bz-faq summary { cursor:pointer; font-size:15.5px; font-weight:680; letter-spacing:-.015em; list-style:none; display:flex; justify-content:space-between; gap:12px; }
.bz-faq summary::-webkit-details-marker { display:none; }
.bz-faq summary::after { content:"+"; color:var(--accent); font-weight:700; }
.bz-faq details[open] summary::after { content:"−"; }
.bz-faq p { font-size:14px; color:var(--ink2); line-height:1.75; margin:10px 0 0; max-width:70ch; }
.bz-final { margin-top:clamp(56px,8vw,96px); padding:clamp(28px,4vw,44px); border-radius:28px; background:var(--deep); color:#fff; display:grid; grid-template-columns:minmax(0,1.2fr) auto; gap:20px; align-items:center; }
@media (max-width: 760px) { .bz-final { grid-template-columns:1fr; } }
.bz-final h2 { font-size:clamp(23px,3vw,32px); font-weight:760; letter-spacing:-.03em; margin:0; line-height:1.3; }
.bz-final p { color:#CFC9DE; font-size:15px; line-height:1.7; margin:10px 0 0; max-width:52ch; }
.bz-foot { margin-top:44px; padding:20px 0 calc(60px + var(--yume-safe-bottom, 0px)); border-top:1px solid var(--line); font-size:13px; color:var(--ink3); display:flex; flex-direction:column; gap:14px; }
.bz-foot .links { display:flex; gap:14px; flex-wrap:wrap; }
.bz-foot a { color:var(--ink3); text-decoration:none; }
.bz-foot address { font-style:normal; font-size:12px; line-height:1.85; }
@media (prefers-reduced-motion: no-preference) { .bz-fade { animation:bzfade .7s cubic-bezier(.2,.7,.2,1) both; } @keyframes bzfade { from { opacity:.0001; transform:translateY(10px); } } }
`;

const NAV = [
  ["#index", "지수"],
  ["#audit", "AI 감사"],
  ["#check", "검사·API"],
  ["#pricing", "요금"],
  ["#trust", "신뢰"],
  ["#faq", "자주 묻는 질문"],
];

const PROOF = [
  ["공식 원문 대조", "법제처 국가법령정보 공동활용 API와 DOI 레지스트리에서 원문을 직접 받습니다."],
  ["특허 출원 10-2026-0194281", "부존재 신뢰도 정량화 — 청구항 15개, 심사 청구."],
  ["고칠 수 없는 지수", "발행본마다 SHA-256 지문과 원자료를 공개합니다."],
  ["AI 사용을 숨기지 않음", "생성형 AI를 쓰는 자리와 쓰지 않는 자리를 밝힙니다."],
];

const PILLARS = [
  { k: "검사", t: "글 한 편을 원문으로", v: "보도자료·상품 설명·상담 답변을 올리면 틀린 곳과 고친 문장이 나옵니다. 개발팀은 API로 답변이 나가기 전에 거릅니다.", href: "#check", cta: "검사·API 보기" },
  { k: "감사", t: "귀사 AI를 표본으로", v: "정답이 확정된 질문과 실제 사용자 질문으로 귀사 AI 서비스를 검사하고, 사람이 원문으로 재확인한 비공개 보고서를 드립니다.", href: "#audit", cta: "AI 감사 보기" },
  { k: "지수", t: "같은 방법으로, 주기마다 공개", v: "YUME 할루시네이션 지수. 표본·신뢰구간·방법을 함께 공개하고, 발행한 숫자는 고칠 수 없게 지문을 붙입니다.", href: "#index", cta: "지수 보기" },
];

// 감사 절차 — 감사 데스크(server/auditDesk.js)가 실제로 강제하는 순서 그대로다.
const AUDIT_FLOW = [
  ["질문 설계", "귀사 업종의 법령으로 정답을 먼저 확정한 기준 문항과, 실제 사용자가 하는 질문을 섞어 20~30개(정밀 감사는 더 많이)를 만듭니다."],
  ["답변 수집", "사람이 일반 사용자로서 질문을 직접 입력하고, 받은 시각과 화면 캡처를 남깁니다. 자동으로 대량 질의하지 않습니다."],
  ["검사와 재확인", "유메가 답변을 원문과 대조하고, 오류로 지목된 항목은 사람이 공식 원문을 직접 열어 확인한 것만 남깁니다. 애매한 것은 뺍니다."],
  ["비공개 보고서", "검사 수치(신뢰구간 포함), 대표 사례와 원문 링크, 잘된 점, 한계를 1~2쪽에 담아 귀사에만 드립니다."],
];

const AUDIT_PRODUCTS = [
  { k: "무료 AI 점검", sub: "5분 · 셀프", v: "정답이 확정된 질문 8개를 귀사 AI에 넣고 답을 붙여 넣으면 바로 채점합니다. API 키를 넘기지 않아도 됩니다.", cta: "free" },
  { k: "1회 정밀 감사", sub: "표본 감사 + 보고서 + 개선 회의 1회", v: "가장 신경 쓰이는 오류 유형을 들려 주시면 그 범위로 질문을 설계합니다. 비용은 질문 수와 업종 범위를 듣고 견적으로 드립니다.", cta: "audit", label: "정밀 감사 문의", main: true },
  { k: "정기 감사 + 감사 기록", sub: "분기마다 재감사", v: "동의하시면 공개 감사 기록 페이지와 홈페이지 배지(90일 유효)를 드리고, YUME 할루시네이션 지수에 이름을 싣습니다. 고객사·투자자에게 보여 줄 수 있는 검사 기록입니다.", cta: "audit_regular", label: "정기 감사 문의" },
];

// 업종 순서가 곧 영업 우선순위다. 확인 의무와 담당자·예산이 이미 있는 광고 심의 업종이 먼저.
const SECTOR = [
  { tag: "보험·금융 광고 심의", title: "심의 전에 수치 오류를 먼저 잡습니다", body: "AI로 쓴 상품 안내문과 광고 문구의 금리·보장 범위·조건 수치를 약관과 대조합니다. 약관을 기준 자료로 넣으면 회사 고유 수치까지 맞춰 보고, 틀린 문장은 약관에 적힌 값으로 고친 문장까지 드립니다.", who: "보험사 · 은행 · 카드 · 증권 · 협회 광고 심의 조직" },
  { tag: "건강기능식품·제약", title: "효능 주장과 인용 연구를 심의 전에", body: "상세페이지와 광고에 붙은 연구 인용은 DOI·PMID를 공식 레지스트리에 조회해 논문이 실제로 있는지 확인합니다. 받은 적 없는 수상·인증, 출처 없는 수치는 공표 기록이 있어야 할 곳을 탐색해 없으면 부존재 신뢰도로 알려 드립니다.", who: "건강기능식품 · 제약 · 의료기기 · 헬스케어 플랫폼" },
  { tag: "상담 챗봇·AI 서비스", title: "고객에게 나가기 전, 마지막 확인", body: "챗봇의 말은 회사의 말입니다. 청약철회 기간이나 보증 범위를 AI가 어림으로 답하면 그 안내가 분쟁의 근거가 됩니다. 답변 생성과 고객 노출 사이에 API를 두면 해당 조문을 법제처에서 직접 받아 대조합니다.", who: "금융 · 통신 · 유통 · 공공 상담, 법률·세무·노무 AI 서비스" },
  { tag: "보도자료·홍보", title: "AI로 작성, 유메로 사실 확인", body: "틀린 보도자료는 정정 보도로 돌아옵니다. 배포 전에 문서를 올리면 수치·연도·기관명을 출처 원문과 대조하고, 모든 주장이 확인되면 읽는 사람이 근거를 직접 열어 보는 YUME 검증 마크를 붙일 수 있습니다.", who: "공공기관 · 대학 · 스타트업 홍보팀" },
  { tag: "법률", title: "제출 전, 인용 전체를 한 번에", body: "AI가 만든 사건번호는 형식이 완벽해서 눈으로는 걸러지지 않습니다. 문서 전체의 인용을 한 번에 법제처 원문과 대조하고 실재하지 않으면 부존재 신뢰도와 함께 표시합니다. 개별 사안에 대한 법률 판단은 하지 않습니다.", who: "로펌 · 기업 법무팀 · 리걸테크" },
  { tag: "교육·리서치", title: "참고문헌이 진짜인지 확인하세요", body: "\"업계 평균 18.7%\" 같은 수치와 그럴듯한 참고문헌은 출처 없이도 자연스럽게 읽힙니다. 유메는 그 주장이 사실이라면 어디에 기록돼 있어야 하는지를 기준으로 탐색하고, 기록이 없으면 지어낸 것으로 판정합니다.", who: "대학 · 연구기관 · 보고서·제안서 작성" },
];

// 도입 순서. 처음 두 단계는 비용도 결재도 없다 — 증거를 먼저 보여 주고, 증거로 계약한다.
const STEPS = [
  { n: "01", k: "무료 AI 점검 또는 비공개 감사", v: "5분 셀프 점검으로 귀사 AI를 먼저 재 보거나, 유메가 감사한 결과를 비공개로 받아 보세요. API 키를 넘기지 않아도 됩니다.", cta: "audit" },
  { n: "02", k: "실제 문서 10건 무료 검사", v: "귀사가 실제로 내보내는 문서 10건을 보내 주시면 틀린 곳과 고친 문장을 돌려 드립니다. 공개해도 되는 문서로 시작하셔도 됩니다.", cta: "trial10" },
  { n: "03", k: "2주 PoC", v: "합의한 범위로 2주 동안 검사하고 보고서를 드립니다. 검사 건수, 오류 유형별 건수, 고치기 전·후 사례 3개, 처리 시간, 사람 검수와의 비용 비교가 들어갑니다.", cta: "poc" },
  { n: "04", k: "약정 · 정기 감사", v: "결과를 보고 API 약정이나 종량제, 정기 감사를 고릅니다. 기대에 못 미치면 계약하지 않으셔도 됩니다.", cta: "unsure" },
];

// 할 수 있는 것보다 할 수 없는 것을 먼저 말한다. 전부 실제 동작이어야 한다.
const TRUST = [
  { k: "생성형 AI를 쓰고, 그 사실을 숨기지 않습니다", v: "주장 추출, 검색어 작성, 고친 문장 제안에 생성형 AI(Anthropic Claude)를 씁니다. 판정은 AI의 기억으로 확정하지 않습니다. 출처를 대지 못하는 '확인됨'과 '사실과 다름'은 자동으로 '확인되지 않음'으로 내려갑니다." },
  { k: "모르면 모른다고 합니다", v: "100% 정확하다고 말하지 않습니다. '확인되지 않음'은 거짓이라는 뜻이 아니라 근거를 찾지 못했다는 뜻이고, 어디까지 찾았는지 함께 보여 드립니다." },
  { k: "사람 검수자를 대체하지 않습니다", v: "유메는 사람 검수자의 1차 필터입니다. 검수자는 유메가 표시한 '사실과 다름'과 '확인되지 않음'부터 보면 됩니다. 최종 판단과 규제 준수 책임은 귀사에 있습니다." },
  { k: "귀사 자료는 그 검사에만 씁니다", v: "기준 자료(약관·상품 정보)는 저장하지 않고, 그 자료로 낸 판정은 다른 고객과 공유하는 캐시에 넣지 않습니다. API 텍스트는 과금·분쟁 대응을 위해 1년 보관하며 데이터셋에 넣지 않습니다. Claude API 입력은 모델 학습에 쓰이지 않습니다." },
  { k: "숫자와 돈을 섞지 않습니다", v: "지수와 감사 결과는 같은 방법으로 셉니다. 유료 고객이라고 빼거나, 좋게 내 달라는 대가를 받지 않습니다. 회사 이름은 동의한 경우에만 싣습니다." },
  { k: "판정이 틀리면 고칩니다", v: "결과 화면의 '이 판정이 틀렸나요?'나 이메일로 알려 주시면 검토해 바로잡고, 같은 실수가 반복되지 않도록 정확도 시험에 넣습니다." },
];

const TECH = [
  { k: "공식 데이터 직접 대조", v: "법률 주장은 웹 검색이 아니라 법제처 국가법령정보 공동활용 API로 조문 원문을 받아 대조합니다. 오늘 시행 중인 버전만 조회하므로 개정 전 내용을 현행으로 착각하지 않습니다." },
  { k: "부존재 신뢰도 (특허 출원 10-2026-0194281 · 심사 청구)", v: "못 찾았다고 곧바로 없다고 하지 않습니다. 탐색 커버리지·식별자 형식오류·유사 실재 항목과의 근접도로 부존재 신뢰도를 산출하고, 임계값을 넘을 때만 지어낸 것으로 판정합니다." },
  { k: "근거 잠금", v: "웹 판정의 근거 문장을 서버가 출처 페이지에서 직접 확인하고, 처음 판정을 모르는 독립 검토자에게 다시 묻습니다. 통과하지 못한 판정은 내보내지 않습니다." },
  { k: "기록에 남는 판정", v: "주장별 판정·근거·출처·원문 속 위치·부존재 신뢰도가 구조화된 JSON으로 나옵니다. 사후 감사와 내부 리뷰에 그대로 쓸 수 있습니다." },
];

const FAQ = [
  ["유메도 AI 아닌가요?", "주장을 떼어 내고 검색어를 만들고 고친 문장을 제안하는 데 생성형 AI를 씁니다. 다만 판정은 공식 원문과 출처 문장으로만 단정합니다. 근거를 대지 못하는 판정은 '확인되지 않음'으로 내려가고, 지수의 기준 문항은 정답을 먼저 법제처 원문으로 확정해 두고 채점합니다."],
  ["100% 정확한가요?", "아닙니다. 아무 글에서나 100%를 약속하는 서비스는 과장입니다. 유메는 원문으로 확인된 것만 '확인됨'이나 '사실과 다름'으로 단정하고, 나머지는 어디까지 찾았는지와 함께 '확인되지 않음'으로 둡니다."],
  ["감사 결과가 공개되나요?", "아니요. 감사 보고서는 귀사에만 비공개 링크로 드리고, 언제든 회수할 수 있습니다. 회사 이름은 서면으로 동의하신 경우에만 공개 감사 기록과 지수에 실립니다. 지수에는 업종 단위의 익명 숫자로만 들어갑니다."],
  ["우리 AI의 API 키나 내부 접근 권한이 필요한가요?", "필요 없습니다. 무료 점검은 질문을 귀사 AI에 넣고 받은 답을 붙여 넣는 방식이고, 감사는 유메가 일반 사용자로서 직접 써 보는 방식입니다."],
  ["지수의 숫자는 돈을 내면 바뀌나요?", "바뀌지 않습니다. 방법(YHI-1.0)을 공개하고 같은 방법으로 셉니다. 발행한 호는 SHA-256 지문을 붙여 고정하고, 바로잡을 때는 사유와 이전 지문을 공개합니다."],
  ["결과를 보증해 주나요?", "유메가 드리는 것은 무엇을 언제 어떤 원문으로 확인했는지의 검사 기록입니다. 서비스 품질이나 앞으로의 답변을 보증하지 않으며, 법률·의료·금융 자문이 아닙니다."],
];

const PRICE_CARDS = [
  { key: "trial", label: API_RATES.trial.label, price: "0원", period: "", detail: `매달 ${API_RATES.trial.calls}회. 가입하면 바로 키를 받아 응답 형식을 확인할 수 있습니다.`, unit: "계정당 한도 · 키는 여러 개 만들어도 함께 씁니다", cta: "가입하고 키 발급받기", href: `${YUME_URL}/?open=api` },
  { key: "metered", label: API_RATES.metered.label, price: won(API_RATES.metered.unitKrw), period: " / 회", detail: "월 약정 없이 쓴 만큼 냅니다. 물량을 가늠하기 전에 붙여 보기 좋습니다.", unit: "기본료 없음", cta: "종량제 신청", plan: "metered" },
  ...API_RATES.tiers.map((t) => ({
    key: t.key, label: t.label, price: won(t.monthlyKrw), period: " / 월",
    detail: `매달 ${t.calls.toLocaleString("ko-KR")}회 포함.`,
    unit: `건당 ${won(Math.round(t.monthlyKrw / t.calls))} · 종량제보다 ${Math.round((1 - t.monthlyKrw / t.calls / API_RATES.metered.unitKrw) * 100)}% 저렴`,
    cta: `${t.label} 신청`, plan: t.key,
  })),
];

// 점검 보고서의 "견적 받기"가 ?inquiry=growth 처럼 붙여 보낸다. 들어오자마자 그 플랜으로 문의 창을 연다.
function initialInquiry() {
  try {
    const p = new URLSearchParams(window.location.search).get("inquiry");
    return p ? { plan: p, note: "" } : null;
  } catch {
    return null;
  }
}

// 지수 최신 호. 서버가 내려준 숫자만 쓴다 — 없으면 없다고, 대표 숫자가 없는 호면 그렇다고 말한다.
function useLatestIndex() {
  const [latest, setLatest] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${YUME_URL}/hallucination-index/latest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setLatest(d))
      .catch(() => alive && setLatest(null));
    return () => {
      alive = false;
    };
  }, []);
  return latest;
}

function IndexFigure({ latest, big = false }) {
  const h = latest?.headline;
  const has = h && h.rate !== null && h.rate !== undefined;
  const href = latest ? `${YUME_URL}${latest.url}` : `${YUME_URL}/hallucination-index`;
  return (
    <div>
      <div className="label">{latest ? `YUME 할루시네이션 지수 · ${latest.title}` : "YUME 할루시네이션 지수"}</div>
      {has ? (
        <div className="num">{pct(h.rate)}</div>
      ) : (
        <div className="num word">{latest === undefined ? "…" : latest ? "창간호 발행" : "창간 준비 중"}</div>
      )}
      <div className="desc">
        {has
          ? <>정답이 공식 원문으로 확정된 질문 {Number(h.n).toLocaleString("ko-KR")}건 중 AI가 근거 없이 지어낸 비율. 95% 신뢰구간 {pct(h.low)}~{pct(h.high)}{h.provisional ? " · 표본이 작아 예비 숫자" : ""}.</>
          : latest
            ? "창간호는 측정 방법과 기준선을 먼저 공개했습니다. 대표 숫자는 사람이 재확인한 감사 표본이 모이는 다음 호부터 싣습니다 — 표본 없이 숫자를 내지 않습니다."
            : "같은 방법으로 반복해 재는 공개 지표입니다. 무엇을 어떻게 재는지는 지금 공개되어 있습니다."}
        {big && latest?.engine?.claims ? <> 이번 호 기준선: 유메가 대조한 사실 주장 {Number(latest.engine.claims).toLocaleString("ko-KR")}개.</> : null}
      </div>
      <a className="link" href={href} style={{ display: "inline-block", marginTop: 10 }}>{latest ? "이번 호 전체 보기 →" : "지수와 방법 보기 →"}</a>
    </div>
  );
}

function Section({ id, eyebrow, title, lede, children }) {
  return (
    <section id={id} className="bz-sec">
      <div className="bz-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </section>
  );
}

export default function BusinessPage() {
  const [showAudit, setShowAudit] = useState(false);
  // 도입 문의 창. { plan, note } — 카드의 "신청"은 그 플랜을 골라 둔 채로 연다.
  const [inquiry, setInquiry] = useState(initialInquiry);
  const ask = (plan = "unsure") => () => setInquiry({ plan, note: "" });
  const latest = useLatestIndex();

  return (
    <main className="bz">
      <style>{CSS}</style>

      {/* ── 상단 메뉴 ── */}
      <header className="bz-nav">
        <div className="bz-wrap row">
          <a className="bz-brand" href="#top" aria-label="유메 기업용 홈 맨 위로"><b>YUME</b><span>for Business</span></a>
          <nav className="bz-links" aria-label="기업용 홈 메뉴">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="right">
            <a className="bz-btn ghost sm personal" href={YUME_URL}>개인용</a>
            <button type="button" className="bz-btn primary sm" onClick={ask("audit")}>도입 문의</button>
          </div>
        </div>
      </header>

      <div className="bz-wrap" id="top">
        {/* ── 히어로: 무엇을 하는 곳인가 ── */}
        <section className="bz-hero">
          <div className="bz-fade">
            <div className="bz-eyebrow">AI 할루시네이션 검사 · 감사 · 지수</div>
            <h1>AI가 지어낸 말을, 원문으로 검사하고 기록으로 남깁니다</h1>
            <p className="bz-tag">AI의 짐작이 아니라, 원문으로 판정합니다.</p>
            <p className="lead">
              유메는 AI 할루시네이션을 재는 곳입니다. 문장 속 사실 주장을 하나씩 떼어 <b>법령 원문과 공식 레지스트리에 직접 대조</b>하고,
              무엇을 언제 어떤 원문으로 확인했는지 기록으로 남깁니다. 귀사 AI는 표본으로 감사하고, 같은 방법으로 잰 숫자는 주기마다 공개합니다.
            </p>
            <div className="bz-ctas">
              <button type="button" className="bz-btn primary" onClick={ask("audit")}>AI 감사 문의</button>
              <button type="button" className="bz-btn ghost" onClick={() => setShowAudit(true)}>우리 AI 무료 점검</button>
              <a className="bz-btn ghost" href={`${YUME_URL}/?open=docs`}>문서 올려서 검사하기</a>
            </div>
          </div>

          {/* 증거 패널 — 지수 최신 호(실제 발행본)와 판정 기록 한 줄(API 응답 형식 예시). */}
          <aside className="bz-panel bz-fade" aria-label="유메가 남기는 기록">
            <IndexFigure latest={latest} />
            <div className="bz-receipt">
              <div className="top"><span>판정 기록 · API 응답 형식 예시</span><span>verified_via: nec</span></div>
              <div className="claim">“공정위 고시 제2019-77호 제3조가 로열티 상한을 정한다”</div>
              <span className="verdict">사실과 다름 · 부존재 신뢰도 0.763</span>
              <div className="why">행정규칙 검색공간의 약 85%를 탐색했지만 해당 고시를 찾지 못했습니다. 주장마다 근거·출처·원문 속 위치가 함께 남습니다.</div>
            </div>
          </aside>
        </section>

        {/* ── 근거 띠 ── */}
        <div className="bz-proof">
          {PROOF.map(([b, d]) => <div key={b}><b>{b}</b>{d}</div>)}
        </div>

        {/* ── 세 가지 일 ── */}
        <Section eyebrow="유메가 하는 일" title="검사하고, 감사하고, 공개합니다" lede="세 가지는 한 줄로 이어집니다. 검사로 쌓인 판정 기술이 감사를 가능하게 하고, 감사 결과가 지수의 표본이 되고, 지수가 다시 귀사가 감사를 받을 이유가 됩니다.">
          <div className="bz-grid g3">
            {PILLARS.map((p) => (
              <a key={p.k} href={p.href} className="bz-card bz-pillar">
                <span className="big">{p.k}</span>
                <span className="t">{p.t}</span>
                <span className="d">{p.v}</span>
                <span className="f" style={{ color: "var(--accent)", fontWeight: 650 }}>{p.cta} →</span>
              </a>
            ))}
          </div>
        </Section>

        {/* ── 지수 ── */}
        <Section id="index" eyebrow="YUME 할루시네이션 지수" title="AI 할루시네이션의 기준 숫자를, 같은 방법으로 반복해 공개합니다" lede="공식 원문으로 정답을 확정한 질문으로 AI가 근거 없이 지어내는 비율을 재고 주기마다 발행합니다. 숫자마다 표본과 95% 신뢰구간, 방법과 한계를 같이 싣고, 발행한 숫자는 고칠 수 없게 지문(SHA-256)을 붙입니다.">
          <div className="bz-panel" style={{ marginTop: 22 }}>
            <IndexFigure latest={latest} big />
          </div>
          <div className="bz-grid g3">
            {[
              ["정답은 원문이 정합니다", "법제처 국가법령정보·판례 데이터베이스·학술 레지스트리로 정답을 먼저 확정한 질문만 씁니다. 같은 질문이 반복되지 않아 미리 대비할 수 없습니다."],
              ["오류는 사람이 확정합니다", "유메가 지목한 오류는 사람이 공식 원문을 직접 열어 확인한 것만 셉니다. 표본이 20건이 안 되는 칸은 비율을 싣지 않습니다."],
              ["숫자는 고치지 않습니다", "발행본에 지문을 붙이고 원자료(JSON·CSV)를 공개합니다. 바로잡을 때는 사유와 이전 지문을 남깁니다."],
            ].map(([h, d]) => (
              <div key={h} className="bz-card"><div className="t">{h}</div><div className="d">{d}</div></div>
            ))}
          </div>
          <div className="bz-ctas" style={{ marginTop: 18 }}>
            <a className="bz-btn dark" href={`${YUME_URL}/hallucination-index`}>지수와 방법 보기</a>
            <a className="bz-btn ghost" href={`${YUME_URL}/hallucination-index#method`}>측정 방법 YHI-1.0</a>
          </div>
        </Section>

        {/* ── AI 감사 ── */}
        <Section id="audit" eyebrow="AI 감사" title="귀사 AI가 어디서 지어내는지, 사람이 원문으로 확인한 기록으로" lede="보안 점검처럼, 유메가 귀사 AI 서비스를 일반 사용자로서 써 보고 근거 없이 지어낸 답을 공식 원문과 함께 찾아 드립니다. 결과는 귀사에만 비공개로 드리고, 공개 여부는 귀사가 정합니다.">
          <ol className="bz-steps">
            {AUDIT_FLOW.map(([k, v], i) => (
              <li key={k} className="bz-card">
                <div className="n">{String(i + 1).padStart(2, "0")}</div>
                <div className="t">{k}</div>
                <div className="d">{v}</div>
              </li>
            ))}
          </ol>
          <div className="bz-grid g3">
            {AUDIT_PRODUCTS.map((p) => (
              <div key={p.k} className={`bz-card${p.main ? " main" : ""}`}>
                <div className="k">{p.k}</div>
                <div style={{ fontSize: 13, color: "var(--ink3)" }}>{p.sub}</div>
                <div className="d" style={{ flex: 1 }}>{p.v}</div>
                <div className="act">
                  {p.cta === "free"
                    ? <button type="button" className="bz-btn ghost sm" onClick={() => setShowAudit(true)}>무료 점검 시작</button>
                    : <button type="button" className={`bz-btn ${p.main ? "primary" : "ghost"} sm`} onClick={ask(p.cta)}>{p.label}</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="bz-card" style={{ marginTop: 12 }}>
            <div className="t">실제 서비스에서 AI가 틀리는 자리를 묻습니다</div>
            <div className="d">
              <b>수치 하나가 틀린 자료로 고객 안내문 쓰기</b>, <b>최근 개정된 현행 기준</b>, 고객이 내민 <b>있을 법한 가짜 조문</b>, 근거로 대라는 <b>판례 번호</b>.
              요즘 AI가 가장 많이 무너지는 자리입니다. 질문마다 정답을 먼저 확정해 두고 채점하므로, 유메의 짐작이 아니라 원문과 대조한 결과가 나옵니다.
            </div>
          </div>
          <p className="bz-note">동의 없이 회사 이름을 쓰지 않습니다 · 결과가 나쁘다고 빼거나, 좋게 내 달라는 대가를 받지 않습니다 · 점검 결과가 깨끗하면 도입을 권하지 않습니다 · 감사 결과는 그 기간의 표본 검사 기록이며 서비스 품질을 보증하지 않습니다.</p>
        </Section>

        {/* ── 검사·API ── */}
        <Section id="check" eyebrow="검사 · 검증 마크 · API" title="글 한 편부터 서비스 전체까지, 같은 판정으로" lede="실무자는 파일을 올리고, 개발팀은 API로 붙입니다. 어느 길로 들어와도 주장마다 근거와 출처가 남고, 모두 확인된 글에는 누구나 열어 볼 수 있는 검증 마크가 붙습니다.">
          <h3 className="bz-sub">문서 검사 — 개발자 없이</h3>
          <div className="bz-grid g3">
            {[
              ["원문에 바로 표시", "보도자료·상품 설명서·약관·보고서를 그대로 올리면(HWPX·DOCX·PDF·TXT, 10만 자까지) 어느 문장이 틀렸는지 원문 위에 표시합니다."],
              ["고친 본문까지", "틀린 문장을 근거에 적힌 실제 값으로 고친 문장으로 바꾼 본문을 내려받습니다. 여러 건은 일괄 검증으로 한 번에."],
              ["우리 회사 기준으로", "회사 소개·상품 정보를 함께 넣으면, 자사 이야기는 공개 웹이 아니라 그 자료와 대조합니다. 자료는 저장하지 않습니다."],
            ].map(([h, d]) => <div key={h} className="bz-card"><div className="t">{h}</div><div className="d">{d}</div></div>)}
          </div>

          <h3 className="bz-sub">YUME 검증 마크와 A4 검증서</h3>
          <div className="bz-grid g4">
            {[
              ["엄격한 발급 기준", "모든 주장이 '확인됨'이고 서버가 출처 페이지에서 근거 문장을 직접 확인한 경우에만 발급합니다."],
              ["공개 검증 페이지", "마크를 누르면 원문, 주장별 근거와 출처, 검증 일시, 원문 지문이 열립니다."],
              ["바뀌면 바로 표시", "글자가 하나라도 바뀌면 '원문 변경됨', 90일이 지나면 '재확인 필요'로 바뀝니다."],
              ["A4 검증서", "검증서 번호·원문 지문·진위 확인 QR을 담아 결재·심의·투자 자료에 첨부합니다."],
            ].map(([h, d]) => <div key={h} className="bz-card"><div className="t">{h}</div><div className="d">{d}</div></div>)}
          </div>
          <p className="bz-note">검증 마크는 글 속 사실 주장을 검증 시점 기준으로 확인한 기록이며, 회사·상품의 품질을 보증하지 않습니다.</p>

          <h3 className="bz-sub">검증 API — 답변을 내보내기 전에 한 번 거르세요</h3>
          <div className="bz-code">
            <pre>{`POST /v1/verify
Authorization: Bearer <API_KEY>

{ "text": "AI가 생성한 답변 전문" }

→ {
    "claims": [{
      "text": "공정위 고시 제2019-77호 제3조가 로열티 상한을 정한다",
      "verdict": "false",
      "verified_via": "nec",
      "nec": { "score": 0.763, "grade": "nonexistent" },
      "explanation": "행정규칙 검색공간의 약 85%를 탐색했지만 …"
    }]
  }`}</pre>
          </div>
          <div className="bz-chips">
            {["일괄 검증 20건", "긴 문서 /v1/documents", "웹훅 결과 받기", "멱등 키 — 이중 과금 방지", "기준 자료 대조(저장 안 함)", "엄격 모드", "원문 속 위치·고친 문장", "OpenAPI", "MCP(ChatGPT·Claude 도구)"].map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="bz-ctas" style={{ marginTop: 18 }}>
            <a className="bz-btn primary" href={`${YUME_URL}/docs/api`}>API 문서 보기</a>
            <a className="bz-btn ghost" href={`${YUME_URL}/?open=api`}>가입하고 키 발급받기</a>
            <a className="bz-btn ghost" href={`${YUME_URL}/?open=docs`}>문서 검사하기</a>
          </div>
        </Section>

        {/* ── 업종별 ── */}
        <Section id="sectors" eyebrow="업종별 쓰임" title="어떤 실패를 막는지" lede="분야마다 AI가 무너지는 지점이 다릅니다. 규제 산업이 아니어도 지어낸 수치 한 줄이 그대로 책임이 되는 자리가 있습니다.">
          <div className="bz-grid g3">
            {SECTOR.map((s) => (
              <div key={s.tag} className="bz-card">
                <span style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 750, letterSpacing: "0.06em", color: "var(--accent)", background: "var(--accent-soft)", borderRadius: 999, padding: "3px 11px" }}>{s.tag}</span>
                <div className="t">{s.title}</div>
                <div className="d">{s.body}</div>
                <div className="f">{s.who}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 요금 ── 값은 서버가 실제 한도에 쓰는 표(server/apiRates.js)에서 그대로 읽는다. */}
        <Section id="pricing" eyebrow="요금" title="쓴 만큼, 또는 약정한 만큼" lede="검증 1건이 호출 1회입니다. 체험은 가입만 하면 매달 무료로 쓸 수 있고, 그 위는 종량제나 월 약정으로 씁니다. 감사는 범위를 듣고 견적을 드립니다. 표시된 금액은 모두 부가세 별도입니다.">
          <div className="bz-grid g4">
            {PRICE_CARDS.map((c) => (
              <div key={c.key} className={`bz-card${c.key === "growth" ? " main" : ""}`}>
                <div className="k">{c.label}</div>
                <div className="bz-price">{c.price}<small>{c.period}</small></div>
                <div className="d" style={{ flex: 1 }}>{c.detail}</div>
                <div className="f">{c.unit}</div>
                {c.plan
                  ? <button type="button" className="bz-btn ghost sm" onClick={ask(c.plan)}>{c.cta}</button>
                  : <a className="bz-btn primary sm" href={c.href}>{c.cta}</a>}
              </div>
            ))}
          </div>
          <div className="bz-grid g2" style={{ marginTop: 12 }}>
            <div className="bz-card">
              <div className="k">AI 감사</div>
              <div className="t">견적 — 질문 수 · 업종 · 주기에 따라</div>
              <div className="d">무료 점검과 첫 비공개 감사는 비용이 없습니다. 정밀 감사와 정기 감사는 범위를 듣고 견적을 드립니다.</div>
              <div className="act"><button type="button" className="bz-btn ghost sm" onClick={ask("audit")}>감사 견적 요청</button></div>
            </div>
            <div className="bz-card">
              <div className="k">더 큰 물량 · 계약서</div>
              <div className="t">맞춤 견적</div>
              <div className="d">전용 한도, 계약서, 대량 처리가 필요하시면 알려 주세요. 처리하지 못하고 실패한 호출은 세지 않습니다.</div>
              <div className="act"><button type="button" className="bz-btn ghost sm" onClick={ask("custom")}>맞춤 견적 요청</button></div>
            </div>
          </div>
        </Section>

        {/* ── 도입 순서 ── */}
        <Section id="start" eyebrow="도입 순서" title="증거를 먼저 보시고, 그다음에 정하세요" lede="처음 두 단계는 비용이 들지 않고 결재도 필요 없습니다. 결과가 기대에 못 미치면 거기서 멈추시면 됩니다.">
          <ol className="bz-steps">
            {STEPS.map((st) => (
              <li key={st.n} className="bz-card">
                <div className="n">STEP {st.n}</div>
                <div className="t">{st.k}</div>
                <div className="d" style={{ flex: 1 }}>{st.v}</div>
                <div className="act">
                  {st.cta === "audit"
                    ? <button type="button" className="bz-btn ghost sm" onClick={() => setShowAudit(true)}>무료 점검 시작</button>
                    : <button type="button" className="bz-btn ghost sm" onClick={ask(st.cta)}>{st.cta === "trial10" ? "10건 무료 검사 신청" : st.cta === "poc" ? "PoC 문의" : "약정·감사 상담"}</button>}
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── 신뢰 ── */}
        <Section id="trust" eyebrow="신뢰와 데이터" title="할 수 있는 것과 할 수 없는 것을 먼저 말씀드립니다" lede="확인을 파는 곳이 스스로를 과장하면 그 자체로 신뢰를 잃습니다. 유메가 어떻게 판정하고 귀사 자료를 어떻게 다루는지 그대로 적었습니다.">
          <div className="bz-grid g3">
            {TRUST.map((x) => <div key={x.k} className="bz-card"><div className="t">{x.k}</div><div className="d">{x.v}</div></div>)}
          </div>
          <h3 className="bz-sub">“AI가 한 번 더 확인했습니다”와는 다릅니다</h3>
          <div className="bz-grid g2">
            {TECH.map((x) => <div key={x.k} className="bz-card"><div className="t">{x.k}</div><div className="d">{x.v}</div></div>)}
          </div>
          <p className="bz-note">
            업종별 문구는 규제 준수를 보장한다는 뜻이 아닙니다. 유메는 준수를 돕는 확인 도구이고, 판정은 법률·의료·금융 자문이 아닙니다.
            자세한 내용은 <a href={`${YUME_URL}/terms`} style={{ color: "var(--accent)" }}>이용약관</a>과 <a href={`${YUME_URL}/privacy`} style={{ color: "var(--accent)" }}>개인정보처리방침</a>에 있습니다.
          </p>
        </Section>

        {/* ── 자주 묻는 질문 ── */}
        <Section id="faq" eyebrow="자주 묻는 질문" title="도입 전에 많이 묻는 것">
          <div className="bz-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </Section>

        {/* ── 마무리 ── */}
        <section className="bz-final">
          <div>
            <h2>귀사 AI, 먼저 재 보세요</h2>
            <p>5분 무료 점검으로 시작하거나, 유메가 감사한 결과를 비공개로 받아 보세요. 실제 문서로 보고 싶으시면 10건을 무료로 검사해 드립니다.</p>
          </div>
          <div className="bz-ctas" style={{ marginTop: 0 }}>
            <button type="button" className="bz-btn primary" onClick={() => setShowAudit(true)}>무료로 점검받기</button>
            <button type="button" className="bz-btn light" onClick={ask("audit")}>AI 감사 문의</button>
            <button type="button" className="bz-btn light" onClick={ask("trial10")}>문서 10건 무료 검사</button>
          </div>
        </section>

        <footer className="bz-foot">
          <div className="links">
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <a href={YUME_URL}>개인용 유메</a>
            <a href={`${YUME_URL}/hallucination-index`}>할루시네이션 지수</a>
            <a href={`${YUME_URL}/hallucination`}>할루시네이션이란</a>
            <a href={`${YUME_URL}/docs/api`}>API 문서</a>
            <a href={`${YUME_URL}/terms`}>이용약관</a>
            <a href={`${YUME_URL}/privacy`}>개인정보처리방침</a>
            <a href={`${YUME_URL}/refund`}>환불정책</a>
            <a href={`${YUME_URL}/products`}>상품 안내</a>
          </div>
          {/* 기업용도 같은 사업자가 운영하므로 신원정보를 같이 싣는다. */}
          <address>
            <div>
              {businessLine([
                `상호 ${BUSINESS.name}(${BUSINESS.nameEn})`,
                `대표 ${BUSINESS.ceo}`,
                `사업자등록번호 ${BUSINESS.regNo}`,
                BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`,
              ])}
            </div>
            <div>주소 {BUSINESS.address}</div>
            {BUSINESS.tel && <div>대표전화 <a href={telHref}>{BUSINESS.tel}</a></div>}
            <div>이메일 {BUSINESS.email}</div>
            <div>{COMPLAINT_NOTICE} {COMPLAINT_OFFICER}</div>
            <div style={{ marginTop: 6 }}>유메는 검증 과정에 생성형 AI를 사용합니다. 판정은 공개 원문과 대조한 검증 정보이며 법률·의료·금융 자문이나 보증이 아닙니다.</div>
            <div style={{ marginTop: 6 }}>{COPYRIGHT}</div>
          </address>
        </footer>
      </div>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
      {inquiry && <InquiryModal plan={inquiry.plan} note={inquiry.note} onClose={() => setInquiry(null)} />}
    </main>
  );
}
