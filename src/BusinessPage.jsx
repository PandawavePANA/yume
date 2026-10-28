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
import EnginePipeline from "./components/business/EnginePipeline.jsx";
import BenchBoard from "./components/business/BenchBoard.jsx";
import PlanCalc from "./components/business/PlanCalc.jsx";
import Logo from "./components/business/Logo.jsx";
import DiagnosisForm from "./components/business/DiagnosisForm.jsx";
import { HeroFlow, VerifyTicker } from "./components/business/HeroFlow.jsx";
import { CellGrid, CountUp, HorizontalRail, LineRule, Marquee, MaskWords, Reveal, SplitWords, useStableVh, VerifyStory } from "./components/business/motion.jsx";
import { API_ORIGIN, YUME_URL, PERSONAL_URL } from "./businessConfig.js";
import { BUSINESS, telHref, COPYRIGHT, businessLine, COMPLAINT_NOTICE, COMPLAINT_OFFICER, VERILINE_EMAIL } from "./businessInfo.js";
import BusinessAddress from "./BusinessAddress.jsx";
import { API_RATES, API_UNIT_CHARS, AUDIT_LEAD, AUDIT_PILOT_SEATS, AUDIT_RATES } from "../server/apiRates.js";

const won = (n) => `${n.toLocaleString("ko-KR")}원`;

