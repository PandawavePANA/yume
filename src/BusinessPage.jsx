// 기업용 랜딩 — 유메 본체와 별도 도메인에 배포되는 독립 사이트의 전부다.
//
// 유메의 정체성은 "AI 팩트체크 도구"가 아니라 AI 할루시네이션을 재는 곳이다(2026-10-11).
// 신용평가사가 부도율을 해마다 공개하고 개별 회사를 평가하듯, 유메는 세 가지를 한다.
//   검사 — 글 한 편의 근거를 원문과 대조(문서·API)
//   감사 — 회사의 AI 서비스를 표본으로 감사하고 사람이 재확인한 보고서(감사 데스크)
//   지수 — 같은 방법으로 잰 숫자를 주기마다 공개(YUME 할루시네이션 지수)
// 증빙의 무게는 "보증한다"는 말이 아니라 기록에서 나온다 — 원문 링크, 신뢰구간, 고칠 수 없는 지문.
// 그래서 이 페이지는 "보증"이라는 말을 쓰지 않는다.
// 무료 점검 결과가 깨끗하면 도입을 권하지 않는다고 먼저 밝히는 것도 같은 이유다.
import { useEffect, useState } from "react";
import AuditModal from "./components/yume/AuditModal.jsx";
import InquiryModal from "./components/business/InquiryModal.jsx";
import { CONTACT_EMAIL } from "./components/yume/api.js";
import { YUME_URL } from "./businessConfig.js";
import { BUSINESS, telHref, COPYRIGHT, businessLine, COMPLAINT_NOTICE, COMPLAINT_OFFICER } from "./businessInfo.js";
import { API_RATES } from "../server/apiRates.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
};

// 업종 순서가 곧 영업 우선순위다(학습서 40장). 확인 의무와 담당자·예산이 이미 있는 광고 심의 업종이 먼저,
// 그다음 정정 보도 위험이 있는 보도자료, 챗봇, 법률, 교육·리서치. 제목은 그 업종 실무자에게 하는 한 문장이다.
const SECTOR = [
  {
    tag: "보험·금융 광고 심의",
    title: "심의 전에 수치 오류를 먼저 잡습니다",
    body: "AI로 쓴 상품 안내문과 광고 문구의 금리·보장 범위·조건 수치를 약관과 대조합니다. 약관을 기준 자료로 넣으면 회사 고유 수치까지 맞춰 보고, 틀린 문장은 약관에 적힌 값으로 고친 문장까지 드립니다.",
    who: "보험사 · 은행 · 카드 · 증권 · 협회 광고 심의 조직",
  },
  {
    tag: "건강기능식품·제약",
    title: "효능 주장과 인용 연구를 심의 전에",
    body: "상세페이지와 광고에 붙은 연구 인용은 DOI·PMID를 공식 레지스트리에 조회해 논문이 실제로 있는지 확인합니다. 받은 적 없는 수상·인증, 출처 없는 수치는 공표 기록이 있어야 할 곳을 탐색해 없으면 부존재 신뢰도로 알려 드립니다.",
    who: "건강기능식품 · 제약 · 의료기기 · 헬스케어 플랫폼",
  },
  {
    tag: "보도자료·홍보",
    title: "AI로 작성, 유메로 사실 확인",
    body: "틀린 보도자료는 정정 보도로 돌아옵니다. 배포 전에 문서를 올리면 수치·연도·기관명을 출처 원문과 대조하고, 모든 주장이 확인되면 읽는 사람이 근거를 직접 열어 보는 YUME 검증 마크를 붙일 수 있습니다.",
    who: "공공기관 · 대학 · 스타트업 홍보팀",
  },
  {
    tag: "상담 챗봇",
    title: "고객에게 나가기 전, 마지막 확인",
    body: "챗봇의 말은 회사의 말입니다. 청약철회 기간이나 보증 범위를 AI가 어림으로 답하면 그 안내가 분쟁의 근거가 됩니다. 답변 생성과 고객 노출 사이에 API를 두면 해당 조문을 법제처에서 직접 받아 대조합니다.",
    who: "금융 · 통신 · 유통 · 공공 상담 서비스",
  },
  {
    tag: "법률",
    title: "제출 전 1분, 인용 전체를 확인하세요",
    body: "AI가 만든 사건번호는 형식이 완벽해서 눈으로는 걸러지지 않습니다. 번호를 하나씩 조회하기 전에, 문서 전체의 인용을 한 번에 법제처 원문과 대조하고 실재하지 않으면 부존재 신뢰도와 함께 표시합니다. 유메는 인용을 확인하는 변호사의 업무 도구이며, 개별 사안에 대한 법률 판단은 하지 않습니다.",
    who: "로펌 · 기업 법무팀 · 리걸테크",
  },
  {
    tag: "교육·리서치",
    title: "참고문헌이 진짜인지 확인하세요",
    body: "\"업계 평균 18.7%\" 같은 수치와 그럴듯한 참고문헌은 출처 없이도 자연스럽게 읽힙니다. 유메는 그 주장이 사실이라면 어디에 기록돼 있어야 하는지를 기준으로 탐색하고, 기록이 없으면 지어낸 것으로 판정합니다.",
    who: "대학 · 연구기관 · 보고서·제안서 작성",
  },
];

