// 기업용 랜딩 — 유메 본체와 별도 도메인에 배포되는 독립 사이트의 전부다.
//
// 순서가 곧 영업 논리다. 무료 점검을 맨 위에 두는 이유는, 유메가 필요하다는 걸 우리가
// 주장하는 대신 그쪽 AI가 증명하게 하기 위해서다. 점검 결과가 깨끗하면 도입을 권하지
// 않는다고 먼저 밝히는 것도 같은 이유다 — 안 팔 때 안 파는 게 점검의 신뢰다.
// 그다음에야 API, 업종별 쓰임, 기술이 온다.
import { useState } from "react";
import AuditModal from "./components/yume/AuditModal.jsx";
import { CONTACT_EMAIL } from "./components/yume/api.js";
import { YUME_URL } from "./businessConfig.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
};

const SECTOR = [
  {
    tag: "법률",
    title: "존재하지 않는 판례가 서면에 들어가는 일",
    body: "AI가 만든 사건번호는 형식이 완벽해서 눈으로는 걸러지지 않습니다. 유메는 인용된 사건번호·조문을 법제처 국가법령정보에 직접 조회해, 실재하지 않으면 부존재 신뢰도와 함께 표시합니다.",
    who: "로펌 · 기업 법무팀 · 법률 상담 서비스",
  },
  {
    tag: "의료·제약",
    title: "환자 안내자료에 실린 근거가 실재하는지",
    body: "인용된 DOI·PMID를 공식 레지스트리에 조회해 논문이 실제로 있는지 확인합니다. 지어낸 출처로 작성된 교육자료는 배포 전에 걸러집니다.",
    who: "병원 · 제약사 · 헬스케어 플랫폼",
  },
  {
    tag: "금융",
    title: "응대 스크립트가 현행 규정과 맞는지",
    body: "법령은 개정됩니다. 유메는 오늘 시행 중인 조문만 조회해 대조하므로, 개정 전 기준으로 쓰인 설명을 사실과 다름으로 잡아냅니다.",
    who: "은행 · 증권 · 보험 · 핀테크",
  },
  {
    tag: "커머스·마케팅",
    title: "받은 적 없는 수상과 없는 인증",
    body: "AI가 쓴 상품 설명에는 그럴듯한 수상 이력·인증 마크·점유율 수치가 섞여 들어갑니다. 공표된 기록이 있어야 할 주장인데 어디에도 없으면 유메가 지어낸 것으로 판정합니다. 표시·광고 문구는 사실과 다르면 그대로 법적 문제가 됩니다.",
    who: "이커머스 · 브랜드 · 광고대행",
  },
  {
    tag: "고객 응대",
    title: "고객에게 잘못 알려준 환불 규정",
    body: "청약철회 기간이나 보증 범위처럼 법으로 정해진 내용을 AI가 어림으로 답하면, 그 안내 자체가 분쟁의 근거가 됩니다. 유메는 해당 조문을 법제처에서 직접 받아 대조합니다.",
    who: "CS 챗봇 · 상담 스크립트 · 도움말 센터",
  },
  {
    tag: "리서치·콘텐츠",
    title: "본 적 없는 통계를 인용하는 일",
    body: "\"업계 평균 18.7%\" 같은 수치는 출처 없이도 자연스럽게 읽힙니다. 유메는 이런 주장이 사실이라면 어디에 기록돼 있어야 하는지를 기준으로 탐색하고, 그 기록이 없으면 부존재 신뢰도로 판정합니다.",
    who: "보고서 · 제안서 · 콘텐츠 제작",
  },
];

const TECH = [
  {
    k: "공식 데이터 직접 대조",
    v: "법률 주장은 웹 검색이 아니라 법제처 국가법령정보 공동활용 API로 조문 원문을 받아 대조합니다. 오늘 시행 중인 버전만 조회하므로 개정 전 내용을 현행으로 착각하지 않습니다.",
  },
  {
    k: "부존재 신뢰도 (특허 출원)",
    v: "못 찾았다고 곧바로 없다고 하지 않습니다. 탐색 커버리지(C)·식별자 형식오류(F)·유사 실재 항목과의 근접도(P)로 부존재 신뢰도를 산출하고, 임계값을 넘을 때만 지어낸 것으로 판정합니다.",
  },
  {
    k: "근거 없는 판정은 내지 않음",
    v: "출처를 대지 못하는 확인됨·사실과 다름은 자동으로 확인되지 않음으로 내려갑니다. 모델이 그럴듯하게 말했다는 이유로 판정이 나가는 경로를 막아 뒀습니다.",
  },
  {
    k: "기록에 남는 판정",
    v: "주장별 판정·근거·출처·부존재 신뢰도가 구조화된 JSON으로 나옵니다. 사후 감사와 내부 리뷰에 그대로 쓸 수 있습니다.",
  },
];