const CSS = `
.vl { --black:#0A0A0B; --ink:#111113; --white:#FFFFFF; --off:#F5F5F6; --line:#E6E6E9; --line-dark:rgba(255,255,255,.12);
  --g1:#5C5C64; --g2:#8E8E97; --g3:#B4B4BC; --key:#2F5BFF; --key-deep:#1E46E0; --key-on-dark:#7B95FF; --key-soft:#EEF2FF;
  --sans:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif; --mono:"IBM Plex Mono","IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",monospace;
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
.vl-sec.dark { background:var(--black); color:#fff; position:relative; }
/* 거친 질감(Grainy Gradient) — 어두운 면에만 아주 옅게. 화면을 덮는 층이라 누르기는 통과시킨다 */
.vl-hero::after, .vl-sec.dark::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.09; mix-blend-mode:overlay; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.vl-sec.dark > * { position:relative; z-index:1; }
/* 검증선(Line Animation) — 히어로의 "마지막 검증선."에 코발트 선이 왼쪽에서 오른쪽으로 그어진다 */
.vl-hero h1 .vl-grad { background-image:linear-gradient(var(--key-on-dark), var(--key-on-dark)); background-repeat:no-repeat; background-position:0 100%; padding-bottom:.08em; background-size:0 3px; animation:vlUline .5s 1.15s cubic-bezier(.2,.7,.2,1) forwards; }
.vl-hero h1 .vl-grad + .vl-grad { animation-delay:1.6s; }
@keyframes vlUline { to { background-size:100% 3px; } }
/* 오류 흔들림(Glitch) — 틀린 AI 답에만, 몇 초에 한 번 아주 짧게. 색은 코발트 하나 */
.vl-glitch { position:relative; animation:vlGlitch 6s steps(1, end) infinite; }
@keyframes vlGlitch { 0%, 90%, 100% { left:0; text-shadow:none; clip-path:none; } 91% { left:1px; text-shadow:-2px 0 rgba(47,91,255,.75), 2px 0 rgba(10,10,11,.25); } 92% { left:-1px; text-shadow:2px 0 rgba(47,91,255,.75); clip-path:inset(35% 0 25% 0); } 93% { left:1px; text-shadow:-1px 0 rgba(47,91,255,.6); clip-path:none; } 94% { left:0; text-shadow:none; } }
.vl-eyebrow { display:flex; align-items:center; gap:12px; font-size:14px; font-weight:500; color:var(--g2); }
.vl-sec.dark .vl-eyebrow, .vl-hero .vl-eyebrow { color:#8E8E97; }
.vl-mw { display:inline-block; overflow:hidden; vertical-align:top; padding-bottom:.08em; margin-bottom:-.08em; }
.vl-h2 { font-size:clamp(32px,4.4vw,56px); font-weight:700; letter-spacing:-.035em; line-height:1.18; margin:18px 0 0; text-wrap:balance; max-width:20ch; }
.vl-lede { font-size:clamp(17px,1.6vw,20px); color:var(--g1); line-height:1.75; margin:20px 0 0; max-width:58ch; }
.vl-sec.dark .vl-lede { color:#A1A1AA; }
.vl-rule { height:1px; background:var(--line); position:relative; margin:0 0 28px; max-width:120px; overflow:hidden; }
.vl-rule span { position:absolute; inset:0; display:block; }
.vl-sec.dark .vl-rule { background:var(--line-dark); }
/* 히어로 */
.vl-hero { position:relative; min-height:calc(var(--vhx, 1svh) * 100); display:flex; flex-direction:column; justify-content:center; overflow:hidden;
  background:radial-gradient(820px 520px at 78% 56%, rgba(47,91,255,.15), transparent 66%), var(--black); color:#fff; padding-top:96px; padding-bottom:72px; }
.vl-grad { color:#9DB1FF; }
.vl-badge { display:inline-flex; align-items:center; gap:10px; max-width:100%; padding:5px 14px 5px 6px; border-radius:999px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.03); font-size:13px; color:#B4B4BC; }
.vl-badge span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.vl-badge b { flex:none; white-space:nowrap; font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.06em; color:#AFC0FF; background:rgba(123,149,255,.14); border-radius:999px; padding:3px 9px; }
.vl-promise { font-size:clamp(18px,1.9vw,22px); line-height:1.6; color:#E4E7EF; margin:24px 0 0; padding-left:14px; border-left:2px solid var(--key-on-dark); }
.vl-promise b { color:#fff; font-weight:700; }
.vl-scope { font-size:12.5px; line-height:1.6; color:#7C8396; margin:14px 0 0; max-width:60ch; }
.vl-scope a { color:#AFC0FF; }
.vl-techrow { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; }
.vl-techrow span { font-family:var(--sans); font-size:12px; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.03); color:#C9CBD6; display:inline-flex; align-items:center; gap:7px; }
.vl-techrow span i { width:5px; height:5px; border-radius:50%; display:block; background:var(--key-on-dark); opacity:.8; }
.vl-hero::before { content:""; position:absolute; inset:0; background:linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px) 0 0/56px 56px, linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px) 0 0/56px 56px; mask-image:radial-gradient(ellipse at 60% 50%, #000 30%, transparent 75%); -webkit-mask-image:radial-gradient(ellipse at 60% 50%, #000 30%, transparent 75%); pointer-events:none; }
.vl-hero-grid { position:relative; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.05fr); gap:clamp(24px,4vw,56px); align-items:center; }
@media (max-width: 980px) { .vl-hero-grid { grid-template-columns:1fr; } }
@media (max-width: 420px) { .vl-hero h1 { font-size:34px; } .vl-hero .lead { font-size:16px; } .vl-promise { font-size:17px; } }
.vl-hero h1 { font-size:clamp(36px,6.4vw,88px); font-weight:700; letter-spacing:-.045em; line-height:1.06; margin:22px 0 0; text-wrap:balance; }
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
.vl-ticker code { font-family:var(--sans); font-weight:500; color:#AFC0FF; font-size:12.5px; }
.vl-ticker .what { color:#D4D4D8; overflow:hidden; text-overflow:ellipsis; }
.vl-ticker b { font-weight:600; font-size:12.5px; flex:none; }
.vl-ticker b.ok { color:#A1A1AA; } .vl-ticker b.fix { color:#fff; background:rgba(47,91,255,.35); border-radius:4px; padding:0 6px; }
@media (max-width: 560px) { .vl-ticker .label { display:none; } }
@media (prefers-reduced-motion: reduce) { .vl-ticker .dot { animation:none; } }
@keyframes vlHint { 0% { transform:scaleY(0); opacity:1; } 70% { transform:scaleY(1); opacity:1; } 100% { transform:scaleY(1); opacity:0; } }
@media (max-width: 980px) { .vl-scrollhint { display:none; } }
/* 조문 띠 — 오른쪽 → 왼쪽 */
.vl-marquee { overflow:hidden; border-top:1px solid var(--line-dark); border-bottom:1px solid var(--line-dark); background:var(--black); color:#6B6B73; mask-image:linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); -webkit-mask-image:linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.vl-marquee-track { display:flex; gap:48px; width:max-content; padding:18px 0; font-family:var(--sans); font-size:13.5px; white-space:nowrap; animation:vlMarq 60s linear infinite; }
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
.vl-rail-sticky { position:sticky; top:0; height:100vh; height:calc(var(--vhx, 1svh) * 100); padding-top:64px; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
@media (max-width: 900px) { .vl-rail-track { margin-top:24px !important; gap:14px !important; padding:0 16px !important; } .vl-trap { min-height:0 !important; padding:22px !important; gap:10px !important; } .vl-rail-sticky .vl-h2 { font-size:28px; } .vl-rail-sticky .vl-lede { margin-top:10px; font-size:15.5px; } }
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
.vl-trap .law { margin-top:auto; padding-top:16px; border-top:1px solid var(--line); font-family:var(--sans); font-size:13px; color:var(--g1); }
.vl-trap.end { background:var(--black); color:#fff; border-color:var(--black); justify-content:center; }
.vl-trap.end h3 { font-size:26px; }
.vl-trap.end p { color:#A1A1AA; margin:0; font-size:15.5px; }
/* 검증 이야기 */
.vl-story-outer { height:380vh; height:calc(var(--vhx, 1svh) * 380); position:relative; }
.vl-story-sticky { position:sticky; top:0; height:100vh; height:calc(var(--vhx, 1svh) * 100); padding-top:64px; display:flex; align-items:center; }
.vl-story-static { padding-top:40px; }
.vl-story-measure { position:absolute; left:0; right:0; top:0; visibility:hidden; pointer-events:none; }
.vl-story-measure > * { position:absolute; left:0; right:0; top:0; }
.vl-story-measure * { animation:none !important; transition:none !important; }
.vl-story-grid { width:min(1180px,100%); margin:0 auto; padding:0 20px; display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:clamp(24px,5vw,72px); align-items:center; }
.vl-story-steps { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.vl-story-steps li { display:grid; grid-template-columns:44px 1fr; gap:12px; padding:16px 0; border-top:1px solid var(--line); opacity:.38; transition:opacity .4s; position:relative; }
.vl-story-steps li::before { content:""; position:absolute; left:0; top:-1px; height:2px; width:100%; background:var(--key); transform:scaleX(0); transform-origin:left; transition:transform .5s cubic-bezier(.2,.7,.2,1); }
.vl-story-steps li.on::before { transform:scaleX(1); }
.vl-story-steps li.on, .vl-story-steps li.past { opacity:1; }
.vl-story-steps li .n { font-family:var(--mono); font-size:13px; color:var(--g2); padding-top:3px; }
.vl-story-steps li.on .n { color:var(--key); }
.vl-story-steps b { font-size:18px; font-weight:700; letter-spacing:-.02em; }
.vl-story-steps p { margin:4px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
.vl-story-static .vl-story-steps li { opacity:1; }
.vl-story-mstep { display:none; }
.vl-story-doc { position:relative; border-radius:18px; background:var(--black); color:#fff; padding:clamp(20px,3vw,32px); box-shadow:0 40px 80px rgba(10,10,11,.18); overflow:hidden; }
.vl-story-doc::before { content:""; position:absolute; inset:0; background:linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px) 0 0/100% 28px; mask-image:linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent); -webkit-mask-image:linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent); pointer-events:none; }
.vl-story-doc > * { position:relative; }
.vl-story-hud { display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:12px; color:#8E8E97; padding-bottom:14px; }
.vl-story-hud .live { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
.vl-story-hud .live i { width:6px; height:6px; border-radius:50%; background:#52525B; }
.vl-story-hud .live.on { color:#AFC0FF; }
.vl-story-hud .live.on i { background:var(--key-on-dark); animation:vlPulse 1.4s ease-out infinite; }
.vl-story-hud .cnt b { color:#fff; font-weight:600; font-variant-numeric:tabular-nums; }
.vl-story-hud .meter { flex:1 1 80px; height:2px; background:rgba(255,255,255,.1); border-radius:2px; overflow:hidden; min-width:60px; }
.vl-story-hud .meter i { display:block; height:100%; background:var(--key-on-dark); transform-origin:left; }
.vl-story-q { font-size:15.5px; color:#D4D4D8; padding-bottom:18px; border-bottom:1px solid var(--line-dark); }
.vl-story-q span { font-weight:600; font-size:12px; color:#8E8E97; margin-right:10px; }
.vl-story-a { position:relative; padding-top:18px; display:grid; gap:12px; }
.vl-story-a .who { font-weight:600; font-size:12px; color:#8E8E97; }
.vl-story-scan { position:absolute; left:-12px; right:-12px; height:2px; background:linear-gradient(90deg, transparent, var(--key-on-dark), transparent); box-shadow:0 0 18px rgba(123,149,255,.7); transition:top .12s linear, opacity .3s; pointer-events:none; z-index:2; }
.vl-sent { border:1px solid var(--line-dark); border-radius:12px; padding:14px 16px; transition:border-color .35s, background .35s, opacity .35s; }
.vl-sent.wait { opacity:.55; }
.vl-sent p { margin:0; font-size:15.5px; line-height:1.65; color:#E4E4E7; }
.vl-sent.check { border-color:rgba(123,149,255,.6); background:rgba(47,91,255,.08); }
.vl-sent.done.bad { border-color:rgba(123,149,255,.9); background:rgba(47,91,255,.06); }
.vl-sent s { position:relative; color:#71717A; text-decoration:none; background:linear-gradient(currentColor, currentColor) 0 55%/0 1.5px no-repeat; animation:vlGlitchOnce .32s steps(1, end), vlStrike .5s .3s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes vlGlitchOnce { 0% { left:1px; text-shadow:-2px 0 rgba(123,149,255,.85); } 33% { left:-1px; text-shadow:2px 0 rgba(123,149,255,.85); clip-path:inset(30% 0 30% 0); } 66% { left:1px; text-shadow:-1px 0 rgba(123,149,255,.6); clip-path:none; } 100% { left:0; text-shadow:none; } }
@keyframes vlStrike { to { background-size:100% 1.5px; } }
.vl-sent .fix { display:inline-block; color:#fff; font-weight:700; background:rgba(47,91,255,.38); border-radius:4px; padding:0 4px; animation:vlPop .45s .45s cubic-bezier(.2,.7,.2,1) both; }
@keyframes vlPop { from { opacity:0; transform:translateY(4px) scale(.96); } to { opacity:1; transform:none; } }
.vl-sent .meta { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:8px; font-size:12.5px; min-height:18px; }
.vl-sent .meta code { font-family:var(--sans); font-weight:500; color:#AFC0FF; }
.vl-sent .wait { color:#52525B; }
.vl-sent .checking { color:var(--key-on-dark); font-weight:500; }
.vl-sent .bar { flex:1 1 60px; height:2px; background:rgba(123,149,255,.18); border-radius:2px; overflow:hidden; min-width:40px; }
.vl-sent .bar i { display:block; height:100%; background:var(--key-on-dark); transform-origin:left; }
.vl-sent .stamp { display:inline-block; animation:vlStamp .35s cubic-bezier(.2,.7,.2,1) both; }
@keyframes vlStamp { from { opacity:0; transform:scale(1.25); } to { opacity:1; transform:none; } }
.vl-sent .pass { color:#D4D4D8; }
.vl-sent .fail { color:#fff; font-weight:600; }
.vl-story-receipt { font-family:var(--sans); display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px dashed rgba(255,255,255,.14); font-size:12px; color:#6B6B73; transition:color .3s; }
.vl-story-receipt code { font-family:var(--mono); color:#52525B; }
.vl-story-receipt.on code { color:#AFC0FF; }
.vl-story-receipt em { font-style:normal; color:#D4D4D8; animation:vlPop .4s both; }
@media (max-width: 900px) {
  .vl-story-outer { height:280vh; height:calc(var(--vhx, 1svh) * 280); }
  .vl-story-sticky { padding:max(76px, calc((var(--vhx, 1svh) * 100 - 580px) / 2)) 0 10px; align-items:flex-start; }
  .vl-story-sticky > .vl-story-grid { transform-origin:top center; }
  .vl-story-grid { grid-template-columns:1fr; gap:12px; padding:0 16px; }
  .vl-story-steps { display:none; }
  .vl-story-mstep { display:block; }
  .vl-story-mstep .bars { display:grid; grid-template-columns:repeat(5,1fr); gap:4px; }
  .vl-story-mstep .bars i { height:3px; border-radius:2px; background:var(--line); position:relative; overflow:hidden; }
  .vl-story-mstep .bars i::after { content:""; position:absolute; inset:0; background:var(--key); transform:scaleX(0); transform-origin:left; transition:transform .45s cubic-bezier(.2,.7,.2,1); }
  .vl-story-mstep .bars i.past::after, .vl-story-mstep .bars i.on::after { transform:scaleX(1); }
  .vl-story-mstep .cur { display:grid; grid-template-columns:auto 1fr; column-gap:10px; align-items:baseline; margin-top:10px; animation:vlPop .4s cubic-bezier(.2,.7,.2,1) both; }
  .vl-story-mstep .cur .n { font-family:var(--mono); font-size:11.5px; color:var(--key); }
  .vl-story-mstep .cur b { font-size:16.5px; letter-spacing:-.02em; }
  .vl-story-mstep .cur p { grid-column:1 / -1; margin:2px 0 0; font-size:13.5px; color:var(--g1); line-height:1.5; }
  .vl-story-doc { padding:16px; border-radius:16px; box-shadow:0 24px 48px rgba(10,10,11,.16); }
  .vl-story-hud { padding-bottom:10px; gap:10px; }
  .vl-story-q { font-size:14px; padding-bottom:10px; line-height:1.55; }
  .vl-story-a { gap:7px; padding-top:10px; }
  .vl-story-a .who { font-size:11px; }
  .vl-story-scan { left:-6px; right:-6px; }
  .vl-sent { padding:9px 12px; border-radius:10px; }
  .vl-sent p { font-size:14px; line-height:1.55; }
  .vl-sent .meta { margin-top:4px; font-size:11.5px; gap:8px; min-height:0; }
  .vl-sent .meta code { font-size:11px; }
  .vl-sent.wait .meta { display:none; }
  .vl-sent.wait p, .vl-sent.done.ok p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
  .vl-story-receipt { margin-top:10px; padding-top:9px; font-size:11px; }
  /* 맞은 문장은 한 줄 + 오른쪽 ✓ 하나로 접는다(근거 조문은 대조할 때 이미 보였다) */
  .vl-sent.done.ok { display:flex; align-items:center; gap:10px; }
  .vl-sent.done.ok p { flex:1; min-width:0; }
  .vl-sent.done.ok .meta { margin:0; flex:none; }
  .vl-sent.done.ok .meta code { display:none; }
  .vl-sent.done.ok .stamp { font-size:0; }
  .vl-sent.done.ok .stamp::before { content:"✓"; font-size:13px; color:#AFC0FF; font-weight:700; }
  .vl-story-receipt em { display:none; }
  .vl-story-static .vl-story-steps { display:grid; }
  .vl-story-static .vl-story-mstep { display:none; }
}
@media (max-width: 900px) and (max-height: 640px) {
  .vl-story-mstep .cur p { display:none; }
  .vl-story-q { font-size:13px; }
  .vl-sent p { font-size:13.5px; }
}
@media (prefers-reduced-motion: reduce) { .vl-sent s { background-size:100% 1.5px; animation:none; } .vl-sent .fix, .vl-sent .stamp, .vl-story-receipt em { animation:none; } }
/* 문항 칸(증거) */
.vl-cells { display:flex; flex-wrap:wrap; gap:4px; margin-top:16px; max-width:240px; }
.vl-cells i { width:12px; height:12px; border-radius:3px; background:var(--line); opacity:0; transform:scale(.3); transition:opacity .35s, transform .35s cubic-bezier(.2,.7,.2,1), background .35s; }
.vl-cells.on i { opacity:1; transform:none; background:#D4D4DA; }
.vl-cells.on i.hit { background:var(--key); }
/* 가로 레일 진행 막대 */
.vl-rail-meter { width:min(1140px, calc(100% - 40px)); margin:28px auto 0; height:2px; background:var(--line); border-radius:2px; overflow:hidden; }
.vl-rail-meter i { display:block; height:100%; background:var(--key); transform-origin:left; }
@media (max-width: 900px) { .vl-rail-meter { width:calc(100% - 32px); margin-top:18px; } }
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
@media (max-width: 560px) {
  .vl-price-grid { grid-template-columns:1fr; margin-top:36px; }
  /* 검증 API는 휴대폰에서 두 칸으로 접는다 — 다섯 장을 한 줄씩 쌓으면 너무 길다 */
  .vl-price-grid.api { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .vl-price-grid.api .vl-pcard { padding:16px; gap:6px; border-radius:14px; }
  .vl-price-grid.api .vl-pcard:last-child:nth-child(odd) { grid-column:1 / -1; }
  .vl-price-grid.api .k { font-size:13.5px; }
  .vl-price-grid.api .price { font-size:clamp(17px,5.4vw,21px); }
  .vl-price-grid.api .price { white-space:nowrap; line-height:1.25; }
  .vl-price-grid.api .price small { display:block; font-size:12px; }
  .vl-price-grid.api .d { font-size:12.5px; line-height:1.5; }
  .vl-price-grid.api .vl-btn.sm { height:34px; font-size:13px; padding:0 10px; }
  .vl-pcard { padding:22px; }
  .vl-pcard.main { padding:21px; }
  .vl-pilot { padding:18px 20px; }
  .vl-pilot .vl-btn { width:100%; }
}
.vl-safe { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:36px; }
.vl-safe > div { border-left:2px solid var(--key); padding:4px 0 4px 14px; }
.vl-safe b { font-size:16px; letter-spacing:-.02em; }
.vl-safe p { margin:2px 0 0; font-size:14px; color:var(--g1); line-height:1.55; }
@media (max-width: 760px) { .vl-safe { grid-template-columns:1fr; gap:14px; margin-top:28px; } }
.vl-pcard { border:1px solid var(--line); border-radius:16px; padding:26px; display:flex; flex-direction:column; gap:10px; background:var(--white); transition:border-color .25s, transform .25s; }
.vl-pcard:hover { border-color:var(--ink); transform:translateY(-3px); }
.vl-pcard.main { border:2px solid var(--key); padding:25px; }
.vl-pcard.main { position:relative; overflow:hidden; }
.vl-pcard.main::after { content:""; position:absolute; top:0; bottom:0; left:-60%; width:40%; background:linear-gradient(100deg, transparent, rgba(47,91,255,.07), transparent); transform:skewX(-12deg); animation:vlSheen 6s ease-in-out infinite; pointer-events:none; }
@keyframes vlSheen { 0%, 55% { left:-60%; } 100% { left:130%; } }
.vl-pcard .k { font-size:15px; font-weight:700; }
.vl-pcard .price { font-size:32px; font-weight:700; letter-spacing:-.035em; font-variant-numeric:tabular-nums; }
.vl-pcard .price small { font-size:14px; font-weight:400; color:var(--g2); letter-spacing:0; }
.vl-pcard .d { color:var(--g1); font-size:15px; line-height:1.65; flex:1; }
.vl-path { margin-top:28px; padding:18px 22px; border-radius:16px; border:1.5px solid var(--key); background:#fff; }
.vl-path .tag { display:inline-block; font-size:12px; font-weight:700; letter-spacing:.04em; color:var(--key); }
.vl-path ol { list-style:none; margin:10px 0 0; padding:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; counter-reset:p; }
.vl-path li { counter-increment:p; font-size:14px; color:var(--g1); line-height:1.55; }
.vl-path li b { display:block; font-size:16px; color:var(--ink, #0A0A0B); }
.vl-path li b::before { content:counter(p) ". "; color:var(--key); }
@media (max-width: 760px) { .vl-path ol { grid-template-columns:1fr; gap:10px; } }
.vl-more { margin-top:16px; }
.vl-more > summary { cursor:pointer; font-size:14.5px; font-weight:600; color:var(--key); padding:8px 0; }
.vl-team { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:32px; }
.vl-team > div { border-top:2px solid var(--ink); padding-top:12px; }
.vl-team b { font-size:15px; }
.vl-team p { margin:6px 0 0; font-size:15px; color:var(--g1); line-height:1.65; }
@media (max-width: 900px) { .vl-team { grid-template-columns:1fr 1fr; } }
@media (max-width: 560px) { .vl-team { grid-template-columns:1fr; gap:18px; margin-top:24px; } }
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
.vl-form input, .vl-form textarea, .vl-form select { width:100%; background:#0A0A0B; border:1px solid rgba(255,255,255,.16); color:#fff; border-radius:10px; padding:13px 14px; font:inherit; font-size:16px; }
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
@media (prefers-reduced-motion: reduce) { .vl-marquee-track, .vl-scrollhint i, .vl-pcard.main::after, .vl-glitch { animation:none; } .vl-hero h1 .vl-grad { animation:none; background-size:100% 3px; } .vl-pcard:hover { transform:none; } }
`;

