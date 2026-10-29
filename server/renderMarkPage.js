// VERILINE 검증 마크의 공개 화면 — 검증 페이지(/v/:id), A4 검증서(/v/:id/certificate),
// 고객 홈페이지에 붙는 스크립트(/v/embed.js).
//
// 마크의 힘은 "누구나 확인할 수 있다"에서 나온다. 그래서 검증 페이지에는 원문, 주장마다 대조한
// 근거 문장과 출처, 검증 시각, 원문 지문을 모두 싣고, 붙여 넣은 글이 검증받은 원문과 같은지
// 그 자리에서 대조할 수 있게 한다. 검증서는 결재·심의·투자 자료에 첨부하는 종이 형태다.
import QRCode from "qrcode";
import { COMPANY, esc, layout } from "./renderPages.js";
import { MARK_NORMALIZE_SOURCE, MARK_VALID_DAYS, STATUS_COLOR, STATUS_LABEL, markStatus } from "./trustMarkRules.js";

const kDate = (ms) =>
  new Date(Number(ms)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
const kDateTime = (ms) =>
  new Date(Number(ms)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// 원문 정규화 — trustMarkRules.markText와 똑같아야 한다(공백 전부 제거, NFC).
const NORMALIZE_JS = `function yumeNorm(t){return String(t||"").normalize("NFC").replace(${MARK_NORMALIZE_SOURCE},"");}
async function yumeHash(t){var b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(yumeNorm(t)));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0");}).join("");}`;

const STATUS_NOTE = {
  valid: "이 글의 사실 주장은 모두 공개된 원문 자료로 확인되었습니다.",
  expired: `검증한 지 ${MARK_VALID_DAYS}일이 지났습니다. 사실은 바뀔 수 있어 다시 확인이 필요합니다.`,
  revoked: "이 검증 마크는 철회되었습니다. 더 이상 검증된 글로 볼 수 없습니다.",
};

function statusPill(status, big = false) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.missing;
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:${big ? "7px 14px" : "3px 10px"};border-radius:999px;background:${color};color:#fff;font-weight:800;font-size:${big ? 15 : 12}px">${status === "valid" ? "✓ " : ""}${esc(STATUS_LABEL[status] || status)}</span>`;
}

function claimList(claims) {
  return claims
    .map((c, i) => {
      const src = c.evidence?.url ? c.evidence : c.sources?.[0] ? { url: c.sources[0].url, quote: c.sources[0].quote } : null;
      return `<div style="border-top:1px solid #E8EFFF;padding:14px 0">
  <div style="display:flex;gap:10px;align-items:flex-start">
    <span style="flex-shrink:0;width:24px;height:24px;border-radius:999px;background:#E4F5EC;color:#2E7D56;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center">${i + 1}</span>
    <div style="min-width:0;flex:1">
      <div style="font-weight:700;color:#121827;line-height:1.6">${esc(c.text)}</div>
      <div style="font-size:12.5px;color:#2E7D56;margin-top:3px;font-weight:600">✓ 사실로 확인 · ${esc(c.via_label)}</div>
      ${src?.quote ? `<blockquote style="margin:8px 0 0;padding:8px 12px;border-left:3px solid #8DB0FF;background:#F5F8FF;font-size:13px;color:#3F3A52;line-height:1.7">“${esc(src.quote)}”</blockquote>` : ""}
      ${src?.url ? `<div style="font-size:12px;margin-top:6px"><a href="${esc(src.url)}" target="_blank" rel="noopener nofollow" style="color:#2F6BFF;word-break:break-all">${esc(src.url)}</a></div>` : ""}
      ${c.via === "reference" ? `<div style="font-size:12px;color:#7B87A1;margin-top:6px">발급 기업이 제출한 기준 자료(비공개)와 대조했습니다.</div>` : ""}
    </div>
  </div>
</div>`;
    })
    .join("");
}

export function renderMarkPage(mark) {
  if (!mark) {
    return layout("검증 기록 없음", `<h1>검증 기록을 찾을 수 없습니다</h1><p>주소가 정확한지 확인해 주세요. 베리라인이 발급하지 않은 마크이거나, 발급한 계정이 삭제되었을 수 있습니다.</p>`);
  }
  const status = markStatus(mark);
  const claims = JSON.parse(mark.claims_json || "[]");
  const certBtn =
    status === "valid"
      ? `<a href="/v/${esc(mark.id)}/certificate" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0A0E17;color:#fff;font-weight:700;font-size:14px;text-decoration:none">검증서 PDF 받기</a>`
      : "";
  const body = `
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
  <div>
    <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#7B87A1">VERILINE 검증 기록</div>
    <h1 style="margin-top:6px">${esc(mark.title || "검증받은 글")}</h1>
  </div>
  ${statusPill(status, true)}
</div>
<p style="font-size:15px;color:#121827;font-weight:600;margin:14px 0 4px">${esc(STATUS_NOTE[status] || "")}</p>
${mark.revoked_reason ? `<p class="muted">철회 사유: ${esc(mark.revoked_reason)}</p>` : ""}
<table style="margin-top:14px">
  <tr><th style="width:130px">검증 번호</th><td><code>${esc(mark.id)}</code></td></tr>
  <tr><th>검증 일시</th><td>${esc(kDateTime(mark.issued_at))}${Number(mark.renewals) ? ` <span class="muted">(첫 발급 ${esc(kDate(mark.first_issued_at))} · 재검증 ${Number(mark.renewals)}회)</span>` : ""}</td></tr>
  <tr><th>유효기간</th><td>${esc(kDate(mark.expires_at))}까지 <span class="muted">(검증일부터 ${MARK_VALID_DAYS}일)</span></td></tr>
  <tr><th>확인한 주장</th><td>${claims.length}개 — 모두 사실로 확인</td></tr>
  <tr><th>원문 지문</th><td><code style="word-break:break-all">${esc(mark.text_hash)}</code><div class="muted">SHA-256 · 공백을 뺀 원문 글자로 계산합니다. 글자 하나만 바뀌어도 달라집니다.</div></td></tr>
</table>
<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">${certBtn}</div>

<h2>주장별 근거</h2>
<p class="muted">베리라인이 글 속 사실 주장을 하나씩 나누고, 서버가 출처 페이지를 직접 열어 근거 문장이 실제로 있는지 확인했습니다. 처음 판정을 모르는 독립 검토도 같은 결론을 낸 주장만 통과합니다.</p>
${claims.length ? claimList(claims) : `<p class="muted">공개할 주장 기록이 없습니다.</p>`}

${mark.text ? `<h2>검증받은 원문</h2>
<details><summary style="cursor:pointer;color:#2F6BFF;font-weight:700;font-size:14px">원문 펼치기 (${mark.text.length.toLocaleString()}자)</summary>
<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8;color:#3F3A52;background:#F5F8FF;border-radius:12px;padding:14px 16px;margin-top:10px">${esc(mark.text)}</div></details>

<h2>이 글이 검증받은 원문과 같은지 대조</h2>
<p class="muted">어디선가 이 마크가 붙은 글을 보셨다면, 그 글을 아래에 붙여 넣어 보세요. 띄어쓰기·줄바꿈은 무시하고 글자를 대조합니다. 대조는 이 브라우저 안에서만 하고 서버로 보내지 않습니다.</p>
<textarea id="cmp" rows="5" style="width:100%;border:1px solid #C9D8FF;border-radius:12px;padding:10px 12px;font:inherit;font-size:13.5px;box-sizing:border-box"></textarea>
<button id="cmpBtn" style="margin-top:8px">원문 대조하기</button>
<div id="cmpOut" class="msg"></div>` : ""}

<h2>이 마크가 말하는 것과 말하지 않는 것</h2>
<ul>
<li>베리라인이 <b>검증 일시 기준</b>으로, 위 글에 담긴 <b>사실 주장</b>을 공개된 원문 자료와 대조해 확인했다는 기록입니다.</li>
<li>글쓴이·회사·상품·서비스의 품질이나 신뢰도를 <b>보증하지 않습니다.</b> 의견·평가·전망은 확인 대상이 아닙니다.</li>
<li>법령 개정이나 새 발표로 사실이 바뀔 수 있어 유효기간(${MARK_VALID_DAYS}일)을 둡니다. 기간이 지나면 "재확인 필요"로 바뀝니다.</li>
<li>틀린 점을 발견하셨다면 <a href="mailto:${esc(COMPANY.email)}?subject=${encodeURIComponent(`[베리라인 검증 제보] ${mark.id}`)}">${esc(COMPANY.email)}</a>로 알려 주세요. 확인되면 마크를 철회하고 그 사실을 이 페이지에 남깁니다.</li>
</ul>`;
  const script = mark.text
    ? `<script>${NORMALIZE_JS}
document.getElementById("cmpBtn").addEventListener("click", async function(){
  var out=document.getElementById("cmpOut"); var t=document.getElementById("cmp").value;
  if(!t.trim()){out.className="msg err";out.textContent="대조할 글을 붙여 넣어 주세요.";return;}
  if(!window.crypto||!crypto.subtle){out.className="msg err";out.textContent="이 브라우저에서는 대조할 수 없습니다.";return;}
  var h=await yumeHash(t);
  if(h===${JSON.stringify(mark.text_hash)}){out.className="msg ok";out.textContent="✓ 검증받은 원문과 같습니다.";}
  else{out.className="msg err";out.textContent="✗ 검증받은 원문과 다릅니다. 글자가 바뀌었거나 일부만 붙여 넣었습니다.";}
});</script>`
    : "";
  return layout(`${mark.title || "검증 기록"} — VERILINE 검증`, body, { script });
}

// ── A4 검증서 ────────────────────────────────────────────────────────────────
// 화면에서 PDF로 바로 내려받는다(html2pdf — 한글 글꼴을 서버에 싣지 않으려고 브라우저가 그린다).
// 인쇄해도 같은 모양이 나오도록 @page A4 여백 0으로 맞춘다.
const PER_FIRST = 4; // 첫 장에 싣는 주장 수. 나머지는 별지로.
const PER_ANNEX = 9;

function seal() {
  // 원형 직인. 글자는 원을 따라 돈다.
  return `<svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
<defs><path id="ring" d="M64,64 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"/></defs>
<circle cx="64" cy="64" r="60" fill="none" stroke="#B3312F" stroke-width="4"/>
<circle cx="64" cy="64" r="53" fill="none" stroke="#B3312F" stroke-width="1.5"/>
<circle cx="64" cy="64" r="33" fill="none" stroke="#B3312F" stroke-width="1.5"/>
<text font-family="'Noto Serif KR',serif" font-size="11.5" font-weight="700" fill="#B3312F" letter-spacing="1.6"><textPath href="#ring" startOffset="1%">VERILINE FACT VERIFICATION · 베리라인 사실 검증 ·</textPath></text>
<text x="64" y="60" text-anchor="middle" font-family="'Noto Serif KR',serif" font-size="17" font-weight="900" fill="#B3312F">검증</text>
<text x="64" y="80" text-anchor="middle" font-family="'Noto Serif KR',serif" font-size="12" font-weight="700" fill="#B3312F">VERILINE</text>
</svg>`;
}

function certClaimRows(claims, from) {
  return claims
    .map((c, k) => {
      const src = c.evidence?.url ? c.evidence.url : c.sources?.[0]?.url || "";
      const where = c.via === "reference" ? "발급 기업 기준 자료(비공개)" : c.via === "official" ? "법제처 국가법령정보" : host(src) || c.via_label;
      return `<tr><td class="n">${from + k + 1}</td><td>${esc(c.text)}</td><td class="src">${esc(where)}</td></tr>`;
    })
    .join("");
}

export async function renderCertificatePage(mark, base) {
  const status = markStatus(mark);
  if (!mark || status !== "valid") {
    return layout(
      "검증서를 발급할 수 없습니다",
      `<h1>검증서를 발급할 수 없습니다</h1><p>${mark ? `이 마크는 지금 <b>${esc(STATUS_LABEL[status])}</b> 상태입니다. 검증서는 유효한 마크에만 발급합니다.` : "검증 기록을 찾을 수 없습니다."}</p>${mark ? `<p><a href="/v/${esc(mark.id)}">검증 기록 보기</a></p>` : ""}`,
    );
  }
  const url = `${base}/v/${mark.id}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, width: 92, color: { dark: "#0A0E17", light: "#FFFFFF00" } });
  const claims = JSON.parse(mark.claims_json || "[]");
  const first = claims.slice(0, PER_FIRST);
  const rest = claims.slice(PER_FIRST);
  const annexes = [];
  for (let i = 0; i < rest.length; i += PER_ANNEX) annexes.push(rest.slice(i, i + PER_ANNEX));
  const pages = 1 + annexes.length;
  const no = `YM-${new Date(Number(mark.issued_at)).getFullYear()}-${mark.id.slice(2).toUpperCase()}`;

  const frame = (inner, n) => `<section class="page"><div class="frame"><div class="inner">${inner}
  <div class="pageno">${n} / ${pages}</div></div></div></section>`;

  const page1 = frame(`
  <div class="brand"><span class="logo">VERILINE</span><span class="brandsub">Fact Verification by REAMER</span></div>
  <div class="title">사 실 검 증 서</div>
  <div class="subtitle">CERTIFICATE OF FACT VERIFICATION</div>
  <div class="no">검증서 번호 ${esc(no)}</div>

  <table class="meta">
    <tr><th>문서 제목</th><td>${esc(mark.title || "제목 없음")}</td></tr>
    <tr><th>원문 분량</th><td>${(mark.text || "").length.toLocaleString()}자 · 확인한 사실 주장 ${claims.length}개</td></tr>
    <tr><th>원문 지문</th><td class="mono">${esc(mark.text_hash)}</td></tr>
    <tr><th>검증 일시</th><td>${esc(kDateTime(mark.issued_at))} (한국 시간)</td></tr>
    <tr><th>유효기간</th><td>${esc(kDate(mark.expires_at))}까지</td></tr>
  </table>

  <p class="statement">위 문서에 담긴 사실 주장 <b>${claims.length}개</b>를 베리라인이 하나씩 나누어 공개된 원문 자료와 대조한 결과,
  <b>모든 주장이 근거 원문으로 확인되었음</b>을 이 검증서로 확인합니다.</p>

  <table class="claims">
    <tr><th class="n">#</th><th>확인한 사실 주장</th><th class="src">근거 출처</th></tr>
    ${certClaimRows(first, 0)}
  </table>
  ${rest.length ? `<div class="more">나머지 주장 ${rest.length}개는 별지에 이어집니다.</div>` : ""}

  <div class="bottom">
    <div class="verify">
      <div class="qr">${qr}</div>
      <div class="vtext"><b>진위 확인</b><br/>QR 코드를 찍거나 아래 주소에서<br/>주장별 근거 문장과 원문을 확인하세요.<br/><span class="mono">${esc(url.replace(/^https?:\/\//, ""))}</span></div>
    </div>
    <div class="issuer">
      <div class="date">${esc(kDate(mark.issued_at))}</div>
      <div class="by">VERILINE · 베리라인 검증</div>
      <div class="ceo">대표 ${esc(COMPANY.ceo)}</div>
      <div class="seal">${seal()}</div>
    </div>
  </div>
  <div class="fine">이 검증서는 검증 일시 기준으로 문서 속 사실 주장을 공개 원문과 대조한 기록이며, 글쓴이·회사·상품의 품질이나 신뢰도를 보증하지 않습니다.
  의견·평가·전망은 확인 대상이 아닙니다. 원문이 한 글자라도 바뀌면 원문 지문이 달라지며 이 검증서는 그 글에 적용되지 않습니다.
  유효기간이 지났거나 철회된 경우 위 주소에 그 상태가 표시됩니다. 발급 ${esc(COMPANY.name)} · 사업자등록번호 ${esc(COMPANY.regNo)} · ${esc(COMPANY.email)}</div>`, 1);

  const annexPages = annexes.map((group, k) =>
    frame(`
  <div class="brand"><span class="logo">VERILINE</span><span class="brandsub">검증서 번호 ${esc(no)}</span></div>
  <div class="annexTitle">별지 ${k + 1} — 확인한 사실 주장</div>
  <table class="claims">
    <tr><th class="n">#</th><th>확인한 사실 주장</th><th class="src">근거 출처</th></tr>
    ${certClaimRows(group, PER_FIRST + k * PER_ANNEX)}
  </table>
  <div class="fine">주장마다 대조한 근거 문장과 출처 주소는 ${esc(url.replace(/^https?:\/\//, ""))} 에서 볼 수 있습니다.</div>`, k + 2),
  );

  const file = `베리라인_사실검증서_${mark.id}.pdf`;
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>사실 검증서 ${esc(no)} · 베리라인</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Noto+Serif+KR:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #E9E5EF; font-family: 'Noto Sans KR', -apple-system, 'Malgun Gothic', sans-serif; color: #0A0E17; word-break: keep-all; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; justify-content: center; align-items: center; padding: 12px; background: #0A0E17; color: #fff; font-size: 14px; flex-wrap: wrap; }
  .bar button, .bar a { border: none; border-radius: 999px; padding: 9px 18px; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; }
  .bar button { background: #8DB0FF; color: #0A0E17; } .bar a { background: transparent; color: #C8D0E0; border: 1px solid #4A4360; }
  #doc { width: 210mm; margin: 18px auto 40px; }
  .page { width: 210mm; height: 297mm; background: #FFFEFB; padding: 11mm; margin-bottom: 18px; box-shadow: 0 8px 30px rgba(10, 14, 23,.18); page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; margin-bottom: 0; }
  .frame { height: 100%; border: 2.4px solid #3B2C6B; padding: 2.2mm; }
  .inner { position: relative; height: 100%; border: 0.8px solid #8DB0FF; padding: 11mm 13mm 9mm;
    background: radial-gradient(circle at 50% 42%, rgba(168,139,234,.07), transparent 60%),
      repeating-linear-gradient(45deg, rgba(47, 107, 255,.025) 0 2px, transparent 2px 9px); }
  .brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #DCCFF3; padding-bottom: 3mm; }
  .logo { font-family: 'Noto Serif KR', serif; font-weight: 900; font-size: 20px; letter-spacing: .32em; color: #3B2C6B; }
  .brandsub { font-size: 10.5px; letter-spacing: .14em; color: #7B87A1; text-transform: uppercase; }
  .title { font-family: 'Noto Serif KR', serif; font-weight: 900; font-size: 40px; text-align: center; letter-spacing: .28em; margin: 10mm 0 2mm; color: #0A0E17; }
  .subtitle { text-align: center; font-size: 11px; letter-spacing: .42em; color: #7B87A1; }
  .no { text-align: center; font-size: 12px; color: #4A5468; margin: 4mm 0 7mm; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; }
  .meta th, .meta td { border-top: 1px solid #E6DAF6; border-bottom: 1px solid #E6DAF6; padding: 2.3mm 3mm; font-size: 12.5px; text-align: left; vertical-align: top; }
  .meta th { width: 30mm; color: #2F6BFF; font-weight: 700; background: rgba(247,241,254,.7); }
  .mono { font-family: ui-monospace, Consolas, Menlo, monospace; font-size: 10.5px; word-break: break-all; letter-spacing: .02em; }
  .statement { font-family: 'Noto Serif KR', serif; font-size: 15px; line-height: 2; text-align: center; margin: 8mm 4mm 6mm; color: #0A0E17; }
  .claims th { font-size: 11px; color: #fff; background: #3B2C6B; padding: 2mm 2.5mm; text-align: left; font-weight: 700; }
  .claims td { font-size: 11.5px; line-height: 1.6; padding: 2mm 2.5mm; border-bottom: 1px solid #ECE4F7; vertical-align: top; }
  .claims .n { width: 9mm; text-align: center; color: #2F6BFF; font-weight: 800; }
  .claims .src { width: 42mm; color: #4A5468; font-size: 10.5px; word-break: break-all; }
  .claims th.src, .claims th.n { color: #fff; }
  .more { font-size: 11px; color: #7B87A1; margin-top: 2mm; text-align: right; }
  .bottom { position: absolute; left: 13mm; right: 13mm; bottom: 27mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .verify { display: flex; gap: 4mm; align-items: center; }
  .qr svg { width: 25mm; height: 25mm; display: block; }
  .vtext { font-size: 10.5px; line-height: 1.65; color: #4A5468; }
  .vtext b { color: #0A0E17; font-size: 11.5px; }
  .issuer { position: relative; text-align: right; padding-right: 21mm; white-space: nowrap; }
  .issuer .date { font-family: 'Noto Serif KR', serif; font-size: 14px; font-weight: 700; margin-bottom: 3mm; }
  .issuer .by { font-family: 'Noto Serif KR', serif; font-size: 15px; font-weight: 900; color: #0A0E17; }
  .issuer .ceo { font-size: 12px; color: #4A5468; margin-top: 1.5mm; }
  /* 직인은 대표자 이름 위에 겹쳐 찍는다(한국 서식 관행). */
  .seal { position: absolute; right: -2mm; bottom: -8mm; opacity: .88; transform: rotate(-8deg); }
  .seal svg { width: 27mm; height: 27mm; }
  .vtext { max-width: 62mm; }
  .fine { position: absolute; left: 13mm; right: 13mm; bottom: 8mm; font-size: 8.6px; line-height: 1.6; color: #8A93A6; border-top: 1px solid #E6DAF6; padding-top: 2.5mm; }
  .annexTitle { font-family: 'Noto Serif KR', serif; font-weight: 900; font-size: 20px; margin: 8mm 0 5mm; color: #0A0E17; }
  .pageno { position: absolute; right: 13mm; top: 4mm; font-size: 9px; color: #9AA6BF; }
  @media print { body { background: #fff; } .bar { display: none; } #doc { margin: 0; } .page { margin: 0; box-shadow: none; } }
  @media (max-width: 820px) { #doc { transform-origin: top left; } }
</style></head>
<body>
<div class="bar"><span>사실 검증서 · ${esc(no)}</span><button id="dl">PDF로 내려받기</button><a href="/v/${esc(mark.id)}">검증 기록 보기</a></div>
<div id="doc">${page1}${annexPages.join("")}</div>
<script src="/v/assets/html2pdf.js"></script>
<script>
document.getElementById("dl").addEventListener("click", async function(){
  var b=this; b.disabled=true; var old=b.textContent; b.textContent="PDF 만드는 중…";
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // 쪽마다 따로 그려 A4 한 장에 정확히 한 장씩 붙인다. 문서 전체를 한 번에 넘기면
    // 높이 반올림 때문에 쪽이 둘로 쪼개지며 빈 쪽이 생긴다.
    var pages=[].slice.call(document.querySelectorAll("#doc .page"));
    var opt={ margin:0, html2canvas:{scale:2,useCORS:true,backgroundColor:"#FFFEFB"}, jsPDF:{unit:"mm",format:"a4",orientation:"portrait"} };
    var canvases=[];
    for (var i=0;i<pages.length;i++) canvases.push(await html2pdf().set(opt).from(pages[i]).toCanvas().get("canvas"));
    var pdf=await html2pdf().set(opt).from(document.createElement("div")).toPdf().get("pdf");
    while (pdf.getNumberOfPages()>1) pdf.deletePage(pdf.getNumberOfPages());
    canvases.forEach(function(c,k){ if(k) pdf.addPage(); else pdf.setPage(1); pdf.addImage(c.toDataURL("image/jpeg",0.95),"JPEG",0,0,210,297); });
    pdf.setProperties({ title: ${JSON.stringify(`VERILINE 사실 검증서 ${no}`)}, author: "베리라인(VERILINE)", subject: ${JSON.stringify(url)} });
    pdf.save(${JSON.stringify(file)});
  } catch(e) { alert("PDF를 만들지 못했어요. 브라우저의 인쇄 → PDF로 저장을 이용해 주세요."); }
  b.disabled=false; b.textContent=old;
});
</script>
</body></html>`;
}

// ── 고객 홈페이지에 붙는 스크립트 ────────────────────────────────────────────
// <div data-yume-mark="ym…">검증받은 글</div> 뒤에 배지를 붙인다. 감싼 글의 글자를 지문과 대조해
// 바뀌었으면 "원문 변경됨"으로 보여 준다(배지를 글 안에 넣으면 지문이 바뀌므로 글 뒤에 둔다).
export function embedScript(base) {
  return `/* VERILINE 검증 마크 — ${base}/v/ */
(function(){
${NORMALIZE_JS}
var BASE=${JSON.stringify(base)};
var LABEL=${JSON.stringify(STATUS_LABEL)};
var COLOR=${JSON.stringify(STATUS_COLOR)};
function badge(id,status){
  var a=document.createElement("a"); a.href=BASE+"/v/"+encodeURIComponent(id); a.target="_blank"; a.rel="noopener";
  a.setAttribute("data-yume-badge",status);
  a.style.cssText="display:inline-flex;align-items:center;gap:0;margin-top:10px;border-radius:999px;overflow:hidden;font:700 12.5px/1 -apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(10, 14, 23,.15)";
  var l=document.createElement("span"); l.textContent=(status==="valid"?"✓ ":"")+"VERILINE 검증"; l.style.cssText="background:#0A0E17;color:#fff;padding:8px 11px";
  var r=document.createElement("span"); r.textContent=LABEL[status]||status; r.style.cssText="background:"+(COLOR[status]||"#8A93A6")+";color:#fff;padding:8px 11px";
  a.appendChild(l); a.appendChild(r); return a;
}
async function run(el){
  var id=el.getAttribute("data-yume-mark"); if(!id||el.getAttribute("data-yume-done"))return; el.setAttribute("data-yume-done","1");
  var status="missing";
  try{
    var m=await (await fetch(BASE+"/v/"+encodeURIComponent(id)+"/status.json")).json();
    status=m.status||"missing";
    if(status==="valid"){
      if(window.crypto&&crypto.subtle){ if((await yumeHash(el.textContent))!==m.text_hash) status="changed"; }
    }
  }catch(e){}
  el.insertAdjacentElement("afterend",badge(id,status));
}
function all(){ var els=document.querySelectorAll("[data-yume-mark]"); for(var i=0;i<els.length;i++) run(els[i]); }
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",all); else all();
})();`;
}