// 도입 순서. 처음 두 단계는 비용도 결재도 없다 — 증거를 먼저 보여 주고, 증거로 계약한다(학습서 40장 퍼널).
const STEPS = [
  { n: "1", k: "무료 AI 점검", v: "5분. 질문을 받아 귀사 AI에 넣고 답을 붙여 넣으면 할루시네이션 지수와 리포트 링크가 나옵니다. API 키를 넘기지 않아도 됩니다.", cta: "audit" },
  { n: "2", k: "실제 문서 10건 무료 검사", v: "귀사가 실제로 내보내는 문서 10건을 보내 주시면 유메로 검사해 틀린 곳과 고친 문장을 돌려 드립니다. 공개해도 되는 문서로 시작하셔도 됩니다.", cta: "trial10" },
  { n: "3", k: "2주 PoC", v: "합의한 문서 수만큼 2주 동안 검사하고 보고서를 드립니다. 검사 건수, 오류 유형별 건수, 고치기 전·후 사례 3개, 처리 시간, 사람 검수와의 비용 비교가 들어갑니다.", cta: "poc" },
  { n: "4", k: "월 약정", v: "PoC 결과를 보고 물량에 맞는 약정이나 종량제를 고릅니다. 결과가 기대에 못 미치면 계약하지 않으셔도 됩니다.", cta: "unsure" },
];

// 기업이 유메를 믿을 근거. 할 수 있는 것보다 할 수 없는 것을 먼저 말한다. 여기 적은 문장은 전부
// 실제 동작이어야 한다 — 기준 자료 미저장은 server/apiV1.js, 보관 기간은 개인정보처리방침과 같다.
const TRUST = [
  {
    k: "생성형 AI를 쓰고, 그 사실을 숨기지 않습니다",
    v: "주장 추출, 검색어 작성, 고친 문장 제안에 생성형 AI(Anthropic Claude)를 씁니다. 다만 판정은 AI의 기억으로 확정하지 않습니다. 출처를 대지 못하는 '확인됨'과 '사실과 다름'은 자동으로 '확인되지 않음'으로 내려갑니다.",
  },
  {
    k: "모르면 모른다고 합니다",
    v: "100% 정확하다고 말하지 않습니다. '확인되지 않음'은 거짓이라는 뜻이 아니라 근거를 찾지 못했다는 뜻이고, 그때 어디까지 찾았고 무엇을 못 봤는지를 함께 보여 드립니다. 중요한 결정은 판정에 붙은 원문 링크로 직접 확인하세요.",
  },
  {
    k: "사람 검수자를 대체하지 않습니다",
    v: "유메는 사람 검수자의 1차 필터입니다. 검수자는 문서 전체를 처음부터 다시 읽는 대신 유메가 표시한 '사실과 다름'과 '확인되지 않음'부터 보면 됩니다. 최종 판단과 규제 준수 책임은 귀사에 있습니다.",
  },
  {
    k: "귀사 자료는 그 검사에만 씁니다",
    v: "함께 넣은 기준 자료(약관·상품 정보)는 저장하지 않고, 그 자료로 낸 판정은 다른 고객과 공유하는 캐시에 넣지 않습니다. API로 보낸 텍스트는 과금·분쟁 대응을 위해 1년 보관하며 데이터셋 제공 대상에 넣지 않습니다. 유메가 쓰는 Claude API에 들어간 입력은 모델 학습에 쓰이지 않습니다.",
  },
  {
    k: "판정이 틀리면 고칩니다",
    v: "결과 화면의 '이 판정이 틀렸나요?'나 이메일로 알려 주시면 검토해 판정을 바로잡고, 같은 실수가 반복되지 않도록 정확도 시험에 넣습니다. 보증이 아니라 확인입니다 — 유메는 무엇을 언제 어떤 원문으로 확인했는지를 기록으로 남깁니다.",
  },
];

