// 서연 — 기업 발굴. 한국어 AI 상담·답변 서비스를 운영하는 회사를 웹 검색으로 찾아 감사 후보로 올린다.
//
// 찾는 것은 "회사가 공개한 정보"뿐이다 — 서비스 주소, 회사가 사이트에 적어 둔 문의·제휴 메일, 이용약관 주소.
// 개인을 찾아 연락처를 모으지 않는다. 담당자 개인 주소는 대표가 직접 확인한다(발송 체크리스트의 마지막 줄).
import { all } from "../../db.js";
import { createAudit, updateAudit, DESK_DOMAINS } from "../../auditDesk.js";

// 업종 → 검색할 서비스 모양. 영업 우선순위 순서(기업용 페이지 SECTOR와 같은 생각).
const TARGETS = [
  { domain: "인사", what: "노무·근로기준법·4대보험·육아휴직을 답해 주는 AI 노무 상담 챗봇" },
  { domain: "법률", what: "법률 질문에 답하는 AI 법률 상담 서비스(리걸테크)" },
  { domain: "금융", what: "세금·연말정산·보험·대출 질문에 답하는 AI 세무·금융 상담 챗봇" },
  { domain: "의료", what: "증상·약·건강 질문에 답하는 AI 건강 상담 서비스" },
  { domain: "공공", what: "민원·복지·정부 지원 제도를 안내하는 AI 상담 챗봇" },
  { domain: "커머스", what: "환불·청약철회·보증 정책을 안내하는 쇼핑몰·플랫폼 AI 고객 상담 챗봇" },
];

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** 이미 데스크에 있는 서비스 주소(호스트). 같은 곳을 두 번 올리지 않는다. */
export async function knownHosts() {
  const rows = await all("SELECT service_url FROM ai_audits WHERE service_url <> ''");
  return new Set(rows.map((r) => hostOf(r.service_url)).filter(Boolean));
}

/** 오늘 찾을 업종 — 데스크에 후보가 가장 적은 업종부터. */
export async function pickTarget() {
  const rows = await all("SELECT domain, COUNT(*) AS n FROM ai_audits GROUP BY domain");
  const have = Object.fromEntries(rows.map((r) => [r.domain, Number(r.n)]));
  return [...TARGETS].sort((a, b) => (have[a.domain] || 0) - (have[b.domain] || 0))[0];
}

const SYSTEM = `당신은 B2B 영업 리서처입니다. 웹 검색으로 실제로 운영 중인 한국 서비스를 찾아 표로 정리합니다.
규칙:
- 실제로 지금 접속해서 쓸 수 있는 서비스만. 검색 결과에서 확인하지 못한 회사·주소·메일은 지어내지 말고 빈칸("")으로 두세요.
- contact_email은 그 회사가 자기 사이트에 공개한 문의·제휴·고객센터 메일만 적습니다(개인 SNS·추측 금지).
- tos_url은 그 서비스의 이용약관 페이지 주소(찾았을 때만).
- 대기업 계열 대형 서비스보다, 담당자에게 메일이 닿을 만한 스타트업·중소 규모를 우선합니다.
- JSON 하나만 출력: {"candidates":[{"company":"","service_name":"","service_url":"","contact_email":"","tos_url":"","why":"한 줄: 어떤 AI가 무엇을 답하는지","evidence_url":""}]}`;

export async function run(ctx) {
  const cap = ctx.cap(3);
  const target = await pickTarget();
  const known = await knownHosts();
  const exclude = [...known].slice(0, 80).join(", ") || "없음";
  const { json, usd } = await ctx.deps.ai({
    system: SYSTEM,
    user: `${target.what}를 운영하는 한국 회사를 ${cap + 2}곳 찾아 주세요(최대 ${cap + 2}곳).\n이미 아는 곳(제외): ${exclude}`,
    searches: 5,
    maxTokens: 6000,
    label: "staff:research",
  });
  const seen = new Set(known);
  const picked = [];
  for (const c of Array.isArray(json?.candidates) ? json.candidates : []) {
    const url = String(c.service_url || "").trim();
    const host = hostOf(url);
    if (!host || seen.has(host) || !/^https?:\/\//.test(url) || !String(c.company || "").trim()) continue;
    seen.add(host);
    const email = String(c.contact_email || "").trim();
    picked.push({
      company: String(c.company).trim().slice(0, 120),
      service_name: String(c.service_name || c.company).trim().slice(0, 120),
      service_url: url.slice(0, 400),
      contact_email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.slice(0, 200) : "",
      tos_url: /^https?:\/\//.test(String(c.tos_url || "")) ? String(c.tos_url).slice(0, 400) : "",
      why: String(c.why || "").slice(0, 200),
      evidence_url: /^https?:\/\//.test(String(c.evidence_url || "")) ? String(c.evidence_url).slice(0, 400) : "",
      domain: DESK_DOMAINS.includes(target.domain) ? target.domain : "범용",
    });
    if (picked.length >= cap) break;
  }
  if (!picked.length) {
    await ctx.log(`${target.domain} 업종에서 새 후보를 찾지 못했어요`, { level: "warn", costUsd: usd });
    return { note: `${target.domain} — 새 후보 없음` };
  }
  // 후보 등록은 영업팀장 전결(KINDS.add_prospects.auto) — 기안으로 남겨 결재 이력에서 무엇을 왜 올렸는지 볼 수 있게 한다.
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  await ctx.propose({
    kind: "add_prospects",
    title: `감사 후보 ${picked.length}곳 (${target.domain})`,
    summary: picked.map((p) => `${p.company} — ${p.why}`).join("\n"),
    payload: { candidates: picked },
    dedupe: `prospects:${day}:${target.domain}`,
  });
  await ctx.log(`${target.domain} 후보 ${picked.length}곳을 찾아 결재를 올렸어요`, { costUsd: usd });
  return { note: `후보 ${picked.length}곳 결재 대기` };
}

/** 후보를 감사 데스크에 올린다(같은 호스트는 건너뜀). 만든 감사 id 목록. */
export async function addProspects(list, staffName = "AI 직원") {
  const known = await knownHosts();
  const ids = [];
  for (const p of list) {
    const host = hostOf(p.service_url);
    if (!host || known.has(host)) continue;
    known.add(host);
    const made = await createAudit({
      company: p.company,
      service_name: p.service_name,
      service_url: p.service_url,
      domain: p.domain,
      category: "service",
      contact_email: p.contact_email,
      found_via: `${staffName}(기업 발굴)${p.evidence_url ? ` · ${p.evidence_url}` : ""}`,
    });
    if (made.error) continue;
    if (p.tos_url || p.why) await updateAudit(made.id, { tos_url: p.tos_url || "", notes: p.why ? `발굴 메모: ${p.why}` : "" });
    ids.push(made.id);
  }
  return ids;
}
