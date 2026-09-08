// 카카오톡 등 외부 채널에서 링크로 공유된 검증 결과를 보여주는, React 앱과는
// 별개의 정적 서버 렌더링 페이지. React 클라이언트 라우팅을 새로 붙이는 대신
// (SPA에는 아직 라우터가 없다) 이 결과 하나만 보여주는 용도로 가볍게 만들었다.
//
// 진짜 유메 사이트의 검증 카드(맥 창 점 3개 헤더, 스피너, 판정 배지 색상 등)와
// 최대한 똑같이 보이도록 YumeDashboard.jsx에 있는 색상표(VERDICT/VBG/VBORDER/
// OVERALL_TONE)와 마크업 구조를 그대로 옮겨왔다 — 카카오로 받은 사람이 "어? 이거
// 딴 페이지네" 싶지 않게, 진짜 유메 결과 화면을 보고 있다는 느낌을 주기 위해서다.
//
// status가 "pending"이면 검증이 아직 끝나지 않은 것 — 카카오 스킬이 5초 안에
// 응답해야 해서, 검증이 끝나기 전에 이 링크부터 먼저 보낸다. 그래서 이 페이지는
// 자바스크립트 폴링 대신 아주 단순하게 <meta refresh>로 몇 초마다 스스로
// 새로고침하면서, 서버에 저장된 상태가 "done"으로 바뀌길 기다린다.

const VERDICT = {
  confirmed: { label: "확인됨", bg: "#E7F6EE", color: "#1F9D66", glyph: "✓" },
  false: { label: "사실과 다름", bg: "#FBE9E7", color: "#C6402F", glyph: "✕" },
  uncertain: { label: "판단 보류", bg: "#FDF0DC", color: "#B4690E", glyph: "!" },
};
const VBORDER = { confirmed: "#E6EFE9", false: "#F5D8D3", uncertain: "#F3E3C4" };
const VBG = { confirmed: "#F9FBF9", false: "#FDF4F3", uncertain: "#FFFBF3" };
const OVERALL_TONE = {
  confirmed: { bg: "#EAF7F0", border: "#B7E4CC", fg: "#fff", chipBg: "#1F9D66" },
  uncertain: { bg: "#FFF6E0", border: "#F0D98C", fg: "#7A5B00", chipBg: "#FCE7A6" },
  false: { bg: "#FBEDEA", border: "#F0BCB0", fg: "#fff", chipBg: "#C6402F" },
};

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 카카오톡에서 붙여넣는 원문은 몇 문단씩 되는 경우가 많아서, 그걸 그대로 다
// 펼쳐두면 정작 중요한 판정 결과를 보려고 한참 스크롤해야 한다. 짧으면 그대로
// 보여주고, 길면 <details>/<summary>로 접어둔다 — 자바스크립트 없이 순수 HTML
// 만으로 동작해서 카카오톡 인앱 브라우저에서도 안전하게 펼치고 접을 수 있다.
const INPUT_PREVIEW_LEN = 90;
function inputBox(input) {
  const text = input || "";
  if (text.length <= INPUT_PREVIEW_LEN) {
    return `<div class="input-box">${esc(text)}</div>`;
  }
  const preview = text.slice(0, INPUT_PREVIEW_LEN).trim();
  return `<details class="input-box">
    <summary style="cursor:pointer;">${esc(preview)}… <span style="color:#8B5FD9;font-weight:600;">전체 보기 (${text.length}자)</span></summary>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #DEC8F2;">${esc(text)}</div>
  </details>`;
}

