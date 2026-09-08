// 카카오톡 등 외부 채널에서 링크로 공유된 검증 결과를 보여주는, React 앱과는
// 별개의 정적 서버 렌더링 페이지. React 클라이언트 라우팅을 새로 붙이는 대신
// (SPA에는 아직 라우터가 없다) 이 결과 하나만 보여주는 용도로 가볍게 만들었다.
// 색상·톤은 메인 앱과 맞췄지만 상호작용(재검증, 로그인 등)은 없는 읽기 전용 페이지다.
//
// status가 "pending"이면 검증이 아직 끝나지 않은 것 — 카카오 스킬이 5초 안에
// 응답해야 해서, 검증이 끝나기 전에 이 링크부터 먼저 보낸다. 그래서 이 페이지는
// 자바스크립트 폴링 대신 아주 단순하게 <meta refresh>로 몇 초마다 스스로
// 새로고침하면서, 서버에 저장된 상태가 "done"으로 바뀌길 기다린다.

const TONE = {
  confirmed: { bg: "#EAF7F0", border: "#B7E4CC", chipBg: "#1F9D66" },
  uncertain: { bg: "#FFF6E0", border: "#F0D98C", chipBg: "#FCE7A6", chipFg: "#7A5B00" },
  false: { bg: "#FBEDEA", border: "#F0BCB0", chipBg: "#C6402F" },
};

const VERDICT_LABEL = { confirmed: "확인됨", false: "사실과 다름", uncertain: "판단 보류" };

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const BASE_STYLE = `
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
`;

function page({ head = "", body, input }) {
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
    <div class="brand">YUME 검증 결과</div>
    ${input !== undefined ? `<div class="input-box">${esc(input)}</div>` : ""}
    ${body}
    <a class="cta" href="/">유메로 직접 확인해보기 →</a>
  </div>
</body>
</html>`;
}

export function renderResultPage({ id, input, status, result }) {
  if (status === "pending") {
    return page({
      head: `<meta http-equiv="refresh" content="4">`,
      input,
      body: `
        <div class="overall" style="background:#F1E6FB;border:1px solid #D9BFF0;text-align:center;">
          <div style="width:26px;height:26px;border-radius:999px;border:3px solid #D4BEF0;border-top-color:#8B7FD8;margin:4px auto 14px;animation:spin 0.8s linear infinite;"></div>
          <div style="font-size:14px;color:#4C5266;">유메가 확인하고 있어요… 이 페이지는 4초마다 자동으로 새로고침됩니다.</div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        <div class="footer">id: ${esc(id)}</div>`,
    });
  }

  if (status === "error") {
    return page({
      input,
      body: `
        <div class="overall" style="background:#FBEDEA;border:1px solid #F0BCB0;">
          <div style="font-size:13.5px;color:#2A2440;line-height:1.6;">확인 중 오류가 발생했어요. 카카오톡 채널에 다시 한번 보내주세요.</div>
        </div>`,
    });
  }

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

  return page({
    head: `<meta property="og:title" content="유메 검증 결과" />\n<meta property="og:description" content="${esc(result.overall?.detail || result.summary || "AI 답변 팩트체크 결과")}" />`,
    input,
    body: `
    <div class="overall" style="background:${tone.bg};border:1px solid ${tone.border};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-size:12.5px;font-weight:700;color:${chipFg};background:${tone.chipBg};border-radius:999px;padding:3px 10px;">${esc(result.overall?.label || "판단 보류")}</span>
        <span style="font-size:12.5px;color:#6E6389;">도메인: ${esc(result.overall_domain || "일반")}</span>
      </div>
      <div style="font-size:13.5px;color:#2A2440;line-height:1.6;">${esc(result.overall?.detail || result.summary || "")}</div>
    </div>
    ${claimsHtml}
    <div class="footer">id: ${esc(id)}</div>`,
  });
}
