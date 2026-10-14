// AI 본사(/admin/staff) — 대표가 AI 직원을 사람 직원처럼 관리하는 화면.
//
// 세 화면: 결재함(기안서 + 결재란 도장) · 조직도(팀별 직원 카드, 근무 상태가 살아 움직임) · 업무 일지.
// 대표가 할 일은 결재뿐이라 결재함이 첫 화면이다. 휴대폰에서 결재하는 경우가 많아 좁은 화면을 먼저 생각했다.
// 데이터는 /api/admin/staff 하나에서 받는다(15초마다 새로 고침, 열어 둔 결재 문서의 입력은 지우지 않는다).

const CSS = `
:root {
  --bg:#F3F2F8; --panel:#FFFFFF; --panel2:#F8F7FC; --ink:#191726; --ink2:#55506A; --ink3:#8F89A6;
  --line:rgba(40,30,80,.10); --line2:rgba(40,30,80,.18); --accent:#5B3FA0; --accent2:#7B5FD0; --accent-soft:rgba(91,63,160,.09);
  --seal:#C8322B; --ok:#1F8A5B; --ok-soft:rgba(31,138,91,.10); --warn:#A86A12; --warn-soft:rgba(220,150,30,.13); --bad:#C2410C; --bad-soft:rgba(194,65,12,.09);
  --shadow:0 1px 2px rgba(20,10,50,.05),0 10px 30px rgba(20,10,50,.07); --radius:16px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#0E0D14; --panel:#17151F; --panel2:#1D1B27; --ink:#EDEBF5; --ink2:#B6B1C9; --ink3:#7E7995;
    --line:rgba(255,255,255,.08); --line2:rgba(255,255,255,.16); --accent:#A48CEB; --accent2:#C2B2F5; --accent-soft:rgba(164,140,235,.12);
    --seal:#EF5B52; --ok:#3CC48A; --ok-soft:rgba(60,196,138,.12); --warn:#E8B04A; --warn-soft:rgba(232,176,74,.12); --bad:#F2784B; --bad-soft:rgba(242,120,75,.12);
    --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 34px rgba(0,0,0,.35); color-scheme: dark; }
}
* { box-sizing:border-box; }
html, body { margin:0; background:var(--bg); color:var(--ink); }
body { font-family:'Pretendard Variable','Noto Sans KR',-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif; font-size:14.5px; line-height:1.6; word-break:keep-all; -webkit-font-smoothing:antialiased; }
button, input, select, textarea { font:inherit; color:inherit; }
a { color:var(--accent); }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
.num { font-variant-numeric:tabular-nums; }

/* ── 상단 ── */
.top { position:sticky; top:0; z-index:20; background:color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter:saturate(1.4) blur(14px); border-bottom:1px solid var(--line); }
.top .in { max-width:1240px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.brand { display:flex; align-items:center; gap:10px; margin-right:auto; }
.logo { width:34px; height:34px; border-radius:10px; background:conic-gradient(from 210deg, #5B3FA0, #8C6BE0, #E58A5C, #5B3FA0); display:grid; place-items:center; color:#fff; font-weight:900; font-size:15px; box-shadow:0 4px 14px rgba(91,63,160,.35); }
.brand b { font-size:16px; letter-spacing:-.01em; display:block; line-height:1.2; }
.brand small { color:var(--ink3); font-size:12px; }
.chips { display:flex; gap:6px; flex-wrap:wrap; }
.chip { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:5px 10px; border-radius:99px; background:var(--panel); border:1px solid var(--line); color:var(--ink2); white-space:nowrap; }
.chip i { width:7px; height:7px; border-radius:50%; background:var(--ok); display:inline-block; }
.chip.bad i { background:var(--bad); } .chip.warn i { background:var(--warn); }
.clock { font-size:12.5px; color:var(--ink3); }

.wrap { max-width:1240px; margin:0 auto; padding:18px 16px 80px; }
.kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
@media (max-width:760px) { .kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
.kpi { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow); position:relative; overflow:hidden; }
.kpi .l { font-size:12.5px; color:var(--ink3); font-weight:600; }
.kpi .v { font-size:30px; font-weight:850; letter-spacing:-.03em; line-height:1.15; margin-top:2px; }
.kpi .s { font-size:12px; color:var(--ink2); margin-top:2px; }
.kpi.hero { background:linear-gradient(135deg, var(--accent) 0%, #7A56C9 60%, #B56AA8 100%); color:#fff; border:0; }
.kpi.hero .l, .kpi.hero .s { color:rgba(255,255,255,.82); }
.kpi.hero::after { content:""; position:absolute; right:-30px; top:-30px; width:120px; height:120px; border-radius:50%; background:rgba(255,255,255,.10); }

.tabs { display:inline-flex; gap:4px; padding:4px; background:var(--panel); border:1px solid var(--line); border-radius:12px; margin:18px 0 14px; box-shadow:var(--shadow); }
.tabs button { border:0; background:none; padding:8px 16px; border-radius:9px; font-weight:700; color:var(--ink2); cursor:pointer; display:inline-flex; gap:7px; align-items:center; }
.tabs button[aria-selected="true"] { background:var(--ink); color:var(--panel); }
.tabs .badge { font-size:11px; background:var(--seal); color:#fff; border-radius:99px; padding:0 7px; line-height:18px; }

/* ── 결재함 ── */
.inbox { display:grid; grid-template-columns:minmax(280px,380px) minmax(0,1fr); gap:14px; align-items:start; }
@media (max-width:900px) { .inbox { grid-template-columns:1fr; } .inbox.open .list { display:none; } .inbox:not(.open) .docpane { display:none; } }
.list { display:grid; gap:8px; }
.item { text-align:left; width:100%; border:1px solid var(--line); background:var(--panel); border-radius:14px; padding:12px 14px 12px 16px; cursor:pointer; position:relative; display:grid; gap:4px; box-shadow:var(--shadow); transition:transform .12s ease, border-color .12s ease; }
.item::before { content:""; position:absolute; left:0; top:12px; bottom:12px; width:4px; border-radius:0 4px 4px 0; background:hsl(var(--h) 70% 52%); }
.item:hover { transform:translateY(-1px); border-color:var(--line2); }
.item[aria-current="true"] { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft), var(--shadow); }
.item .r1 { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--ink3); }
.item .kind { font-weight:800; color:hsl(var(--h) 60% 42%); }
@media (prefers-color-scheme: dark) { .item .kind { color:hsl(var(--h) 70% 70%); } }
.item .t { font-weight:750; font-size:14.5px; line-height:1.4; }
.item .urg { margin-left:auto; font-size:11px; font-weight:800; color:#fff; background:var(--seal); border-radius:6px; padding:1px 7px; }
.item .work { margin-left:auto; font-size:11px; font-weight:800; color:var(--warn); background:var(--warn-soft); border-radius:6px; padding:1px 7px; }
.empty { background:var(--panel); border:1px dashed var(--line2); border-radius:var(--radius); padding:34px 20px; text-align:center; color:var(--ink3); }
.empty .big { font-size:40px; margin-bottom:6px; }

.doc { background:var(--panel); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); overflow:hidden; }
.doc .back { display:none; }
@media (max-width:900px) { .doc .back { display:inline-flex; } }
.dhead { padding:20px 22px 16px; border-bottom:1px solid var(--line); display:flex; gap:18px; justify-content:space-between; flex-wrap:wrap; background:linear-gradient(180deg, var(--panel2), var(--panel)); }
.dtitle { font-size:22px; font-weight:900; letter-spacing:.42em; margin:2px 0 8px; }
.meta { display:grid; grid-template-columns:auto 1fr; gap:2px 12px; font-size:12.5px; color:var(--ink2); }
.meta dt { color:var(--ink3); }
.meta dd { margin:0; font-weight:600; }
table.line { border-collapse:collapse; align-self:flex-start; }
table.line th, table.line td { border:1px solid var(--line2); text-align:center; padding:0; }
table.line th { font-size:11.5px; font-weight:700; color:var(--ink2); background:var(--panel2); padding:4px 10px; min-width:76px; }
table.line td.stamp { height:76px; }
table.line td.nm { font-size:11.5px; color:var(--ink2); padding:4px 6px; }
.seal { width:56px; height:56px; margin:0 auto; border:2.5px solid var(--seal); border-radius:50%; color:var(--seal); display:grid; place-items:center; font-weight:900; font-size:12.5px; line-height:1.1; transform:rotate(-14deg); opacity:.9; box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--seal) 20%, transparent); }
.seal small { display:block; font-size:9.5px; font-weight:700; }
.seal.wait { border-style:dashed; border-color:var(--line2); color:var(--ink3); transform:none; box-shadow:none; font-weight:600; font-size:11px; }
.seal.pop { animation:pop .5s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes pop { 0% { transform:scale(2.2) rotate(-14deg); opacity:0; } 100% { transform:scale(1) rotate(-14deg); opacity:.9; } }
.dbody { padding:18px 22px 6px; display:grid; gap:14px; }
.subject { font-size:18px; font-weight:800; letter-spacing:-.01em; }
.summary { white-space:pre-wrap; background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:12px 14px; font-size:13.5px; color:var(--ink2); }
.sec h4 { margin:0 0 8px; font-size:13px; color:var(--ink3); font-weight:700; letter-spacing:.02em; }
.cands, .finds, .qs { display:grid; gap:8px; }
.cand { display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:start; border:1px solid var(--line); border-radius:12px; padding:10px 12px; }
.cand b { font-size:14.5px; } .cand .u { font-size:12.5px; overflow-wrap:anywhere; } .cand .w { font-size:13px; color:var(--ink2); }
.find { border:1px solid var(--line); border-radius:12px; padding:12px; display:grid; gap:6px; }
.find .q { font-size:12.5px; color:var(--ink3); }
.said { font-size:13.5px; padding:8px 10px; border-radius:9px; background:var(--bad-soft); }
.said b, .off b { font-size:11px; display:block; color:var(--ink3); margin-bottom:2px; }
.off { font-size:13px; padding:8px 10px; border-radius:9px; background:var(--ok-soft); white-space:pre-wrap; max-height:180px; overflow:auto; }
.find .ctl { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.seg { display:inline-flex; border:1px solid var(--line2); border-radius:9px; overflow:hidden; }
.seg button { border:0; background:none; padding:5px 10px; font-size:12.5px; font-weight:700; color:var(--ink2); cursor:pointer; }
.seg button[aria-pressed="true"] { background:var(--ink); color:var(--panel); }
.qs ol { margin:0; padding-left:22px; display:grid; gap:4px; font-size:13.5px; }
.field { display:grid; gap:5px; font-size:12.5px; font-weight:700; color:var(--ink2); }
.field input, .field textarea { padding:10px 12px; border-radius:10px; border:1px solid var(--line2); background:var(--panel); font-size:14.5px; font-weight:500; }
.field textarea { min-height:220px; resize:vertical; line-height:1.7; font-family:inherit; }
.mailcard { border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.mailcard .mh { padding:10px 12px; background:var(--panel2); font-size:12.5px; color:var(--ink2); display:grid; gap:2px; }
.mailcard .mh b { color:var(--ink); font-size:14px; }
.mailcard .mb { padding:12px; font-size:13.5px; white-space:pre-wrap; max-height:260px; overflow:auto; }
.readbtn { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 16px; border-radius:14px; background:linear-gradient(135deg, var(--accent-soft), transparent); border:1px solid color-mix(in srgb, var(--accent) 30%, transparent); text-decoration:none; color:var(--ink); }
.readbtn b { font-size:15px; } .readbtn span { font-size:12.5px; color:var(--ink2); } .readbtn i { font-style:normal; font-weight:800; color:var(--accent); white-space:nowrap; }
.checks { display:grid; gap:6px; }
.checks label { display:flex; gap:9px; align-items:flex-start; font-size:13.5px; padding:9px 11px; border:1px solid var(--line); border-radius:10px; cursor:pointer; }
.checks input { margin-top:3px; accent-color:var(--accent); width:16px; height:16px; }
iframe.preview { width:100%; height:620px; border:1px solid var(--line); border-radius:12px; background:#F4F2F8; }
.money { font-size:30px; font-weight:900; letter-spacing:-.02em; }
.verdict { display:inline-block; font-weight:800; padding:3px 10px; border-radius:8px; font-size:13px; }
.verdict.ok { background:var(--ok-soft); color:var(--ok); } .verdict.prohibited { background:var(--bad-soft); color:var(--bad); } .verdict.unclear { background:var(--warn-soft); color:var(--warn); }
.dfoot { position:sticky; bottom:0; padding:14px 22px; border-top:1px solid var(--line); background:color-mix(in srgb, var(--panel) 92%, transparent); backdrop-filter:blur(8px); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dfoot .msg { font-size:13px; color:var(--bad); margin-right:auto; }
.btn { border:0; border-radius:11px; padding:10px 18px; font-weight:800; cursor:pointer; display:inline-flex; gap:6px; align-items:center; text-decoration:none; font-size:14px; }
.btn.primary { background:var(--accent); color:#fff; box-shadow:0 6px 16px color-mix(in srgb, var(--accent) 35%, transparent); }
.btn.primary:hover { filter:brightness(1.06); }
.btn.ghost { background:var(--accent-soft); color:var(--accent); }
.btn.plain { background:none; color:var(--ink2); border:1px solid var(--line2); }
.btn.sm { padding:6px 11px; font-size:12.5px; border-radius:9px; }
.btn[disabled] { opacity:.55; cursor:progress; }

/* ── 조직도 ── */
.org { display:grid; gap:0; }
.ceo { justify-self:center; display:flex; gap:12px; align-items:center; background:var(--ink); color:var(--panel); border-radius:18px; padding:12px 20px 12px 12px; box-shadow:var(--shadow); position:relative; }
.ceo .av { width:46px; height:46px; font-size:17px; }
.ceo b { font-size:16px; display:block; } .ceo small { opacity:.75; font-size:12px; }
.ceo .pend { margin-left:10px; background:var(--seal); color:#fff; font-weight:800; font-size:12px; padding:3px 10px; border-radius:99px; }
.stem { width:2px; height:26px; background:var(--line2); justify-self:center; }
.teams { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; position:relative; padding-top:22px; }
.teams::before { content:""; position:absolute; top:0; left:10%; right:10%; height:2px; background:var(--line2); }
@media (max-width:1100px) { .teams { grid-template-columns:repeat(2,minmax(0,1fr)); } .teams::before { display:none; } }
@media (max-width:620px) { .teams { grid-template-columns:1fr; } }
.team { display:grid; gap:10px; align-content:start; position:relative; }
.team::before { content:""; position:absolute; top:-22px; left:50%; width:2px; height:22px; background:var(--line2); }
@media (max-width:1100px) { .team::before { display:none; } }
.thead { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:12px; background:hsl(var(--h) 80% 50% / .10); color:hsl(var(--h) 60% 36%); font-weight:850; font-size:13.5px; }
@media (prefers-color-scheme: dark) { .thead { color:hsl(var(--h) 75% 72%); background:hsl(var(--h) 60% 50% / .14); } }
.thead span { margin-left:auto; font-weight:700; font-size:12px; opacity:.8; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); padding:14px; box-shadow:var(--shadow); display:grid; gap:10px; position:relative; }
.card.off { opacity:.62; }
.who { display:flex; gap:11px; align-items:center; }
.av { width:44px; height:44px; flex:none; border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:850; font-size:16px; position:relative;
  background:linear-gradient(140deg, hsl(var(--h) 85% 64%), hsl(calc(var(--h) + 32) 70% 46%)); box-shadow:0 4px 12px hsl(var(--h) 70% 45% / .35); }
.av .dot { position:absolute; right:-1px; bottom:-1px; width:13px; height:13px; border-radius:50%; border:2.5px solid var(--panel); background:var(--ink3); }
.st-working .av { animation:ring 1.6s ease-out infinite; }
@keyframes ring { 0% { box-shadow:0 0 0 0 hsl(var(--h) 80% 55% / .55); } 100% { box-shadow:0 0 0 12px hsl(var(--h) 80% 55% / 0); } }
.st-working .dot { background:var(--ok); } .st-idle .dot { background:#66B48C; } .st-waiting .dot { background:var(--warn); } .st-error .dot, .st-engine .dot { background:var(--bad); } .st-off .dot { background:var(--ink3); }
.who b { font-size:15px; display:block; line-height:1.25; } .who small { color:var(--ink3); font-size:12px; }
.lead-tag { font-size:10.5px; font-weight:800; color:var(--accent); background:var(--accent-soft); border-radius:5px; padding:0 5px; margin-left:4px; vertical-align:2px; }
.duty { font-size:12.5px; color:var(--ink2); line-height:1.5; }
.status { display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; }
.status .pill { border-radius:99px; padding:2px 9px; background:var(--panel2); border:1px solid var(--line); }
.st-working .status .pill { color:var(--ok); border-color:color-mix(in srgb, var(--ok) 35%, transparent); background:var(--ok-soft); }
.st-waiting .status .pill { color:var(--warn); background:var(--warn-soft); border-color:transparent; }
.st-error .status .pill, .st-engine .status .pill { color:var(--bad); background:var(--bad-soft); border-color:transparent; }
.note { font-size:12.5px; color:var(--ink2); background:var(--panel2); border-radius:9px; padding:7px 9px; min-height:32px; }
.stats { display:flex; flex-wrap:wrap; gap:2px 12px; font-size:12px; color:var(--ink3); }
.stats .when { flex-basis:100%; }
.stats b { color:var(--ink); font-size:13px; }
.ctls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-top:1px dashed var(--line); padding-top:10px; }
.sw { position:relative; width:40px; height:23px; border-radius:99px; background:var(--line2); border:0; cursor:pointer; flex:none; transition:background .15s; }
.sw::after { content:""; position:absolute; top:3px; left:3px; width:17px; height:17px; border-radius:50%; background:#fff; transition:transform .15s; box-shadow:0 1px 3px rgba(0,0,0,.25); }
.sw[aria-checked="true"] { background:var(--ok); } .sw[aria-checked="true"]::after { transform:translateX(17px); }
.ctls .grow { margin-left:auto; }
.hint { font-size:11.5px; color:var(--ink3); }

/* ── 오늘 할 일(대표 투두) — 결재(보라·기안서)와 다른 청록·체크리스트 ── */
:root { --todo:#0F8C7E; --todo-soft:rgba(15,140,126,.10); }
@media (prefers-color-scheme: dark) { :root { --todo:#3FD1BE; --todo-soft:rgba(63,209,190,.12); } }
.kpi.todo-kpi { background:linear-gradient(135deg, #0F8C7E, #1FA9A0 70%, #6BC7A8); color:#fff; border:0; }
.kpi.todo-kpi .l, .kpi.todo-kpi .s { color:rgba(255,255,255,.85); }
.tabs .badge.todo-badge { background:var(--todo); }
.todos { background:var(--panel); border:1px solid var(--line); border-top:4px solid var(--todo); border-radius:18px; box-shadow:var(--shadow); padding:18px 20px 20px; }
.thead2 { display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px; }
.thead2 h2 { margin:0; font-size:20px; color:var(--todo); letter-spacing:-.01em; }
.thead2 p { margin:4px 0 0; font-size:13px; color:var(--ink2); max-width:520px; }
.tadd { display:flex; gap:6px; flex-wrap:wrap; }
.tadd input { padding:8px 10px; border-radius:9px; border:1px solid var(--line2); background:var(--panel); font-size:13.5px; }
.tadd input#tadd-title { min-width:min(260px, 100%); }
.tadd .btn.primary { background:var(--todo); box-shadow:0 6px 16px color-mix(in srgb, var(--todo) 30%, transparent); }
.tlist { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
.todo { display:grid; grid-template-columns:34px 1fr; gap:10px; padding:12px 6px; border-bottom:1px dashed var(--line2); align-items:start; transition:opacity .3s; }
.todo:last-child { border-bottom:0; }
.tcheck { width:26px; height:26px; margin-top:1px; border-radius:50%; border:2px solid var(--todo); background:var(--panel); cursor:pointer; display:grid; place-items:center; padding:0; }
.tcheck span { width:10px; height:6px; border-left:2.5px solid transparent; border-bottom:2.5px solid transparent; transform:rotate(-45deg) translate(1px,-1px); }
.tcheck:hover span { border-color:var(--todo); }
.todo.checking .tcheck { opacity:.6; cursor:progress; }
.todo.done .tcheck { background:var(--todo); } .todo.done .tcheck span { border-color:#fff; }
.todo.done .ttitle { text-decoration:line-through; color:var(--ink3); }
.ttitle { font-weight:750; font-size:15px; line-height:1.45; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.tage { font-size:11px; font-weight:800; color:var(--warn); background:var(--warn-soft); border-radius:6px; padding:0 6px; }
.tauto { font-size:11px; font-weight:700; color:var(--todo); background:var(--todo-soft); border-radius:6px; padding:0 6px; }
.tsteps { margin-top:4px; font-size:13px; color:var(--ink2); }
.tsteps summary { cursor:pointer; color:var(--todo); font-weight:700; font-size:12.5px; }
.tsteps div { white-space:pre-wrap; margin-top:6px; background:var(--panel2); border-radius:9px; padding:9px 11px; line-height:1.7; }
.tacts { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:8px; }
.tmsg { font-size:12.5px; color:var(--bad); margin-top:4px; }
.tnext-h { font-size:13px; color:var(--ink3); margin:18px 0 6px; }
.tnext { list-style:none; margin:0; padding:0; display:grid; gap:4px; font-size:13px; color:var(--ink2); }
.tnext b { color:var(--todo); font-variant-numeric:tabular-nums; margin-right:6px; }

/* ── 업무 일지 ── */
.log { background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); padding:6px 0; }
.lrow { display:grid; grid-template-columns:40px 1fr auto; gap:10px; padding:10px 16px; align-items:start; border-bottom:1px solid var(--line); }
.lrow:last-child { border-bottom:0; }
.lrow .av { width:32px; height:32px; font-size:13px; }
.lrow .who2 { font-size:12px; color:var(--ink3); }
.lrow .tt { font-size:14px; font-weight:650; }
.lrow.warn .tt { color:var(--warn); } .lrow.error .tt { color:var(--bad); }
.lrow time { font-size:12px; color:var(--ink3); white-space:nowrap; }
.lrow details { font-size:12.5px; color:var(--ink2); white-space:pre-wrap; }
.lrow summary { cursor:pointer; color:var(--accent); font-size:12px; }

.toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%) translateY(20px); background:var(--ink); color:var(--panel); padding:11px 18px; border-radius:12px; font-weight:700; font-size:14px; opacity:0; transition:all .25s; z-index:50; max-width:calc(100vw - 32px); box-shadow:var(--shadow); }
.toast.on { opacity:1; transform:translateX(-50%) translateY(0); }
.banner { border-radius:14px; padding:12px 14px; margin-bottom:12px; font-size:13.5px; background:var(--warn-soft); color:var(--ink); border:1px solid color-mix(in srgb, var(--warn) 30%, transparent); }
@media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
`;

