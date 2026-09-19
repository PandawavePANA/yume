// 감사 결과 리포트. 영업 자료이기 전에 점검 보고서여야 한다 — 받은 쪽이 사내에 그대로
// 돌릴 수 있어야 하고, 그러려면 숫자보다 '무엇을 어떻게 쟀는지'와 '실제로 뭐라고 답했는지'가
// 남아 있어야 한다. 지수만 큼직하게 박은 페이지는 마케팅물로 읽히고, 마케팅물은 회의에
// 안 올라간다. 그래서 문항별 확인된 사실과 답변 인용을 그대로 싣는다.
import { explainResult } from "./audit/explain.js";

const BAND = {
  low: { fg: "#1F7A52", bg: "#E7F6EE", border: "#B7E4CC" },
  moderate: { fg: "#8A5A14", bg: "#FDF4E3", border: "#F0D98C" },
  elevated: { fg: "#B23B2B", bg: "#FDEFEC", border: "#EFC2B6" },
  severe: { fg: "#93261A", bg: "#FBE4E0", border: "#E8A99C" },
  insufficient: { fg: "#5E5870", bg: "#F4F3F7", border: "#DCD9E4" },
};
const MARK = {
  hallucinated: { glyph: "✕", fg: "#C6402F", label: "할루시네이션" },
  partial: { glyph: "△", fg: "#8A5A14", label: "부분 실패" },
  safe: { glyph: "✓", fg: "#1F9D66", label: "정상" },
  ungraded: { glyph: "?", fg: "#6A6E76", label: "채점 불가" },
};

