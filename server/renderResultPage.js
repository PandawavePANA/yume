// 카카오톡 등 외부 채널에서 링크로 공유된 검증 결과를 보여주는, React 앱과는
// 별개의 정적 서버 렌더링 페이지. React 클라이언트 라우팅을 새로 붙이는 대신
// (SPA에는 아직 라우터가 없다) 이 결과 하나만 보여주는 용도로 가볍게 만들었다.
// 색상·톤은 메인 앱과 맞췄지만 상호작용(재검증, 로그인 등)은 없는 읽기 전용 페이지다.

const TONE = {
  confirmed: { bg: "#EAF7F0", border: "#B7E4CC", chipBg: "#1F9D66" },
  uncertain: { bg: "#FFF6E0", border: "#F0D98C", chipBg: "#FCE7A6", chipFg: "#7A5B00" },
  false: { bg: "#FBEDEA", border: "#F0BCB0", chipBg: "#C6402F" },
};

const VERDICT_LABEL = { confirmed: "확인됨", false: "사실과 다름", uncertain: "판단 보류" };

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderResultPage({ id, input, result }) {
  const tone = TONE[result.overall?.tone] || TONE.uncertain;
  const chipFg = tone.chipFg || "#fff";
  const claimsHtml = (result.claims || [])
    .map((c) => {
      const t = TONE[c.verdict] || TONE.uncertain;
      const cfg = t.chipFg || "#fff";
      return `
        <div style="background:#fff;border:1px solid #E3D9F2;border-radius:14px;padding:16px 18px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:11.5px;font-weight:700;color:${cfg};background:${t.chipBg};border-radius:999px;padding:2px 9px;">${esc(VERDICT_LABEL[c.verdict] || "판단 보류")}</span>
            <span style="font-size:11.5px;color:#9C8FC2;">${esc(c.domain || "")}</span>
          </div>
          <div style="font-size:14.5px;font-weight:600;color:#241F33;margin-bottom:4px;">${esc(c.text)}</div>
          ${c.explanation ? `<div style="font-size:13px;color:#6E6389;line-height:1.6;">${esc(c.explanation)}</div>` : ""}
        </div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>유메 검증 결과</title>
<meta property="og:title" content="유메 검증 결과" />
<meta property="og:description" content="${esc(result.overall?.detail || result.summary || "AI 답변 팩트체크 결과")}" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif;
    background: radial-gradient(ellipse 80% 60% at 50% -10%, #D3B8F5 0%, #E3CDF7 40%, #F1E3FA 75%, #F8F0FC 100%);
    color: #241F33; min-height: 100vh;
  }
  .wrap { max-width: 640px; margin: 0 auto; padding: 28px 18px 60px; }
  .brand { font-size: 13px; font-weight: 700; color: #6B4FA8; letter-spacing: 0.04em; margin-bottom: 18px; }
  .input-box { background: #fff; border: 1px solid #E3D9F2; border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; font-size: 13.5px; color: #4C5266; line-height: 1.6; white-space: pre-wrap; }
  .overall { padding: 16px 18px; border-radius: 14px; margin-bottom: 18px; }
  .footer { text-align: center; font-size: 12px; color: #A99BC9; margin-top: 28px; }
  a.cta { display: block; text-align: center; margin-top: 24px; background: linear-gradient(90deg,#B49AEE,#6B4FA8); color: #fff; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 13px 0; border-radius: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">YUME 검증 결과</div>
    <div class="input-box">${esc(input)}</div>
    <div class="overall" style="background:${tone.bg};border:1px solid ${tone.border};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-size:12.5px;font-weight:700;color:${chipFg};background:${tone.chipBg};border-radius:999px;padding:3px 10px;">${esc(result.overall?.label || "판단 보류")}</span>
        <span style="font-size:12.5px;color:#6E6389;">도메인: ${esc(result.overall_domain || "일반")}</span>
      </div>
      <div style="font-size:13.5px;color:#2A2440;line-height:1.6;">${esc(result.overall?.detail || result.summary || "")}</div>
    </div>
    ${claimsHtml}
    <a class="cta" href="/">유메로 직접 확인해보기 →</a>
    <div class="footer">이 링크는 카카오톡 등에서 공유된 검증 결과입니다 · id: ${esc(id)}</div>
  </div>
</body>
</html>`;
}