// 2026-10-26 대표 "다른 기업 IR 덱 흐름을 참고해 — IR 내용과 가격 제안이 함께". 순서는 IR 덱의 정석(문제 → 왜 지금 →
// 해결 → 기술 · 해자 → 제품 → 시장 → 비즈니스 모델 · 가격 → 경쟁 → 성과 · 로드맵 → 팀 → 문의)을 따르되,
// 고객이 읽어도 결정에 필요한 것(증거 · 받는 것 · 가격 · 신뢰 · FAQ · 무료 진단)이 빠지지 않게 끼워 넣었다.
const NAV = [
  ["#proof", "사례"],
  ["#bench", "성능"],
  ["#how", "작동 방식"],
  ["#tech", "기술"],
  ["#pricing", "가격"],
  ["#faq", "FAQ"],
];


const LAWS = ["근로기준법 제60조 연차 유급휴가", "고용보험법 제40조 구직급여 수급 요건", "최저임금법 제31조 과태료", "남녀고용평등법 제19조 육아휴직", "고용보험법 제50조 피보험기간", "근로자퇴직급여 보장법 제8조", "주택임대차보호법 제3조의2", "소득세법 제59조의4", "부가가치세법 제30조", "의료법 제27조", "국민건강보험법 제41조", "민법 제750조 불법행위"];

