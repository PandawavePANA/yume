// 감사 결과 요약 메일(대표에게) — 휴대폰에서 한 번에 읽히게.
//
// 대표는 이 메일을 휴대폰 Gmail에서 연다(다크 모드 포함). 예전 메일은 글줄을 이어 붙인 텍스트라
// "무엇이 얼마나 틀렸는지"가 한눈에 안 들어왔다(2026-10-13 대표 지적). 그래서 순서를 고정한다:
//   1) 판정(위험·주의·양호)과 한 줄 설명 — 가장 크게
//   2) 숫자 세 칸 — 틀린 답변 비율, 확정 오류 수, 질문 수
//   3) 확정 오류 카드 — 제목, AI가 한 말(빨강), 원문(초록), 근거 조문
//   4) 잘 답한 것 — 체크 목록
//   5) 검토 메모 — 제외한 것과 이유(정직하게)
//   6) 보고서 버튼, 그리고 상대 담당자에게 보낼 메일(복사용 상자)
// 메일 클라이언트는 CSS를 거의 지원하지 않는다 — 표(table)와 인라인 스타일만 쓰고, 색은 배경과
// 글자를 늘 짝으로 지정해 다크 모드 반전에도 대비가 남게 한다.
import { caseFacts, lawRef, severityOf, verdictOf, SEVERITY_LEVELS } from "./renderAuditDossier.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 긴 주소(보고서 링크)는 끊을 곳이 없어 표 전체를 화면 밖으로 민다 — / 와 - 등 뒤에 줄바꿈 기회를 넣는다.
const breakable = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, (u) => u.replace(/([/\-_.?=&])/g, "$1<wbr>"));
const nl = (s) => breakable(esc(s)).replace(/\n/g, "<br>");

const TONE = {
  risk: { bg: "#C2410C", soft: "#FFF1EB", ink: "#9A3412" },
  caution: { bg: "#B7791F", soft: "#FFF8E6", ink: "#8A5A10" },
  good: { bg: "#2F7D5B", soft: "#EAF6EF", ink: "#1F5F43" },
};
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

/**
 * @param detail auditDetail(...) 결과
 * @param opts.title 머리 제목(예: "로무앤톡 2차 감사 결과")
 * @param opts.notes 검토 메모 줄들(제외 이유 등)
 * @param opts.goodLines 잘 답한 것(없으면 보고서 대표 사례에서)
 * @param opts.banner 맨 위 안내(예: 최종본 안내)
 * @param opts.meta 질문 방식 한 줄(예: "로무앤톡 화면에 한 건씩 직접 입력 · 크레딧 1,400")
 */