const BASE_STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif;
    background: radial-gradient(ellipse 80% 60% at 50% -10%, #D3B8F5 0%, #E3CDF7 40%, #F1E3FA 75%, #F8F0FC 100%);
    color: #241F33; min-height: 100vh;
  }
  .wrap { max-width: 640px; margin: 0 auto; padding: 40px 18px 60px; }
  .card { background: #fff; border-radius: 20px; border: 1px solid #D9BFF0; box-shadow: 0 1px 2px rgba(107,79,168,0.08), 0 16px 44px rgba(107,79,168,0.22); overflow: hidden; }
  .card-header { display: flex; align-items: center; gap: 8px; padding: 14px 20px; border-bottom: 1px solid #E3CEF5; }
  .dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
  .card-title { margin-left: 10px; font-size: 12.5px; color: #A99BC9; font-weight: 500; }
  .card-body { padding: 24px; }
  .input-box { background: #F1E6FB; border: 1px solid #DEC8F2; border-radius: 12px; padding: 16px; margin-bottom: 16px; font-size: 13.5px; color: #33363F; line-height: 1.7; white-space: pre-wrap; }
  .section-label { font-size: 11px; font-weight: 700; color: #B0A2D6; letter-spacing: 0.03em; margin: 22px 0 10px; }
  .footer { text-align: center; font-size: 12px; color: #A99BC9; margin-top: 20px; }
  a.cta { display: block; text-align: center; margin-top: 20px; background: linear-gradient(90deg,#B49AEE,#6B4FA8); color: #fff; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 13px 0; border-radius: 12px; }
  @keyframes yume-spin { to { transform: rotate(360deg); } }
`;

function cardHeader() {
  return `
    <div class="card-header">
      <span class="dot" style="background:#E2665E;"></span>
      <span class="dot" style="background:#E8B349;"></span>
      <span class="dot" style="background:#5FBD73;"></span>
      <span class="card-title">AI 답변 붙여넣고 검증하기</span>
    </div>`;
}

function page({ head = "", cardBody, footer = "" }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>유메 검증 결과</title>
${head}
<style>${BASE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${cardHeader()}
      <div class="card-body">${cardBody}</div>
    </div>
    <a class="cta" href="/">유메로 직접 확인해보기 →</a>
    ${footer}
  </div>
</body>
</html>`;
}

export function renderResultPage({ id, input, status, result, createdAt }) {
  if (status === "pending") {
    const elapsedSec = Math.max(0, Math.round((Date.now() - (createdAt || Date.now())) / 1000));
    return page({
      head: `<meta http-equiv="refresh" content="4">`,
      cardBody: `
        ${inputBox(input)}
        <div style="display:flex;flex-direction:column;align-items:center;padding:40px 0 12px;gap:14px;">
          <div style="width:28px;height:28px;border-radius:999px;border:3px solid #D4BEF0;border-top-color:#8B7FD8;animation:yume-spin 0.8s linear infinite;"></div>
          <div style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#8B7FD8;background:#F1E6FB;border-radius:999px;padding:4px 12px;">
            <span style="font-variant-numeric:tabular-nums;">${elapsedSec}초</span> 동안 확인하는 중…
          </div>
          <div style="font-size:14px;color:#9C8FC2;text-align:center;max-width:420px;padding:0 16px;">AI 답변에서 사실 주장을 추출하고 실시간으로 검색하는 중…</div>
          <div style="font-size:12px;color:#B6A9D6;">내용이 길면 최대 30초 정도 걸릴 수 있어요 · 이 페이지는 4초마다 자동으로 새로고침됩니다</div>
        </div>`,
      footer: `<div class="footer">id: ${esc(id)}</div>`,
    });
  }

  if (status === "error") {
    return page({
      cardBody: `
        ${inputBox(input)}
        <div style="padding:14px 16px;border-radius:12px;background:#FBEDEA;border:1px solid #F0BCB0;font-size:13.5px;color:#2A2440;line-height:1.6;">
          확인 중 오류가 발생했어요. 카카오톡 채널에 다시 한번 보내주세요.
        </div>`,
    });
  }

  const tone = OVERALL_TONE[result.overall?.tone] || OVERALL_TONE.uncertain;
  const claimsHtml = (result.claims || [])
    .map((c) => {
      const v = VERDICT[c.verdict] || VERDICT.uncertain;
      const officialBadge = c.verified_via === "official"
        ? `<span style="font-size:9.5px;font-weight:700;color:#6B4FA8;background:#EDE4FB;border-radius:999px;padding:1px 7px;">법제처 공식 확인${c.effective_date ? ` · ${esc(c.effective_date)} 시행 기준` : ""}</span>`
        : c.verified_via === "unavailable"
        ? `<span style="font-size:9.5px;font-weight:700;color:#9C8FC2;background:#F1ECFA;border-radius:999px;padding:1px 7px;">공식 API 미연동</span>`
        : "";
      return `
        <div style="display:flex;gap:10px;padding:12px 14px;border-radius:12px;background:${VBG[c.verdict] || VBG.uncertain};border:1px solid ${VBORDER[c.verdict] || VBORDER.uncertain};margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:${v.bg};color:${v.color};font-size:12px;font-weight:700;flex-shrink:0;">${v.glyph}</span>
          <div>
            <div style="font-size:10.5px;font-weight:700;letter-spacing:0.02em;color:#A99BC9;margin-bottom:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span>${esc(c.domain || "")} · ${v.label}</span>
              ${officialBadge}
            </div>
            <div style="font-size:13.5px;color:#2A2440;line-height:1.55;margin-bottom:3px;">${esc(c.text)}</div>
            <div style="font-size:12px;color:#6E6389;">${esc(c.explanation || "")}</div>
          </div>
        </div>`;
    })
    .join("\n");

  const sources = (result.claims || []).flatMap((c) => (c.sources || []).map((s) => ({ ...s, forClaim: c.text })));
  const sourcesHtml = sources.length
    ? sources
        .map(
          (s) => `
        <div style="padding:10px 12px;border-radius:10px;background:#F9F6FD;border:1px solid #E3D9F2;margin-bottom:8px;">
          <a href="${esc(s.url)}" style="font-size:13px;color:#6B4FA8;font-weight:600;text-decoration:none;">${esc(s.title || s.url)}</a>
          <div style="font-size:11.5px;color:#9C8FC2;margin-top:2px;">${esc(s.forClaim)}</div>
        </div>`
        )
        .join("\n")
    : `<div style="font-size:13px;color:#9C8FC2;">이 검증에는 표시할 출처가 없습니다.</div>`;

  return page({
    head: `<meta property="og:title" content="유메 검증 결과" />\n<meta property="og:description" content="${esc(result.overall?.detail || result.summary || "AI 답변 팩트체크 결과")}" />`,
    cardBody: `
      ${inputBox(input)}
      <div style="padding:14px 16px;border-radius:12px;background:${tone.bg};border:1px solid ${tone.border};margin-bottom:10px;">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:700;color:${tone.fg};background:${tone.chipBg};border-radius:999px;padding:3px 10px;">${esc(result.overall?.label || "판단 보류")}</span>
          <span style="font-size:12.5px;color:#6E6389;">도메인: ${esc(result.overall_domain || "일반")}</span>
        </div>
        <div style="font-size:13.5px;color:#2A2440;line-height:1.6;">${esc(result.overall?.detail || result.summary || "")}</div>
      </div>
      ${result.summary ? `<p style="font-size:13px;color:#6E6389;margin:0 0 16px;line-height:1.6;">${esc(result.summary)}</p>` : ""}
      <div class="section-label">검증 결과</div>
      ${claimsHtml}
      <div class="section-label">근거 자료 ${sources.length ? `(${sources.length})` : ""}</div>
      ${sourcesHtml}`,
    footer: `<div class="footer">id: ${esc(id)}</div>`,
  });
}