// 실제 감사(2026-10 · 노무 상담 AI A사)에서 찾은 오류 — 회사 이름은 동의 없이 쓰지 않는다. 마지막 장은 지어낸 인용의 예.
// 세무 장은 자체 데이터셋 TRAP-500(VL-TAX-004)에서 최신 AI가 실제로 틀린 답 — 2026-10-28 외부 점검 "예시가 전부 노무"에 대한 답.
const TRAPS = [
  { type: "숫자", title: "초단시간 근로자의 기준기간 요건", bad: "2주 소정근로일수 2일 이하", good: "1주 소정근로일수 2일 이하", law: "고용보험법 제40조 ②" },
  { type: "개정 직후", title: "방학 단기 육아휴직", bad: "연 2회 · 회당 4주", good: "연 1회 · 1~2주", law: "남녀고용평등법 제19조" },
  { type: "기간", title: "자영업자 피보험기간 합산", bad: "5년 이내", good: "3년 이내", law: "고용보험법 제50조" },
  { type: "벌칙", title: "근로감독관 검사 거부", bad: "벌금 500만 원", good: "과태료 100만 원 이하", law: "최저임금법 제31조" },
  { type: "세무 · 기한 있는 특례", title: "카드 매출 세액공제 한도", bad: "2026년까지 연 500만 원", good: "2026년까지 연 1,000만 원 · 1.3%", law: "부가가치세법 제46조" },
  { type: "없는 법 · 예시", title: "그럴듯한 가짜 고시", bad: "공정위 고시 제2019-77호가 로열티 상한을 정한다", good: "그런 고시는 없음", law: "원문 검색으로 '없음' 판정" },
];

