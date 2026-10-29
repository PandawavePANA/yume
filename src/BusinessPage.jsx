// 베리라인(VERILINE) 메인 홈 — veriline.kr/ 이 이 화면이고, 개인 검사 · 계정 · API 키는 veriline.kr/check다.
//
// 2026-10-29 재설계(대표: "스캠 코인 사이트 같지 않게, 가독성을 올리고 약한 숫자는 빼거나 뒤로, 강한 내용을 앞에").
// 예전 화면은 검은 바탕 · 네온 빛 · 격자 · 글리치 · 흐르는 띠 · 실시간 기록 · 남은 자리 숫자 · 반짝이는 가격 카드 — 코인 사이트의 문법이었고,
// 첫 제목이 애니메이션 때문에 몇 초 늦게 떴다. 이제는 감사 · 법률 문서처럼: 흰 면 · 먹색 글자 · 차분한 남색 하나 ·
// 틀림은 빨간 취소선, 바로잡음은 초록(문서 대조의 관례). 움직임은 스크롤할 때 살짝 나타나는 것 하나만 쓴다.
//
// 한 사람을 위한 페이지다: 노무 · 법률 · 세무 AI 상담 서비스의 대표 · PM. 순서는 결정에 필요한 순서 —
//   무엇을 하나(첫 화면, 실제 오류 한 장) → 실제 서비스도 틀렸나(A사 사례 셋) → 어디서 틀리나 → 어떻게 잡나 → 무엇을 받나
//   → 얼마인가 → 누가 만드나 · 기술과 측정(펼쳐 보기) → FAQ → 무료 진단.
// 금액은 서버 요율표(API_RATES · AUDIT_RATES)에서만 읽는다. 감사 사례의 회사 이름은 동의 없이 쓰지 않는다(A사).
import { useState } from "react";
import AuditModal from "./components/yume/AuditModal.jsx";
import InquiryModal from "./components/business/InquiryModal.jsx";
import QuoteModal, { QUOTE_PRODUCTS } from "./components/business/QuoteModal.jsx";
import BenchBoard from "./components/business/BenchBoard.jsx";
import PlanCalc from "./components/business/PlanCalc.jsx";
import Logo from "./components/business/Logo.jsx";
import DiagnosisForm from "./components/business/DiagnosisForm.jsx";
import { Reveal } from "./components/business/motion.jsx";
import { SITE_URL, CONSOLE_URL } from "./businessConfig.js";
import { BUSINESS, telHref, COPYRIGHT, businessLine, COMPLAINT_NOTICE, COMPLAINT_OFFICER, VERILINE_EMAIL } from "./businessInfo.js";
import BusinessAddress from "./BusinessAddress.jsx";
import { API_RATES, AUDIT_PILOT_SEATS, AUDIT_RATES } from "../server/apiRates.js";

const won = (n) => `${n.toLocaleString("ko-KR")}원`;

