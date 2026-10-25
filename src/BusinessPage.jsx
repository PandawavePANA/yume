// 베리라인(VERILINE) 메인 홈 — 2026-10-25 새로 만듦. 2026-10-26부터 veriline.kr/ 이 이 화면이고, 개인용 검사는 유메(www.yume-reamer.com)다.
//
// 설계서: 바탕화면 veriline/site/베리라인_사이트_설계서.md (페르소나 · 여정 · 정보 구조 · 움직임 · 문구 원칙)
// 톤앤매너: 바탕화면 veriline/brand/베리라인_톤앤매너_2026-10-25.md — 흑백 + 키 컬러 하나(코발트 #2F5BFF). 틀림은 색 없이 취소선, 바로잡음만 키 컬러.
//
// 한 사람을 위한 페이지다: 노무 · 법률 AI 상담 서비스의 대표 · PM. 그 사람이 들어와서
//   5초 — 무엇을 하는 곳인가(히어로) → 30초 — 정말 틀리나(실제 감사 숫자) → 어디서 틀리나(함정 유형, 가로 레일)
//   → 어떻게 잡나(검증 과정 스크롤 이야기) → 무엇을 받나(보고서 미리보기) → 얼마인가(요금) → 믿어도 되나(할 수 없는 것)
//   → 걸리는 점(FAQ) → 무료 진단(바로 이 자리에서 신청) 순서로 결정한다.
// 금액은 서버 요율표(API_RATES · AUDIT_RATES)에서만 읽는다. 감사 사례의 회사 이름은 동의 없이 쓰지 않는다(A사).
import { useEffect, useRef, useState } from "react";
import AuditModal from "./components/yume/AuditModal.jsx";
import InquiryModal from "./components/business/InquiryModal.jsx";
import QuoteModal, { QUOTE_PRODUCTS } from "./components/business/QuoteModal.jsx";
import GateScene from "./components/business/GateScene.jsx";
import Logo from "./components/business/Logo.jsx";
import DiagnosisForm from "./components/business/DiagnosisForm.jsx";
import { HeroFlow, VerifyTicker } from "./components/business/HeroFlow.jsx";
import { CountUp, HorizontalRail, LineRule, Marquee, Reveal, ReportPreview, SplitWords, TimelineFill, VerifyStory } from "./components/business/motion.jsx";
import { CONTACT_EMAIL } from "./components/yume/api.js";
import { API_ORIGIN, YUME_URL, PERSONAL_URL } from "./businessConfig.js";
import { BUSINESS, telHref, COPYRIGHT, businessLine, COMPLAINT_NOTICE, COMPLAINT_OFFICER } from "./businessInfo.js";
import BusinessAddress from "./BusinessAddress.jsx";
import { API_RATES, API_UNIT_CHARS, AUDIT_LEAD, AUDIT_PILOT_SEATS, AUDIT_RATES } from "../server/apiRates.js";

const won = (n) => `${n.toLocaleString("ko-KR")}원`;