const STEPS = [
  ["주장으로 쪼개기", "숫자 · 기간 · 조건 · 벌칙을 하나씩 떼어 냅니다."],
  ["현행 원문 가져오기", "법제처에서 오늘 시행 중인 조문을 직접 받습니다."],
  ["원문과 대조", "근거를 대지 못하는 판정은 내보내지 않습니다."],
  ["사람이 한 번 더", "감사에서는 사람이 원문을 열어 다시 확인합니다."],
  ["고친 문장과 근거", "틀린 문장은 원문 값으로, 근거는 몇 조 몇 항까지."],
];

// 고용보험법 제40조 ① · ②(2026-10-25 법령 원문으로 확인), 제48조 ①, 제58조.
const SENTENCES = [
  { text: "이직일 이전 18개월 동안 피보험 단위기간이 180일 이상이어야 합니다.", ok: true, law: "고용보험법 제40조 ①" },
  { text: "초단시간 근로자는 2주 소정근로일수가 2일 이하이면 기준기간이 24개월로 늘어납니다.", ok: false, fix: "1주 소정근로일수 2일 이하", law: "고용보험법 제40조 ②" },
  { text: "자기 사정으로 그만두면 원칙적으로 구직급여를 받을 수 없습니다.", ok: true, law: "고용보험법 제58조" },
  { text: "구직급여는 이직일 다음 날부터 12개월 안에 받아야 합니다.", ok: true, law: "고용보험법 제48조 ①" },
];