const CSS = `
.vl { --bg:#FFFFFF; --soft:#F6F7F9; --ink:#14171F; --g1:#4B5260; --g2:#6E7583; --line:#E3E6EB; --navy:#1B2B55; --key:#2547B8; --key-deep:#1B3794; --key-soft:#EEF2FB;
  --bad:#B42318; --bad-soft:#FDF1F0; --good:#0F7A55; --good-soft:#EDF7F2;
  --sans:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  font-family:var(--sans); color:var(--ink); background:var(--bg); font-size:17px; line-height:1.75; word-break:keep-all; -webkit-font-smoothing:antialiased; }
.vl *, .vl *::before, .vl *::after { box-sizing:border-box; }
.vl a { color:inherit; }
.vl :focus-visible { outline:2px solid var(--key); outline-offset:3px; border-radius:6px; }
.vl-wrap { width:min(1120px,100%); margin:0 auto; padding-left:max(20px, env(safe-area-inset-left, 0px)); padding-right:max(20px, env(safe-area-inset-right, 0px)); }
/* 상단 메뉴 — 처음부터 흰 면 */
.vl-nav { position:sticky; top:0; z-index:40; padding-top:var(--yume-safe-top, 0px); background:rgba(255,255,255,.94); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }
.vl-nav .row { display:flex; align-items:center; gap:28px; height:64px; }
.vl-nav .brand { display:flex; align-items:center; color:var(--navy); text-decoration:none; }
.vl-nav nav { display:flex; gap:2px; flex:1; }
.vl-nav nav a { text-decoration:none; font-size:15px; padding:6px 12px; border-radius:8px; color:var(--g1); }
.vl-nav nav a:hover { color:var(--ink); background:var(--soft); }
.vl-nav .right { display:flex; gap:12px; align-items:center; margin-left:auto; }
.vl-nav .personal { font-size:14px; text-decoration:none; color:var(--g2); }
@media (max-width: 900px) { .vl-nav nav { display:none; } }
@media (max-width: 520px) { .vl-nav .personal { display:none; } }
/* 버튼 */
.vl-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:50px; padding:0 22px; border-radius:10px; border:1px solid transparent; font:inherit; font-size:16px; font-weight:600; text-decoration:none; cursor:pointer; white-space:nowrap; transition:background .2s, border-color .2s; }
.vl-btn:disabled { opacity:.6; cursor:default; }
.vl-btn.key { background:var(--key); color:#fff; }
.vl-btn.key:hover { background:var(--key-deep); }
.vl-btn.line { border-color:#C9CED8; color:var(--ink); background:#fff; }
.vl-btn.line:hover { border-color:var(--ink); }
.vl-btn.sm { height:40px; padding:0 16px; font-size:14.5px; border-radius:9px; }
/* 섹션 */
.vl-sec { padding:clamp(72px,9vw,120px) 0; scroll-margin-top:64px; }
.vl-sec.soft { background:var(--soft); }
.vl-eyebrow { font-size:14px; font-weight:600; color:var(--key); letter-spacing:.01em; }
.vl-h2 { font-size:clamp(28px,3.4vw,42px); font-weight:700; letter-spacing:-.03em; line-height:1.3; margin:12px 0 0; max-width:24ch; text-wrap:balance; color:var(--ink); }
.vl-lede { font-size:clamp(16.5px,1.5vw,18.5px); color:var(--g1); margin:16px 0 0; max-width:60ch; }
/* 첫 화면 */
.vl-hero { padding:clamp(48px,7vw,96px) 0 clamp(56px,7vw,88px); background:linear-gradient(180deg, #F3F5FA 0%, #FFFFFF 100%); border-bottom:1px solid var(--line); }
.vl-hero-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,.95fr); gap:clamp(32px,5vw,64px); align-items:center; }
@media (max-width: 960px) { .vl-hero-grid { grid-template-columns:1fr; } }
.vl-hero .who { font-size:15px; font-weight:600; color:var(--navy); }
.vl-hero h1 { font-size:clamp(34px,4.6vw,56px); font-weight:700; letter-spacing:-.035em; line-height:1.22; margin:14px 0 0; text-wrap:balance; color:var(--ink); }
.vl-hero h1 em { font-style:normal; color:var(--key); }
.vl-hero .lead { font-size:clamp(17px,1.6vw,19.5px); color:var(--g1); margin:20px 0 0; max-width:44ch; }
.vl-hero .ctas { display:flex; gap:12px; flex-wrap:wrap; margin-top:30px; }
.vl-checks { list-style:none; padding:0; margin:28px 0 0; display:grid; gap:8px; font-size:15.5px; color:var(--g1); }
.vl-checks li { display:flex; gap:10px; align-items:flex-start; }
.vl-checks li::before { content:"✓"; color:var(--good); font-weight:700; flex:none; }
@media (max-width: 420px) { .vl-hero .ctas .vl-btn { width:100%; } }
/* 대조 카드(첫 화면 · 사례) */
.vl-case { background:#fff; border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 50px rgba(20,32,70,.08), 0 1px 3px rgba(20,32,70,.06); overflow:hidden; }
.vl-case .hd { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:14px 20px; border-bottom:1px solid var(--line); background:#FBFBFC; font-size:13.5px; color:var(--g2); }
.vl-case .hd b { color:var(--ink); font-weight:600; }
.vl-case .tag { font-size:12.5px; font-weight:600; color:var(--bad); background:var(--bad-soft); border-radius:999px; padding:3px 10px; white-space:nowrap; }
.vl-case .body { padding:18px 20px 20px; display:grid; gap:12px; }
.vl-case .q { font-size:15px; color:var(--g1); }
.vl-case .q span { font-weight:600; color:var(--ink); margin-right:6px; }
.vl-case .ans { border-radius:10px; padding:12px 14px; font-size:15.5px; line-height:1.65; }
.vl-case .ans small { display:block; font-size:12.5px; font-weight:600; margin-bottom:4px; }
.vl-case .ans.bad { background:var(--bad-soft); }
.vl-case .ans.bad small { color:var(--bad); }
.vl-case .ans.bad s { text-decoration-color:var(--bad); text-decoration-thickness:1.5px; color:#5B2621; }
.vl-case .ans.good { background:var(--good-soft); }
.vl-case .ans.good small { color:var(--good); }
.vl-case .ans.good b { color:#0B4A35; }
.vl-case .law { font-size:13px; color:var(--g2); padding-top:10px; border-top:1px dashed var(--line); }
/* 사례 셋 */
.vl-cases { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:40px; }
@media (max-width: 960px) { .vl-cases { grid-template-columns:1fr; } }
.vl-cases .vl-case { box-shadow:0 1px 3px rgba(20,32,70,.06); }
.vl-fact { margin-top:28px; display:flex; flex-wrap:wrap; gap:8px 28px; font-size:15px; color:var(--g1); padding:16px 20px; border:1px solid var(--line); border-radius:12px; background:#fff; }
.vl-fact b { color:var(--ink); }
/* 틀리는 자리 */
.vl-traps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-top:40px; }
@media (max-width: 1000px) { .vl-traps { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .vl-traps { grid-template-columns:1fr; } }
.vl-trap { border:1px solid var(--line); border-radius:14px; padding:22px; background:#fff; display:flex; flex-direction:column; gap:10px; }
.vl-trap .type { font-size:13px; font-weight:700; color:var(--key); }
.vl-trap h3 { margin:0; font-size:18px; letter-spacing:-.02em; line-height:1.4; }
.vl-trap p { margin:0; font-size:14.5px; color:var(--g1); line-height:1.6; }
.vl-trap .ex { margin-top:auto; padding-top:12px; border-top:1px solid var(--line); font-size:13.5px; line-height:1.6; }
.vl-trap .ex s { color:var(--bad); text-decoration-thickness:1.5px; }
.vl-trap .ex b { color:var(--good); }
/* 작동 방식 */
.vl-steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-top:40px; counter-reset:s; }
@media (max-width: 960px) { .vl-steps { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .vl-steps { grid-template-columns:1fr; } }
.vl-steps li { list-style:none; counter-increment:s; background:#fff; border:1px solid var(--line); border-radius:14px; padding:22px; }
.vl-steps li::before { content:counter(s); display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:var(--key-soft); color:var(--key); font-weight:700; font-size:14px; }
.vl-steps b { display:block; margin-top:14px; font-size:17.5px; letter-spacing:-.02em; }
.vl-steps p { margin:6px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
.vl-steps-list { padding:0; margin:0; }
/* 받는 것 */
.vl-deliver { display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr); gap:clamp(32px,5vw,64px); align-items:start; margin-top:8px; }
@media (max-width: 960px) { .vl-deliver { grid-template-columns:1fr; } }
.vl-list { list-style:none; padding:0; margin:28px 0 0; display:grid; }
.vl-list li { padding:14px 0; border-top:1px solid var(--line); font-size:16.5px; font-weight:600; }
.vl-list li span { display:block; color:var(--g1); font-size:15px; font-weight:400; margin-top:2px; }
.vl-reportwrap { overflow-x:auto; }
.vl-report { background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:0 20px 50px rgba(20,32,70,.08); padding:clamp(20px,3vw,30px); font-size:14px; min-width:520px; }
.vl-report .top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding-bottom:14px; border-bottom:2px solid var(--navy); }
.vl-report .top b { font-size:18px; letter-spacing:-.02em; display:block; color:var(--navy); }
.vl-report .top small { font-size:12px; color:var(--g2); }
.vl-report table { width:100%; border-collapse:collapse; margin-top:6px; font-size:13.5px; }
.vl-report th { text-align:left; font-weight:600; color:var(--g2); font-size:12px; padding:10px 6px; border-bottom:1px solid var(--line); }
.vl-report td { padding:11px 6px; border-bottom:1px solid var(--line); vertical-align:top; line-height:1.55; }
.vl-report td s { color:var(--bad); }
.vl-report td b { color:var(--good); }
.vl-report td.law { font-size:12.5px; color:var(--g1); white-space:nowrap; }
.vl-report .foot { margin-top:12px; font-size:12px; color:var(--g2); }
/* 가격 */
.vl-safe { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:32px; }
.vl-safe > div { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
.vl-safe b { font-size:16px; }
.vl-safe p { margin:4px 0 0; font-size:14.5px; color:var(--g1); line-height:1.55; }
@media (max-width: 760px) { .vl-safe { grid-template-columns:1fr; } }
.vl-price-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:24px; }
.vl-price-grid.api { grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:16px; }
@media (max-width: 980px) { .vl-price-grid, .vl-price-grid.api { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .vl-price-grid { grid-template-columns:1fr; } .vl-price-grid.api { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .vl-price-grid.api .vl-pcard { padding:16px; } .vl-price-grid.api .price { font-size:20px; } }
.vl-pcard { border:1px solid var(--line); border-radius:14px; padding:24px; display:flex; flex-direction:column; gap:10px; background:#fff; }
.vl-pcard.main { border:2px solid var(--key); padding:23px; }
.vl-pcard .badge { align-self:flex-start; font-size:12px; font-weight:700; color:var(--key); background:var(--key-soft); border-radius:999px; padding:3px 10px; }
.vl-pcard .k { font-size:16px; font-weight:700; }
.vl-pcard .price { font-size:30px; font-weight:700; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.vl-pcard .price small { font-size:14px; font-weight:400; color:var(--g2); letter-spacing:0; }
.vl-pcard .d { color:var(--g1); font-size:15px; line-height:1.65; flex:1; }
.vl-pilot { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; margin-top:16px; padding:18px 22px; border-radius:12px; background:var(--key-soft); }
.vl-pilot b { font-size:16.5px; }
.vl-pilot p { margin:2px 0 0; color:var(--g1); font-size:14.5px; }
.vl-subh { font-size:20px; font-weight:700; letter-spacing:-.02em; margin:56px 0 0; }
.vl-more { margin-top:12px; }
.vl-more > summary { cursor:pointer; font-size:15px; font-weight:600; color:var(--key); padding:8px 0; }
.vl-docs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:16px; }
.vl-docs a, .vl-docs button { display:flex; flex-direction:column; gap:4px; text-align:left; padding:16px 18px; border:1px solid var(--line); border-radius:12px; background:#fff; font:inherit; color:inherit; text-decoration:none; cursor:pointer; }
.vl-docs b { font-size:15.5px; }
.vl-docs span { color:var(--g1); font-size:14px; }
.vl-docs a:hover, .vl-docs button:hover { border-color:var(--key); }
@media (max-width: 860px) { .vl-docs { grid-template-columns:1fr 1fr; } }
@media (max-width: 460px) { .vl-docs { grid-template-columns:1fr; } }
.vl-note { font-size:14.5px; color:var(--g2); margin-top:16px; line-height:1.7; }
.vl-note a { color:var(--key); }
/* 만든 곳 · 기술 */
.vl-team { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-top:32px; }
.vl-team > div { border-top:2px solid var(--navy); padding-top:12px; }
.vl-team b { font-size:15.5px; }
.vl-team p { margin:6px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
@media (max-width: 900px) { .vl-team { grid-template-columns:1fr 1fr; } }
@media (max-width: 560px) { .vl-team { grid-template-columns:1fr; } }
.vl-tech { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:32px; }
.vl-tech > div { background:#fff; border:1px solid var(--line); border-radius:14px; padding:22px; }
.vl-tech b { font-size:17px; }
.vl-tech p { margin:6px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
@media (max-width: 900px) { .vl-tech { grid-template-columns:1fr; } }
.vl-bench { margin-top:24px; border:1px solid var(--line); border-radius:14px; background:#fff; padding:6px 20px; }
.vl-bench > summary { cursor:pointer; font-weight:600; padding:12px 0; color:var(--key); }
/* FAQ */
.vl-faq { margin-top:36px; border-top:1px solid var(--line); max-width:860px; }
.vl-faq details { border-bottom:1px solid var(--line); }
.vl-faq summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; gap:20px; padding:20px 0; font-size:17.5px; font-weight:600; letter-spacing:-.015em; }
.vl-faq summary::-webkit-details-marker { display:none; }
.vl-faq summary::after { content:"+"; font-weight:400; color:var(--key); font-size:22px; line-height:1; transition:transform .2s; }
.vl-faq details[open] summary::after { transform:rotate(45deg); }
.vl-faq p { margin:0 0 20px; color:var(--g1); font-size:16px; max-width:66ch; }
/* 무료 진단 */
.vl-diag { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:clamp(32px,5vw,64px); align-items:start; }
@media (max-width: 920px) { .vl-diag { grid-template-columns:1fr; } }
.vl-diag-steps { list-style:none; padding:0; margin:28px 0 0; display:grid; gap:0; counter-reset:d; }
.vl-diag-steps li { counter-increment:d; display:grid; grid-template-columns:36px 1fr; gap:10px; padding:14px 0; border-top:1px solid var(--line); }
.vl-diag-steps li::before { content:counter(d); display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--key-soft); color:var(--key); font-weight:700; font-size:13px; }
.vl-diag-steps b { font-size:16.5px; }
.vl-diag-steps p { margin:2px 0 0; color:var(--g1); font-size:15px; }
.vl-form { position:relative; background:#fff; border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 50px rgba(20,32,70,.08); padding:clamp(22px,3vw,32px); display:grid; gap:16px; }
.vl-form label { display:grid; gap:6px; font-size:14.5px; font-weight:600; color:var(--ink); }
.vl-form input, .vl-form textarea, .vl-form select { width:100%; background:#fff; border:1px solid #C9CED8; color:var(--ink); border-radius:10px; padding:12px 14px; font:inherit; font-size:16px; font-weight:400; }
.vl-form input:focus, .vl-form textarea:focus, .vl-form select:focus { border-color:var(--key); outline:none; box-shadow:0 0 0 3px rgba(37,71,184,.15); }
.vl-form .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width: 560px) { .vl-form .two { grid-template-columns:1fr; } }
.vl-form .fine { font-size:13px; color:var(--g2); margin:0; font-weight:400; }
.vl-form .fine a { color:var(--key); }
.vl-form .err { font-size:14.5px; color:var(--bad); background:var(--bad-soft); border-radius:10px; padding:10px 12px; }
.vl-form .done { display:grid; gap:10px; }
.vl-form .done b { font-size:21px; }
.vl-form .done p { margin:0; color:var(--g1); }
.vl-linkbtn { background:none; border:0; padding:0; font:inherit; color:var(--key); cursor:pointer; text-decoration:underline; }
/* 푸터 */
.vl-foot { background:var(--navy); color:#C5CCDC; padding:48px 0 calc(40px + var(--yume-safe-bottom, 0px)); font-size:14px; }
.vl-foot .top { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap; align-items:center; }
.vl-foot .links { display:flex; gap:16px; flex-wrap:wrap; }
.vl-foot a { color:#DDE3F0; text-decoration:none; } .vl-foot a:hover { color:#fff; text-decoration:underline; }
.vl-foot address { font-style:normal; font-size:13px; line-height:1.9; margin-top:28px; color:#A9B3C9; }
`;