const CSS = `
.vl { --black:#0A0A0B; --ink:#111113; --white:#FFFFFF; --off:#F5F5F6; --line:#E6E6E9; --line-dark:rgba(255,255,255,.12);
  --g1:#5C5C64; --g2:#8E8E97; --g3:#B4B4BC; --key:#2F5BFF; --key-deep:#1E46E0; --key-on-dark:#7B95FF; --key-soft:#EEF2FF;
  --sans:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  font-family:var(--sans); color:var(--ink); background:var(--white); font-size:17px; line-height:1.75; word-break:keep-all; -webkit-font-smoothing:antialiased; }
.vl *, .vl *::before, .vl *::after { box-sizing:border-box; }
.vl a { color:inherit; }
.vl :focus-visible { outline:2px solid var(--key); outline-offset:3px; border-radius:6px; }
.vl-wrap { width:min(1180px,100%); margin:0 auto; padding-left:max(20px, env(safe-area-inset-left, 0px)); padding-right:max(20px, env(safe-area-inset-right, 0px)); }
/* 상단 메뉴 — 히어로 위에서는 투명, 지나면 흰 면 */
.vl-nav { position:fixed; left:0; right:0; top:0; z-index:40; padding-top:var(--yume-safe-top, 0px); transition:background .35s, border-color .35s, color .35s; border-bottom:1px solid transparent; color:#fff; }
.vl-nav.solid { background:rgba(255,255,255,.88); backdrop-filter:blur(16px) saturate(150%); -webkit-backdrop-filter:blur(16px) saturate(150%); border-bottom-color:var(--line); color:var(--ink); }
.vl-nav .row { display:flex; align-items:center; gap:28px; height:64px; }
.vl-nav .brand { display:flex; align-items:center; color:inherit; text-decoration:none; }
.vl-nav nav { display:flex; gap:4px; flex:1; }
.vl-nav nav a { text-decoration:none; font-size:14.5px; padding:6px 10px; border-radius:8px; opacity:.72; transition:opacity .2s; }
.vl-nav nav a:hover { opacity:1; }
.vl-nav .right { display:flex; gap:10px; align-items:center; margin-left:auto; }
.vl-nav .personal { font-size:14px; text-decoration:none; opacity:.7; }
@media (max-width: 960px) { .vl-nav nav { display:none; } }
@media (max-width: 560px) { .vl-nav .personal { display:none; } }
/* 버튼 */
.vl-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:48px; padding:0 22px; border-radius:10px; border:1px solid transparent; font:inherit; font-size:15.5px; font-weight:600; text-decoration:none; cursor:pointer; white-space:nowrap; transition:background .2s, border-color .2s, color .2s, transform .15s; }
.vl-btn:active { transform:translateY(1px); }
.vl-btn:disabled { opacity:.6; cursor:default; }
.vl-btn.key { background:var(--key); color:#fff; }
.vl-btn.key:hover { background:var(--key-deep); }
.vl-btn.line { border-color:var(--line); color:var(--ink); background:transparent; }
.vl-btn.line:hover { border-color:var(--ink); }
.vl-btn.line-dark { border-color:rgba(255,255,255,.28); color:#fff; background:transparent; }
.vl-btn.line-dark:hover { border-color:#fff; }
.vl-btn.sm { height:38px; padding:0 14px; font-size:14px; border-radius:9px; }
.vl-btn .arr { transition:transform .2s; } .vl-btn:hover .arr { transform:translateX(3px); }
/* 공통 섹션 */
.vl-sec { padding:clamp(88px,12vw,160px) 0; scroll-margin-top:64px; }
.vl-sec.off { background:var(--off); }
.vl-sec.dark { background:var(--black); color:#fff; }
.vl-eyebrow { display:flex; align-items:center; gap:12px; font-size:14px; font-weight:500; color:var(--g2); }
.vl-sec.dark .vl-eyebrow, .vl-hero .vl-eyebrow { color:#8E8E97; }
.vl-h2 { font-size:clamp(32px,4.4vw,56px); font-weight:700; letter-spacing:-.035em; line-height:1.18; margin:18px 0 0; text-wrap:balance; max-width:20ch; }
.vl-lede { font-size:clamp(17px,1.6vw,20px); color:var(--g1); line-height:1.75; margin:20px 0 0; max-width:58ch; }
.vl-sec.dark .vl-lede { color:#A1A1AA; }
.vl-rule { height:1px; background:var(--line); position:relative; margin:0 0 28px; max-width:120px; overflow:hidden; }
.vl-rule span { position:absolute; inset:0; display:block; }
.vl-sec.dark .vl-rule { background:var(--line-dark); }
/* 히어로 */
.vl-hero { position:relative; min-height:100svh; display:flex; flex-direction:column; justify-content:center; overflow:hidden;
  background:radial-gradient(800px 480px at 74% 56%, rgba(47,91,255,.20), transparent 64%), var(--black); color:#fff; padding-top:96px; padding-bottom:72px; }
.vl-hero::before { content:""; position:absolute; inset:0; background:linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px) 0 0/56px 56px, linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px) 0 0/56px 56px; mask-image:radial-gradient(ellipse at 60% 50%, #000 30%, transparent 75%); -webkit-mask-image:radial-gradient(ellipse at 60% 50%, #000 30%, transparent 75%); pointer-events:none; }
.vl-hero-grid { position:relative; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.05fr); gap:clamp(24px,4vw,56px); align-items:center; }
@media (max-width: 980px) { .vl-hero-grid { grid-template-columns:1fr; } }
.vl-hero h1 { font-size:clamp(42px,6.4vw,88px); font-weight:700; letter-spacing:-.045em; line-height:1.06; margin:22px 0 0; text-wrap:balance; }
.vl-hero .lead { font-size:clamp(17px,1.7vw,20px); color:#B4B4BC; line-height:1.75; margin:26px 0 0; max-width:46ch; }
.vl-hero .ctas { display:flex; gap:12px; flex-wrap:wrap; margin-top:34px; }
.vl-hero .micro { display:flex; gap:18px; flex-wrap:wrap; margin-top:22px; font-size:13.5px; color:#8E8E97; }
.vl-hero .micro span::before { content:"— "; color:var(--key-on-dark); }
.vl-scrollhint { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); font-family:var(--mono); font-size:11px; letter-spacing:.14em; color:#6B6B73; display:flex; flex-direction:column; align-items:center; gap:8px; }
.vl-scrollhint i { width:1px; height:32px; background:linear-gradient(#6B6B73, transparent); animation:vlHint 1.8s ease-in-out infinite; transform-origin:top; }
/* 히어로 배경 흐름 · 검증 기록 한 줄(HeroFlow.jsx) */
.vl-flow { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.vl-hero-grid { z-index:1; }
.vl-ticker { display:flex; align-items:center; gap:10px; margin-top:28px; padding:10px 14px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:rgba(255,255,255,.03); max-width:560px; font-size:13.5px; overflow:hidden; }
.vl-ticker .dot { width:7px; height:7px; border-radius:50%; background:var(--key-on-dark); box-shadow:0 0 0 0 rgba(123,149,255,.6); animation:vlPulse 1.8s ease-out infinite; flex:none; }
@keyframes vlPulse { 0% { box-shadow:0 0 0 0 rgba(123,149,255,.55); } 100% { box-shadow:0 0 0 9px rgba(123,149,255,0); } }
.vl-ticker .label { color:#71717A; flex:none; font-size:12.5px; }
.vl-ticker .win { position:relative; flex:1; min-width:0; height:22px; }
.vl-ticker .row { position:absolute; inset:0; display:flex; gap:8px; align-items:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vl-ticker code { font-family:var(--mono); color:#AFC0FF; font-size:12.5px; }
.vl-ticker .what { color:#D4D4D8; overflow:hidden; text-overflow:ellipsis; }
.vl-ticker b { font-weight:600; font-size:12.5px; flex:none; }
.vl-ticker b.ok { color:#A1A1AA; } .vl-ticker b.fix { color:#fff; background:rgba(47,91,255,.35); border-radius:4px; padding:0 6px; }
@media (max-width: 560px) { .vl-ticker .label { display:none; } }
@media (prefers-reduced-motion: reduce) { .vl-ticker .dot { animation:none; } }
@keyframes vlHint { 0% { transform:scaleY(0); opacity:1; } 70% { transform:scaleY(1); opacity:1; } 100% { transform:scaleY(1); opacity:0; } }
@media (max-width: 980px) { .vl-scrollhint { display:none; } }
/* 조문 띠 — 오른쪽 → 왼쪽 */
.vl-marquee { overflow:hidden; border-top:1px solid var(--line-dark); border-bottom:1px solid var(--line-dark); background:var(--black); color:#6B6B73; mask-image:linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); -webkit-mask-image:linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.vl-marquee-track { display:flex; gap:48px; width:max-content; padding:18px 0; font-family:var(--mono); font-size:13.5px; white-space:nowrap; animation:vlMarq 60s linear infinite; }
@keyframes vlMarq { from { transform:translateX(0); } to { transform:translateX(-50%); } }
/* 실제 감사 숫자 */
.vl-proof { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:64px; border-top:1px solid var(--line); }
.vl-proof > div { padding:28px 28px 0 0; }
.vl-proof > div + div { border-left:1px solid var(--line); padding-left:28px; }
.vl-proof small { display:block; font-size:14.5px; color:var(--g1); }
.vl-proof b { display:block; font-size:clamp(48px,6vw,84px); font-weight:700; letter-spacing:-.045em; line-height:1.05; margin-top:10px; font-variant-numeric:tabular-nums; }
.vl-proof b.key { color:var(--key); }
.vl-proof em { display:block; font-style:normal; font-size:14px; color:var(--g2); margin-top:8px; }
@media (max-width: 760px) { .vl-proof { grid-template-columns:1fr; } .vl-proof > div + div { border-left:0; border-top:1px solid var(--line); padding-left:0; } .vl-proof > div { padding:24px 0; } }
.vl-quote { font-size:clamp(22px,2.6vw,32px); font-weight:600; letter-spacing:-.025em; line-height:1.45; margin:72px 0 0; max-width:30ch; text-wrap:balance; }
.vl-quote span { color:var(--g2); }
/* 가로 레일 */
.vl-rail-outer { position:relative; background:var(--white); }
.vl-rail-sticky { position:sticky; top:0; height:100vh; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
.vl-rail-track { display:flex; gap:20px; padding:0 max(20px, calc((100vw - 1180px) / 2 + 20px)); margin-top:48px; will-change:transform; width:max-content; }
.vl-rail-static { padding:clamp(88px,12vw,140px) 0; }
.vl-rail-scroll { display:flex; gap:16px; overflow-x:auto; scroll-snap-type:x mandatory; padding:0 20px 8px; margin-top:36px; -webkit-overflow-scrolling:touch; }
.vl-rail-scroll > * { scroll-snap-align:start; }
.vl-trap { flex:0 0 min(400px, 82vw); border:1px solid var(--line); border-radius:16px; padding:28px; background:var(--white); display:flex; flex-direction:column; gap:14px; min-height:340px; }
.vl-trap .type { font-size:13.5px; font-weight:600; color:var(--key); }
.vl-trap h3 { margin:0; font-size:22px; font-weight:700; letter-spacing:-.025em; line-height:1.35; }
.vl-trap .row { display:grid; grid-template-columns:72px 1fr; gap:8px; font-size:15.5px; line-height:1.6; }
.vl-trap .row span:first-child { color:var(--g2); font-size:13.5px; padding-top:2px; }
.vl-trap s { color:var(--g2); text-decoration-thickness:1.5px; }
.vl-trap .right { color:var(--key); font-weight:700; }
.vl-trap .law { margin-top:auto; padding-top:16px; border-top:1px solid var(--line); font-family:var(--mono); font-size:13px; color:var(--g1); }
.vl-trap.end { background:var(--black); color:#fff; border-color:var(--black); justify-content:center; }
.vl-trap.end h3 { font-size:26px; }
.vl-trap.end p { color:#A1A1AA; margin:0; font-size:15.5px; }
/* 검증 이야기 */
.vl-story-outer { height:380vh; position:relative; }
.vl-story-sticky { position:sticky; top:0; height:100vh; display:flex; align-items:center; }
.vl-story-static { padding-top:40px; }
.vl-story-grid { width:min(1180px,100%); margin:0 auto; padding:0 20px; display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:clamp(24px,5vw,72px); align-items:center; }
@media (max-width: 900px) { .vl-story-grid { grid-template-columns:1fr; } }
.vl-story-steps { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.vl-story-steps li { display:grid; grid-template-columns:44px 1fr; gap:12px; padding:16px 0; border-top:1px solid var(--line); opacity:.38; transition:opacity .4s; }
.vl-story-steps li.on, .vl-story-steps li.past { opacity:1; }
.vl-story-steps li .n { font-family:var(--mono); font-size:13px; color:var(--g2); padding-top:3px; }
.vl-story-steps li.on .n { color:var(--key); }
.vl-story-steps b { font-size:18px; font-weight:700; letter-spacing:-.02em; }
.vl-story-steps p { margin:4px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
.vl-story-static .vl-story-steps li { opacity:1; }
.vl-story-doc { border-radius:18px; background:var(--black); color:#fff; padding:clamp(20px,3vw,32px); box-shadow:0 40px 80px rgba(10,10,11,.18); }
.vl-story-q { font-size:15.5px; color:#D4D4D8; padding-bottom:18px; border-bottom:1px solid var(--line-dark); }
.vl-story-q span { font-family:var(--mono); font-size:12px; color:#8E8E97; margin-right:10px; }
.vl-story-a { position:relative; padding-top:18px; display:grid; gap:12px; }
.vl-story-a .who { font-family:var(--mono); font-size:12px; color:#8E8E97; }
.vl-story-scan { position:absolute; left:-12px; right:-12px; height:2px; background:linear-gradient(90deg, transparent, var(--key-on-dark), transparent); box-shadow:0 0 18px rgba(123,149,255,.8); transition:top .12s linear, opacity .3s; pointer-events:none; }
.vl-sent { border:1px solid var(--line-dark); border-radius:12px; padding:14px 16px; transition:border-color .35s, background .35s; }
.vl-sent p { margin:0; font-size:15.5px; line-height:1.65; color:#E4E4E7; }
.vl-sent.check { border-color:rgba(123,149,255,.6); background:rgba(47,91,255,.08); }
.vl-sent.done.bad { border-color:rgba(123,149,255,.9); }
.vl-sent s { color:#71717A; }
.vl-sent .fix { color:#fff; font-weight:700; background:rgba(47,91,255,.38); border-radius:4px; padding:0 4px; }
.vl-sent .meta { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:8px; font-size:12.5px; min-height:18px; }
.vl-sent .meta code { font-family:var(--mono); color:#AFC0FF; }
.vl-sent .wait { color:#52525B; }
.vl-sent .checking { color:var(--key-on-dark); }
.vl-sent .pass { color:#D4D4D8; }
.vl-sent .fail { color:#fff; font-weight:600; }
/* 보고서 */
.vl-deliver { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:clamp(32px,6vw,88px); align-items:center; }
@media (max-width: 920px) { .vl-deliver { grid-template-columns:1fr; } }
.vl-list { list-style:none; padding:0; margin:32px 0 0; display:grid; }
.vl-list li { display:grid; grid-template-columns:28px 1fr; gap:10px; padding:16px 0; border-top:1px solid var(--line); font-size:16.5px; }
.vl-list li::before { content:""; width:14px; height:2px; background:var(--key); margin-top:13px; }
.vl-list li span { display:block; color:var(--g1); font-size:15px; margin-top:2px; }
.vl-report { background:var(--white); border:1px solid var(--line); border-radius:14px; box-shadow:0 50px 100px rgba(10,10,11,.12), 0 2px 6px rgba(10,10,11,.05); padding:clamp(20px,3vw,36px); font-size:14px; min-width:520px; }
.vl-report .top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding-bottom:18px; border-bottom:2px solid var(--ink); }
.vl-report .top b { font-size:20px; letter-spacing:-.02em; display:block; }
.vl-report .top small { font-family:var(--mono); font-size:11.5px; color:var(--g2); }
.vl-report .meta { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 0; border-bottom:1px solid var(--line); }
.vl-report .meta div small { display:block; font-size:11.5px; color:var(--g2); }
.vl-report .meta div b { font-size:15px; }
.vl-report table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13.5px; }
.vl-report th { text-align:left; font-weight:500; color:var(--g2); font-size:11.5px; padding:10px 6px; border-bottom:1px solid var(--line); }
.vl-report td { padding:12px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
.vl-report td.id { font-family:var(--mono); color:var(--g1); width:54px; }
.vl-report td.law { font-family:var(--mono); font-size:12px; color:var(--key); white-space:nowrap; }
.vl-report .verdict { display:inline-block; font-size:11.5px; font-weight:600; padding:2px 7px; border-radius:5px; background:var(--ink); color:#fff; white-space:nowrap; }
.vl-report .foot { margin-top:14px; font-size:12px; color:var(--g2); }
.vl-reportwrap { overflow-x:auto; padding:8px 4px 24px; }
/* 제품 타임라인 */
.vl-timeline { position:relative; margin-top:72px; padding-left:56px; }
.vl-timeline-line { position:absolute; left:15px; top:8px; bottom:8px; width:2px; background:var(--line-dark); }
.vl-timeline-line span { position:absolute; inset:0; background:var(--key-on-dark); transform-origin:top; display:block; }
.vl-tl-item { position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:24px; padding:36px 0; border-top:1px solid var(--line-dark); align-items:start; }
.vl-tl-item::before { content:""; position:absolute; left:-47px; top:44px; width:12px; height:12px; border-radius:50%; background:var(--black); border:2px solid var(--key-on-dark); }
.vl-tl-item .when { font-size:14px; font-weight:600; color:var(--key-on-dark); }
.vl-tl-item h3 { margin:8px 0 0; font-size:clamp(24px,2.6vw,32px); letter-spacing:-.03em; }
.vl-tl-item p { margin:10px 0 0; color:#A1A1AA; max-width:52ch; font-size:16px; }
.vl-tl-item .price { text-align:right; }
.vl-tl-item .price b { display:block; font-size:clamp(24px,2.6vw,32px); letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.vl-tl-item .price small { color:#8E8E97; font-size:13px; }
.vl-tl-item .price .vl-btn { margin-top:14px; }
@media (max-width: 720px) { .vl-tl-item { grid-template-columns:1fr; } .vl-tl-item .price { text-align:left; } }
/* 분야 */
.vl-fields { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:56px; border-top:1px solid var(--line); }
.vl-fields > div { padding:28px 24px 8px 0; }
.vl-fields > div + div { border-left:1px solid var(--line); padding-left:24px; }
.vl-fields .st { font-size:13.5px; font-weight:600; color:var(--g2); }
.vl-fields .st.now { color:var(--key); }
.vl-fields h3 { margin:10px 0 0; font-size:28px; letter-spacing:-.03em; }
.vl-fields p { margin:8px 0 0; color:var(--g1); font-size:15px; }
@media (max-width: 860px) { .vl-fields { grid-template-columns:repeat(2,minmax(0,1fr)); } .vl-fields > div:nth-child(3) { border-left:0; padding-left:0; } .vl-fields > div:nth-child(n+3) { border-top:1px solid var(--line); } }
/* 요금 */
.vl-price-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:48px; }
.vl-price-grid.api { grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:20px; }
@media (max-width: 980px) { .vl-price-grid, .vl-price-grid.api { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .vl-price-grid, .vl-price-grid.api { grid-template-columns:1fr; } }
.vl-pcard { border:1px solid var(--line); border-radius:16px; padding:26px; display:flex; flex-direction:column; gap:10px; background:var(--white); transition:border-color .25s, transform .25s; }
.vl-pcard:hover { border-color:var(--ink); transform:translateY(-3px); }
.vl-pcard.main { border:2px solid var(--key); padding:25px; }
.vl-pcard .k { font-size:15px; font-weight:700; }
.vl-pcard .price { font-size:32px; font-weight:700; letter-spacing:-.035em; font-variant-numeric:tabular-nums; }
.vl-pcard .price small { font-size:14px; font-weight:400; color:var(--g2); letter-spacing:0; }
.vl-pcard .d { color:var(--g1); font-size:15px; line-height:1.65; flex:1; }
.vl-pilot { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; margin-top:16px; padding:22px 26px; border-radius:16px; background:var(--key-soft); }
.vl-pilot b { font-size:17px; }
.vl-pilot p { margin:4px 0 0; color:var(--g1); font-size:15px; }
.vl-subh { font-size:20px; font-weight:700; letter-spacing:-.02em; margin:64px 0 0; }
.vl-docs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:20px; border-top:1px solid var(--line); }
.vl-docs a, .vl-docs button { display:flex; flex-direction:column; gap:4px; text-align:left; padding:20px 20px 20px 0; border:0; border-bottom:1px solid var(--line); background:none; font:inherit; color:inherit; text-decoration:none; cursor:pointer; }
.vl-docs b { font-size:15.5px; }
.vl-docs span { color:var(--g1); font-size:14px; }
.vl-docs a:hover b, .vl-docs button:hover b { color:var(--key); }
@media (max-width: 860px) { .vl-docs { grid-template-columns:1fr 1fr; } }
.vl-note { font-size:14px; color:var(--g2); margin-top:18px; line-height:1.7; }
.vl-note a { color:var(--key); }
/* 신뢰 */
.vl-trust { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:56px; border-top:1px solid var(--line); }
.vl-trust > div { padding:32px 32px 32px 0; border-bottom:1px solid var(--line); }
.vl-trust > div:nth-child(even) { padding-left:32px; border-left:1px solid var(--line); }
.vl-trust .no { font-family:var(--mono); font-size:12.5px; color:var(--key); }
.vl-trust h3 { margin:10px 0 0; font-size:21px; letter-spacing:-.025em; }
.vl-trust p { margin:10px 0 0; color:var(--g1); font-size:15.5px; }
@media (max-width: 760px) { .vl-trust { grid-template-columns:1fr; } .vl-trust > div:nth-child(even) { padding-left:0; border-left:0; } }
.vl-badges { display:flex; gap:12px; flex-wrap:wrap; margin-top:32px; }
.vl-badges span, .vl-badges a { font-family:var(--mono); font-size:13px; padding:8px 12px; border:1px solid var(--line); border-radius:8px; color:var(--g1); text-decoration:none; }
.vl-badges a { color:var(--key); }
/* FAQ */
.vl-faq { margin-top:48px; border-top:1px solid var(--line); max-width:860px; }
.vl-faq details { border-bottom:1px solid var(--line); }
.vl-faq summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; gap:20px; padding:24px 0; font-size:18px; font-weight:600; letter-spacing:-.02em; }
.vl-faq summary::-webkit-details-marker { display:none; }
.vl-faq summary::after { content:"+"; font-family:var(--mono); font-weight:400; color:var(--key); font-size:22px; line-height:1; transition:transform .25s; }
.vl-faq details[open] summary::after { transform:rotate(45deg); }
.vl-faq p { margin:0 0 24px; color:var(--g1); font-size:16px; max-width:66ch; }
/* 무료 진단 */
.vl-diag { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:clamp(32px,6vw,88px); align-items:start; }
@media (max-width: 920px) { .vl-diag { grid-template-columns:1fr; } }
.vl-diag-steps { list-style:none; padding:0; margin:40px 0 0; display:grid; }
.vl-diag-steps li { display:grid; grid-template-columns:44px 1fr; gap:10px; padding:18px 0; border-top:1px solid var(--line-dark); }
.vl-diag-steps .n { font-family:var(--mono); font-size:13px; color:var(--key-on-dark); padding-top:3px; }
.vl-diag-steps b { font-size:17px; }
.vl-diag-steps p { margin:4px 0 0; color:#A1A1AA; font-size:15px; }
.vl-form { position:relative; background:#141416; border:1px solid var(--line-dark); border-radius:18px; padding:clamp(22px,3vw,34px); display:grid; gap:16px; }
.vl-form label { display:grid; gap:8px; font-size:14px; color:#D4D4D8; }
.vl-form input, .vl-form textarea, .vl-form select { width:100%; background:#0A0A0B; border:1px solid rgba(255,255,255,.16); color:#fff; border-radius:10px; padding:13px 14px; font:inherit; font-size:15.5px; }
.vl-form input:focus, .vl-form textarea:focus, .vl-form select:focus { border-color:var(--key-on-dark); outline:none; }
.vl-form .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width: 560px) { .vl-form .two { grid-template-columns:1fr; } }
.vl-form .fine { font-size:12.5px; color:#8E8E97; margin:0; }
.vl-form .err { font-size:14px; color:#fff; background:rgba(255,255,255,.08); border-radius:10px; padding:10px 12px; }
.vl-form .done { display:grid; gap:12px; }
.vl-form .done b { font-size:22px; }
.vl-form .done p { margin:0; color:#A1A1AA; }
.vl-linkbtn { background:none; border:0; padding:0; font:inherit; color:var(--key-on-dark); cursor:pointer; text-decoration:underline; }
/* 푸터 */
.vl-foot { background:var(--black); color:#8E8E97; padding:56px 0 calc(48px + var(--yume-safe-bottom, 0px)); font-size:13.5px; border-top:1px solid var(--line-dark); }
.vl-foot .top { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap; align-items:center; }
.vl-foot .links { display:flex; gap:18px; flex-wrap:wrap; }
.vl-foot a { color:#A1A1AA; text-decoration:none; } .vl-foot a:hover { color:#fff; }
.vl-foot address { font-style:normal; font-size:12.5px; line-height:1.9; margin-top:32px; color:#6B6B73; }
/* IR 구역(문제 · 왜 지금 · 기술 · 경쟁 · 로드맵 · 팀 · 비즈니스 모델) */
.vl-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:56px; border-top:1px solid var(--line); }
.vl-stats > div { padding:28px 28px 0 0; }
.vl-stats > div + div { border-left:1px solid var(--line); padding-left:28px; }
.vl-stats b { display:block; font-size:clamp(44px,5.4vw,72px); font-weight:700; letter-spacing:-.045em; line-height:1.05; font-variant-numeric:tabular-nums; }
.vl-stats p { margin:10px 0 0; font-size:16.5px; font-weight:600; }
.vl-stats small { display:block; margin-top:10px; font-size:12.5px; color:var(--g2); line-height:1.6; }
@media (max-width: 760px) { .vl-stats { grid-template-columns:1fr; } .vl-stats > div + div { border-left:0; border-top:1px solid var(--line); padding-left:0; } .vl-stats > div { padding:24px 0; } }
.vl-why { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:48px; }
.vl-why > div { background:var(--white); border:1px solid var(--line); border-radius:16px; padding:28px; }
.vl-why .k { font-size:13.5px; font-weight:600; color:var(--key); }
.vl-why h3 { margin:10px 0 0; font-size:21px; letter-spacing:-.025em; line-height:1.4; }
.vl-why p { margin:10px 0 0; color:var(--g1); font-size:15.5px; }
@media (max-width: 860px) { .vl-why { grid-template-columns:1fr; } }
.vl-tech { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; margin-top:56px; background:var(--line-dark); border:1px solid var(--line-dark); border-radius:18px; overflow:hidden; }
.vl-techcard { background:var(--black); padding:30px; min-height:220px; transition:background .3s; }
.vl-techcard:hover { background:#111114; }
.vl-techcard .k { font-family:var(--mono); font-size:13px; color:var(--key-on-dark); }
.vl-techcard h3 { margin:12px 0 0; font-size:21px; letter-spacing:-.025em; }
.vl-techcard p { margin:10px 0 0; color:#A1A1AA; font-size:15px; line-height:1.7; }
@media (max-width: 960px) { .vl-tech { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 600px) { .vl-tech { grid-template-columns:1fr; } }
.vl-tablewrap { overflow-x:auto; margin-top:48px; border:1px solid var(--line); border-radius:16px; }
.vl-compare { width:100%; min-width:760px; border-collapse:collapse; font-size:15px; }
.vl-compare th { text-align:left; font-size:13px; font-weight:600; color:var(--g2); padding:16px 18px; border-bottom:1px solid var(--line); background:var(--off); }
.vl-compare td { padding:16px 18px; border-bottom:1px solid var(--line); vertical-align:top; }
.vl-compare td:first-child { font-weight:600; }
.vl-compare tr:last-child td { border-bottom:0; }
.vl-compare tr.us td { background:var(--key-soft); color:var(--ink); font-weight:600; }
.vl-compare tr.us td:first-child { color:var(--key); }
.vl-road { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; margin-top:56px; position:relative; }
.vl-road::before { content:""; position:absolute; left:0; right:0; top:7px; height:2px; background:var(--line); }
.vl-roaditem { position:relative; padding:32px 20px 0 0; }
.vl-roaditem::before { content:""; position:absolute; left:0; top:0; width:16px; height:16px; border-radius:50%; background:var(--off); border:2px solid var(--g3); }
.vl-roaditem.done::before { background:var(--key); border-color:var(--key); }
.vl-roaditem .when { font-family:var(--mono); font-size:13px; color:var(--g2); }
.vl-roaditem.done .when { color:var(--key); }
.vl-roaditem h3 { margin:8px 0 0; font-size:20px; letter-spacing:-.025em; }
.vl-roaditem p { margin:8px 0 0; color:var(--g1); font-size:15px; }
@media (max-width: 860px) { .vl-road { grid-template-columns:1fr 1fr; row-gap:28px; } .vl-road::before { display:none; } }
@media (max-width: 520px) { .vl-road { grid-template-columns:1fr; } }
.vl-teamgrid { display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr); gap:clamp(32px,6vw,80px); align-items:start; }
@media (max-width: 900px) { .vl-teamgrid { grid-template-columns:1fr; } }
.vl-team { display:grid; gap:0; border-top:1px solid var(--line); }
.vl-team > div { padding:24px 0; border-bottom:1px solid var(--line); }
.vl-team small { font-size:13px; color:var(--g2); }
.vl-team b { display:block; margin-top:6px; font-size:19px; letter-spacing:-.02em; }
.vl-team p { margin:8px 0 0; color:var(--g1); font-size:15.5px; }
.vl-bm { display:flex; flex-wrap:wrap; align-items:center; gap:14px; margin-top:44px; padding:24px 28px; border:1px solid var(--line); border-radius:16px; background:var(--white); }
.vl-bm > div small { display:block; font-size:12.5px; color:var(--g2); }
.vl-bm > div b { font-size:18px; letter-spacing:-.02em; }
.vl-bm i { font-style:normal; color:var(--key); font-size:20px; }
.vl-bm .acv { margin-left:auto; text-align:right; }
.vl-bm .acv b { color:var(--key); font-size:20px; font-variant-numeric:tabular-nums; }
@media (max-width: 760px) { .vl-bm .acv { margin-left:0; text-align:left; width:100%; } }
/* 휴대폰 하단 고정 버튼 */
.vl-sticky { position:fixed; left:0; right:0; bottom:0; z-index:39; padding:10px max(16px, env(safe-area-inset-left, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)); background:rgba(10,10,11,.92); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border-top:1px solid var(--line-dark); transform:translateY(110%); transition:transform .35s; display:none; }
.vl-sticky.show { transform:none; }
.vl-sticky .vl-btn { width:100%; }
@media (max-width: 720px) { .vl-sticky { display:block; } }
@media (prefers-reduced-motion: reduce) { .vl-marquee-track, .vl-scrollhint i { animation:none; } .vl-pcard:hover { transform:none; } }
`;