// 페르소나(노무 · 법률 AI 회사 PM)가 실제로 걸려 하는 순서대로.
const FAQ = [
  ["API 키나 내부 권한이 필요한가요?", "아니요. 일반 사용자처럼 서비스를 직접 써 보며 확인합니다. 출시 전이면 시험 계정만 주세요."],
  ["결과가 밖으로 새지 않나요?", "보고서는 비공개 링크로 귀사에만 드리고, 언제든 회수할 수 있습니다."],
  ["자체 테스트가 있는데도 필요할까요?", "자체 26문항을 모두 통과한 서비스가 함정 12문항 중 4개를 틀렸습니다. 자체 시험은 실사 · 제휴 심사에서 증빙도 되지 않습니다."],
  ["기간과 비용은요?", `무료 진단은 보통 영업일 3일입니다. 정밀 감사는 ${won(AUDIT_RATES.audit.krw)}(부가세 별도), 첫 ${AUDIT_PILOT_SEATS}곳은 ${won(AUDIT_RATES.audit_pilot.krw)}입니다.`],
  ["베리라인이 틀리면요?", "베리라인이 원문으로 고친 부분(판정 영수증이 있는 부분)이 원문과 다르면 이용료를 환불하고 정정 보고서를 드립니다. 확인하지 못한 부분은 결과에 그렇게 적습니다."],
];

const DIAG_STEPS = [
  ["주소를 남기세요", "서비스 주소와 연락처면 충분합니다."],
  ["직접 써 봅니다", "함정 질문을 넣고, 답을 원문과 맞춰 봅니다."],
  ["요약을 받으세요", "틀린 곳과 근거 조문을 영업일 3일 안에 드립니다. 깨끗하면 도입을 권하지 않습니다."],
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
      {typeof title === "string" ? <MaskWords as="h2" className="vl-h2" text={title} /> : <h2 className="vl-h2">{title}</h2>}
      {lede && <p className="vl-lede">{lede}</p>}
    </Reveal>
  );
}