const NAV = [
  ["#cases", "실제 사례"],
  ["#how", "작동 방식"],
  ["#report", "받는 것"],
  ["#pricing", "가격"],
  ["#faq", "자주 묻는 질문"],
];

// 실제 무료 진단(노무 상담 AI A사, 2026-10-27)에서 원문으로 확정한 오류 — 회사 이름은 동의 없이 쓰지 않는다.
// 근거: veriline/영업/로무앤톡/01_2026-10-27_밤_재감사_결과.md · 법제처 현행 조문(2026-10-29 재확인).
const CASES = [
  {
    topic: "임금체불 처벌",
    tag: "바뀐 법 미반영",
    q: "임금을 안 주면 사업주는 어떤 처벌을 받나요?",
    bad: "3년 이하의 징역 또는 3천만 원 이하의 벌금(근로기준법 제109조 제1항)",
    good: "5년 이하의 징역 또는 5천만 원 이하의 벌금",
    law: "근로기준법 제107조 제1항 · 2026.10.8 시행(그 전에 생긴 체불은 옛 기준)",
  },
  {
    topic: "체불사업주 신용제재",
    tag: "비슷한 조문 혼동",
    q: "신용제재 기준이 최근 1년 체불총액 3천만 원 이상 맞죠?",
    bad: "네, 1년 이내 체불총액 3천만 원 이상인 사업주가 대상입니다",
    good: "2천만 원 이상 — 3천만 원은 명단 공개 기준",
    law: "근로기준법 제43조의3 제1항 제1호 · 제43조의2",
  },
  {
    topic: "체불 임금 3배 청구",
    tag: "새 조문 누락",
    q: "몇 달째 월급을 못 받았는데 더 받을 방법이 있나요?",
    bad: "지연이자와 소멸시효만 안내(3배 청구 제도를 찾지 못함)",
    good: "1년 중 3개월 이상 미지급 등이면 체불액의 3배 이내 청구 가능",
    law: "근로기준법 제43조의8",
  },
];