const TECH = [
  {
    k: "공식 데이터 직접 대조",
    v: "법률 주장은 웹 검색이 아니라 법제처 국가법령정보 공동활용 API로 조문 원문을 받아 대조합니다. 오늘 시행 중인 버전만 조회하므로 개정 전 내용을 현행으로 착각하지 않습니다.",
  },
  {
    k: "부존재 신뢰도 (특허 출원 10-2026-0194281 · 심사 청구)",
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

// 히어로의 세 카드 — 유메가 하는 세 가지 일.
const PILLARS = [
  { k: "검사", t: "글 한 편을 원문으로", v: "보도자료·상품 설명·상담 답변을 올리면 틀린 곳과 고친 문장이 나옵니다. 개발팀은 API로 답변이 나가기 전에 거릅니다.", href: "#docs" },
  { k: "감사", t: "귀사 AI를 표본으로", v: "정답이 확정된 질문과 실제 사용자 질문으로 귀사 AI 서비스를 검사하고, 사람이 원문으로 재확인한 비공개 보고서를 드립니다.", href: "#audit" },
  { k: "지수", t: "같은 방법으로, 주기마다 공개", v: "YUME 할루시네이션 지수. 표본·신뢰구간·방법을 함께 공개하고, 발행한 숫자는 고칠 수 없게 지문을 붙입니다.", href: "#index" },
];

// 감사 절차 — 감사 데스크(server/auditDesk.js)가 실제로 강제하는 순서 그대로다.
const AUDIT_FLOW = [
  ["질문 설계", "귀사 업종의 법령으로 정답을 먼저 확정한 기준 문항과, 실제 사용자가 하는 질문을 섞어 20~30개(정밀 감사는 더 많이)를 만듭니다."],
  ["답변 수집", "사람이 일반 사용자로서 질문을 직접 입력하고, 받은 시각과 화면 캡처를 남깁니다. 자동으로 대량 질의하지 않습니다."],
  ["검사와 재확인", "유메가 답변을 원문과 대조하고, 오류로 지목된 항목은 사람이 공식 원문을 직접 열어 확인한 것만 남깁니다. 애매한 것은 뺍니다."],
  ["비공개 보고서", "검사 수치(신뢰구간 포함), 대표 사례와 원문 링크, 잘된 점, 한계를 1~2쪽에 담아 귀사에만 드립니다."],
];

const AUDIT_PRODUCTS = [
  { k: "무료 AI 점검", sub: "5분 · 셀프", v: "정답이 확정된 질문 8개를 귀사 AI에 넣고 답을 붙여 넣으면 바로 채점합니다. API 키를 넘기지 않아도 됩니다.", cta: "free" },
  { k: "1회 정밀 감사", sub: "표본 감사 + 보고서 + 개선 회의 1회", v: "가장 신경 쓰이는 오류 유형을 들려 주시면 그 범위로 질문을 설계합니다. 비용은 질문 수와 업종 범위를 듣고 견적으로 드립니다.", cta: "audit", label: "정밀 감사 문의", main: true },
  { k: "정기 감사 + 감사 기록", sub: "분기마다 재감사", v: "동의하시면 공개 감사 기록 페이지와 홈페이지 배지(90일 유효)를 드리고, YUME 할루시네이션 지수에 이름을 싣습니다. 고객사·투자자에게 보여 줄 수 있는 검사 기록입니다.", cta: "audit_regular", label: "정기 감사 문의" },
];

// 지수 최신 호. 유메 서버가 내려준 숫자만 보여 준다 — 없으면 창간 준비 중이라고 말한다.
function IndexCard() {
  const [latest, setLatest] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${YUME_URL}/hallucination-index/latest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setLatest(d))
      .catch(() => alive && setLatest(null));
    return () => {
      alive = false;
    };
  }, []);
  const h = latest?.headline;
  const pctText = (v) => `${Number(v).toFixed(1)}%`;
  return (
    <a href={latest ? `${YUME_URL}${latest.url}` : `${YUME_URL}/hallucination-index`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, alignItems: "center", marginTop: 22, padding: "24px 26px", borderRadius: 22, background: "#1F1B2E", color: "#fff", textDecoration: "none" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#A88BEA" }}>{latest ? latest.title : "창간 준비 중"}</div>
        <div style={{ fontSize: "clamp(44px, 7vw, 64px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
          {h && h.rate !== null ? pctText(h.rate) : latest === undefined ? "…" : "곧 첫 호"}
        </div>
      </div>
      <div style={{ fontSize: 14, color: "#CFC9DE", lineHeight: 1.7 }}>
        {h && h.rate !== null
          ? <>정답이 확정된 질문 {Number(h.n).toLocaleString("ko-KR")}건 중 AI가 근거 없이 지어낸 비율입니다. 95% 신뢰구간 {pctText(h.low)}~{pctText(h.high)}{h.provisional ? " · 표본이 작아 예비 숫자" : ""}.</>
          : "첫 호는 감사와 자가 점검이 공개 기준을 넘으면 발행합니다. 무엇을 어떻게 재는지는 지금 공개되어 있습니다."}
        <div style={{ marginTop: 10, fontWeight: 700, color: "#A88BEA" }}>지수 보기 →</div>
      </div>
    </a>
  );
}

const btn = {
  padding: "13px 24px", borderRadius: 999, border: "none", background: UI.accent,
  color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", textDecoration: "none", fontFamily: "inherit",
  display: "inline-block",
};
const btnGhost = {
  ...btn, background: "rgba(139,111,216,0.12)", color: UI.accent,
};

function Section({ id, eyebrow, title, lede, children }) {
  return (
    <section id={id} style={{ marginTop: "clamp(56px, 8vw, 92px)", scrollMarginTop: 24 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink3 }}>{eyebrow}</div>
      <h2 style={{ fontSize: "clamp(24px, 3.2vw, 34px)", fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, margin: "12px 0 0", lineHeight: 1.25, textWrap: "balance" }}>
        {title}
      </h2>
      {lede && <p style={{ fontSize: "clamp(15px, 1.5vw, 17px)", color: UI.ink2, lineHeight: 1.7, margin: "12px 0 0", maxWidth: "58ch" }}>{lede}</p>}
      {children}
    </section>
  );
}

const won = (n) => `${n.toLocaleString("ko-KR")}원`;

// 요금 카드. 숫자는 전부 API_RATES에서 온다.
const PRICE_CARDS = [
  {
    key: "trial", label: API_RATES.trial.label, price: "0원", period: "",
    detail: `매달 ${API_RATES.trial.calls}회. 가입하면 바로 키를 받아 응답 형식을 확인할 수 있습니다.`,
    unit: "계정당 한도 · 키는 여러 개 만들어도 함께 씁니다",
    cta: "가입하고 키 발급받기", href: `${YUME_URL}/?open=api`,
  },
  {
    key: "metered", label: API_RATES.metered.label, price: won(API_RATES.metered.unitKrw), period: " / 회 · VAT 별도",
    detail: "월 약정 없이 쓴 만큼 냅니다. 물량을 가늠하기 전에 붙여 보기 좋습니다.",
    unit: "기본료 없음",
    cta: "종량제 신청", plan: "metered",
  },
  ...API_RATES.tiers.map((t) => ({
    key: t.key, label: t.label, price: won(t.monthlyKrw), period: " / 월 · VAT 별도",
    detail: `매달 ${t.calls.toLocaleString("ko-KR")}회 포함.`,
    unit: `건당 ${won(Math.round(t.monthlyKrw / t.calls))} · 종량제보다 ${Math.round((1 - t.monthlyKrw / t.calls / API_RATES.metered.unitKrw) * 100)}% 저렴`,
    cta: `${t.label} 신청`, plan: t.key,
  })),
];

// 점검 보고서의 "견적 받기"가 ?inquiry=growth 처럼 붙여 보낸다. 들어오자마자 그 플랜으로 문의 창을 연다.
function initialInquiry() {
  try {
    const p = new URLSearchParams(window.location.search).get("inquiry");
    return p ? { plan: p, note: "" } : null;
  } catch {
    return null;
  }
}

export default function BusinessPage() {
  const [showAudit, setShowAudit] = useState(false);
  // 도입 문의 창. { plan, note } — 요금 카드의 "신청"은 그 플랜을 골라 둔 채로 연다.
  const [inquiry, setInquiry] = useState(initialInquiry);
  const ask = (plan = "unsure") => () => setInquiry({ plan, note: "" });

  return (
    <main style={{ background: "#F6F2FC", minHeight: "100dvh" }}>
      {/* border-box가 없으면 폭 100%에 좌우 여백 40px이 더해져, 폰에서 페이지가 화면보다 40px 넓어지고 옆으로 밀린다. */}
      <div style={{ width: "min(960px, 100%)", boxSizing: "border-box", margin: "0 auto", padding: "calc(22px + var(--yume-safe-top)) 20px calc(80px + var(--yume-safe-bottom))" }}>

        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <a href={YUME_URL} style={{ textDecoration: "none", fontSize: 14, fontWeight: 700, letterSpacing: "0.22em", color: UI.accent }}>
            YUME
          </a>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <a href={`${YUME_URL}/hallucination-index`} style={{ textDecoration: "none", fontSize: 13.5, color: UI.ink2, padding: "8px 10px" }}>
              할루시네이션 지수
            </a>
            <a href={YUME_URL} style={{ textDecoration: "none", fontSize: 13.5, color: UI.ink2, padding: "8px 10px" }}>
              개인용으로 써보기
            </a>
            <a href={`${YUME_URL}/docs/api`} style={{ ...btnGhost, padding: "9px 16px", fontSize: 13.5 }}>API 문서</a>
          </div>
        </nav>

        {/* ── 히어로: 검사하고, 기록하고, 공개한다 ───────────────────── */}
        <header style={{ marginTop: "clamp(40px, 6vw, 68px)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: UI.ink3 }}>AI 할루시네이션 검사</div>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 700, letterSpacing: "-0.035em", color: UI.ink, margin: "14px 0 0", lineHeight: 1.18, textWrap: "balance" }}>
            AI가 지어낸 말을, 원문으로 검사하고 기록으로 남깁니다
          </h1>
          <div style={{ fontSize: "clamp(16px, 1.8vw, 20px)", fontWeight: 600, color: UI.accent, margin: "12px 0 0", letterSpacing: "-0.015em" }}>
            AI의 짐작이 아니라, 원문으로 판정합니다.
          </div>
          <p style={{ fontSize: "clamp(16px, 1.7vw, 19px)", color: UI.ink2, lineHeight: 1.7, margin: "18px 0 0", maxWidth: "54ch" }}>
            유메는 AI 할루시네이션을 재는 곳입니다. 문장 속 사실 주장을 하나씩 떼어 <b>법령 원문과 공식 레지스트리에 직접 대조</b>하고,
            무엇을 언제 어떤 원문으로 확인했는지 기록으로 남깁니다. 같은 방법으로 잰 숫자는 주기마다 공개합니다.
          </p>
          <p style={{ fontSize: "clamp(14px, 1.4vw, 16px)", color: UI.ink2, lineHeight: 1.7, margin: "10px 0 0", maxWidth: "54ch" }}>
            검수자를 대신하지 않습니다. <b>사람 검수자의 1차 필터</b>로 볼 곳을 먼저 표시하고, 결과는 보증이 아니라 <b>검사 기록</b>입니다.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
            <button type="button" onClick={ask("audit")} style={btn}>AI 감사 문의</button>
            <a href={`${YUME_URL}/?open=docs`} style={btnGhost}>문서 올려서 검사하기</a>
            <button onClick={() => setShowAudit(true)} style={btnGhost}>우리 AI 무료로 점검받기</button>
          </div>

          {/* 세 가지 일. 카드가 곧 아래 섹션의 목차다. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 30 }}>
            {PILLARS.map((p) => (
              <a key={p.k} href={p.href} style={{ textDecoration: "none", padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}`, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: UI.accent }}>{p.k}</span>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>{p.t}</span>
                <span style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65 }}>{p.v}</span>
              </a>
            ))}
          </div>

        </header>

        {/* ── AI 감사 ──────────────────────────────────────────────────
            보안 점검처럼, 유메가 귀사 AI를 일반 사용자로서 써 보고 지어낸 답을 원문과 함께 찾는다.
            결과는 비공개. 공개 여부는 그 회사가 정한다 — 이 약속이 감사를 받게 만드는 이유다. */}
        <Section id="audit" eyebrow="AI 감사" title="귀사 AI가 어디서 지어내는지, 사람이 원문으로 확인한 기록으로" lede="유메가 귀사 AI 서비스를 일반 사용자로서 써 보고, 근거 없이 지어낸 답을 공식 원문과 함께 찾아 드립니다. 결과는 귀사에만 비공개로 드리고, 공개 여부는 귀사가 정합니다.">
          <ol style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {AUDIT_FLOW.map(([k, v], i) => (
              <li key={k} style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: UI.accent, letterSpacing: "0.08em" }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: UI.ink, marginTop: 6 }}>{k}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65, marginTop: 6 }}>{v}</div>
              </li>
            ))}
          </ol>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 14 }}>
            {AUDIT_PRODUCTS.map((p) => (
              <div key={p.k} style={{ padding: "20px 22px", borderRadius: 20, display: "flex", flexDirection: "column", gap: 8, background: p.main ? "#fff" : "rgba(255,255,255,0.86)", border: p.main ? `1.5px solid ${UI.accent}` : `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: UI.accent }}>{p.k}</div>
                <div style={{ fontSize: 13, color: UI.ink3 }}>{p.sub}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65, flex: 1 }}>{p.v}</div>
                {p.cta === "free"
                  ? <button type="button" onClick={() => setShowAudit(true)} style={{ ...btnGhost, padding: "10px 14px", fontSize: 13.5 }}>무료 점검 시작</button>
                  : <button type="button" onClick={ask(p.cta)} style={{ ...(p.main ? btn : btnGhost), padding: "10px 14px", fontSize: 13.5 }}>{p.label}</button>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: UI.ink3, lineHeight: 1.75 }}>
            동의 없이 회사 이름을 쓰지 않습니다 · 결과가 나쁘다고 빼거나, 좋게 내 달라는 대가를 받지 않습니다 · 점검 결과가 깨끗하면 도입을 권하지 않습니다 · 감사 결과는 그 기간의 표본 검사 기록이며 서비스 품질을 보증하지 않습니다.
          </div>
          <div style={{ marginTop: 18, padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,0.8)", border: `1px solid ${UI.hairline}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: UI.ink, marginBottom: 7 }}>실제 서비스에서 AI가 틀리는 자리를 묻습니다</div>
            <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.7 }}>
              귀사 AI가 실제로 하는 일을 시킵니다 — <b>수치 하나가 틀린 자료로 고객 안내문 쓰기</b>, <b>최근 개정된 현행 기준</b>,
              고객이 내민 <b>있을 법한 가짜 조문</b>, 근거로 대라는 <b>판례 번호</b>. 요즘 AI가 가장 많이 무너지는 자리입니다.
              질문마다 정답을 법제처 원문과 공식 레지스트리로 먼저 확정해 두고 채점하므로, 유메의 짐작이 아니라
              원문과 대조한 결과가 나옵니다.
            </div>
          </div>

        </Section>

        {/* ── YUME 할루시네이션 지수 ───────────────────────────────────
            숫자는 유메 서버의 최신 발행본에서 읽는다(지어낸 숫자를 쓰지 않는다). 아직 없으면 창간 준비 중. */}
        <Section id="index" eyebrow="YUME 할루시네이션 지수" title="AI 할루시네이션의 기준 숫자를, 같은 방법으로 반복해 공개합니다" lede="공식 원문으로 정답을 확정한 질문으로 AI가 근거 없이 지어내는 비율을 재고 주기마다 발행합니다. 숫자마다 표본과 95% 신뢰구간, 방법과 한계를 같이 싣고, 발행한 숫자는 고칠 수 없게 지문(SHA-256)을 붙입니다.">
          <IndexCard />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
            {[
              ["정답은 원문이 정합니다", "법제처 국가법령정보·판례 데이터베이스·학술 레지스트리로 정답을 먼저 확정한 질문만 씁니다."],
              ["오류는 사람이 확정합니다", "유메가 지목한 오류는 사람이 공식 원문을 직접 열어 확인한 것만 셉니다."],
              ["숫자는 고치지 않습니다", "발행본에 지문을 붙이고 원자료를 공개합니다. 바로잡을 때는 사유와 이전 지문을 남깁니다."],
            ].map(([h, d]) => (
              <div key={h} style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,0.85)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: UI.ink, marginBottom: 6 }}>{h}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65 }}>{d}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 문서 검사(개발자 없이) ─────────────────────────────────
            도입을 정하는 사람은 대개 실무자고, 그 사람이 가진 건 HWPX·DOCX 파일 한 개다.
            API보다 먼저 보여 준다 — 써 보고 맞다고 느껴야 개발팀에 넘긴다. */}
        <Section
          id="docs"
          eyebrow="문서 검사"
          title="파일을 올리면, 틀린 곳과 고친 본문이 나옵니다"
          lede="보도자료·상품 설명서·약관·보고서를 그대로 올리세요(HWPX·DOCX·PDF·TXT, 10만 자까지). 유메가 문장마다 사실을 확인해 원문에 표시하고, 틀린 문장을 근거의 실제 값으로 고친 본문을 내려받게 합니다."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 20 }}>
            {[
              ["원문에 바로 표시", "어느 문장이 틀렸는지 원문 위에 색으로 표시합니다. 판정마다 근거와 출처가 붙습니다."],
              ["고친 본문까지", "틀린 문장을 근거에 적힌 실제 값으로 고친 문장으로 바꾼 본문을 내려받습니다."],
              ["우리 회사 기준으로", "회사 소개·상품 정보를 함께 넣으면, 자사 이야기는 공개 웹이 아니라 그 자료와 대조합니다. 자료는 저장하지 않습니다."],
            ].map(([h, d]) => (
              <div key={h} style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,0.85)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: UI.ink, marginBottom: 6 }}>{h}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <a href={`${YUME_URL}/?open=docs`} style={btn}>문서 올려서 검사하기</a>
          </div>
        </Section>

        {/* ── YUME 검증 마크 ─────────────────────────────────────────
            기업이 사는 건 결국 "우리 글은 확인을 받았다"는 신뢰다. 보증이 아니라 검증 —
            무엇을 언제 어떤 원문으로 확인했는지 공개하는 것이 마크의 값어치다. */}
        <Section
          eyebrow="YUME 검증 마크"
          title="모두 사실로 확인된 글에, 누구나 확인할 수 있는 마크를"
          lede="문서 검사에서 모든 사실 주장이 출처 원문으로 확인되면 YUME 검증 마크와 A4 검증서(PDF)를 발급합니다. 홈페이지·보도자료·광고에 붙이면, 읽는 사람이 마크를 눌러 주장별 근거 문장과 출처를 직접 확인합니다."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 20 }}>
            {[
              ["엄격한 발급 기준", "모든 주장이 '확인됨'이고, 서버가 출처 페이지에서 근거 문장을 직접 확인한 경우에만 발급합니다. 사실과 다름·근거 없음이 하나라도 있으면 고칠 곳을 알려 드립니다."],
              ["공개 검증 페이지", "마크를 누르면 원문, 주장별 근거 문장과 출처, 검증 일시, 원문 지문이 열립니다. 붙여 넣은 글이 검증받은 원문과 같은지도 그 자리에서 대조합니다."],
              ["바뀌면 바로 표시", "삽입 코드는 검증받은 글을 감쌉니다. 글자가 하나라도 바뀌면 마크가 '원문 변경됨'으로, 90일이 지나면 '재확인 필요'로 바뀝니다."],
              ["A4 검증서", "검증서 번호, 원문 지문, 확인한 주장과 출처, 진위 확인 QR을 담은 검증서를 PDF로 받아 결재·심의·투자 자료에 첨부합니다."],
            ].map(([h, d]) => (
              <div key={h} style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,0.85)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: UI.ink, marginBottom: 6 }}>{h}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: UI.ink3, lineHeight: 1.65 }}>
            검증 마크는 글 속 <b>사실 주장</b>을 검증 시점 기준으로 확인한 기록이며, 회사·상품의 품질을 보증하지 않습니다.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <a href={`${YUME_URL}/?open=docs`} style={btn}>문서 검사하고 마크 받기</a>
          </div>
        </Section>

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
            <a href={`${YUME_URL}/?open=api`} style={btnGhost}>가입하고 키 발급받기</a>
          </div>
        </Section>

        {/* ── 요금 ────────────────────────────────────────────────── */}
        {/* 기업 담당자가 가장 먼저 찾는 건 “대략 얼마인가”다. 없으면 비싸겠거니 하고 문의조차
            하지 않는다. 값은 서버가 실제 한도에 쓰는 표(server/apiRates.js)에서 그대로 읽는다 —
            화면과 실제 청구가 어긋날 수 없다. API가 한도에 닿으면 429 응답이 이 자리(#pricing)를 가리킨다. */}
        <Section id="pricing" eyebrow="요금" title="쓴 만큼, 또는 약정한 만큼" lede="검증 1건이 호출 1회입니다. 체험은 가입만 하면 매달 무료로 쓸 수 있고, 그 위는 종량제나 월 약정으로 씁니다. 표시된 금액은 모두 부가세 별도입니다.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 22 }}>
            {PRICE_CARDS.map((c) => (
              <div key={c.key} style={{
                padding: "22px 22px 20px", borderRadius: 20, display: "flex", flexDirection: "column",
                background: c.key === "growth" ? "#fff" : "rgba(255,255,255,0.86)",
                border: c.key === "growth" ? `1.5px solid ${UI.accent}` : `1px solid ${UI.hairline}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: UI.accent }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                  {c.price}<span style={{ fontSize: 13.5, fontWeight: 500, color: UI.ink3, letterSpacing: 0 }}>{c.period}</span>
                </div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.6, marginTop: 6, flex: 1 }}>{c.detail}</div>
                <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${UI.hairline}`, fontVariantNumeric: "tabular-nums" }}>{c.unit}</div>
                {c.plan ? (
                  <button type="button" onClick={ask(c.plan)} style={{ ...btnGhost, marginTop: 14, padding: "10px 14px", fontSize: 13.5, textAlign: "center" }}>{c.cta}</button>
                ) : (
                  <a href={c.href} style={{ ...btn, marginTop: 14, padding: "10px 14px", fontSize: 13.5, textAlign: "center" }}>{c.cta}</a>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: UI.ink3, lineHeight: 1.7, margin: "14px 2px 0" }}>
            모든 금액은 부가세(10%) 별도입니다. 처리하지 못하고 실패한 호출은 세지 않습니다. 더 큰 물량, 전용 한도, 계약서가 필요하시면{" "}
            <button type="button" onClick={ask("custom")} style={{ border: 0, background: "none", padding: 0, font: "inherit", color: UI.accent, textDecoration: "underline", cursor: "pointer" }}>맞춤 견적</button>을 요청해 주세요.
          </p>
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

        {/* ── 도입 순서 ──────────────────────────────────────────── */}
        <Section id="start" eyebrow="도입 순서" title="증거를 먼저 보시고, 그다음에 정하세요" lede="처음 두 단계는 비용이 들지 않고 결재도 필요 없습니다. 결과가 기대에 못 미치면 거기서 멈추시면 됩니다.">
          <ol style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {STEPS.map((st) => (
              <li key={st.n} style={{ padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: UI.accent, letterSpacing: "0.08em" }}>STEP {st.n}</div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: UI.ink, letterSpacing: "-0.015em" }}>{st.k}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.65, flex: 1 }}>{st.v}</div>
                {st.cta === "audit" ? (
                  <button type="button" onClick={() => setShowAudit(true)} style={{ ...btnGhost, padding: "9px 14px", fontSize: 13, marginTop: 4 }}>무료 점검 시작</button>
                ) : (
                  <button type="button" onClick={ask(st.cta)} style={{ ...btnGhost, padding: "9px 14px", fontSize: 13, marginTop: 4 }}>
                    {st.cta === "trial10" ? "10건 무료 검사 신청" : st.cta === "poc" ? "PoC 문의" : "약정 상담"}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </Section>

        {/* ── 신뢰 ────────────────────────────────────────────────── */}
        <Section id="trust" eyebrow="신뢰와 데이터" title="할 수 있는 것과 할 수 없는 것을 먼저 말씀드립니다" lede="확인을 파는 서비스가 스스로를 과장하면 그 자체로 신뢰를 잃습니다. 유메가 어떻게 판정하고 귀사 자료를 어떻게 다루는지 그대로 적었습니다.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 22 }}>
            {TRUST.map((t) => (
              <div key={t.k} style={{ padding: "18px 20px", borderRadius: 18, background: "rgba(255,255,255,0.86)", border: `1px solid ${UI.hairline}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: UI.ink, letterSpacing: "-0.015em" }}>{t.k}</div>
                <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, marginTop: 6 }}>{t.v}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: UI.ink3, lineHeight: 1.7, margin: "14px 2px 0" }}>
            업종별 문구는 규제 준수를 보장한다는 뜻이 아닙니다. 유메는 준수를 돕는 확인 도구이고, 판정은 법률·의료·금융 자문이 아닙니다.
            자세한 내용은 <a href={`${YUME_URL}/terms`} style={{ color: UI.accent }}>이용약관</a>과 <a href={`${YUME_URL}/privacy`} style={{ color: UI.accent }}>개인정보처리방침</a>에 있습니다.
          </p>
        </Section>

        {/* ── 기술 ────────────────────────────────────────────────── */}
        <Section eyebrow="어떻게 다른가" title="“AI가 한 번 더 확인했습니다”와는 다릅니다" lede="AI에게 한 번 더 물으면 같은 기억에서 같은 답이 나옵니다. 유메는 판정마다 공식 기록과 출처 원문을 직접 대조하고, 못 찾았다는 사실 자체를 정량화합니다.">
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
            귀사 AI, 먼저 재 보세요
          </h2>
          <p style={{ fontSize: 15.5, color: "#CFC9DE", lineHeight: 1.7, margin: "12px 0 0", maxWidth: "48ch" }}>
            5분이면 됩니다. 질문을 받아 귀사 AI에 넣고, 답변을 붙여넣으면 끝입니다.
            결과는 사내에 공유할 수 있는 리포트 링크로 나옵니다. 실제 문서로 보고 싶으시면 10건을 무료로 검사해 드립니다.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button onClick={() => setShowAudit(true)} style={btn}>무료로 점검받기</button>
            <button type="button" onClick={ask("audit")} style={{ ...btn, background: "rgba(255,255,255,0.14)" }}>AI 감사 문의</button>
            <button type="button" onClick={ask("trial10")} style={{ ...btn, background: "rgba(255,255,255,0.14)" }}>문서 10건 무료 검사</button>
          </div>
        </section>

        <footer style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${UI.hairline}`, fontSize: 13, color: UI.ink3, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: UI.ink3, textDecoration: "none" }}>{CONTACT_EMAIL}</a>
            <a href={`${YUME_URL}/terms`} style={{ color: UI.ink3, textDecoration: "none" }}>이용약관</a>
            <a href={`${YUME_URL}/privacy`} style={{ color: UI.ink3, textDecoration: "none" }}>개인정보처리방침</a>
            <a href={`${YUME_URL}/refund`} style={{ color: UI.ink3, textDecoration: "none" }}>환불정책</a>
            <a href={`${YUME_URL}/products`} style={{ color: UI.ink3, textDecoration: "none" }}>상품 안내</a>
            <a href={`${YUME_URL}/hallucination-index`} style={{ color: UI.ink3, textDecoration: "none" }}>할루시네이션 지수</a>
          </div>
          {/* 기업용도 같은 사업자가 운영하므로 신원정보를 같이 싣는다. */}
          <address style={{ fontStyle: "normal", fontSize: 12, lineHeight: 1.85, color: UI.ink3 }}>
            <div>
              {businessLine([
                `상호 ${BUSINESS.name}(${BUSINESS.nameEn})`,
                `대표 ${BUSINESS.ceo}`,
                `사업자등록번호 ${BUSINESS.regNo}`,
                BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`,
              ])}
            </div>
            <div>주소 {BUSINESS.address}</div>
            {BUSINESS.tel && (
              <div>
                대표전화 <a href={telHref} style={{ color: UI.ink3, textDecoration: "none" }}>{BUSINESS.tel}</a>
              </div>
            )}
            <div>이메일 {BUSINESS.email}</div>
            <div>{COMPLAINT_NOTICE} {COMPLAINT_OFFICER}</div>
            <div style={{ marginTop: 6 }}>유메는 검증 과정에 생성형 AI를 사용합니다. 판정은 공개 원문과 대조한 검증 정보이며 법률·의료·금융 자문이나 보증이 아닙니다.</div>
            <div style={{ marginTop: 6 }}>{COPYRIGHT}</div>
          </address>
        </footer>
      </div>

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
      {inquiry && <InquiryModal plan={inquiry.plan} note={inquiry.note} onClose={() => setInquiry(null)} />}
    </main>
  );
}