// 화면 스크립트 — 서버 템플릿 안에 들어가므로 백틱과 템플릿 치환을 쓰지 않는다.
const SCRIPT = String.raw`
(function () {
  var S = { data: null, tab: "inbox", sel: null, inputs: {}, busy: false };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var won = function (n) { return Math.round(Number(n) || 0).toLocaleString("ko-KR") + "원"; };
  var ago = function (t) { if (!t) return ""; var s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전"; if (s < 86400) return Math.floor(s / 3600) + "시간 전"; return Math.floor(s / 86400) + "일 전"; };
  var kst = function (t) { var d = new Date(Number(t) + 9 * 3600000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
  var teamHue = function (team) { return (S.data && S.data.teams[team] ? S.data.teams[team].hue : 268); };
  var staffById = function (id) { return (S.data ? S.data.staff : []).find(function (s) { return s.id === id; }); };
  var avatar = function (name, hue, cls) { return '<span class="av ' + (cls || "") + '" style="--h:' + hue + '">' + esc(String(name || "?").slice(0, 1)) + '<i class="dot"></i></span>'; };
  var STATUS = { working: "근무 중", idle: "대기", waiting: "결재 대기", error: "문제 있음", engine: "엔진 멈춤", off: "쉬는 중" };

  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("on"); }, 2600); }
  async function api(path, body) {
    var r = await fetch("/api/admin" + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || "실패했어요");
    return d;
  }

  // ── 상단 ──
  function renderTop() {
    var d = S.data, s = d.summary;
    var eng = s.engine && s.engine.ok ? '<span class="chip"><i></i>검사 엔진 정상</span>' : '<span class="chip bad"><i></i>엔진 멈춤 · 충전 필요</span>';
    var mail = s.outreachReady ? '<span class="chip"><i></i>유메 메일 발송 가능</span>' : '<span class="chip warn"><i></i>유메 메일 인증 전</span>';
    var inbox = s.gmail ? '<span class="chip"><i></i>메일함 연결됨</span>' : '<span class="chip warn"><i></i>메일함 연결 전</span>';
    var field = s.fieldAgent ? '<span class="chip"><i></i>현장 요원(PC) 연결</span>' : '<span class="chip warn"><i></i>현장 요원(PC) 꺼짐</span>';
    $("#chips").innerHTML = eng + mail + inbox + field;
    var working = d.staff.filter(function (x) { return x.status === "working"; }).length;
    var on = d.staff.filter(function (x) { return x.enabled; }).length;
    $("#kpis").innerHTML =
      '<div class="kpi hero"><div class="l">결재 대기</div><div class="v num">' + s.pending + '</div><div class="s">' + (s.urgent ? "급한 결재 " + s.urgent + "건" : "급한 결재 없음") + "</div></div>" +
      '<div class="kpi"><div class="l">오늘 직원들이 처리한 일</div><div class="v num">' + s.doneToday + '</div><div class="s">업무 일지 기준</div></div>' +
      '<div class="kpi"><div class="l">오늘 AI 비용</div><div class="v num">' + won(s.costKrw) + '</div><div class="s">직원 업무 + 감사 채점</div></div>' +
      '<div class="kpi todo-kpi"><div class="l">오늘 할 일</div><div class="v num">' + s.todos + '</div><div class="s">대표님만 할 수 있는 일 · 출근 ' + on + "/" + d.staff.length + (working ? " · " + working + "명 근무 중" : "") + "</div></div>";
    document.querySelectorAll(".tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)); });
    $("#badge").textContent = s.pending; $("#badge").style.display = s.pending ? "" : "none";
    $("#badge2").textContent = s.todos; $("#badge2").style.display = s.todos ? "" : "none";
  }

  // ── 결재함 ──
  function lineHtml(a, approved) {
    var line = (a.payload && a.payload.line) || [];
    var th = line.map(function (p) { return "<th>" + esc(p.role) + "</th>"; }).join("");
    var st = line.map(function (p) {
      if (p.id === "ceo") return '<td class="stamp">' + (approved ? '<div class="seal pop">승인<small>' + esc(p.name) + "</small></div>" : '<div class="seal wait">결재<br>대기</div>') + "</td>";
      return '<td class="stamp"><div class="seal">' + (p.role === "기안" ? "기안" : "검토") + "<small>" + esc(p.name) + "</small></div></td>";
    }).join("");
    var nm = line.map(function (p) { return '<td class="nm">' + esc(p.team ? p.team + " " : "") + esc(p.title) + "</td>"; }).join("");
    return '<table class="line" aria-label="결재란"><tr>' + th + "</tr><tr>" + st + "</tr><tr>" + nm + "</tr></table>";
  }
  function listHtml() {
    var list = S.data.approvals;
    if (!list.length) return '<div class="empty"><div class="big">🗂️</div><b>결재할 문서가 없습니다</b><div style="margin-top:4px;font-size:13px">직원들이 일하다 대표님 결재가 필요하면 여기로 올라옵니다.</div></div>';
    return list.map(function (a) {
      var st = staffById(a.staff) || { name: a.staff, team: "office" };
      return '<button type="button" class="item" data-open="' + a.id + '" aria-current="' + String(S.sel === a.id) + '" style="--h:' + teamHue(st.team) + '">' +
        '<span class="r1"><span class="kind">' + esc(a.kindLabel) + "</span>· " + esc(st.name) + " · " + ago(a.created_at) + (a.urgent ? '<span class="urg">급함</span>' : a.work ? '<span class="work">업무 요청</span>' : "") + "</span>" +
        '<span class="t">' + esc(a.title) + "</span></button>";
    }).join("");
  }
  function inputOf(a) { return S.inputs[a.id] || (S.inputs[a.id] = initInput(a)); }
  function initInput(a) {
    var p = a.payload || {};
    if (a.kind === "add_prospects") return { pick: (p.candidates || []).map(function (_, i) { return i; }) };
    if (a.kind === "review_findings") { var d = {}; (p.items || []).forEach(function (x) { d[x.id] = x.qa; }); return { decisions: d }; }
    if (a.kind === "send_first") return { to: p.to || "", checks: {} };
    if (a.kind === "reply_mail") return { to: p.to || "", body: p.draft || "" };
    return { to: p.to || "" };
  }
  function bodyHtml(a) {
    var p = a.payload || {}, inp = inputOf(a), h = "";
    if (a.kind === "add_prospects") {
      h += '<div class="sec"><h4>후보 — 등록할 곳만 남기세요</h4><div class="cands">' + (p.candidates || []).map(function (c, i) {
        return '<label class="cand"><input type="checkbox" data-pick="' + i + '" ' + (inp.pick.indexOf(i) >= 0 ? "checked" : "") + ' /><span><b>' + esc(c.company) + '</b> <span class="hint">' + esc(c.domain) + '</span><div class="u"><a href="' + esc(c.service_url) + '" target="_blank" rel="noopener">' + esc(c.service_url) + "</a></div>" +
          '<div class="w">' + esc(c.why) + "</div>" + '<div class="hint">' + (c.contact_email ? "문의 " + esc(c.contact_email) : "공개 메일 없음") + (c.tos_url ? ' · <a href="' + esc(c.tos_url) + '" target="_blank" rel="noopener">약관</a>' : "") + "</div></span></label>";
      }).join("") + "</div></div>";
    } else if (a.kind === "tos_verdict") {
      h += p.verdict ? '<div><span class="verdict ' + esc(p.verdict) + '">' + ({ ok: "문제없음", prohibited: "금지", unclear: "애매" }[p.verdict] || "") + "</span>" + (p.url ? ' <a class="hint" href="' + esc(p.url) + '" target="_blank" rel="noopener">약관 원문 열기 ↗</a>' : "") + "</div>" : "";
      h += '<div class="sec"><a class="btn plain sm" href="/admin/audits#' + esc(p.auditId) + '" target="_blank" rel="noopener">감사 데스크에서 보기</a></div>';
    } else if (a.kind === "collect_issue") {
      var cmd = "railway run --service yume node scripts/field-agent.mjs --open " + p.auditId;
      h += '<div class="sec" style="display:flex;gap:8px;flex-wrap:wrap">' + (p.url ? '<a class="btn plain sm" href="' + esc(p.url) + '" target="_blank" rel="noopener">서비스 열기 ↗</a>' : "") + '<button type="button" class="btn ghost sm" data-copytext="' + esc(cmd) + '">가입용 창 여는 명령 복사</button><a class="btn plain sm" href="/admin/audits#' + esc(p.auditId) + '" target="_blank" rel="noopener">감사 데스크</a></div>';
      h += '<div class="hint">' + (p.status === "login_required" ? "가입·로그인은 현장 요원 전용 창에서 해야 저장됩니다(바탕화면 ‘유메 현장요원 열기’). 반려하면 사람이 질문을 넣는 방식으로 바꿉니다." : "반려하면 사람이 질문을 넣는 방식으로 바꿉니다.") + "</div>";
    } else if (a.kind === "collect_answers") {
      h += '<div class="sec qs"><h4>질문 ' + (p.questions || []).length + '개 <button type="button" class="btn ghost sm" data-copyq>질문 전체 복사</button></h4><ol>' + (p.questions || []).map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol></div>";
      h += '<div class="sec" style="display:flex;gap:8px;flex-wrap:wrap">' + (p.url ? '<a class="btn plain sm" href="' + esc(p.url) + '" target="_blank" rel="noopener">상대 서비스 열기 ↗</a>' : "") + '<a class="btn plain sm" href="/admin/audits#' + esc(p.auditId) + '" target="_blank" rel="noopener">감사 데스크(답 붙여넣기)</a></div>';
    } else if (a.kind === "review_findings") {
      h += '<div class="sec"><h4>항목별 판정 — 원문 링크를 열어 확인하고 바꿀 수 있습니다</h4><div class="finds">' + (p.items || []).map(function (x) {
        var cur = inp.decisions[x.id];
        var b = function (v, label) { return '<button type="button" data-dec="' + x.id + '" data-v="' + v + '" aria-pressed="' + String(cur === v) + '">' + label + "</button>"; };
        return '<div class="find"><div class="q">질문 · ' + esc(x.question) + '</div><div class="said"><b>AI가 한 말</b>' + esc(x.ai) + '</div><div class="off"><b>공식 원문</b>' + esc(x.official || "(원문 없음)") + "</div>" +
          '<div class="hint">QA 수아: ' + esc(x.qaReason) + "</div>" +
          '<div class="ctl"><span class="seg">' + b("confirmed", "오류 확정") + b("excluded", "애매 · 제외") + b("yume_wrong", "유메 오판") + "</span>" + (x.url ? '<a class="btn plain sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">원문 열기 ↗</a>' : '<span class="hint">원문 링크 없음 — 확정 불가</span>') + "</div></div>";
      }).join("") + "</div></div>";
    } else if (a.kind === "reply_mail") {
      h += '<div class="mailcard"><div class="mh"><b>' + esc(p.subject || "(제목 없음)") + "</b><span>" + esc(p.fromName ? p.fromName + " · " : "") + esc(p.to) + " · " + kst(p.date) + '</span></div><div class="mb">' + esc(p.original || "") + "</div></div>";
      h += '<label class="field">받는 사람<input id="in-to" type="email" value="' + esc(inp.to) + '" /></label>';
      h += '<label class="field">답장 (고쳐서 승인하면 고친 대로 대표 메일함에서 나갑니다)<textarea id="in-body">' + esc(inp.body) + "</textarea></label>";
    } else if (a.kind === "send_first") {
      if (p.reportUrl) h += '<a class="readbtn" href="' + esc(p.reportUrl) + '" target="_blank" rel="noopener"><span><b>보고서 먼저 읽기</b><br><span>받는 사람이 열어 볼 비공개 보고서 그대로입니다</span></span><i>열기 ↗</i></a>';
      h += '<label class="field">받는 사람(담당자 개인 이메일)<input id="in-to" type="email" value="' + esc(inp.to) + '" placeholder="name@company.com" /></label>';
      h += '<div class="sec"><h4>대표 확인 — 세 줄 모두 체크해야 나갑니다</h4><div class="checks">' +
        [["manual_input", "질문은 사람이 일반 사용자로서 넣었고(대량 자동 질의 아님), 답마다 받은 시각이 있다"], ["ambiguous_removed", "애매한 사례는 모두 뺐다"], ["recipient_person", "받는 사람이 담당자 개인이다(대표 메일함 아님)"]].map(function (c) {
          return '<label><input type="checkbox" data-check="' + c[0] + '" ' + (inp.checks[c[0]] ? "checked" : "") + " /><span>" + c[1] + "</span></label>";
        }).join("") + "</div></div>";
      h += '<div class="hint">법무 검토(도윤): ' + esc(p.legal || "") + "</div>";
      h += '<div class="sec"><h4>메일 미리보기 <span class="hint">· 보고서 링크는 승인할 때 만들어집니다</span></h4><iframe class="preview" sandbox="allow-same-origin" src="/api/admin/staff/approvals/' + a.id + '/preview" title="메일 미리보기"></iframe></div>';
    } else if (a.kind === "confirm_payment") {
      var m = /합계 ([\d,]+원)/.exec(a.summary || "");
      h += m ? '<div class="money num">' + esc(m[1]) + "</div>" : "";
    } else if (a.kind === "send_followup" || a.kind === "quote_reminder" || a.kind === "pay_reminder" || a.kind === "deliver_report") {
      if (a.kind === "deliver_report" && p.reportUrl) h += '<a class="readbtn" href="' + esc(p.reportUrl) + '" target="_blank" rel="noopener"><span><b>보고서 먼저 읽기</b><br><span>고객에게 보낼 보고서 그대로입니다</span></span><i>열기 ↗</i></a>';
      h += '<label class="field">받는 사람<input id="in-to" type="email" value="' + esc(inp.to) + '" /></label>';
    }
    return h;
  }
  function docHtml(a, approved) {
    var st = staffById(a.staff) || { name: a.staff, teamLabel: "", title: "" };
    return '<article class="doc">' +
      '<div class="dhead"><div><button type="button" class="btn plain sm back" data-close>← 목록</button><div class="dtitle">기 안 서</div><dl class="meta">' +
      "<dt>문서번호</dt><dd class=\"num\">STF-" + String(a.id).padStart(5, "0") + "</dd><dt>종류</dt><dd>" + esc(a.kindLabel) + "</dd><dt>기안</dt><dd>" + esc(st.teamLabel) + " " + esc(st.name) + " " + esc(st.title) + "</dd><dt>기안일시</dt><dd class=\"num\">" + kst(a.created_at) + "</dd></dl></div>" +
      lineHtml(a, approved) + "</div>" +
      '<div class="dbody"><div class="subject">' + esc(a.title) + '</div><div class="summary">' + esc(a.summary || "") + "</div>" + bodyHtml(a) + (a.result ? '<div class="banner">이전 실행 결과: ' + esc(a.result) + "</div>" : "") + "</div>" +
      '<div class="dfoot"><span class="msg" id="docmsg"></span><button type="button" class="btn plain" data-reject>반려</button><button type="button" class="btn primary" data-approve>' + approveLabel(a) + "</button></div></article>";
  }
  function approveLabel(a) {
    return { collect_issue: "처리했어요", field_offline: "확인", collect_answers: "맡겠습니다" }[a.kind] || (a.work ? "맡겠습니다" : "승인");
  }
  function renderInbox(full) {
    var pane = $("#view");
    var sel = S.data.approvals.find(function (a) { return a.id === S.sel; });
    if (!sel && S.sel) S.sel = null;
    if (full || !pane.querySelector(".inbox")) {
      pane.innerHTML = '<div class="inbox' + (sel ? " open" : "") + '"><div class="list" id="list"></div><div class="docpane" id="docpane"></div></div>';
    }
    pane.querySelector(".inbox").classList.toggle("open", !!sel);
    $("#list").innerHTML = listHtml();
    var dp = $("#docpane");
    if (!sel) { dp.innerHTML = S.data.approvals.length ? '<div class="empty"><div class="big">✍️</div>왼쪽에서 결재할 문서를 고르세요.</div>' : ""; dp.dataset.id = ""; return; }
    if (dp.dataset.id !== String(sel.id)) { dp.innerHTML = docHtml(sel, false); dp.dataset.id = String(sel.id); }
  }

  // ── 조직도 ──
  function cardHtml(s) {
    var mode = s.autonomyFixed ? '<span class="hint">' + (s.autonomy === "auto" ? "늘 자동" : "늘 결재 후") + "</span>" :
      '<span class="seg" role="group" aria-label="일하는 방식"><button type="button" data-mode="approve" data-id="' + s.id + '" aria-pressed="' + String(s.autonomy === "approve") + '">결재 후</button><button type="button" data-mode="auto" data-id="' + s.id + '" aria-pressed="' + String(s.autonomy === "auto") + '">자동</button></span>';
    return '<div class="card st-' + s.status + (s.enabled ? "" : " off") + '" style="--h:' + s.hue + '">' +
      '<div class="who">' + avatar(s.name, s.hue) + "<div><b>" + esc(s.name) + (s.lead ? '<span class="lead-tag">' + (s.title.indexOf("팀장") >= 0 || s.title.indexOf("실장") >= 0 ? "리더" : "담당") + "</span>" : "") + "</b><small>" + esc(s.title) + (s.ai ? " · AI" : "") + "</small></div></div>" +
      '<div class="duty">' + esc(s.duty) + "</div>" +
      '<div class="status"><span class="pill">' + STATUS[s.status] + "</span>" + (s.pending ? '<span class="hint">결재 ' + s.pending + "건 올림</span>" : "") + "</div>" +
      '<div class="note">' + esc(s.note || "아직 기록이 없어요") + "</div>" +
      '<div class="stats"><span>오늘 <b class="num">' + s.doneToday + "</b>건</span><span>비용 <b class=\"num\">" + won(s.usdToday * 1400) + "</b></span><span class=\"when\">" + esc(s.nextHint) + "</span></div>" +
      '<div class="ctls"><button type="button" class="sw" role="switch" aria-label="' + esc(s.name) + ' 출근" aria-checked="' + String(s.enabled) + '" data-toggle="' + s.id + '"></button><span class="hint">' + (s.enabled ? "출근" : "퇴근") + "</span>" + mode +
      '<button type="button" class="btn ghost sm grow" data-run="' + s.id + '"' + (s.status === "working" ? " disabled" : "") + ">" + (s.status === "working" ? "일하는 중…" : "지금 일 시키기") + "</button></div></div>";
  }
  function renderOrg() {
    var d = S.data;
    var order = ["office", "sales", "legal", "audit", "ops"];
    var teams = order.map(function (t) {
      var members = d.staff.filter(function (s) { return s.team === t; }).sort(function (a, b) { return Number(b.lead) - Number(a.lead); });
      return '<section class="team" style="--h:' + d.teams[t].hue + '"><div class="thead">' + esc(d.teams[t].label) + "<span>" + members.length + "명</span></div>" + members.map(cardHtml).join("") + "</section>";
    }).join("");
    $("#view").innerHTML = '<div class="org"><div class="ceo">' + avatar("대", 268) + "<div><b>" + esc(d.ceo.name) + "</b><small>" + esc(d.ceo.title) + " · 결재만 합니다</small></div>" + (d.summary.pending ? '<span class="pend">결재 ' + d.summary.pending + "</span>" : "") + '</div><div class="stem"></div><div class="teams">' + teams + "</div></div>";
  }

  // ── 업무 일지 ──
  function renderLog() {
    var logs = S.data.logs;
    $("#view").innerHTML = logs.length ? '<div class="log">' + logs.map(function (l) {
      var hue = teamHue(l.team);
      return '<div class="lrow ' + esc(l.level) + '">' + avatar(l.name, hue) + "<div><div class=\"who2\">" + esc(l.name) + " · " + esc((S.data.teams[l.team] || {}).label || "") + '</div><div class="tt">' + esc(l.title) + "</div>" + (l.detail ? "<details><summary>자세히</summary>" + esc(l.detail) + "</details>" : "") + "</div><time>" + kst(l.created_at) + "</time></div>";
    }).join("") + "</div>" : '<div class="empty"><div class="big">📓</div>아직 기록이 없습니다.</div>';
  }

  // ── 오늘 할 일(대표 투두) — 결재 문서와 다른 체크리스트 모양 ──
  function renderTodos() {
    var d = S.data;
    var rows = d.todos.map(function (t) {
      return '<li class="todo" data-id="' + t.id + '">' +
        '<button type="button" class="tcheck" data-tdone="' + t.id + '" aria-label="' + esc(t.title) + ' 완료"><span></span></button>' +
        '<div class="tmain"><div class="ttitle">' + esc(t.title) + (t.age ? '<span class="tage">' + t.age + "일째</span>" : "") + (t.check ? '<span class="tauto">완료 누르면 서버가 확인</span>' : "") + "</div>" +
        (t.steps ? '<details class="tsteps"><summary>어떻게 하나요</summary><div>' + esc(t.steps) + "</div></details>" : "") +
        '<div class="tacts">' + (t.link ? (/^https?:/.test(t.link) ? '<a class="btn plain sm" href="' + esc(t.link) + '" target="_blank" rel="noopener">열기 ↗</a>' : '<span class="hint">문서: ' + esc(t.link) + "</span>") : "") +
        '<button type="button" class="btn plain sm" data-tsnooze="' + t.id + '">내일로</button></div><div class="tmsg" id="tmsg-' + t.id + '"></div></div></li>';
    }).join("");
    var next = d.todosNext.length ? '<h3 class="tnext-h">곧 할 일</h3><ul class="tnext">' + d.todosNext.map(function (t) { return "<li><b>" + esc(t.due_date.slice(5).replace("-", "/")) + "</b> " + esc(t.title) + "</li>"; }).join("") + "</ul>" : "";
    $("#view").innerHTML = '<section class="todos"><div class="thead2"><div><h2>오늘 할 일</h2><p>계정·DNS·홈택스·충전처럼 대표님 본인만 할 수 있는 일입니다. 직원들의 결재 문서와 따로 모았습니다.</p></div>' +
      '<form class="tadd" id="tadd"><input id="tadd-title" placeholder="할 일 추가 (예: 세무서 서류 제출)" maxlength="200" /><input id="tadd-date" type="date" aria-label="날짜(선택)" /><button type="submit" class="btn primary sm">추가</button></form></div>' +
      (rows ? '<ul class="tlist">' + rows + "</ul>" : '<div class="empty"><div class="big">✅</div>오늘 할 일을 다 끝냈습니다.</div>') + next + "</section>";
  }

  function render(full) {
    if (!S.data) return;
    renderTop();
    if (S.tab === "inbox") renderInbox(full);
    else if (S.tab === "todo") renderTodos();
    else if (S.tab === "org") renderOrg();
    else renderLog();
  }
  async function load(full) {
    try { S.data = await api("/staff"); render(full); }
    catch (e) { $("#view").innerHTML = '<div class="empty">' + esc(e.message) + "</div>"; }
  }

  // ── 이벤트 ──
  document.addEventListener("click", async function (e) {
    var t = e.target.closest("button, [data-open]");
    if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; render(true); return; }
    if (t.dataset.tdone) {
      var li = t.closest(".todo"), tm = $("#tmsg-" + t.dataset.tdone);
      t.disabled = true; li.classList.add("checking"); if (tm) tm.textContent = "";
      try { var rr = await api("/staff/todos/" + t.dataset.tdone + "/done", {}); li.classList.add("done"); toast(rr.result || "완료"); setTimeout(function () { load(); }, 700); }
      catch (err) { li.classList.remove("checking"); t.disabled = false; if (tm) tm.textContent = err.message; }
      return;
    }
    if (t.dataset.tsnooze) { try { await api("/staff/todos/" + t.dataset.tsnooze + "/snooze", {}); toast("내일 다시 올려 둘게요"); load(); } catch (err) { toast(err.message); } return; }
    if (t.dataset.open) { S.sel = Number(t.dataset.open); renderInbox(false); var dp = $("#docpane"); if (dp) dp.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    if (t.hasAttribute("data-close")) { S.sel = null; renderInbox(false); return; }
    if (t.dataset.dec) { var a1 = S.data.approvals.find(function (x) { return x.id === S.sel; }); inputOf(a1).decisions[t.dataset.dec] = t.dataset.v; t.parentNode.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
    if (t.dataset.copytext) { try { await navigator.clipboard.writeText(t.dataset.copytext); toast("복사했어요 — PC의 명령 창(유메 폴더)에 붙여 넣으세요"); } catch (_) { toast("복사하지 못했어요"); } return; }
    if (t.hasAttribute("data-copyq")) { var a2 = S.data.approvals.find(function (x) { return x.id === S.sel; }); try { await navigator.clipboard.writeText((a2.payload.questions || []).map(function (q, i) { return (i + 1) + ". " + q; }).join("\n")); toast("질문을 복사했어요"); } catch (_) { toast("복사하지 못했어요"); } return; }
    if (t.hasAttribute("data-approve") || t.hasAttribute("data-reject")) {
      var a = S.data.approvals.find(function (x) { return x.id === S.sel; });
      if (!a || S.busy) return;
      var msg = $("#docmsg"); msg.textContent = "";
      if (t.hasAttribute("data-reject")) {
        var reason = prompt("반려 사유(직원에게 남깁니다)", "");
        if (reason === null) return;
        S.busy = true;
        try { await api("/staff/approvals/" + a.id + "/reject", { reason: reason }); toast("반려했어요"); S.sel = null; await load(true); } catch (err) { msg.textContent = err.message; } finally { S.busy = false; }
        return;
      }
      var inp = inputOf(a); var to = $("#in-to"); if (to) inp.to = to.value.trim(); var bd = $("#in-body"); if (bd) inp.body = bd.value;
      S.busy = true; t.disabled = true; t.textContent = "처리 중…";
      try {
        var r = await api("/staff/approvals/" + a.id + "/approve", { input: inp });
        var cell = document.querySelector("#docpane td.stamp:last-child"); if (cell) cell.innerHTML = '<div class="seal pop">승인<small>' + esc(S.data.ceo.name) + "</small></div>";
        toast("결재했어요 — " + (r.result || "완료"));
        setTimeout(function () { S.sel = null; delete S.inputs[a.id]; load(true); }, 900);
      } catch (err) { msg.textContent = err.message; t.disabled = false; t.textContent = approveLabel(a); }
      finally { S.busy = false; }
      return;
    }
    if (t.dataset.toggle) { var s1 = staffById(t.dataset.toggle); try { await api("/staff/" + s1.id, { enabled: !s1.enabled }); toast(s1.name + (s1.enabled ? " 퇴근" : " 출근")); load(); } catch (err) { toast(err.message); } return; }
    if (t.dataset.mode) { try { await api("/staff/" + t.dataset.id, { autonomy: t.dataset.mode }); toast(t.dataset.mode === "auto" ? "자동으로 처리하게 했어요" : "결재 후 처리하게 했어요"); load(); } catch (err) { toast(err.message); } return; }
    if (t.dataset.run) { var s2 = staffById(t.dataset.run); try { await api("/staff/" + s2.id + "/run", {}); toast(s2.name + "에게 일을 맡겼어요"); setTimeout(load, 1200); } catch (err) { toast(err.message); } return; }
  });
  document.addEventListener("submit", async function (e) {
    if (e.target.id !== "tadd") return;
    e.preventDefault();
    var title = $("#tadd-title").value.trim(); if (!title) return;
    try { await api("/staff/todos", { title: title, due_date: $("#tadd-date").value || null }); toast("할 일을 추가했어요"); load(); } catch (err) { toast(err.message); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; var a = S.data && S.data.approvals.find(function (x) { return x.id === S.sel; });
    if (!a) return;
    var inp = inputOf(a);
    if (t.dataset.pick !== undefined) { var i = Number(t.dataset.pick); inp.pick = inp.pick.filter(function (x) { return x !== i; }); if (t.checked) inp.pick.push(i); }
    if (t.dataset.check) inp.checks[t.dataset.check] = t.checked;
  });
  setInterval(function () { var d = new Date(Date.now() + 9 * 3600000); $("#clock").textContent = d.getUTCFullYear() + "." + (d.getUTCMonth() + 1) + "." + d.getUTCDate() + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " KST"; }, 1000);
  setInterval(function () { if (!S.busy && document.visibilityState === "visible") load(false); }, 15000);
  load(true);
})();
`;