// 2026-10-26 대표 "다른 기업 IR 덱 흐름을 참고해 — IR 내용과 가격 제안이 함께". 순서는 IR 덱의 정석(문제 → 왜 지금 →
// 해결 → 기술 · 해자 → 제품 → 시장 → 비즈니스 모델 · 가격 → 경쟁 → 성과 · 로드맵 → 팀 → 문의)을 따르되,
// 고객이 읽어도 결정에 필요한 것(증거 · 받는 것 · 가격 · 신뢰 · FAQ · 무료 진단)이 빠지지 않게 끼워 넣었다.
const NAV = [
  ["#problem", "문제"],
  ["#how", "해결"],
  ["#tech", "기술"],
  ["#pricing", "가격"],
  ["#compare", "비교"],
  ["#roadmap", "로드맵"],
  ["#faq", "자주 묻는 질문"],
];

// 문제 — 출처가 있는 숫자만(각주 그대로 화면에)
const PROBLEM = [
  { n: "61.8%", t: "법률 정보를 생성형 AI로 얻는 성인", src: "전자신문 · 오픈서베이, 2026.6, 성인 1,008명(1~3순위 합산)" },
  { n: "17~33%", t: "법률 전문 AI 도구의 오답률", src: "Magesh et al., Journal of Empirical Legal Studies, 2025" },
  { n: "50~83%", t: "의료 질문 속 거짓 정보를 그대로 따라 한 AI 답", src: "Mount Sinai 연구팀, Communications Medicine, 2025.8 · 6개 모델 · 300개 사례" },
];

