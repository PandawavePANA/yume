// 상대 회사 담당자에게 보내는 첫 메일(HTML) — 열어서 끝까지 읽고, 보고서를 누르게.
//
// 텍스트만 있는 메일은 받은편지함에서 다른 영업 메일과 구분이 안 된다(2026-10-13 대표: "너무 단조로워,
// 무조건 읽고 보고서에 들어가게"). 그렇다고 광고처럼 꾸미면 스팸으로 보인다. 그래서 1:1 편지의 모양은
// 지키면서 시선이 가는 자리 세 곳만 만든다:
//   1) 숫자 하나 — "12개 중 4개"를 크게
//   2) 어디가 틀렸는지 "조문 이름"만 칩으로 — 무엇이 틀렸는지는 보고서에 있다(궁금해서 누르게)
//   3) 버튼 하나 — "어떤 답이 틀렸는지 보기"
// 사례 내용은 본문에 풀지 않는다. 압박·기한·가격 문구는 쓰지 않는다(lintCopy와 같은 원칙).
// 메일 클라이언트용이라 표(table)와 인라인 스타일만 쓴다.
import { caseFacts, lawRef } from "./renderAuditDossier.js";
import { COMPANY } from "./renderPages.js";
import { OPT_OUT } from "./auditDesk.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