export default function BusinessPage() {
  useStableVh();
  const [quote, setQuote] = useState(initialQuote);
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [showAudit, setShowAudit] = useState(false);
  const [pilot, setPilot] = useState(null);
  const [solid, setSolid] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    fetch(`${API_ORIGIN}/api/b2b/seats`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPilot(d.pilot)).catch(() => {});
  }, []);
  // 메뉴는 히어로를 지나면 흰 면으로.
  // 2026-10-28: 휴대폰 하단 고정 버튼을 뺐다 — 상단 메뉴의 "무료 진단 받기"와 겹쳤고(외부 점검: CTA가 여러 번),
  // 스크롤할 때마다 고정 구간 위치를 재느라 휴대폰 스크롤이 무거웠다. 이제 스크롤마다 하는 일은 scrollY 비교 하나다.
  useEffect(() => {
    let h = heroRef.current?.offsetHeight || 600;
    const on = () => setSolid(window.scrollY > h - 72);
    const re = () => { h = heroRef.current?.offsetHeight || 600; on(); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", re);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", re); };
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
            {/* 2026-10-28: 실제 검증 성숙도대로 표기한다(외부 점검 — 헤드라인이 실제 범위보다 넓다는 지적) */}
            <Reveal><div className="vl-badge"><b>ENGINE 3.1</b><span>노무 정식 · 법률 · 세무 베타 · 의료 준비 중</span></div></Reveal>
            <SplitWords as="h1" text={"AI 답이 나가기 전, \n 마지막 검증선."} accent={[5, 6]} accentClass="vl-grad" delay={0.1} />
            <Reveal delay={0.5}>
              {/* 2026-10-28: "책임집니다"를 계약상 한도가 보이는 문장으로(사업 진단 — 무한책임으로 읽힐 소지). 범위는 판정 영수증과 기업 이용 조건 제10조의2 */}
              <p className="vl-promise">AI 답변, 베리라인으로 걸러내세요.<br /><b>베리라인이 고친 부분이 원문과 다르면, 이용료를 돌려드리고 정정 보고서를 드립니다.</b></p>
              <p className="lead">틀린 법 안내 한 줄이 소송이 됩니다. 베리라인이 원문과 맞춰 보고 고쳐 드립니다.</p>
              <div className="ctas">
                <a className="vl-btn key" href="#diagnosis" onClick={toDiag}>우리 AI 무료 진단 받기 <span className="arr">→</span></a>
                <a className="vl-btn line-dark" href="#how">작동 방식 보기</a>
              </div>
              <div className="vl-techrow" aria-label="검증 방식">
                <span><i />법제처 현행 조문</span>
                <span><i />벌칙 · 위임 지도</span>
                <span><i />코드 판정</span>
                <span><i />SHA-256 영수증</span>
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


      {/* ── 2. 증거: 정말 틀리나(30초) ── */}
      <section className="vl-sec" id="proof">
        <div className="vl-wrap">
          <Head eyebrow="실제 감사 · 노무 상담 AI A사" title="자체 점검은 통과. 함정 질문에선 4개를 틀렸습니다." />
          <Reveal className="vl-proof">
            <div><small>A사가 만든 점검 26문항</small><b>26 / 26</b><em>모두 통과</em><CellGrid total={26} /></div>
            <div><small>베리라인 함정 12문항</small><b className="key"><CountUp to={4} suffix="개" /></b><em>틀림 · 3개 중 1개꼴</em><CellGrid total={12} hits={4} /></div>
            {/* 2026-10-27: 예전 "감사 3회 · 28건"은 24건이 모델 시범 감사(고객 서비스 아님)라 고객 사례 옆에 두지 않는다 */}
            <div><small>찾은 오류, 사람이 원문으로 재확인</small><b>4 / 4</b><em>모두 조문 링크로 확인</em><CellGrid total={4} hits={4} /></div>
          </Reveal>
          <Reveal><p className="vl-quote">회사가 만든 시험은 회사에 유리합니다. <span>AI가 무너지는 자리를 묻지 않으니까요.</span></p></Reveal>
        </div>
      </section>

      {/* ── 2-1. 성능: 자체 데이터셋 · 정확도 · 가격 ── */}
      <section className="vl-sec off" id="bench">
        <div className="vl-wrap">
          <Head eyebrow="성능 · 자체 데이터셋" title="최신 AI가 틀린 505문항으로 단련했습니다" lede="숫자는 모두 실제로 잰 값입니다." />
          <BenchBoard onTry={toDiag} />
        </div>
      </section>


      {/* ── 3. 어디서 틀리나: 함정 유형(가로 레일, 오른쪽 → 왼쪽) ── */}
      <section id="cases" style={{ scrollMarginTop: 64 }}>
        <HorizontalRail title={<div className="vl-wrap"><Head eyebrow="AI가 무너지는 자리" title="AI가 틀리는 자리는 정해져 있습니다" lede="개정 직후, 숫자, 기간, 벌칙. 거기를 묻습니다. (현행 원문은 2026.10.28 기준)" /></div>}>
          {TRAPS.map((t, i) => (
            <article key={t.title} className="vl-trap">
              <div className="type">{t.type}</div>
              <h3>{t.title}</h3>
              <div className="row"><span>AI 답</span><s className="vl-glitch" style={{ animationDelay: `${1.2 + i * 0.9}s` }}>{t.bad}</s></div>
              <div className="row"><span>현행 원문</span><span className="right">{t.good}</span></div>
              <div className="law">§ {t.law}</div>
            </article>
          ))}
          <article className="vl-trap end">
            <h3>귀사 AI는 여기서 뭐라고 답할까요?</h3>
            <p>주소만 남기세요. 먼저 확인해 드립니다.</p>
            <a className="vl-btn key" href="#diagnosis" onClick={toDiag} style={{ alignSelf: "flex-start", marginTop: 8 }}>무료 진단 받기 <span className="arr">→</span></a>
          </article>
        </HorizontalRail>
      </section>

      {/* ── 4. 어떻게 잡나: 검증 과정(스크롤 이야기) ── */}
      <section className="vl-sec off" id="how" style={{ paddingBottom: 0 }}>
        <div className="vl-wrap">
          <Head eyebrow="작동 방식" title="한 문장씩, 원문과 맞춰 봅니다" lede="스크롤해 보세요. 실제 노무 상담 답변 하나가 검증됩니다." />
        </div>
        <VerifyStory steps={STEPS} question="초단시간으로 일하다 그만뒀는데 실업급여를 받을 수 있나요?" sentences={SENTENCES} />
        <div style={{ height: "clamp(64px,8vw,120px)" }} />
      </section>

      {/* ── IR 4. 기술 · 해자 ── */}
      <section className="vl-sec dark" id="tech">
        <div className="vl-wrap">
          <Head dark eyebrow="기술 · 엔진 3.0" title="판정은 AI가 아니라 원문과 코드가 합니다" />
          <Reveal><EnginePipeline /></Reveal>
        </div>
      </section>




      {/* ── 8. 요금 ── */}
      <section className="vl-sec off" id="pricing">
        <div className="vl-wrap">
          <Head eyebrow="가격" title="감사로 시작해, 구독으로" lede="부가세 별도." />
          {/* 사기 전에 걸리는 세 가지(손해 볼까 · 틀리면 · 비쌀까)를 가격 바로 위에서 먼저 지운다 */}
          <Reveal className="vl-safe">
            <div><b>무료 진단부터</b><p>깨끗하면 도입을 권하지 않습니다.</p></div>
            <div><b>고친 부분은 환불 보증</b><p>원문과 다르면 그 건 이용료 환불 + 정정 보고서.</p></div>
            <div><b>API 매달 {API_RATES.trial.calls}건 무료</b><p>가입만 하면 개발팀이 먼저 붙여 봅니다.</p></div>
          </Reveal>
          <Reveal className="vl-path">
            <span className="tag">처음이면 이 순서</span>
            <ol><li><b>무료 진단</b>함정 질문 몇 개로 귀사 AI를 먼저 봅니다</li><li><b>파일럿 감사</b>{pilot !== 0 ? `첫 ${AUDIT_PILOT_SEATS}곳 ${won(AUDIT_RATES.audit_pilot.krw)}` : `정밀 감사 ${won(AUDIT_RATES.audit.krw)}`} · 보고서와 30분 설명</li><li><b>정기 감사 또는 API</b>법이 바뀔 때마다 · 답변마다</li></ol>
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
              <div><b>첫 {AUDIT_PILOT_SEATS}곳 파일럿 — 정밀 감사 {won(AUDIT_RATES.audit_pilot.krw)}{pilot != null ? ` · 남은 자리 ${pilot}` : ""}</b><p>범위는 같고, 조건은 30분 피드백 통화 하나.</p></div>
              <button type="button" className="vl-btn key sm" onClick={() => setQuote("audit_pilot")}>파일럿으로 신청</button>
            </Reveal>
          )}
          <h3 className="vl-subh">검증 API</h3>
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
          <p className="vl-note">개발팀이 먼저 붙여 보려면 <a href={`${PERSONAL_URL}?open=api`}>가입하고 체험 키 받기</a>(매달 {API_RATES.trial.calls}건 무료) · <a href={`${YUME_URL}/docs/api`}>API 문서</a></p>
          <h3 className="vl-subh">구매 · 계약 서류</h3>
          <div className="vl-docs">
            <button type="button" onClick={() => setQuote("audit")}><b>견적서 바로 받기</b><span>A4 견적서가 바로 나옵니다</span></button>
            <a href={`${YUME_URL}/b2b/terms`} target="_blank" rel="noreferrer"><b>기업 서비스 이용 조건</b><span>책임 범위 · 해지 · 비밀 유지</span></a>
            <a href={`${YUME_URL}/b2b/dpa`} target="_blank" rel="noreferrer"><b>데이터 처리 부속서</b><span>개인정보 처리 위탁 표준본</span></a>
            <a href={`${YUME_URL}/b2b/security`} target="_blank" rel="noreferrer"><b>보안 설명서</b><span>데이터를 어떻게 다루는지</span></a>
          </div>
        </div>
      </section>




      {/* ── 9-1. 누가 만드나 — 2026-10-28 외부 점검: 익명 사례 하나로는 약하다, 법률 · 의료 고객은 누가 만들었는지를 본다.
             지킬 수 있는 사실만 적는다(이력은 리머 소개와 같은 내용, 실명 사례는 동의를 받는 대로). */}
      <section className="vl-sec" id="team">
        <div className="vl-wrap">
          <Head eyebrow="만든 곳" title="누가, 왜, 어떻게 만드는지" />
          <Reveal className="vl-team">
            <div><b>운영</b><p>{BUSINESS.name}({BUSINESS.nameEn}) · 대표 {BUSINESS.ceo}<br />사업자등록번호 {BUSINESS.regNo}</p></div>
            <div><b>대표</b><p>한국디지털미디어고 해킹방어과 · 중앙대 전자전기공학부 · 한국정보올림피아드 전국 2위</p></div>
            <div><b>시작한 이유</b><p>AI가 알려 준 잘못된 법 정보를 믿었다가 실제로 손해를 본 뒤 만들기 시작했습니다.</p></div>
            <div><b>만드는 방식</b><p>AI로 빠르게 만들고, 판정은 법령 원문과 코드가 하고, 찾은 오류는 사람이 원문으로 다시 확인합니다.</p></div>
          </Reveal>
          <p className="vl-note">고객사 실명 사례는 서면 동의를 받는 대로 공개합니다. 지금 공개한 A사 사례는 회사 이름만 가린 실제 감사 결과입니다.</p>
        </div>
      </section>

      {/* ── 10. 자주 묻는 질문 ── */}
      <section className="vl-sec" id="faq">
        <div className="vl-wrap">
          <Head eyebrow="자주 묻는 질문" title="도입 전에 묻는 것들" />
          <Reveal className="vl-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </Reveal>
        </div>
      </section>

      {/* ── 11. 무료 진단(이 자리에서 바로 신청) ── */}
      <section className="vl-sec dark" id="diagnosis">
        <div className="vl-wrap vl-diag">
          <div>
            <Head dark eyebrow="무료 진단" title="귀사 AI가 어디서 틀리는지, 먼저 보세요" lede="무료입니다. API 키도, 결재도 필요 없습니다." />
            <Reveal>
              <ol className="vl-diag-steps">
                {DIAG_STEPS.map(([k, v], i) => <li key={k}><span className="n">{String(i + 1).padStart(2, "0")}</span><div><b>{k}</b><p>{v}</p></div></li>)}
              </ol>
              <p className="vl-note" style={{ color: "#8E8E97" }}>투자 · 제휴 문의는 {VERILINE_EMAIL}로 보내 주세요.</p>
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
              <a href={`mailto:${VERILINE_EMAIL}`}>{VERILINE_EMAIL}</a>
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
            <div>이메일 {VERILINE_EMAIL}</div>
            <div>{COMPLAINT_NOTICE} {COMPLAINT_OFFICER}</div>
            {/* 2026-10-28 외부 점검 "도메인이 둘로 나뉘어 브랜드가 흐려진다" — 같은 회사의 같은 엔진임을 밝힌다 */}
            <div style={{ marginTop: 8 }}>veriline.kr은 기업용, www.yume-reamer.com은 같은 엔진의 개인용 검사 · API 문서 · 약관 사이트입니다. 두 곳 모두 리머(REAMER)가 운영합니다.</div>
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