const btn = {
  padding: "13px 24px", borderRadius: 999, border: "none", background: UI.accent,
  color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", textDecoration: "none",
  display: "inline-block",
};
const btnGhost = {
  ...btn, background: "rgba(139,111,216,0.12)", color: UI.accent,
};

function Section({ eyebrow, title, lede, children }) {
  return (
    <section style={{ marginTop: "clamp(56px, 8vw, 92px)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink3 }}>{eyebrow}</div>
      <h2 style={{ fontSize: "clamp(24px, 3.2vw, 34px)", fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, margin: "12px 0 0", lineHeight: 1.25, textWrap: "balance" }}>
        {title}
      </h2>
      {lede && <p style={{ fontSize: "clamp(15px, 1.5vw, 17px)", color: UI.ink2, lineHeight: 1.7, margin: "12px 0 0", maxWidth: "58ch" }}>{lede}</p>}
      {children}
    </section>
  );
}

export default function BusinessPage() {
  const [showAudit, setShowAudit] = useState(false);

  return (
    <main style={{ background: "#F6F2FC", minHeight: "100dvh" }}>
      <div style={{ width: "min(960px, 100%)", margin: "0 auto", padding: "calc(22px + var(--yume-safe-top)) 20px calc(80px + var(--yume-safe-bottom))" }}>

        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <a href={YUME_URL} style={{ textDecoration: "none", fontSize: 14, fontWeight: 700, letterSpacing: "0.22em", color: UI.accent }}>
            YUME
          </a>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <a href={YUME_URL} style={{ textDecoration: "none", fontSize: 13.5, color: UI.ink2, padding: "8px 10px" }}>
              개인용으로 써보기
            </a>
            <a href={`${YUME_URL}/docs/api`} style={{ ...btnGhost, padding: "9px 16px", fontSize: 13.5 }}>API 문서</a>
          </div>
        </nav>

        {/* ── 히어로: 주장 대신 점검 ───────────────────────────────── */}
        <header style={{ marginTop: "clamp(40px, 6vw, 68px)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink3 }}>무료 · 가입 불필요</div>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 700, letterSpacing: "-0.035em", color: UI.ink, margin: "14px 0 0", lineHeight: 1.18, textWrap: "balance" }}>
            우리 회사 AI, 거짓말을 할까?
          </h1>
          <p style={{ fontSize: "clamp(16px, 1.7vw, 19px)", color: UI.ink2, lineHeight: 1.7, margin: "18px 0 0", maxWidth: "52ch" }}>
            유메가 필요하다고 설득하는 대신, 필요한지 먼저 확인해 드립니다.
            <b> 정답을 미리 아는 질문 8개</b>를 만들어 드리니 귀사 AI에 넣어보세요.
            지어낸 답이 얼마나 나오는지 채점해 드립니다.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
            <button onClick={() => setShowAudit(true)} style={btn}>무료로 점검받기</button>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[유메] 도입 문의")}`} style={btnGhost}>도입 문의</a>
          </div>

          <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,0.8)", border: `1px solid ${UI.hairline}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: UI.ink, marginBottom: 7 }}>질문을 지어내지 않고, 검증해서 만듭니다</div>
            <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.7 }}>
              “민법 제9999조를 설명해주세요” 같은 질문입니다. 짐작해서 내는 게 아니라
              <b> 법제처에서 민법의 마지막 조문 번호를 확인한 뒤</b> 그보다 큰 번호를 고릅니다.
              존재하지 않는 것이 확정된 상태라, 설명을 지어내면 그 자리에서 잡힙니다.
              사건번호와 논문 DOI도 레지스트리에 없음을 확인한 것만 씁니다.
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 13.5, color: UI.ink2, lineHeight: 1.65 }}>
            점검 결과가 깨끗하면 <b>도입을 권하지 않습니다.</b> 표본이 부족하면 등급도 매기지 않습니다 —
            근거 없이 파는 건 이 점검의 신뢰를 스스로 깎는 일이니까요.
          </div>
        </header>

        {/* ── API ─────────────────────────────────────────────────── */}
        <Section
          eyebrow="검증 API"
          title="답변을 내보내기 전에 한 번 거르세요"
          lede="유메 API를 답변 생성과 사용자 노출 사이에 두면, 점검에서 걸러진 것과 같은 답을 내보내기 전에 잡습니다. 주장별 판정·근거·출처와 부존재 신뢰도를 그대로 받아 쓰실 수 있습니다."
        >
          <div style={{ marginTop: 20, borderRadius: 18, overflow: "hidden", border: `1px solid ${UI.hairline}`, background: "#1F1B2E" }}>
            <pre style={{ margin: 0, padding: "18px 20px", overflowX: "auto", fontSize: 12.5, lineHeight: 1.7, color: "#CFC9DE", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{`POST /v1/verify
Authorization: Bearer <API_KEY>

{ "text": "AI가 생성한 답변 전문" }

→ {
    "claims": [{
      "text": "공정위 고시 제2019-77호 제3조가 로열티 상한을 정한다",
      "verdict": "false",
      "verified_via": "nec",
      "nec": { "score": 0.763, "grade": "nonexistent" },
      "explanation": "행정규칙 검색공간의 약 85%를 탐색했지만 …"
    }]
  }`}
            </pre>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <a href={`${YUME_URL}/docs/api`} style={btn}>API 문서 보기</a>
            <a href={YUME_URL} style={btnGhost}>가입하고 키 발급받기</a>
          </div>
        </Section>

        {/* ── 업종별 ──────────────────────────────────────────────── */}
        <Section eyebrow="업종별 쓰임" title="어떤 실패를 막는지" lede="분야마다 AI가 무너지는 지점이 다릅니다. 규제 산업이 아니어도 지어낸 수치 한 줄이 그대로 책임이 되는 자리가 있습니다.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14, marginTop: 22 }}>
            {SECTOR.map((s) => (
              <div key={s.tag} style={{ padding: "22px 24px", borderRadius: 20, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}`, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: UI.accent, background: "rgba(139,111,216,0.12)", borderRadius: 999, padding: "3px 11px" }}>{s.tag}</span>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, lineHeight: 1.4 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.7 }}>{s.body}</div>
                <div style={{ marginTop: "auto", paddingTop: 12, fontSize: 12.5, color: UI.ink3, borderTop: `1px dashed ${UI.hairline}` }}>{s.who}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 기술 ────────────────────────────────────────────────── */}
        <Section eyebrow="어떻게 다른가" title="“AI가 한 번 더 확인했습니다”와는 다릅니다" lede="검증하는 쪽도 AI면 같은 실수를 반복합니다. 유메는 공식 기록을 직접 조회하고, 못 찾았다는 사실 자체를 정량화합니다.">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            {TECH.map((t) => (
              <div key={t.k} style={{ padding: "18px 22px", borderRadius: 18, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: UI.ink, letterSpacing: "-0.015em" }}>{t.k}</div>
                <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.7, marginTop: 6 }}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 마무리 ──────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(48px, 7vw, 76px)", padding: "clamp(28px, 4vw, 40px)", borderRadius: 26, background: "#1F1B2E", color: "#fff" }}>
          <h2 style={{ fontSize: "clamp(22px, 2.8vw, 30px)", fontWeight: 700, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.3, textWrap: "balance" }}>
            먼저 점검부터 해보세요
          </h2>
          <p style={{ fontSize: 15.5, color: "#CFC9DE", lineHeight: 1.7, margin: "12px 0 0", maxWidth: "48ch" }}>
            5분이면 됩니다. 질문을 받아 귀사 AI에 넣고, 답변을 붙여넣으면 끝입니다.
            결과는 사내에 공유할 수 있는 리포트 링크로 나옵니다.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button onClick={() => setShowAudit(true)} style={btn}>무료로 점검받기</button>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[유메] 도입 문의")}`} style={{ ...btn, background: "rgba(255,255,255,0.14)" }}>도입 문의</a>
          </div>
        </section>

        <footer style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${UI.hairline}`, fontSize: 13, color: UI.ink3, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: UI.ink3, textDecoration: "none" }}>{CONTACT_EMAIL}</a>
          <a href={`${YUME_URL}/terms`} style={{ color: UI.ink3, textDecoration: "none" }}>이용약관</a>
          <a href={`${YUME_URL}/privacy`} style={{ color: UI.ink3, textDecoration: "none" }}>개인정보처리방침</a>
        </footer>
      </div>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
    </main>
  );
}