const TRAPS = [
  { type: "바뀐 법", title: "개정 · 시행일 직후", p: "새 조문이 생기거나 조항이 옮겨진 직후, 옛 내용이나 삭제된 조문을 그대로 안내합니다.", bad: "단기 육아휴직 연 2회 · 4주", good: "연 1회 · 1주 또는 2주", law: "남녀고용평등법 제19조" },
  { type: "비슷한 조문", title: "숫자만 다른 형제 조문", p: "문장이 거의 같은 두 조문 중 질문하지 않은 쪽의 숫자를 가져옵니다.", bad: "신용제재 3천만 원", good: "2천만 원", law: "근로기준법 제43조의3" },
  { type: "틀린 전제", title: "질문 속 틀린 숫자", p: "\"~맞죠?\"라는 질문의 틀린 값을 그대로 받아들이거나 일부만 고칩니다.", bad: "근로감독관 검사 거부 벌금 500만 원", good: "과태료 100만 원 이하", law: "최저임금법 제31조" },
  { type: "없는 출처", title: "그럴듯한 가짜 근거", p: "없는 판례 번호 · 고시 · 인용문을 실제처럼 만들어 냅니다.", bad: "공정위 고시 제2019-77호가 상한을 정한다", good: "그런 고시는 없음", law: "원문 검색으로 '확인 안 됨' 판정" },
];