const WHY_NOW = [
  { k: "규제", t: "2026년 1월 인공지능 기본법 시행", d: "AI 서비스의 신뢰성과 투명성이 회사의 책임이 됐습니다. '우리도 확인했다'는 외부 기록이 필요해집니다." },
  { k: "법 개정", t: "법은 계속 바뀝니다", d: "남녀고용평등법 제19조의4는 2025.2.23 시행 개정으로 육아휴직 분할이 2회에서 3회가 됐습니다. 모델은 옛 법을 그대로 말합니다." },
  { k: "모델", t: "모델이 좋아질수록 틀린 곳은 숨습니다", d: "쉬운 질문은 거의 맞힙니다. 남는 오류는 개정 직후 · 단서 · 숫자처럼 사람이 놓치기 쉬운 자리에 몰립니다." },
];

// 기술 · 해자 — "법제처 API + 강한 모델"을 붙이기만 해서는 나오지 않는 것들. 모두 지금 엔진에 들어 있다(veriline-1.0).
const TECH = [
  { k: "01", t: "현행 원문 · 시행일 대조", d: "법제처에서 오늘 시행 중인 버전만 받습니다. 시행 예정 개정 · 삭제 조문 · 효력 상실을 구별하고, 시행령으로 위임된 내용까지 따라갑니다." },
  { k: "02", t: "수치 · 제재 코드 대조", d: "기간 · 금액 · 횟수 · 비율을 단위까지 코드가 비교하고, 벌금(형벌)과 과태료(행정질서벌)를 가릅니다. 모델이 '비슷하게' 읽고 넘어가는 자리를 막습니다." },
  { k: "03", t: "개정 추적", d: "틀린 답이 옛 법 그대로인지 연혁을 거슬러 확인합니다. \"육아휴직 2회 분할\" → \"2025.2.23 시행 개정 전 내용\"처럼 원인과 시점을 알려 드립니다." },
  { k: "04", t: "부존재 신뢰도", d: "없는 조문 · 판례 · 고시를 지어낸 경우, 검색 범위를 수치로 계산해 '없다'를 판정합니다. 특허 출원 10-2026-0194281." },
  { k: "05", t: "반론 먼저, 인용 잠금", d: "틀렸다고 내기 전에 두 번째 검토자가 '맞을 수 있는 이유'부터 찾습니다. 근거 문장은 원문에 그대로 있어야만 남습니다." },
  { k: "06", t: "쌓이는 함정 질문", d: "감사할 때마다 'AI가 실제로 틀린 질문 + 원문 정답'이 데이터셋으로 쌓입니다. 감사가 늘수록 질문이 날카로워집니다." },
];