export function ownerAuditMail(detail, { title, notes = [], goodLines = null, banner = "", meta = "" } = {}) {
  const { audit, items, findings, results, mail, reportUrl } = detail;
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const confirmed = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  const cases = confirmed.map((f) => {
    const c = caseFacts(f, byItem.get(Number(f.item_id)));
    return { f, c, sev: severityOf(f, c) };
  }).sort((a, b) => SEVERITY_LEVELS[a.sev].rank - SEVERITY_LEVELS[b.sev].rank || a.f.id - b.f.id);
  const critical = cases.filter((x) => x.sev === "critical").length;
  const v = verdictOf(results, confirmed, critical);
  const tone = TONE[v.key];
  const goods = goodLines || findings.filter((f) => f.polarity === "good" && Number(f.featured) && f.report_title).map((f) => f.report_title);
  const service = audit.service_name || audit.company;

  const kpi = (big, small) => `<td width="33%" style="padding:4px" valign="top">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#F6F3FB;border-radius:12px"><tr><td style="padding:12px 6px;text-align:center">
      <div style="font-size:22px;line-height:1.1;font-weight:800;color:#1D1A24;letter-spacing:-0.5px">${big}</div>
      <div style="font-size:13px;line-height:1.4;color:#5E5870;margin-top:6px">${small}</div>
    </td></tr></table></td>`;

  const caseCard = (x, i) => `<tr><td style="padding:0 0 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#FFFFFF;border:1px solid #EADFD8;border-left:5px solid #C2410C;border-radius:12px"><tr><td style="padding:16px 16px 14px">
      <div style="font-size:12px;font-weight:800;color:#C2410C;letter-spacing:0.5px">오류 ${i + 1} · ${esc(SEVERITY_LEVELS[x.sev].label)}</div>
      <div style="font-size:17px;line-height:1.5;font-weight:700;color:#1D1A24;margin-top:6px">${esc(x.c.headline)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-top:12px"><tr><td style="background:#FFF1EB;border-radius:8px;padding:10px 12px">
        <div style="font-size:12px;font-weight:700;color:#9A3412">AI가 한 말</div>
        <div style="font-size:15px;line-height:1.6;color:#7C2D12;margin-top:3px">“${esc(x.c.said)}”</div>
      </td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-top:8px"><tr><td style="background:#EAF6EF;border-radius:8px;padding:10px 12px">
        <div style="font-size:12px;font-weight:700;color:#1F5F43">${esc(x.c.truthLabel)} · ${esc(lawRef(x.c))}</div>
        <div style="font-size:15px;line-height:1.6;color:#14532D;margin-top:3px">${esc(x.c.excerpt)}</div>
      </td></tr></table>
      ${x.c.link ? `<div style="margin-top:10px"><a href="${esc(x.c.link)}" style="font-size:13px;color:#6B4FA8;font-weight:700;text-decoration:none">법제처 원문 열기 →</a></div>` : ""}
    </td></tr></table>
  </td></tr>`;

  const section = (label, body) => `<tr><td style="padding:26px 24px 0">
    <div style="font-size:19px;font-weight:800;color:#1D1A24;letter-spacing:-0.3px;margin:0 0 12px">${label}</div>${body}</td></tr>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>table{table-layout:fixed}td,div,a{overflow-wrap:anywhere;word-break:break-word}</style></head>
<body style="margin:0;padding:0;background:#EFECF5;font-family:${FONT};-webkit-text-size-adjust:100%;word-break:keep-all;overflow-wrap:anywhere">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#EFECF5"><tr><td align="center" style="padding:12px 8px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;width:100%;max-width:600px;table-layout:fixed;background:#FFFFFF;border-radius:18px;overflow:hidden">
  ${banner ? `<tr><td style="background:#FFF8E6;color:#8A5A10;font-size:14px;line-height:1.6;padding:12px 24px;border-bottom:1px solid #F3E3B8"><b>안내</b> · ${esc(banner)}</td></tr>` : ""}
  <tr><td style="background:#1F1B2E;padding:22px 24px 20px">
    <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#B9A6F0">VERILINE · AI 할루시네이션 감사</div>
    <div style="font-size:24px;line-height:1.35;font-weight:800;color:#FFFFFF;margin-top:8px;letter-spacing:-0.5px">${esc(title || `${service} 감사 결과`)}</div>
    ${meta ? `<div style="font-size:14px;line-height:1.6;color:#CFC9DE;margin-top:6px">${esc(meta)}</div>` : ""}
  </td></tr>

  <tr><td style="padding:22px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:${tone.soft};border-radius:14px"><tr>
      <td style="padding:16px">
        <div style="display:inline-block;background:${tone.bg};color:#FFFFFF;font-size:22px;font-weight:900;border-radius:10px;padding:8px 16px;letter-spacing:-0.5px">판정 · ${esc(v.label)}</div>
        <div style="height:10px;line-height:10px">&nbsp;</div>
        <div style="font-size:17px;line-height:1.5;font-weight:800;color:${tone.ink}">답변 ${v.answered}개 중 ${v.wrong}개(${Math.round(v.rate)}%)에 원문과 다른 내용</div>
        <div style="font-size:14px;line-height:1.6;color:#4F4960;margin-top:4px">${esc(v.line)}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:12px 18px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;table-layout:fixed"><tr>
    ${kpi(`${v.wrong}<span style="font-size:16px;color:#857E98"> / ${v.answered}</span>`, "틀린 내용이 든 답변")}
    ${kpi(`${cases.length}건`, "원문으로 확정한 오류")}
    ${kpi(`${results.answered}개`, "보낸 질문")}
  </tr></table></td></tr>

  ${cases.length ? section(`확정 오류 ${cases.length}건`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${cases.map(caseCard).join("")}</table>`) : ""}

  ${goods.length ? section("정확하게 답한 것", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${goods.map((g) => `<tr><td valign="top" style="width:26px;padding:4px 0;font-size:16px;color:#2F7D5B;font-weight:900">✓</td><td style="padding:4px 0;font-size:15px;line-height:1.6;color:#2E2A38">${esc(g)}</td></tr>`).join("")}</table>`) : ""}

  ${notes.length ? section("검토 메모", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#F6F3FB;border-radius:12px"><tr><td style="padding:12px 14px;font-size:14px;line-height:1.7;color:#4F4960">${notes.map((n) => `• ${esc(n)}`).join("<br>")}</td></tr></table>`) : ""}

  <tr><td align="center" style="padding:26px 24px 4px">
    <a href="${esc(reportUrl)}" style="display:inline-block;background:#6B4FA8;color:#FFFFFF;font-size:17px;font-weight:800;text-decoration:none;border-radius:12px;padding:15px 28px">감사 보고서 열기</a>
    <div style="font-size:12px;color:#857E98;margin-top:8px">비공개 링크 · 발견 사항마다 AI 답변·원문·법제처 링크가 있습니다</div>
  </td></tr>

  ${section("담당자에게 보낼 메일", `<div style="font-size:14px;line-height:1.6;color:#5E5870;margin:-4px 0 10px">아래를 그대로 복사해 <b>담당자 개인 주소</b>로 보내세요(대표 메일함 X).</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#FAF8FD;border:1px dashed #CDBFEA;border-radius:12px"><tr><td style="padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:#857E98">제목</div>
      <div style="font-size:15px;line-height:1.5;font-weight:700;color:#1D1A24;margin-top:2px">${esc(mail.first.subject)}</div>
      <div style="font-size:12px;font-weight:700;color:#857E98;margin-top:12px">본문</div>
      <div style="font-size:15px;line-height:1.75;color:#2E2A38;margin-top:2px">${nl(mail.first.body)}</div>
    </td></tr></table>`)}

  <tr><td style="padding:24px 24px 22px;font-size:12px;line-height:1.7;color:#958EA8">베리라인 · 이 메일은 대표 확인용입니다. 감사 결과는 상대 회사에만 비공개로 전달하고, 동의 없이 공개하지 않습니다.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    title || `${service} 감사 결과`,
    meta,
    "",
    `판정: ${v.label} — 답변 ${v.answered}개 중 ${v.wrong}개(${Math.round(v.rate)}%)에 원문과 다른 내용`,
    "",
    ...cases.map((x, i) => `[오류 ${i + 1}] ${x.c.headline}\n  AI: “${x.c.said}”\n  원문(${lawRef(x.c)}): ${x.c.excerpt}`),
    "",
    goods.length ? `정확하게 답한 것:\n${goods.map((g) => `✓ ${g}`).join("\n")}` : "",
    notes.length ? `\n검토 메모:\n${notes.map((n) => `• ${n}`).join("\n")}` : "",
    "",
    `감사 보고서: ${reportUrl}`,
    "",
    "── 담당자에게 보낼 메일 ──",
    `제목: ${mail.first.subject}`,
    "",
    mail.first.body,
  ].filter((x) => x !== null).join("\n");

  return { subject: `[베리라인] ${service} — 판정 ${v.label} · 확정 오류 ${cases.length}건`, html, text, verdict: v };
}
