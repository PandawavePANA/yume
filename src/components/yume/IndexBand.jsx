// 메인 랜딩의 "YUME 할루시네이션 지수" 띠.
//
// 유메가 무엇인지 한 번 더 말하는 자리다 — 글을 검사해 주는 도구에서 끝나지 않고, AI가 얼마나
// 지어내는지를 같은 방법으로 재서 공개하는 곳. 숫자는 서버의 최신 발행본에서만 읽는다.
// 아직 발행본이 없으면 "창간 준비 중"이라고 그대로 말한다(지어낸 숫자를 쓰지 않는다).
import { useEffect, useState } from "react";
import { t } from "../../i18n.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
};

const pct = (v) => `${Number(v).toFixed(1)}%`;

export default function IndexBand({ businessUrl }) {
  const [latest, setLatest] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/hallucination-index/latest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setLatest(d))
      .catch(() => alive && setLatest(null));
    return () => {
      alive = false;
    };
  }, []);
  const h = latest?.headline;
  const has = h && h.rate !== null && h.rate !== undefined;
  return (
    <section style={{ maxWidth: 980, margin: "clamp(88px, 14vw, 180px) auto 0", padding: "0 24px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", color: UI.ink3, textAlign: "center", textTransform: "uppercase" }}>
        {t("YUME 할루시네이션 지수")}
      </div>
      <h2 style={{ fontSize: "clamp(28px, 4.6vw, 46px)", fontWeight: 700, letterSpacing: "-0.035em", color: UI.ink, textAlign: "center", lineHeight: 1.2, margin: "14px auto 0", maxWidth: "18ch", textWrap: "balance" }}>
        {t("AI가 얼마나 지어내는지, 같은 방법으로 재서 공개합니다")}
      </h2>
      <p style={{ fontSize: "clamp(15px, 1.6vw, 18px)", color: UI.ink2, textAlign: "center", lineHeight: 1.7, margin: "16px auto 0", maxWidth: "56ch" }}>
        {t("정답을 공식 원문으로 먼저 확정한 질문으로 AI의 답을 채점하고, 주기마다 발행합니다. 숫자마다 표본과 신뢰구간을 싣고, 발행한 숫자는 고칠 수 없게 지문을 붙입니다.")}
      </p>
      <a
        href={latest ? latest.url : "/hallucination-index"}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 22, alignItems: "center", marginTop: 34, padding: "clamp(24px, 4vw, 36px)", borderRadius: 28, background: "#1F1B2E", color: "#fff", textDecoration: "none" }}
      >
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", color: "#A88BEA" }}>{latest ? latest.title : t("창간 준비 중")}</div>
          <div style={{ fontSize: "clamp(52px, 9vw, 88px)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
            {has ? pct(h.rate) : latest === undefined ? "…" : latest ? t("창간호 발행") : t("곧 첫 호")}
          </div>
        </div>
        <div style={{ fontSize: 14.5, color: "#CFC9DE", lineHeight: 1.75 }}>
          {has
            ? t("정답이 확정된 질문 {n}건 중 AI가 근거 없이 지어낸 비율 · 95% 신뢰구간 {low}~{high}", { n: Number(h.n).toLocaleString("ko-KR"), low: pct(h.low), high: pct(h.high) })
            : latest
              ? t("창간호는 측정 방법과 기준선을 먼저 공개했습니다. 대표 숫자는 사람이 재확인한 감사 표본이 모이는 다음 호부터 싣습니다.")
              : t("첫 호는 감사와 자가 점검 표본이 공개 기준을 넘으면 발행합니다. 무엇을 어떻게 재는지는 지금 공개되어 있습니다.")}
          <div style={{ marginTop: 12, fontWeight: 700, color: "#A88BEA" }}>{t("지수 보기 →")}</div>
        </div>
      </a>
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: UI.ink2 }}>
        <a href="/hallucination" style={{ color: UI.accent, fontWeight: 600 }}>{t("AI 할루시네이션이란? 뜻·원인·유형·체크 방법 ›")}</a>
      </div>
      {businessUrl && (
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: UI.ink2 }}>
          {t("AI 서비스를 운영하시나요?")}{" "}
          <a href={`${businessUrl}#audit`} style={{ color: UI.accent, fontWeight: 600 }}>{t("귀사 AI도 같은 방법으로 감사받기 ›")}</a>
        </div>
      )}
    </section>
  );
}