const COMPARE = [
  ["방법", "정답 기준", "외부 증빙", "법 개정", "시간 · 비용"],
  ["직접 만든 테스트", "자체 질문", "안 됨", "직접 따라가야", "개발 몇 주"],
  ["변호사 · 노무사 검수", "전문가 판단", "됨", "매번 다시", "느리고 비쌈"],
  ["범용 AI 평가 서비스", "범용 채점 기준", "됨", "업종 맞춤 필요", "빠름 · 대기업용"],
  ["법령 API + 강한 모델 직접 연결", "모델이 읽은 조문", "안 됨", "현행만 · 옛 법 원인 모름", "개발 · 유지 필요"],
  ["베리라인", "원문 · 시행일 + 코드 대조", "됨 · 독립 감사", "매일 추적 · 개정 원인까지", "1~3일 · 감사 87만 원"],
];

const ROADMAP = [
  { when: "2026.10", t: "엔진 1.0 · 특허 출원", d: "감사 3회 · 할루시네이션 28건 확인 · 수치 대조 · 개정 추적", done: true },
  { when: "2026.11", t: "판매 시작", d: "무료 진단 10곳 · 첫 유료 고객 · 고객 인터뷰 10명" },
  { when: "2027 상반기", t: "세무 지원 · 데이터셋 1,000건", d: "세법 원천 연결 · 분기 공개 할루시네이션 지수" },
  { when: "2027 하반기", t: "의료 지원", d: "의료 법령 다음, 의약품 정보 같은 공식 원천 연결" },
];


const LAWS = ["근로기준법 제60조 연차 유급휴가", "고용보험법 제40조 구직급여 수급 요건", "최저임금법 제31조 과태료", "남녀고용평등법 제19조 육아휴직", "고용보험법 제50조 피보험기간", "근로자퇴직급여 보장법 제8조", "주택임대차보호법 제3조의2", "소득세법 제59조의4", "부가가치세법 제30조", "의료법 제27조", "국민건강보험법 제41조", "민법 제750조 불법행위"];

// 실제 감사(2026-10 · 노무 상담 AI A사)에서 찾은 오류 — 회사 이름은 동의 없이 쓰지 않는다. 마지막 장은 지어낸 인용의 예.
const TRAPS = [
  { type: "숫자", title: "초단시간 근로자의 기준기간 요건", bad: "2주 소정근로일수 2일 이하", good: "1주 소정근로일수 2일 이하", law: "고용보험법 제40조 ②" },
  { type: "개정 직후", title: "방학 단기 육아휴직", bad: "연 2회 · 회당 4주", good: "연 1회 · 1~2주", law: "남녀고용평등법 제19조" },
  { type: "기간", title: "자영업자 피보험기간 합산", bad: "5년 이내", good: "3년 이내", law: "고용보험법 제50조" },
  { type: "벌칙", title: "근로감독관 검사 거부", bad: "벌금 500만 원", good: "과태료 100만 원 이하", law: "최저임금법 제31조" },
  { type: "없는 법 · 예시", title: "그럴듯한 가짜 고시", bad: "공정위 고시 제2019-77호 제3조가 로열티 상한을 정한다", good: "그런 고시는 없음 — 부존재 신뢰도로 판정", law: "특허 출원 10-2026-0194281" },
];

const STEPS = [
  ["주장으로 나누기", "답변을 확인할 수 있는 사실 단위로 쪼갭니다. 숫자 · 기간 · 조건 · 벌칙이 하나씩 떨어져 나옵니다."],
  ["현행 원문 가져오기", "법제처에서 오늘 시행 중인 조문을 직접 받습니다. 시행령 · 시행규칙으로 위임된 내용까지 따라갑니다."],
  ["원문과 대조", "숫자 · 기간 · 조건을 원문 문장과 하나씩 맞춰 봅니다. 근거를 대지 못하는 판정은 내보내지 않습니다."],
  ["사람이 다시 확인", "감사에서는 오류로 지목된 항목을 사람이 공식 원문을 직접 열어 확인한 것만 남깁니다."],
  ["고친 문장과 근거", "틀린 문장은 원문 값으로 고치고, 어느 법 몇 조 몇 항인지 함께 기록합니다."],
];

// 고용보험법 제40조 ① · ②(2026-10-25 법령 원문으로 확인), 제48조 ①, 제58조.
const SENTENCES = [
  { text: "이직일 이전 18개월 동안 피보험 단위기간이 180일 이상이어야 합니다.", ok: true, law: "고용보험법 제40조 ①" },
  { text: "초단시간 근로자는 2주 소정근로일수가 2일 이하이면 기준기간이 24개월로 늘어납니다.", ok: false, fix: "1주 소정근로일수 2일 이하", law: "고용보험법 제40조 ②" },
  { text: "자기 사정으로 그만두면 원칙적으로 구직급여를 받을 수 없습니다.", ok: true, law: "고용보험법 제58조" },
  { text: "구직급여는 이직일 다음 날부터 12개월 안에 받아야 합니다.", ok: true, law: "고용보험법 제48조 ①" },
];

const FIELDS = [
  { k: "노무", st: "지금", now: true, v: "근로기준법 · 고용보험법 · 최저임금법 등 노동 법령" },
  { k: "법률", st: "지금", now: true, v: "법률 · 시행령 · 행정규칙 · 판례(법제처 국가법령정보)" },
  { k: "세무", st: "곧 지원", v: "세법 · 시행령 원문을 같은 방식으로 연결 중" },
  { k: "의료", st: "곧 지원", v: "의료 법령 다음, 의약품 정보 같은 공식 원천 연결" },
];

const TRUST = [
  ["생성형 AI를 쓰고, 숨기지 않습니다", "주장 추출 · 질문 설계 보조 · 고친 문장 제안에 생성형 AI를 씁니다. 판정은 AI의 기억으로 확정하지 않고, 출처를 대지 못하면 '확인되지 않음'으로 둡니다."],
  ["100% 정확하다고 말하지 않습니다", "원문으로 정답이 서지 않는 질문은 출제하지 않습니다. 확인하지 못한 것은 어디까지 찾았는지와 함께 알려 드립니다."],
  ["사람 검수자를 대체하지 않습니다", "베리라인은 사람 검수자의 1차 필터입니다. 최종 판단과 규제 준수 책임은 귀사에 있고, 판정은 법률 · 의료 자문이 아닙니다."],
  ["귀사 자료와 이름을 지킵니다", "감사 결과는 비공개입니다. 회사 이름은 서면 동의가 있을 때만 씁니다. 공개 지수에는 업종 단위 익명 숫자로만 들어갑니다."],
];

// 페르소나(노무 · 법률 AI 회사 PM)가 실제로 걸려 하는 순서대로.
const FAQ = [
  ["우리 AI의 API 키나 내부 권한이 필요한가요?", "필요 없습니다. 무료 진단과 감사는 베리라인이 일반 사용자로서 귀사 서비스를 직접 써 보는 방식입니다. 출시 전이라 공개 주소가 없다면 시험 계정을 받아 진행합니다."],
  ["감사 결과가 밖으로 나가나요?", "아니요. 보고서는 귀사에만 비공개 링크로 드리고 언제든 회수할 수 있습니다. 회사 이름은 서면으로 동의하신 경우에만 공개합니다."],
  ["우리도 테스트를 하는데, 꼭 외부 감사가 필요한가요?", "직접 만든 시험은 직접 만든 쪽에 유리하게 나옵니다. 자체 점검 26문항을 모두 통과한 서비스가 베리라인 함정 질문 12개 중 4개를 틀렸습니다. 그리고 자체 시험은 투자 실사나 제휴 심사에서 외부 증빙이 되지 않습니다."],
  ["얼마나 걸리고, 얼마인가요?", `무료 진단은 보통 영업일 3일, 정밀 감사는 입금 확인 후 ${AUDIT_LEAD}입니다. 정밀 감사는 ${won(AUDIT_RATES.audit.krw)}(부가세 별도)이고, 첫 ${AUDIT_PILOT_SEATS}곳은 파일럿 ${won(AUDIT_RATES.audit_pilot.krw)}입니다.`],
  ["세무 · 의료 AI도 되나요?", "지금은 노무 · 법률입니다. 세무와 의료는 공식 원천을 연결한 뒤 같은 방식으로 지원합니다. 먼저 이야기를 나누고 싶으시면 무료 진단으로 알려 주세요."],
  ["결과를 보증해 주나요?", "베리라인이 드리는 것은 무엇을 언제 어떤 원문으로 확인했는지의 검사 기록입니다. 서비스 품질이나 앞으로의 답변을 보증하지 않습니다."],
];