/** 오류가 나온 조문 이름(중복 제거, 최대 5개). "고용보험법 제40조"처럼 법령명이 너무 길면 줄인다. */
function lawChips(detail) {
  const byItem = new Map(detail.items.map((i) => [Number(i.id), i]));
  const seen = new Set();
  const out = [];
  for (const f of detail.findings) {
    if (f.polarity !== "issue" || f.review !== "confirmed") continue;
    let ref = lawRef(caseFacts(f, byItem.get(Number(f.item_id))));
    ref = ref.replace(/^남녀고용평등과\s*일[·ㆍ]?\s*가정\s*양립\s*지원에\s*관한\s*법률/, "남녀고용평등법").replace(/^남녀고용평등과일[·ㆍ]가정양립지원에관한법률/, "남녀고용평등법");
    if (ref && ref !== "—" && !seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out.slice(0, 5);
}

/**
 * @param detail auditDetail(...) 결과 — mail.first(제목·텍스트 본문)와 결과 숫자를 쓴다
 * @param opts.cardUrl 서명에 넣을 명함 이미지 주소(없으면 글자 서명). 기본은 유메 서버의 /mail-assets/card.png
 * 반환: { subject, html, text }
 */
export function clientAuditMail(detail, { cardUrl = `${(process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "")}/mail-assets/card.png` } = {}) {
  const { audit, results, findings, mail, reportUrl } = detail;
  const confirmed = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  const wrong = new Set(confirmed.map((f) => Number(f.item_id))).size;
  const n = Number(results?.answered) || 0;
  const brand = String(mail.first.subject).replace(/^\[비공개\]\s*/, "").split(" AI ")[0] || audit.company;
  const who = audit.contact_name ? `${esc(audit.contact_name)}님` : "담당자님";
  const chips = lawChips(detail);
  const clean = !confirmed.length;

  const chip = (t) => `<span style="display:inline-block;margin:0 6px 8px 0;padding:6px 11px;border-radius:999px;background:#F3EFFA;color:#4B3A78;font-size:13px;font-weight:700;white-space:nowrap">${esc(t)}</span>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><style>table{table-layout:fixed}td,div,p,a{overflow-wrap:anywhere;word-break:keep-all}</style></head>
<body style="margin:0;padding:0;background:#F4F2F8;font-family:${FONT};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#F4F2F8"><tr><td align="center" style="padding:14px 8px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;width:100%;max-width:560px;background:#FFFFFF;border-radius:16px">
  <tr><td style="padding:22px 24px 0">
    <span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:1px;color:#8A4B2F;background:#FDF0E8;border-radius:6px;padding:4px 9px">비공개 · ${esc(brand)} 한정</span>
  </td></tr>
  <tr><td style="padding:16px 24px 0;font-size:15px;line-height:1.75;color:#3A3546">
    안녕하세요, ${who}.<br>AI 할루시네이션 감지 서비스 <b style="color:#1D1A24">유메</b>를 운영하는 ${esc(COMPANY.ceo)}입니다.
  </td></tr>

  <tr><td style="padding:22px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-left:4px solid ${clean ? "#2F7D5B" : "#C2410C"}"><tr><td style="padding:2px 0 2px 16px">
      <div style="font-size:14px;font-weight:700;color:#6E6780">${esc(brand)} AI에 질문 ${n}개를 넣어 본 결과</div>
      ${clean
        ? `<div style="font-size:30px;line-height:1.25;font-weight:900;color:#1F5F43;letter-spacing:-0.8px;margin-top:6px">법령 원문과 다른 답 0개</div>`
        : `<div style="font-size:34px;line-height:1.2;font-weight:900;color:#C2410C;letter-spacing:-1px;margin-top:6px">${n}개 중 ${wrong}개</div>
      <div style="font-size:19px;line-height:1.5;font-weight:800;color:#1D1A24;margin-top:4px;letter-spacing:-0.3px">답변이 법령 원문과 달랐습니다.</div>`}
    </td></tr></table>
  </td></tr>

  ${!clean && chips.length ? `<tr><td style="padding:18px 24px 0">
    <div style="font-size:13px;font-weight:700;color:#6E6780;margin-bottom:9px">원문과 다르게 안내한 조문</div>
    <div>${chips.map(chip).join("")}</div>
    <div style="font-size:14px;line-height:1.7;color:#4F4960;margin-top:2px">각 조문에서 <b style="color:#1D1A24">AI가 무엇이라고 답했는지</b>, 실제 원문은 무엇인지 보고서에 나란히 정리했습니다.</div>
  </td></tr>` : ""}

  <tr><td align="center" style="padding:24px 24px 6px">
    <a href="${esc(reportUrl)}" style="display:block;background:#5B3FA0;color:#FFFFFF;font-size:17px;font-weight:800;text-decoration:none;border-radius:12px;padding:16px 18px;text-align:center">${clean ? "감사 보고서 보기" : "어떤 답이 틀렸는지 보기 →"}</a>
    <div style="font-size:12.5px;line-height:1.6;color:#857E98;margin-top:9px">질문 원문 · 답변 받은 시각 · 법제처 원문 링크 포함 · 3분이면 읽습니다</div>
  </td></tr>

  <tr><td style="padding:18px 24px 0;font-size:15px;line-height:1.75;color:#3A3546">
    같은 질문을 귀사 서비스에 넣어 직접 확인해 보실 수 있습니다(AI 답변은 시점에 따라 달라질 수 있습니다).
  </td></tr>
  <tr><td style="padding:14px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#F7F5FB;border-radius:10px"><tr><td style="padding:12px 14px;font-size:14px;line-height:1.7;color:#4F4960">
      🔒 이 결과는 <b style="color:#1D1A24">외부에 공개하지 않았으며 앞으로도 공개할 계획이 없습니다.</b>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 24px 0;font-size:15px;line-height:1.75;color:#3A3546">
    ${clean ? "원하시면 이 결과를 ‘YUME 감사 기록’으로 공개해 고객이나 투자자에게 근거로 보여 주실 수 있습니다. 공개는 귀사가 동의하실 때만 합니다." : "필요하시면 범위를 넓혀 한 번 더 무료로 검사해 드리겠습니다."}
    <div style="margin-top:10px;font-weight:800;color:#1D1A24">관심 있으시면 이 메일로 답장 주세요. 친절히 설명해 드리겠습니다.</div>
    <div style="margin-top:6px;font-size:14px;color:#857E98">필요 없으시면 편하게 넘기셔도 됩니다.</div>
  </td></tr>

  <tr><td style="padding:22px 24px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-top:1px solid #ECE8F3"><tr><td style="padding-top:16px">
      <div style="font-size:15px;line-height:1.6;color:#3A3546;margin-bottom:12px">감사합니다.<br><b style="color:#1D1A24">${esc(COMPANY.ceo)}</b> 드림</div>
      ${cardUrl
        ? `<a href="https://www.d-reamer.com" style="text-decoration:none"><img src="${esc(cardUrl)}" width="320" alt="${esc(`${COMPANY.ceo} · REAMER Founder · ${COMPANY.email} · www.d-reamer.com`)}" style="display:block;width:100%;max-width:320px;height:auto;border-radius:10px;border:0"></a>
      <div style="font-size:12px;line-height:1.6;color:#958EA8;margin-top:8px">유메(YUME)는 리머(REAMER)가 운영합니다 · <a href="https://www.yume-reamer.com" style="color:#5B3FA0;text-decoration:none;font-weight:700">www.yume-reamer.com</a></div>`
        : `<div style="font-size:13px;line-height:1.7;color:#857E98">유메(YUME) 대표 · <a href="https://www.yume-reamer.com" style="color:#5B3FA0;text-decoration:none;font-weight:700">www.yume-reamer.com</a><br>${esc(COMPANY.email)}</div>`}
      <div style="font-size:11.5px;line-height:1.6;color:#A8A2B8;margin-top:12px">${esc(OPT_OUT)}</div>
    </td></tr></table>
  </td></tr>
</table>
</td></tr></table></body></html>`;

  return { subject: mail.first.subject, html, text: mail.first.body };
}