export function renderStaffPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" /><meta name="theme-color" content="#5B3FA0" />
<title>AI 본사 · 유메</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<style>${CSS}</style></head>
<body>
<header class="top"><div class="in">
  <div class="brand"><span class="logo">R</span><div><b>AI 본사</b><small>리머 · 유메 — 대표는 결재만</small></div></div>
  <div class="chips" id="chips"></div>
  <span class="clock num" id="clock"></span>
  <span class="chips"><a class="chip" href="/admin/work">작업 리스트</a><a class="chip" href="/admin/audits">감사 데스크</a></span>
</div></header>
<main class="wrap">
  <div class="kpis" id="kpis"></div>
  <div class="tabs" role="tablist" aria-label="화면">
    <button type="button" role="tab" data-tab="inbox" aria-selected="true">결재함 <span class="badge num" id="badge"></span></button>
    <button type="button" role="tab" data-tab="todo" aria-selected="false">오늘 할 일 <span class="badge todo-badge num" id="badge2"></span></button>
    <button type="button" role="tab" data-tab="org" aria-selected="false">조직도</button>
    <button type="button" role="tab" data-tab="log" aria-selected="false">업무 일지</button>
  </div>
  <div id="view"><div class="empty">불러오는 중…</div></div>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${SCRIPT}</script>
</body></html>`;
}