const STEPS = [
  ["문장을 주장으로 나눕니다", "답변에서 숫자 · 기간 · 요건 · 벌칙을 하나씩 떼어 냅니다."],
  ["오늘의 원문을 가져옵니다", "법제처에서 지금 시행 중인 조문과 부칙(시행일 · 경과규정)을 직접 받습니다."],
  ["원문과 한 줄씩 대조합니다", "판정은 원문과 코드가 합니다. 근거를 대지 못하는 판정은 내보내지 않습니다."],
  ["고친 문장과 근거를 드립니다", "틀린 값은 원문 값으로, 근거는 몇 조 몇 항까지. 감사에서는 사람이 원문을 다시 확인합니다."],
];

const FAQ = [
  ["API 키나 내부 권한이 필요한가요?", "아니요. 일반 사용자처럼 서비스를 직접 써 보며 확인합니다. 출시 전이면 시험 계정만 주세요."],
  ["결과가 밖으로 새지 않나요?", "보고서는 비공개 링크로 귀사에만 드리고, 원하시면 언제든 회수합니다. 회사 이름은 서면 동의 없이 공개하지 않습니다."],
  ["자체 테스트가 있는데도 필요할까요?", "자체 시험은 회사가 이미 아는 질문을 묻습니다. 베리라인은 시행일 직후 조문, 비슷한 조문, 질문 속 틀린 전제처럼 AI가 실제로 무너지는 자리를 묻습니다. 실제로 서비스 중인 노무 AI도 이 자리에서 틀렸습니다."],
  ["어느 분야를 하나요?", "노무는 정식 서비스입니다. 법률(임대차 · 민사)과 세무는 베타로, 같은 방식으로 원문을 대조하되 결과에 베타임을 표시합니다. 의료는 준비 중입니다."],
  ["기간과 비용은요?", `무료 진단은 보통 영업일 3일입니다. 정밀 감사는 ${won(AUDIT_RATES.audit.krw)}(부가세 별도)이고, 첫 ${AUDIT_PILOT_SEATS}곳은 ${won(AUDIT_RATES.audit_pilot.krw)}입니다.`],
  ["베리라인이 틀리면요?", "베리라인이 원문으로 고친 부분(판정 영수증이 있는 부분)이 원문과 다르면 이용료를 환불하고 정정 보고서를 드립니다. 확인하지 못한 부분은 결과에 '확인하지 못함'으로 적습니다."],
];

const DIAG_STEPS = [
  ["주소를 남겨 주세요", "서비스 주소와 연락처면 충분합니다."],
  ["직접 써 봅니다", "AI가 틀리기 쉬운 질문을 넣고, 답을 원문과 맞춰 봅니다."],
  ["요약을 받으세요", "다르게 안내한 곳과 근거 조문을 영업일 3일 안에 드립니다. 이상이 없으면 도입을 권하지 않습니다."],
];

function initialQuote() {
  try {
    const p = new URLSearchParams(window.location.search).get("quote");
    return p && QUOTE_PRODUCTS[p] ? p : null;
  } catch {
    return null;
  }
}
function initialInquiry() {
  try {
    const p = new URLSearchParams(window.location.search).get("inquiry");
    return p ? { plan: p, note: "" } : null;
  } catch {
    return null;
  }
}

function Head({ eyebrow, title, lede }) {
  return (
    <Reveal y={12}>
      <div className="vl-eyebrow">{eyebrow}</div>
      <h2 className="vl-h2">{title}</h2>
      {lede && <p className="vl-lede">{lede}</p>}
    </Reveal>
  );
}

function CaseCard({ c }) {
  return (
    <article className="vl-case">
      <div className="hd"><b>{c.topic}</b><span className="tag">{c.tag}</span></div>
      <div className="body">
        <div className="q"><span>질문</span>{c.q}</div>
        <div className="ans bad"><small>AI 상담 답변</small><s>{c.bad}</s></div>
        <div className="ans good"><small>현행 원문</small><b>{c.good}</b></div>
        <div className="law">§ {c.law}</div>
      </div>
    </article>
  );
}

