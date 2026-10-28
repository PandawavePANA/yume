// 베리라인 고객 메일 틀 — 신청 접수 확인. 2026-10-29: 무료 진단을 신청한 고객이 받는 첫 메일.
// 고객 메일에는 베리라인 이름 · contact@veriline.kr · veriline.kr만 나온다(리머 외주 · 옛 주소 없음).
// 사업자 정보 줄은 법이 요구하는 표시라 renderPages.js의 COMPANY에서 읽는다.
import { COMPANY, VERILINE, esc } from "./renderPages.js";

const COPY = {
  veriline_diagnosis: {
    subject: "무료 진단 신청을 받았습니다",
    lead: "무료 진단 신청을 받았습니다.",
    steps: [
      "일반 사용자처럼 서비스 화면에서 개정 직후 조문 · 숫자 요건 · 단서 · 벌칙을 묻는 질문을 넣어 봅니다. API 키나 내부 권한은 필요 없습니다.",
      "보통 영업일 3일 안에, 현행 법과 다르게 답한 곳과 근거 조문 링크를 이 메일 주소로 보내 드립니다. 다르게 답한 곳이 없으면 그렇다고 알려 드립니다.",
      "로그인해야 쓸 수 있는 서비스라면 시험 계정을 이 메일에 답장으로 보내 주세요. 그날부터 셉니다.",
      "결과는 귀사에만 드리고 공개하지 않습니다.",
    ],
  },
  yume_api: {
    subject: "도입 문의를 받았습니다",
    lead: "도입 문의를 받았습니다.",
    steps: ["영업일 하루 안에 이 메일 주소로 답장을 드립니다.", "급하시면 이 메일에 답장하시거나 아래 번호로 전화 주세요."],
  },
};

/** 접수 확인 메일. 반환: { subject, text, html } — sendMail에 그대로 펼친다. */
export function veriLineReceiptMail({ id, name, kind, company = "" }) {
  const c = COPY[kind] || COPY.yume_api;
  const number = `VL-D-${id}`;
  const who = `${company ? `${company} ` : ""}${name}님`;
  const contact = `${VERILINE.email} · ${COMPANY.tel} · ${VERILINE.site.replace(/^https?:\/\//, "")}`;
  const biz = `${COMPANY.name} · 대표 ${COMPANY.ceo} · 사업자등록번호 ${COMPANY.regNo}`;
  const text = [`${who}, ${c.lead}`, `접수 번호 ${number}`, "", ...c.steps.map((s) => `- ${s}`), "", `문의: ${contact}`, "", `베리라인 · ${biz}`].join("\n");
  const html = `<div style="font-family:Pretendard,system-ui,sans-serif;line-height:1.75;color:#0A0E17;font-size:14.5px;max-width:560px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#2F6BFF;font-weight:700">VERILINE</p>
  <p style="margin:0 0 14px"><b>${esc(who)}</b>, ${esc(c.lead)}<br><span style="color:#5C6170">접수 번호 ${esc(number)}</span></p>
  <ul style="margin:0 0 16px;padding-left:18px">${c.steps.map((s) => `<li style="margin:4px 0">${esc(s)}</li>`).join("")}</ul>
  <p style="margin:0;font-size:13px;color:#5C6170">문의 ${esc(contact)}</p>
  <p style="margin:14px 0 0;font-size:11.5px;color:#8A93A6">베리라인 · ${esc(biz)}</p>
</div>`;
  return { subject: `[베리라인] ${c.subject} · ${number}`, text, html };
}