const DIAG_STEPS = [
  ["서비스 주소를 남기세요", "AI 서비스 주소와 분야, 연락처만 있으면 됩니다."],
  ["베리라인이 직접 써 봅니다", "일반 사용자로서 함정 질문 몇 개를 넣고 답을 법령 원문과 대조합니다."],
  ["틀린 곳 요약을 받으세요", "찾은 오류와 근거 조문을 보통 영업일 3일 안에 보내 드립니다. 결과가 깨끗하면 도입을 권하지 않습니다."],
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

function Head({ eyebrow, title, lede, dark = false }) {
  return (
    <Reveal>
      <LineRule dark={dark} />
      <div className="vl-eyebrow">{eyebrow}</div>
      <h2 className="vl-h2">{title}</h2>
      {lede && <p className="vl-lede">{lede}</p>}
    </Reveal>
  );
}

export default function BusinessPage() {
  const [quote, setQuote] = useState(initialQuote);
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [showAudit, setShowAudit] = useState(false);
  const [pilot, setPilot] = useState(null);
  const [solid, setSolid] = useState(false);
  const [sticky, setSticky] = useState(false);
  const heroRef = useRef(null);
  const diagRef = useRef(null);

  useEffect(() => {
    fetch(`${API_ORIGIN}/api/b2b/seats`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPilot(d.pilot)).catch(() => {});
  }, []);
  // 메뉴는 히어로를 지나면 흰 면으로, 휴대폰 하단 버튼은 히어로를 지나고 무료 진단 구역 전까지만.
  useEffect(() => {
    const on = () => {
      const h = heroRef.current?.offsetHeight || 600;
      const y = window.scrollY;
      setSolid(y > h - 72);
      const d = diagRef.current?.getBoundingClientRect();
      setSticky(y > h * 0.8 && !(d && d.top < window.innerHeight));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  const toDiag = (e) => {
    e?.preventDefault();
    document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="vl">
      <style>{CSS}</style>

      {/* ── 상단 메뉴 ── */}
      <header className={`vl-nav${solid ? " solid" : ""}`}>
        <div className="vl-wrap row">
          <a className="brand" href="#top" aria-label="베리라인 홈 맨 위로"><Logo height={24} /></a>
          <nav aria-label="메뉴">{NAV.map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
          <div className="right">
            <a className="personal" href={PERSONAL_URL}>개인용 검사</a>
            <a className="vl-btn key sm" href="#diagnosis" onClick={toDiag}>무료 진단 받기</a>
          </div>
        </div>
      </header>

      {/* ── 1. 히어로: 무엇을 하는 곳인가(5초) ── */}
      <section className="vl-hero" id="top" ref={heroRef}>
        <HeroFlow gateAt={0.66} />
        <div className="vl-wrap vl-hero-grid">
          <div>
            <Reveal><div className="vl-eyebrow">법률 · 노무 · 의료 AI를 위한 할루시네이션 검증</div></Reveal>
            <SplitWords as="h1" text="AI 답이 나가기 전, 마지막 검증선." accent={[4, 5]} delay={0.1} />
            <Reveal delay={0.5}>
              <p className="lead">틀린 법 안내 한 줄이 사용자의 손해가 되고, 회사의 분쟁이 됩니다. 베리라인은 출시 전에 함정 질문으로 AI를 감사하고, 운영 중에는 답이 나가기 전에 법령 원문으로 검증합니다.</p>
              <div className="ctas">
                <a className="vl-btn key" href="#diagnosis" onClick={toDiag}>우리 AI 무료 진단 받기 <span className="arr">→</span></a>
                <a className="vl-btn line-dark" href="#how">작동 방식 보기</a>
              </div>
              <div className="micro"><span>API 키 필요 없음</span><span>결과는 비공개</span><span>보통 영업일 3일</span></div>
              <VerifyTicker />
            </Reveal>
          </div>
          <Reveal delay={0.3}><GateScene /></Reveal>
        </div>
        <div className="vl-scrollhint" aria-hidden="true">SCROLL<i /></div>
      </section>
      <Marquee items={LAWS} />

      {/* ── IR 1. 문제 ── */}
      <section className="vl-sec" id="problem">
        <div className="vl-wrap">
          <Head eyebrow="문제" title="사람들은 이미 법과 건강을 AI에게 묻습니다" lede="그런데 AI는 그럴듯하게 틀립니다. 법률 · 노무 · 세무 · 의료에서는 틀린 안내 한 줄이 곧 사용자의 손해이고, 서비스 회사의 분쟁입니다." />
          <Reveal className="vl-stats">
            {PROBLEM.map((x) => (
              <div key={x.n}><b>{x.n}</b><p>{x.t}</p><small>{x.src}</small></div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── 2. 증거: 정말 틀리나(30초) ── */}
      <section className="vl-sec" id="proof">
        <div className="vl-wrap">
          <Head eyebrow="실제 감사 · 노무 상담 AI A사 · 2026.10" title="자체 점검은 통과했습니다. 그런데 틀렸습니다." />
          <Reveal className="vl-proof">
            <div><small>A사가 직접 만든 점검 질문 26개</small><b><CountUp to={0} suffix="개" /></b><em>틀림 — 자체 점검은 “통과”</em></div>
            <div><small>베리라인 함정 질문 12개</small><b className="key"><CountUp to={4} suffix="개" /></b><em>틀림 — 3개 중 1개꼴</em></div>
            <div><small>감사 3회에서 원문으로 확인한 할루시네이션</small><b><CountUp to={28} suffix="건" /></b><em>모두 사람이 법제처 원문으로 다시 확인</em></div>
          </Reveal>
          <Reveal><p className="vl-quote">회사가 만든 시험은 회사에 유리하게 나옵니다. <span>AI가 실제로 무너지는 자리를 묻지 않기 때문입니다.</span></p></Reveal>
        </div>
      </section>

      {/* ── IR 2. 왜 지금 ── */}
      <section className="vl-sec off" id="whynow">
        <div className="vl-wrap">
          <Head eyebrow="왜 지금" title="지금 확인해야 하는 세 가지 이유" />
          <div className="vl-why">
            {WHY_NOW.map((x, i) => (
              <Reveal key={x.k} delay={i * 0.08}><div className="k">{x.k}</div><h3>{x.t}</h3><p>{x.d}</p></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. 어디서 틀리나: 함정 유형(가로 레일, 오른쪽 → 왼쪽) ── */}
      <section id="cases" style={{ scrollMarginTop: 64 }}>
        <HorizontalRail title={<div className="vl-wrap"><Head eyebrow="AI가 무너지는 자리" title="틀리는 자리는 정해져 있습니다" lede="개정 직후 조문, 숫자, 기간, 벌칙, 그리고 그럴듯한 가짜 법. 베리라인의 함정 질문은 정확히 이 자리를 묻습니다." /></div>}>
          {TRAPS.map((t) => (
            <article key={t.title} className="vl-trap">
              <div className="type">{t.type}</div>
              <h3>{t.title}</h3>
              <div className="row"><span>AI 답</span><s>{t.bad}</s></div>
              <div className="row"><span>현행 원문</span><span className="right">{t.good}</span></div>
              <div className="law">§ {t.law}</div>
            </article>
          ))}
          <article className="vl-trap end">
            <h3>귀사 AI는 이 자리에서 어떻게 답할까요?</h3>
            <p>서비스 주소만 남기시면 같은 방식으로 먼저 확인해 드립니다.</p>
            <a className="vl-btn key" href="#diagnosis" onClick={toDiag} style={{ alignSelf: "flex-start", marginTop: 8 }}>무료 진단 받기 <span className="arr">→</span></a>
          </article>
        </HorizontalRail>
      </section>

      {/* ── 4. 어떻게 잡나: 검증 과정(스크롤 이야기) ── */}
      <section className="vl-sec off" id="how" style={{ paddingBottom: 0 }}>
        <div className="vl-wrap">
          <Head eyebrow="작동 방식" title="한 문장씩, 법령 원문과 대조합니다" lede="스크롤하면 실제 노무 상담 답변 하나가 검증되는 과정을 볼 수 있습니다. 맞는 문장은 근거를 남기고, 틀린 문장은 원문 값으로 고칩니다." />
        </div>
        <VerifyStory steps={STEPS} question="초단시간으로 일하다 그만뒀는데 실업급여를 받을 수 있나요?" sentences={SENTENCES} />
        <div style={{ height: "clamp(64px,8vw,120px)" }} />
      </section>

      {/* ── IR 4. 기술 · 해자 ── */}
      <section className="vl-sec dark" id="tech">
        <div className="vl-wrap">
          <Head dark eyebrow="기술 · 베리라인 엔진 1.0" title="법령 API에 강한 모델을 붙이는 것만으로는 나오지 않는 것" lede="법제처 API는 누구나 씁니다. 차이는 그 위에서 무엇을 코드로 확인하고, 무엇을 쌓느냐입니다." />
          <div className="vl-tech">
            {TECH.map((x, i) => (
              <Reveal key={x.k} delay={(i % 3) * 0.08} className="vl-techcard"><span className="k">{x.k}</span><h3>{x.t}</h3><p>{x.d}</p></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. 무엇을 받나: 보고서 ── */}
      <section className="vl-sec" id="report">
        <div className="vl-wrap vl-deliver">
          <div>
            <Head eyebrow="받는 것" title="고칠 목록과, 그대로 쓸 수 있는 증빙" />
            <Reveal>
              <ul className="vl-list">
                <li><div><b>틀린 곳과 근거 조문</b><span>어느 답의 어느 문장이, 어느 법 몇 조 몇 항과 다른지</span></div></li>
                <li><div><b>원문 값으로 고친 문장</b><span>그대로 붙여 넣어 고칠 수 있게</span></div></li>
                <li><div><b>잘된 점과 한계</b><span>무엇을 검사했고 무엇은 검사하지 않았는지</span></div></li>
                <li><div><b>30분 설명과 재검사 1회</b><span>고친 뒤 다시 확인합니다</span></div></li>
              </ul>
              <p className="vl-note">외부 감사 기록이라 투자 실사, 대기업 제휴 심사, 민원 대응 자료로 그대로 쓸 수 있습니다.</p>
            </Reveal>
          </div>
          <div className="vl-reportwrap">
            <ReportPreview>
              <div className="top">
                <div><b>AI 정밀 감사 보고서</b><small>비공개 · 예시를 위해 회사명을 지움</small></div>
                <Logo height={16} />
              </div>
              <div className="meta">
                <div><small>대상</small><b>노무 상담 AI A사</b></div>
                <div><small>문항</small><b>함정 12 · 일반 26</b></div>
                <div><small>결과</small><b>사실과 다름 4</b></div>
              </div>
              <table>
                <thead><tr><th>번호</th><th>항목</th><th>판정</th><th>근거</th></tr></thead>
                <tbody>
                  <tr><td className="id">F-01</td><td>초단시간 근로자 기준기간 요건</td><td><span className="verdict">사실과 다름</span></td><td className="law">고용보험법 §40②</td></tr>
                  <tr><td className="id">F-02</td><td>방학 단기 육아휴직 횟수 · 기간</td><td><span className="verdict">사실과 다름</span></td><td className="law">남녀고용평등법 §19</td></tr>
                  <tr><td className="id">F-03</td><td>자영업자 피보험기간 합산</td><td><span className="verdict">사실과 다름</span></td><td className="law">고용보험법 §50</td></tr>
                  <tr><td className="id">F-04</td><td>근로감독관 검사 거부 제재</td><td><span className="verdict">사실과 다름</span></td><td className="law">최저임금법 §31</td></tr>
                </tbody>
              </table>
              <div className="foot">모든 오류는 사람이 법제처 원문으로 다시 확인했습니다 · 검증 과정에 생성형 AI를 사용했습니다</div>
            </ReportPreview>
          </div>
        </div>
      </section>

      {/* ── 6. 제품: 출시 전 → 운영 중 → 법이 바뀌면 ── */}
      <section className="vl-sec dark" id="product">
        <div className="vl-wrap">
          <Head dark eyebrow="제품" title="출시 전엔 감사, 출시 후엔 감시" lede="감사로 약점을 찾고, 운영 중에는 API로 답을 거르고, 법이 바뀌면 다시 봅니다. 셋 다 지금 운영 중입니다." />
          <TimelineFill>
            <div className="vl-tl-item">
              <div><div className="when">01 · 출시 전</div><h3>AI 정밀 감사</h3><p>정답을 법령 원문으로 먼저 확정한 함정 질문 50개로 귀사 AI를 검사합니다. 비공개 보고서 · 30분 설명 · 재검사 1회.</p></div>
              <div className="price"><b>{won(AUDIT_RATES.audit.krw)}</b><small>1회 · 부가세 별도</small><br /><button type="button" className="vl-btn key sm" onClick={() => setQuote("audit")}>감사 신청</button></div>
            </div>
            <div className="vl-tl-item">
              <div><div className="when">02 · 운영 중</div><h3>검증 API</h3><p>답이 사용자에게 나가기 전에 해당 조문을 법제처에서 받아 대조하고, 틀린 문장은 고쳐서 돌려줍니다.</p></div>
              <div className="price"><b>월 {won(API_RATES.tiers[0].monthlyKrw)}~</b><small>{API_RATES.tiers[0].calls.toLocaleString("ko-KR")}건 포함</small><br /><a className="vl-btn line-dark sm" href={`${YUME_URL}/docs/api`}>API 문서</a></div>
            </div>
            <div className="vl-tl-item">
              <div><div className="when">03 · 법이 바뀌면</div><h3>정기 감사 · 개정 추적</h3><p>분기마다 30문항 재감사와 법령 개정 알림. 바뀐 조문에 걸린 답부터 다시 봅니다.</p></div>
              <div className="price"><b>{won(AUDIT_RATES.audit_regular.krw)}</b><small>분기 · 1년 선납 {won(AUDIT_RATES.audit_regular_year.krw)}</small><br /><button type="button" className="vl-btn line-dark sm" onClick={() => setQuote("audit_regular")}>정기 감사 신청</button></div>
            </div>
          </TimelineFill>
        </div>
      </section>

      {/* ── 7. 분야 ── */}
      <section className="vl-sec" id="fields">
        <div className="vl-wrap">
          <Head eyebrow="지원 분야" title="틀리면 손해가 생기고, 정답이 원문으로 있는 곳" lede="노무 · 법률부터 시작합니다. 바뀌는 건 정답 원천뿐이라, 같은 방식으로 세무와 의료로 넓힙니다." />
          <Reveal className="vl-fields">
            {FIELDS.map((f) => (
              <div key={f.k}><div className={`st${f.now ? " now" : ""}`}>{f.st}</div><h3>{f.k}</h3><p>{f.v}</p></div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── 8. 요금 ── */}
      <section className="vl-sec off" id="pricing">
        <div className="vl-wrap">
          <Head eyebrow="비즈니스 모델 · 가격" title="감사로 시작해, 구독으로 이어집니다" lede={`모든 금액은 부가세 별도입니다. 감사는 입금 확인 후 ${AUDIT_LEAD} 안에 보고서를 드립니다. API는 보낸 글 ${API_UNIT_CHARS.toLocaleString("ko-KR")}자마다 1건으로 셉니다.`} />
          <Reveal className="vl-bm">
            <div><small>첫 결제 · 한 번</small><b>정밀 감사</b></div><i aria-hidden="true">→</i>
            <div><small>매달</small><b>검증 API</b></div><i aria-hidden="true">→</i>
            <div><small>매년</small><b>정기 감사 · 개정 추적</b></div>
            <div className="acv"><small>고객 1곳 연 반복 매출(감사비 제외)</small><b>{won(API_RATES.tiers[0].monthlyKrw * 12 + AUDIT_RATES.audit_regular_year.krw)} ~ {won(API_RATES.tiers[API_RATES.tiers.length - 1].monthlyKrw * 12 + AUDIT_RATES.audit_regular_year.krw)}</b></div>
          </Reveal>
          <div className="vl-price-grid">
            {[
              { key: "audit", k: "정밀 감사", price: won(AUDIT_RATES.audit.krw), per: " / 1회", d: "함정 질문 50개 · 비공개 보고서 · 30분 설명 · 재검사 1회", main: true },
              { key: "audit_regular", k: "정기 감사", price: won(AUDIT_RATES.audit_regular.krw), per: " / 분기", d: `분기마다 30문항 · 개정 알림 · 1년 선납 ${won(AUDIT_RATES.audit_regular_year.krw)}` },
              { key: "audit_package", k: "출시 전 패키지", price: won(AUDIT_RATES.audit_package.krw), per: " / 1식", d: "정밀 감사 + 검증 API 스타터 3개월(월 400건)" },
            ].map((c, i) => (
              <Reveal key={c.key} delay={i * 0.08} className={`vl-pcard${c.main ? " main" : ""}`}>
                <div className="k">{c.k}</div>
                <div className="price">{c.price}<small>{c.per}</small></div>
                <div className="d">{c.d}</div>
                <button type="button" className={`vl-btn ${c.main ? "key" : "line"} sm`} onClick={() => setQuote(c.key)}>바로 신청</button>
              </Reveal>
            ))}
          </div>
          {pilot !== 0 && (
            <Reveal className="vl-pilot">
              <div><b>첫 {AUDIT_PILOT_SEATS}곳 파일럿 — 정밀 감사 {won(AUDIT_RATES.audit_pilot.krw)}{pilot != null ? ` · 남은 자리 ${pilot}` : ""}</b><p>범위는 정밀 감사와 같고, 조건은 결과를 보고 30분 피드백 통화 하나입니다.</p></div>
              <button type="button" className="vl-btn key sm" onClick={() => setQuote("audit_pilot")}>파일럿으로 신청</button>
            </Reveal>
          )}
          <h3 className="vl-subh">검증 API</h3>
          <div className="vl-price-grid api">
            <div className="vl-pcard"><div className="k">{API_RATES.metered.label}</div><div className="price">{won(API_RATES.metered.unitKrw)}<small> / 건</small></div><div className="d">약정 없이 쓴 만큼 · 후불 월 정산</div><button type="button" className="vl-btn line sm" onClick={() => setQuote("metered")}>견적서 받기</button></div>
            {API_RATES.tiers.map((t) => (
              <div key={t.key} className="vl-pcard"><div className="k">{t.label}</div><div className="price">{won(t.monthlyKrw)}<small> / 월</small></div><div className="d">매달 {t.calls.toLocaleString("ko-KR")}건 · 건당 {won(Math.round(t.monthlyKrw / t.calls))}</div><button type="button" className="vl-btn line sm" onClick={() => setQuote(t.key)}>견적서 받기</button></div>
            ))}
            <div className="vl-pcard"><div className="k">{API_RATES.enterprise.label}</div><div className="price">월 {won(API_RATES.enterprise.fromKrw)}<small>~</small></div><div className="d">전용 한도 · 계약서 · 대량 처리</div><button type="button" className="vl-btn line sm" onClick={() => setInquiry({ plan: "custom", note: "" })}>상담 요청</button></div>
          </div>
          <p className="vl-note">개발팀이 먼저 붙여 보려면 <a href={`${PERSONAL_URL}?open=api`}>가입하고 체험 키 받기</a>(매달 {API_RATES.trial.calls}건 무료) · <a href={`${YUME_URL}/docs/api`}>API 문서</a></p>
          <h3 className="vl-subh">구매 · 계약 서류</h3>
          <div className="vl-docs">
            <button type="button" onClick={() => setQuote("audit")}><b>견적서 바로 받기</b><span>A4 견적서가 바로 나옵니다</span></button>
            <a href={`${YUME_URL}/b2b/terms`} target="_blank" rel="noreferrer"><b>기업 서비스 이용 조건</b><span>해지 · 책임 한도 · 비밀 유지</span></a>
            <a href={`${YUME_URL}/b2b/dpa`} target="_blank" rel="noreferrer"><b>데이터 처리 부속서</b><span>개인정보 처리 위탁 표준본</span></a>
            <a href={`${YUME_URL}/b2b/security`} target="_blank" rel="noreferrer"><b>보안 설명서</b><span>받지 않은 인증은 받지 않았다고</span></a>
          </div>
        </div>
      </section>

      {/* ── IR 8. 경쟁 ── */}
      <section className="vl-sec" id="compare">
        <div className="vl-wrap">
          <Head eyebrow="경쟁과 대안" title="고객이 지금 쓰는 방법과 비교하면" lede="진짜 경쟁자는 고객이 직접 만든 테스트, 전문가 검수, 그리고 법령 API에 모델을 직접 붙이는 방식입니다." />
          <Reveal className="vl-tablewrap">
            <table className="vl-compare">
              <thead><tr>{COMPARE[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{COMPARE.slice(1).map((r) => <tr key={r[0]} className={r[0] === "베리라인" ? "us" : ""}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* ── IR 9. 성과 · 로드맵 ── */}
      <section className="vl-sec off" id="roadmap">
        <div className="vl-wrap">
          <Head eyebrow="성과와 로드맵" title="매출은 아직 0원, 판매 준비는 끝났습니다" lede="숫자는 그대로 말씀드립니다. 다음 분기마다 실측으로 바꿔 갑니다." />
          <div className="vl-road">
            {ROADMAP.map((x, i) => (
              <Reveal key={x.when} delay={i * 0.08} className={`vl-roaditem${x.done ? " done" : ""}`}>
                <div className="when">{x.when}{x.done ? " · 완료" : " · 목표"}</div><h3>{x.t}</h3><p>{x.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── IR 10. 팀 ── */}
      <section className="vl-sec" id="team">
        <div className="vl-wrap vl-teamgrid">
          <Head eyebrow="팀" title="기준은 사람이 정하고, 구현은 AI로 빠르게" />
          <Reveal className="vl-team">
            <div><small>대표</small><b>정원영</b><p>영업과 감사 최종 확인을 맡습니다. 감사 3회를 직접 수행했고, 오류는 법제처 원문으로 다시 확인한 것만 보고서에 남깁니다.</p></div>
            <div><small>일하는 원칙</small><b>“베리라인이 틀리면, 보고서 말고 베리라인을 고친다”</b><p>감사 중 시행 예정 조문을 현행으로 읽던 결함을 찾았을 때 엔진을 고쳤습니다.</p></div>
            <div><small>함께할 자리</small><b>노무사 · 변호사 자문 · B2B 영업 · 기술 공동창업자</b><p>첫 투자와 첫 고객 매출로 이 순서대로 채웁니다.</p></div>
          </Reveal>
        </div>
      </section>

      {/* ── 9. 신뢰: 할 수 없는 것부터 ── */}
      <section className="vl-sec" id="trust">
        <div className="vl-wrap">
          <Head eyebrow="신뢰" title="할 수 없는 것부터 말씀드립니다" lede="검증을 파는 곳이 스스로를 과장하면, 그 자체로 신뢰를 잃습니다." />
          <Reveal className="vl-trust">
            {TRUST.map(([h, d], i) => (
              <div key={h}><div className="no">{String(i + 1).padStart(2, "0")}</div><h3>{h}</h3><p>{d}</p></div>
            ))}
          </Reveal>
          <Reveal className="vl-badges">
            <span>법제처 국가법령정보 원문 대조</span>
            <span>특허 출원 10-2026-0194281</span>
            <span>AI 기본법 고지 준수</span>
            <a href={`${YUME_URL}/hallucination-index`}>할루시네이션 지수 →</a>
          </Reveal>
        </div>
      </section>

      {/* ── 10. 자주 묻는 질문 ── */}
      <section className="vl-sec off" id="faq">
        <div className="vl-wrap">
          <Head eyebrow="자주 묻는 질문" title="도입 전에 걸리는 것들" />
          <Reveal className="vl-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </Reveal>
        </div>
      </section>

      {/* ── 11. 무료 진단(이 자리에서 바로 신청) ── */}
      <section className="vl-sec dark" id="diagnosis" ref={diagRef}>
        <div className="vl-wrap vl-diag">
          <div>
            <Head dark eyebrow="무료 진단" title="귀사 AI가 어디서 틀리는지, 먼저 보세요" lede="비용도 결재도 없습니다. API 키도 필요 없습니다." />
            <Reveal>
              <ol className="vl-diag-steps">
                {DIAG_STEPS.map(([k, v], i) => <li key={k}><span className="n">{String(i + 1).padStart(2, "0")}</span><div><b>{k}</b><p>{v}</p></div></li>)}
              </ol>
              <p className="vl-note" style={{ color: "#8E8E97" }}>투자 · 제휴 문의는 {CONTACT_EMAIL}로 보내 주세요.</p>
              <p className="vl-note" style={{ color: "#8E8E97" }}>바로 맞춰 보고 싶으시면 <button type="button" className="vl-linkbtn" onClick={() => setShowAudit(true)}>5분 셀프 점검</button>도 있습니다.</p>
            </Reveal>
          </div>
          <Reveal delay={0.1}><DiagnosisForm /></Reveal>
        </div>
      </section>

      <footer className="vl-foot">
        <div className="vl-wrap">
          <div className="top">
            <Logo height={22} style={{ color: "#fff" }} />
            <div className="links">
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <a href={PERSONAL_URL}>개인용 할루시네이션 검사</a>
              <a href={`${YUME_URL}/hallucination-index`}>할루시네이션 지수</a>
              <a href={`${YUME_URL}/hallucination`}>할루시네이션이란</a>
              <a href={`${YUME_URL}/docs/api`}>API 문서</a>
              <a href={`${YUME_URL}/terms`}>이용약관</a>
              <a href={`${YUME_URL}/privacy`}>개인정보처리방침</a>
              <a href={`${YUME_URL}/refund`}>환불정책</a>
            </div>
          </div>
          <address>
            <div>{businessLine([`상호 ${BUSINESS.name}(${BUSINESS.nameEn})`, `대표 ${BUSINESS.ceo}`, `사업자등록번호 ${BUSINESS.regNo}`, BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`])}</div>
            <div>주소 <BusinessAddress /></div>
            {BUSINESS.tel && <div>대표전화 <a href={telHref}>{BUSINESS.tel}</a></div>}
            <div>이메일 {BUSINESS.email}</div>
            <div>{COMPLAINT_NOTICE} {COMPLAINT_OFFICER}</div>
            <div style={{ marginTop: 8 }}>베리라인은 검증 과정에 생성형 AI를 사용합니다. 판정은 공개 원문과 대조한 검증 정보이며 법률 · 의료 · 금융 자문이나 보증이 아닙니다.</div>
            <div style={{ marginTop: 8 }}>{COPYRIGHT}</div>
          </address>
        </div>
      </footer>

      <div className={`vl-sticky${sticky ? " show" : ""}`}>
        <a className="vl-btn key" href="#diagnosis" onClick={toDiag}>우리 AI 무료 진단 받기 <span className="arr">→</span></a>
      </div>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
      {inquiry && <InquiryModal plan={inquiry.plan} note={inquiry.note} onClose={() => setInquiry(null)} />}
      {quote && <QuoteModal product={quote} onClose={() => setQuote(null)} />}
    </main>
  );
}