export default function BusinessPage() {
  const [quote, setQuote] = useState(initialQuote);
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [showAudit, setShowAudit] = useState(false);

  const toDiag = (e) => {
    e?.preventDefault();
    document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="vl">
      <style>{CSS}</style>

      <header className="vl-nav">
        <div className="vl-wrap row">
          <a className="brand" href="#top" aria-label="베리라인 홈 맨 위로"><Logo height={22} /></a>
          <nav aria-label="메뉴">{NAV.map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
          <div className="right">
            <a className="personal" href={CONSOLE_URL}>개인용 검사</a>
            <a className="vl-btn key sm" href="#diagnosis" onClick={toDiag}>무료 진단 받기</a>
          </div>
        </div>
      </header>

      {/* 1. 첫 화면 — 무엇을 하는가 + 실제 오류 한 장 */}
      <section className="vl-hero" id="top">
        <div className="vl-wrap vl-hero-grid">
          <div>
            <div className="who">노무 · 법률 · 세무 AI 상담 서비스를 위한 답변 검증</div>
            <h1>AI가 틀린 법을 안내하기 전에, <em>법령 원문으로 바로잡습니다.</em></h1>
            <p className="lead">베리라인은 AI 상담 답변을 법제처 현행 조문과 한 문장씩 대조해, 다르게 안내한 곳을 근거 조문과 함께 고쳐 드립니다.</p>
            <div className="ctas">
              <a className="vl-btn key" href="#diagnosis" onClick={toDiag}>우리 AI 무료 진단 받기</a>
              <a className="vl-btn line" href="#cases">실제 사례 보기</a>
            </div>
            <ul className="vl-checks">
              <li>API 키 · 내부 권한 없이, 일반 사용자 화면에서 확인합니다</li>
              <li>결과는 귀사에만 비공개로 드립니다</li>
              <li>베리라인이 고친 부분이 원문과 다르면 이용료 환불 + 정정 보고서</li>
            </ul>
          </div>
          <Reveal y={12} delay={0.05}>
            <CaseCard c={{ ...CASES[0], topic: "실제 진단 · 노무 상담 AI A사" }} />
          </Reveal>
        </div>
      </section>

      {/* 2. 실제 사례 */}
      <section className="vl-sec" id="cases">
        <div className="vl-wrap">
          <Head eyebrow="실제 사례" title="서비스 중인 노무 AI도, 바뀐 법 앞에서 틀렸습니다" lede="2026년 10월, 실제로 서비스 중인 노무 상담 AI를 일반 사용자로 써 보며 무료 진단했습니다. 아래는 법제처 원문으로 확정한 오류입니다." />
          <div className="vl-cases">
            {CASES.map((c, i) => <Reveal key={c.topic} y={12} delay={i * 0.05}><CaseCard c={c} /></Reveal>)}
          </div>
          <Reveal y={8} className="vl-fact">
            <span>점검 질문 <b>26개</b> 중 <b>8개</b>가 현행 법과 다르게 안내됐습니다</span>
            <span>큰 개정(육아휴직 · 배우자 출산휴가)과 압박성 반박에는 정확했습니다</span>
            <span>회사 이름은 동의 없이 밝히지 않습니다</span>
          </Reveal>
        </div>
      </section>

      {/* 3. 어디서 틀리나 */}
      <section className="vl-sec soft" id="traps">
        <div className="vl-wrap">
          <Head eyebrow="AI가 틀리는 자리" title="검색하는 AI도 틀리는 자리는 정해져 있습니다" lede="최신 AI는 잘 알려진 조문에는 강합니다. 오류는 시행일 직후, 비슷한 조문, 질문 속 틀린 전제, 없는 출처에 몰립니다. 베리라인은 그 자리를 집중해서 묻습니다." />
          <div className="vl-traps">
            {TRAPS.map((t, i) => (
              <Reveal key={t.title} y={12} delay={i * 0.04} className="vl-trap">
                <div className="type">{t.type}</div>
                <h3>{t.title}</h3>
                <p>{t.p}</p>
                <div className="ex"><s>{t.bad}</s> → <b>{t.good}</b><br /><span style={{ color: "var(--g2)" }}>§ {t.law}</span></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. 작동 방식 */}
      <section className="vl-sec" id="how">
        <div className="vl-wrap">
          <Head eyebrow="작동 방식" title="판정은 AI의 추측이 아니라, 원문과 코드가 합니다" lede="모든 판정에는 근거 조문 · 시행일 · 원문 지문이 남는 판정 영수증이 붙어, 누구나 같은 결과를 다시 계산해 볼 수 있습니다." />
          <ol className="vl-steps vl-steps-list">
            {STEPS.map(([b, p]) => <li key={b}><b>{b}</b><p>{p}</p></li>)}
          </ol>
        </div>
      </section>

      {/* 5. 받는 것 */}
      <section className="vl-sec soft" id="report">
        <div className="vl-wrap vl-deliver">
          <div>
            <Head eyebrow="받는 것" title="어디를 고칠지 바로 알 수 있는 보고서" />
            <ul className="vl-list">
              <li>질문 · 실제 답변 · 화면 기록<span>언제 무엇을 물었고 어떻게 답했는지 그대로</span></li>
              <li>현행 원문과 근거 조문<span>법제처 링크 · 시행일 · 몇 조 몇 항까지</span></li>
              <li>오류가 몰린 자리와 고칠 방향<span>색인 갱신 · 형제 조문 구별 · 단서 함께 읽기</span></li>
              <li>설명 통화와 재검사 1회<span>고치신 뒤 같은 질문으로 다시 확인</span></li>
            </ul>
          </div>
          <Reveal y={12} className="vl-reportwrap">
            <div className="vl-report" aria-label="보고서 미리보기">
              <div className="top"><div><b>AI 답변 점검 보고서</b><small>노무 상담 AI A사 · 비공개 · 예시</small></div><small>2026.10.27</small></div>
              <table>
                <thead><tr><th>질문</th><th>AI 답변 → 현행 원문</th><th>근거</th></tr></thead>
                <tbody>
                  <tr><td>임금체불 처벌</td><td><s>3년 · 3천만 원</s> → <b>5년 · 5천만 원</b></td><td className="law">근로기준법 §107①</td></tr>
                  <tr><td>처벌불원 근거</td><td><s>제109조 제2항(삭제됨)</s> → <b>제107조 제2항</b></td><td className="law">근로기준법 §107②</td></tr>
                  <tr><td>신용제재 기준</td><td><s>3천만 원 이상</s> → <b>2천만 원 이상</b></td><td className="law">근로기준법 §43의3</td></tr>
                  <tr><td>대지급금 거짓 서류</td><td><s>3년 · 3천만 원</s> → <b>2년 · 2천만 원</b></td><td className="law">임금채권보장법 §28②</td></tr>
                </tbody>
              </table>
              <div className="foot">판정은 공개 원문과 대조한 검증 정보이며 법률 자문이 아닙니다.</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6. 가격 */}
      <section className="vl-sec" id="pricing">
        <div className="vl-wrap">
          <Head eyebrow="가격" title="무료 진단으로 시작하세요" lede="결과를 먼저 보고 결정하시면 됩니다. 가격은 부가세 별도입니다." />
          <Reveal y={8} className="vl-safe">
            <div><b>무료 진단부터</b><p>이상이 없으면 도입을 권하지 않습니다.</p></div>
            <div><b>고친 부분은 책임집니다</b><p>원문과 다르면 그 건 이용료 환불 + 정정 보고서.</p></div>
            <div><b>API 매달 {API_RATES.trial.calls}건 무료</b><p>개발팀이 가입만 하면 먼저 붙여 봅니다.</p></div>
          </Reveal>
          <div className="vl-price-grid">
            {[
              { key: "audit", k: "정밀 감사", price: won(AUDIT_RATES.audit.krw), per: " / 1회", d: "AI가 틀리기 쉬운 질문 50개 · 사람이 원문 재확인 · 비공개 보고서 · 30분 설명 · 고친 뒤 재검사 1회", main: true },
              { key: "audit_regular", k: "정기 감사", price: won(AUDIT_RATES.audit_regular.krw), per: " / 분기", d: `분기마다 30문항 · 법 개정 뒤 다시 확인 · 1년 선납 ${won(AUDIT_RATES.audit_regular_year.krw)}` },
              { key: "audit_package", k: "출시 전 패키지", price: won(AUDIT_RATES.audit_package.krw), per: " / 1식", d: "정밀 감사 + 검증 API 스타터 3개월(월 400건)" },
            ].map((c) => (
              <div key={c.key} className={`vl-pcard${c.main ? " main" : ""}`}>
                {c.main && <span className="badge">처음이라면 추천</span>}
                <div className="k">{c.k}</div>
                <div className="price">{c.price}<small>{c.per}</small></div>
                <div className="d">{c.d}</div>
                <button type="button" className={`vl-btn ${c.main ? "key" : "line"} sm`} onClick={() => setQuote(c.key)}>견적서 받기</button>
              </div>
            ))}
          </div>
          <div className="vl-pilot">
            <div><b>첫 {AUDIT_PILOT_SEATS}곳 파일럿 — 정밀 감사 {won(AUDIT_RATES.audit_pilot.krw)}</b><p>범위는 정밀 감사와 같고, 결과 피드백 통화 30분을 함께 해 주시는 조건입니다.</p></div>
            <button type="button" className="vl-btn line sm" onClick={() => setQuote("audit_pilot")}>파일럿 견적서 받기</button>
          </div>

          <h3 className="vl-subh">검증 API — 답변이 나갈 때마다</h3>
          <PlanCalc onQuote={(k) => setQuote(k)} onConsult={() => setInquiry({ plan: "custom", note: "" })} />
          <details className="vl-more"><summary>요금제별 가격 전부 보기</summary>
            <div className="vl-price-grid api">
              <div className="vl-pcard"><div className="k">{API_RATES.metered.label}</div><div className="price">{won(API_RATES.metered.unitKrw)}<small> / 건</small></div><div className="d">약정 없이 쓴 만큼 · 후불 월 정산</div><button type="button" className="vl-btn line sm" onClick={() => setQuote("metered")}>견적서 받기</button></div>
              {API_RATES.tiers.map((t) => (
                <div key={t.key} className="vl-pcard"><div className="k">{t.label}</div><div className="price">{won(t.monthlyKrw)}<small> / 월</small></div><div className="d">매달 {t.calls.toLocaleString("ko-KR")}건 · 건당 {won(Math.round(t.monthlyKrw / t.calls))}</div><button type="button" className="vl-btn line sm" onClick={() => setQuote(t.key)}>견적서 받기</button></div>
              ))}
              <div className="vl-pcard"><div className="k">{API_RATES.enterprise.label}</div><div className="price">월 {won(API_RATES.enterprise.fromKrw)}<small>~</small></div><div className="d">전용 한도 · 계약서 · 대량 처리</div><button type="button" className="vl-btn line sm" onClick={() => setInquiry({ plan: "custom", note: "" })}>상담 요청</button></div>
            </div>
          </details>
          <p className="vl-note">개발팀이 먼저 붙여 보려면 <a href={`${CONSOLE_URL}?open=api`}>가입하고 체험 키 받기</a>(매달 {API_RATES.trial.calls}건 무료) · <a href={`${SITE_URL}/docs/api`}>API 문서</a></p>

          <h3 className="vl-subh">구매 · 계약 서류</h3>
          <div className="vl-docs">
            <button type="button" onClick={() => setQuote("audit")}><b>견적서 바로 받기</b><span>결재에 붙일 A4 견적서</span></button>
            <a href={`${SITE_URL}/b2b/terms`} target="_blank" rel="noreferrer"><b>기업 서비스 이용 조건</b><span>책임 범위 · 해지 · 비밀 유지</span></a>
            <a href={`${SITE_URL}/b2b/dpa`} target="_blank" rel="noreferrer"><b>데이터 처리 부속서</b><span>개인정보 처리 위탁 표준본</span></a>
            <a href={`${SITE_URL}/b2b/security`} target="_blank" rel="noreferrer"><b>보안 설명서</b><span>데이터를 어떻게 다루는지</span></a>
          </div>
        </div>
      </section>

      {/* 7. 만든 곳 · 기술과 측정(숫자는 펼쳐 보기 안에) */}
      <section className="vl-sec soft" id="team">
        <div className="vl-wrap">
          <Head eyebrow="만든 곳과 기술" title="누가, 어떻게 만드는지" />
          <Reveal y={8} className="vl-team">
            <div><b>운영</b><p>{BUSINESS.name}({BUSINESS.nameEn}) · 대표 {BUSINESS.ceo}<br />사업자등록번호 {BUSINESS.regNo}</p></div>
            <div><b>대표</b><p>한국디지털미디어고 해킹방어과 · 중앙대 전자전기공학부 · 한국정보올림피아드 전국 2위</p></div>
            <div><b>시작한 이유</b><p>AI가 알려 준 잘못된 법 정보를 믿었다가 실제로 손해를 본 뒤 만들기 시작했습니다.</p></div>
            <div><b>만드는 방식</b><p>AI로 빠르게 만들고, 판정은 법령 원문과 코드가 하고, 찾은 오류는 사람이 원문으로 다시 확인합니다.</p></div>
          </Reveal>
          <div className="vl-tech">
            <div><b>법제처 현행 원문</b><p>그날 시행 중인 조문 · 시행령 · 부칙을 직접 받습니다. 공포됐지만 아직 시행 전인 조항과 경과규정도 따로 봅니다.</p></div>
            <div><b>벌칙 · 위임 지도</b><p>의무 조문과 다른 조문에 있는 벌칙, 법이 시행령에 넘긴 금액 · 기간을 코드로 이어 둡니다.</p></div>
            <div><b>판정 영수증</b><p>판정마다 근거 조문 · 시행일 · 원문 지문(SHA-256)을 남겨, 모델 없이도 같은 판정을 다시 계산할 수 있습니다.</p></div>
          </div>
          <details className="vl-bench">
            <summary>측정 기록 자세히 보기(자체 함정 문항 데이터셋)</summary>
            <BenchBoard onTry={toDiag} />
          </details>
          <p className="vl-note">고객사 실명 사례는 서면 동의를 받는 대로 공개합니다.</p>
        </div>
      </section>

      {/* 8. 자주 묻는 질문 */}
      <section className="vl-sec" id="faq">
        <div className="vl-wrap">
          <Head eyebrow="자주 묻는 질문" title="도입 전에 많이 묻는 것들" />
          <div className="vl-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      {/* 9. 무료 진단 */}
      <section className="vl-sec soft" id="diagnosis">
        <div className="vl-wrap vl-diag">
          <div>
            <Head eyebrow="무료 진단" title="귀사 AI가 어디서 다르게 답하는지, 먼저 보세요" lede="무료입니다. API 키도, 결재도 필요 없습니다." />
            <ol className="vl-diag-steps">
              {DIAG_STEPS.map(([k, v]) => <li key={k}><div><b>{k}</b><p>{v}</p></div></li>)}
            </ol>
            <p className="vl-note">투자 · 제휴 문의는 {VERILINE_EMAIL}로 보내 주세요. 바로 맞춰 보고 싶으시면 <button type="button" className="vl-linkbtn" onClick={() => setShowAudit(true)}>5분 셀프 점검</button>도 있습니다.</p>
          </div>
          <Reveal y={12}><DiagnosisForm /></Reveal>
        </div>
      </section>

      <footer className="vl-foot">
        <div className="vl-wrap">
          <div className="top">
            <Logo height={20} style={{ color: "#fff" }} />
            <div className="links">
              <a href={`mailto:${VERILINE_EMAIL}`}>{VERILINE_EMAIL}</a>
              <a href={CONSOLE_URL}>개인용 할루시네이션 검사</a>
              <a href={`${SITE_URL}/hallucination-index`}>할루시네이션 지수</a>
              <a href={`${SITE_URL}/docs/api`}>API 문서</a>
              <a href={`${SITE_URL}/terms`}>이용약관</a>
              <a href={`${SITE_URL}/privacy`}>개인정보처리방침</a>
              <a href={`${SITE_URL}/refund`}>환불정책</a>
            </div>
          </div>
          <address>
            <div>{businessLine([`상호 ${BUSINESS.name}(${BUSINESS.nameEn})`, `대표 ${BUSINESS.ceo}`, `사업자등록번호 ${BUSINESS.regNo}`, BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`])}</div>
            <div>주소 <BusinessAddress /></div>
            {BUSINESS.tel && <div>대표전화 <a href={telHref}>{BUSINESS.tel}</a></div>}
            <div>이메일 {VERILINE_EMAIL}</div>
            <div>{COMPLAINT_NOTICE} {COMPLAINT_OFFICER}</div>
            <div style={{ marginTop: 8 }}>판정은 공개 원문과 대조한 검증 정보이며 법률 · 의료 · 금융 자문이 아닙니다. 고친 부분에 대한 책임은 환불과 정정 보고서이며, 범위와 한도는 기업 서비스 이용 조건 제10조 · 제10조의2를 따릅니다.</div>
            <div style={{ marginTop: 8 }}>{COPYRIGHT}</div>
          </address>
        </div>
      </footer>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
      {inquiry && <InquiryModal plan={inquiry.plan} note={inquiry.note} onClose={() => setInquiry(null)} />}
      {quote && <QuoteModal product={quote} onClose={() => setQuote(null)} />}
    </main>
  );
}