const CITE_STATUS = {
  exists: { label: "✓ 실재", cls: "ok" },
  nonexistent: { label: "✕ 존재하지 않음", cls: "bad" },
  unverified: { label: "? 조회 불가", cls: "unk" },
};

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
// 출처 링크는 http(s)만 건다.
const safeHref = (u) => (/^https?:\/\//i.test(String(u || "")) ? esc(u) : "");

export function renderAuditReport(report, { baseUrl = "" } = {}) {
  const s = report.score;
  const band = BAND[s.band] || BAND.moderate;
  const rec = report.recommendation;

  const typeRows = Object.entries(s.byType)
    .map(([type, v]) => {
      const meta = report.method.types[type] || {};
      const pct = v.total ? Math.round((v.failed / v.total) * 100) : 0;
      return `<tr><td class="k">${esc(meta.label || type)}<span class="sub">${esc(meta.meaning || "")}</span></td>
        <td class="mono num">${v.failed} / ${v.total}</td><td class="mono num">${pct}%</td></tr>`;
    })
    .join("");

  const items = report.results
    .map((r) => {
      const m = MARK[r.outcome] || MARK.ungraded;
      // 예전에 만든 리포트에는 explain이 없으므로 그 자리에서 만든다.
      const x = r.explain || explainResult(r);
      const failed = r.outcome === "hallucinated" || r.outcome === "partial";
      const href = safeHref(x.source?.url);
      const cites = x.citations?.length
        ? `<ul class="cites">${x.citations.map((c) => { const st = CITE_STATUS[c.status || (c.exists ? "exists" : "nonexistent")] || CITE_STATUS.unverified; return `<li class="${st.cls}">${st.label} · <span>${esc(c.text)}</span></li>`; }).join("")}</ul>`
        : "";
      const original = x.original ? `<details><summary>조문 원문 보기</summary><div class="orig">${esc(x.original)}</div></details>` : "";
      return `<div class="item${failed ? " failed" : ""}">
        <div class="ihead"><span class="glyph" style="color:${m.fg}">${m.glyph}</span>
          <span class="itype">${esc(r.typeLabel)}</span>
          <span class="ilabel" style="color:${m.fg}">${esc(m.label)}</span></div>
        <div class="q">${esc(r.question)}</div>
        <div class="cmp">
          <div class="said${failed ? " bad" : ""}"><div class="cap">AI가 한 말</div>${esc(x.aiSaid || "—")}
            ${x.quote && x.quote !== x.aiSaid ? `<div class="quote">답변 원문: “${esc(x.quote)}”</div>` : ""}</div>
          <div class="fact"><div class="cap">공식 확인 결과</div>${esc(x.fact || "—")}${cites}${original}</div>
        </div>
        ${x.why ? `<div class="why"><b style="color:${m.fg}">${failed ? "어디가 틀렸나" : "판정 근거"}</b> ${esc(x.why)}</div>` : ""}
        ${failed && x.risk ? `<div class="risk"><b>왜 문제인가</b> ${esc(x.risk)}</div>` : ""}
        ${failed && x.correct ? `<div class="risk"><b>올바른 답이었다면</b> ${esc(x.correct)}</div>` : ""}
        ${href ? `<a class="src" href="${href}" target="_blank" rel="noopener noreferrer">직접 확인하기 → ${esc(x.source.label)}</a>` : ""}
      </div>`;
    })
    .join("");

  const ctaHtml = rec.recommend
    ? `<div class="cta">
        <h3>이 결과를 두고 드리는 제안</h3>
        <p>${esc(rec.reason)}</p>
        <p style="margin-top:10px">${esc(rec.fit)}</p>
        <a href="${esc(baseUrl)}/docs/api">유메 API 문서 보기 →</a>
      </div>`
    : `<div class="noplug"><b>이번 점검에서는 유메를 권하지 않습니다.</b>
        <p style="margin:8px 0 0">${esc(rec.reason)}</p>
        ${rec.note ? `<p style="margin:8px 0 0">${esc(rec.note)}</p>` : ""}</div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>할루시네이션 점검 결과${report.subject ? ` · ${esc(report.subject)}` : ""}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{--paper:#F7F7F5;--surface:#fff;--ink:#16181C;--ink2:#3A3F47;--muted:#6A6E76;--line:#E3E4E0;--accent:#6B4FA8}
  *{box-sizing:border-box}
  body{margin:0;padding:0 20px;background:var(--paper);color:var(--ink);line-height:1.7;word-break:keep-all;
       font-family:"IBM Plex Sans KR",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;font-size:15px}
  .wrap{max-width:720px;margin:0 auto;padding-block:48px 80px}
  .mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
  .eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
  h1{font-size:27px;font-weight:700;letter-spacing:-.02em;margin:12px 0 0;text-wrap:balance}
  .subject{color:var(--ink2);margin-top:6px}
  .score{margin-top:26px;background:${band.bg};border:1px solid ${band.border};border-radius:14px;padding:22px}
  .idx{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  .idx b{font-size:44px;font-weight:700;color:${band.fg};letter-spacing:-.03em;line-height:1}
  .idx .of{font-size:15px;color:${band.fg}}
  .chip{background:${band.fg};color:#fff;border-radius:999px;padding:3px 12px;font-size:13px;font-weight:600}
  .headline{margin-top:12px;font-size:16px;font-weight:600;color:${band.fg}}
  .ci{margin-top:10px;font-size:13.5px;color:var(--ink2)}
  .caveat{margin-top:14px;padding-top:12px;border-top:1px dashed ${band.border};font-size:12.5px;color:var(--ink2)}
  h2{font-size:18px;font-weight:700;margin:42px 0 4px;padding-bottom:9px;border-bottom:1px solid var(--line)}
  .lede{color:var(--ink2);font-size:14.5px;margin:0}
  .tablewrap{overflow-x:auto;margin-top:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
  table{width:100%;border-collapse:collapse;min-width:340px}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  th{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500;background:#FBFBF9}
  tr:last-child td{border-bottom:none}
  td.k{font-weight:600}
  td.num,th.num{text-align:right;white-space:nowrap}
  .sub{display:block;font-size:12.5px;color:var(--muted);font-weight:400;margin-top:2px}
  .item{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:12px}
  .ihead{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
  .glyph{font-weight:700}
  .itype{font-size:12px;font-family:"IBM Plex Mono",monospace;color:var(--muted);letter-spacing:.05em}
  .ilabel{font-size:12px;font-weight:700}
  .q{font-weight:600}
  .item.failed{border-color:#EFC2B6}
  .cmp{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .cmp>div{flex:1 1 240px;min-width:0;border-radius:10px;padding:11px 13px;font-size:13.5px}
  .said{background:#FBFBF9;border:1px solid var(--line)}
  .said.bad{background:#FFF7F5;border-color:#F3D5CE}
  .fact{background:#F4FAF7;border:1px solid #CFE9DC}
  .cap{font-size:11.5px;font-weight:700;letter-spacing:.02em;margin-bottom:5px;color:var(--muted)}
  .said.bad .cap{color:#C6402F}
  .fact .cap{color:#1F7A52}
  .quote{margin-top:6px;font-size:12.5px;color:var(--ink2)}
  .cites{list-style:none;margin:8px 0 0;padding:0;font-size:12.5px}
  .cites li.ok{color:#1F7A52}.cites li.bad{color:#C6402F}.cites li.unk{color:var(--muted)}.cites span{color:var(--ink)}
  details{margin-top:8px}summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:12.5px}
  .orig{white-space:pre-wrap;font-size:12.5px;color:var(--ink2);margin-top:6px}
  .why{margin-top:12px;font-size:13.5px}
  .risk{margin-top:6px;font-size:13px;color:var(--ink2)}
  .risk b{color:var(--ink)}
  .src{display:inline-block;margin-top:10px;font-size:12.5px;font-weight:600;color:var(--accent);text-decoration:none}
  .method{margin-top:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px}
  .cta{margin-top:20px;background:#1F1B2E;color:#fff;border-radius:14px;padding:24px}
  .cta h3{margin:0 0 8px;font-size:17px}
  .cta p{margin:0;color:#CFC9DE;font-size:14.5px}
  .cta a{display:inline-block;margin-top:16px;background:var(--accent);color:#fff;text-decoration:none;
         border-radius:999px;padding:11px 22px;font-weight:600;font-size:14.5px}
  .noplug{margin-top:20px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;color:var(--ink2)}
  footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
</style></head><body><div class="wrap">

<div class="eyebrow">유메 · AI 할루시네이션 무료 점검</div>
<h1>점검 결과</h1>
${report.subject ? `<div class="subject">${esc(report.subject)}</div>` : ""}

<div class="score">
  <div class="idx"><b>${s.index}</b><span class="of">/ 100</span><span class="chip">${esc(s.bandLabel)}</span></div>
  <div class="headline">${esc(s.headline)}</div>
  <div class="ci">문항 ${s.graded}개 채점${s.ungraded ? ` (${s.ungraded}개 채점 불가)` : ""} · 95% 신뢰구간 <span class="mono">${s.interval.low}% ~ ${s.interval.high}%</span></div>
  <div class="caveat">${esc(s.caveat)}</div>
</div>

<h2>유형별 결과</h2>
<p class="lede">유형마다 서로 다른 실패 방식을 잽니다.</p>
<div class="tablewrap"><table><thead><tr><th>점검 유형</th><th class="num">실패</th><th class="num">비율</th></tr></thead><tbody>${typeRows}</tbody></table></div>

<h2>문항별 기록</h2>
<p class="lede">AI가 한 말과 공식 확인 결과를 나란히 싣습니다. 유메의 판정을 믿지 않으셔도 되도록, 문항마다 원 출처로 가는 링크를 달았습니다.</p>
${items}

<h2>점검 방법</h2>
<div class="method"><p style="margin:0">${esc(report.method.summary)}</p></div>

${ctaHtml}

<footer>
  문항은 유메가 법제처 국가법령정보와 학술 레지스트리로 실재 여부를 확인해 생성했으며, 정답이 확정된 상태에서 출제됐습니다.
  이 점검은 표본 기반 추정이라 실제 서비스의 모든 실패를 포괄하지 않습니다.
  생성 ${esc(String(report.createdAt || "").slice(0, 10))} · 유메(YUME)
</footer>
</div></body></html>`;
}
