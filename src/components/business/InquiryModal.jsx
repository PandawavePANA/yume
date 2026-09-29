// 기업용 도입 문의 — 메일 앱을 여는 대신 이 자리에서 받는다.
//
// 예전 "도입 문의"는 mailto 링크였다. 회사 PC는 메일 앱이 설정돼 있지 않은 경우가 많아 눌러도
// 아무 일이 없었고, 열리더라도 무엇을 적어야 할지 모르는 빈 메일이었다. 여기서는 리머 사이트와
// 같은 문의 API로 보낸다 — 보내는 순간 의뢰 대화가 열리고, 운영자 데스크에서 답장·견적·카드 결제까지
// 한 줄로 이어진다. 유메는 리머가 운영하므로 견적과 결제도 리머의 대화 화면에서 진행된다.
import { useEffect, useState } from "react";
import { API_ORIGIN } from "../../businessConfig.js";
import { API_RATES } from "../../../server/apiRates.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.12)",
};

const won = (n) => `${n.toLocaleString("ko-KR")}원`;
export const PLAN_CHOICES = [
  { key: "metered", label: `종량제 (호출당 ${won(API_RATES.metered.unitKrw)})` },
  ...API_RATES.tiers.map((t) => ({ key: t.key, label: `${t.label} (월 ${won(t.monthlyKrw)} · ${t.calls.toLocaleString("ko-KR")}회)` })),
  { key: "custom", label: "맞춤 견적 (더 큰 물량 · 계약서)" },
  { key: "unsure", label: "아직 모르겠어요 — 추천해 주세요" },
];

const field = {
  width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, border: `1px solid ${UI.hairline}`,
  background: "#fff", color: UI.ink, font: "inherit", fontSize: 14.5,
};
const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: UI.ink2 };

export default function InquiryModal({ plan = "unsure", note = "", onClose }) {
  const [form, setForm] = useState({ name: "", contact: "", company: "", plan, volume: "", message: note, website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [threadUrl, setThreadUrl] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const planLabel = PLAN_CHOICES.find((p) => p.key === form.plan)?.label || form.plan;
    // 데스크에서 한눈에 읽히도록 머리에 요약을 붙인다. 운영자는 이 한 덩어리를 보고 견적을 낸다.
    const message = [
      "[유메 API 도입 문의]",
      `원하는 플랜: ${planLabel}`,
      form.volume ? `예상 월 호출: ${form.volume}` : null,
      "",
      form.message.trim(),
    ].filter((x) => x !== null).join("\n");
    try {
      const r = await fetch(`${API_ORIGIN}/api/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, contact: form.contact, company: form.company, kind: "yume_api", budget: "undecided", message, website: form.website }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "보내지 못했어요. 잠시 후 다시 시도해주세요.");
      setThreadUrl(data.threadUrl || "");
      setState("done");
    } catch (err) {
      setError(err.message || "보내지 못했어요.");
      setState("idle");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="도입 문의" onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(24, 16, 44, 0.32)", zIndex: 80, overflowY: "auto",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(520px, 100%)", background: "#fff", borderRadius: 22, padding: "26px 24px 22px",
        boxShadow: "0 30px 80px rgba(40, 20, 90, 0.22)",
      }}>
        {state === "done" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>문의가 접수됐습니다</div>
            <p style={{ margin: 0, fontSize: 14.5, color: UI.ink2, lineHeight: 1.7 }}>
              영업일 기준 하루 안에 답변드립니다. 견적서 확인, 확정, 카드 결제까지 아래 대화 화면에서 이어집니다.
              유메는 리머가 운영하므로 대화 화면에는 리머 이름으로 표시됩니다.
            </p>
            {threadUrl && (
              <a href={threadUrl} target="_blank" rel="noreferrer" style={{
                justifySelf: "start", padding: "11px 18px", borderRadius: 12, background: UI.ink, color: "#fff",
                textDecoration: "none", fontWeight: 600, fontSize: 14.5,
              }}>대화 열기 →</a>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: UI.ink3, lineHeight: 1.6 }}>
              {/.+@.+\..+/.test(form.contact)
                ? `같은 링크를 ${form.contact}로도 보내드렸습니다.`
                : "전화번호로 문의하셔서 링크를 메일로 보내드리지 못했습니다. 위 버튼을 눌러 대화 화면을 즐겨찾기해 두세요."}
            </p>
            <button type="button" onClick={onClose} style={{ justifySelf: "end", border: 0, background: "none", color: UI.ink3, fontSize: 13.5, cursor: "pointer" }}>닫기</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>도입 문의</div>
              <p style={{ margin: "6px 0 0", fontSize: 13.5, color: UI.ink3, lineHeight: 1.6 }}>
                보내시면 바로 대화 화면이 열립니다. 견적서와 결제도 그 자리에서 진행됩니다.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <label style={labelStyle}>담당자 성함 *
                <input id="bq-name" required maxLength={60} value={form.name} onChange={set("name")} style={field} autoComplete="name" />
              </label>
              <label style={labelStyle}>회사명
                <input id="bq-company" maxLength={100} value={form.company} onChange={set("company")} style={field} autoComplete="organization" />
              </label>
            </div>
            <label style={labelStyle}>연락받으실 이메일 *
              <input id="bq-contact" required maxLength={200} value={form.contact} onChange={set("contact")} style={field}
                placeholder="견적서와 대화 링크를 보내드립니다" autoComplete="email" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <label style={labelStyle}>원하는 플랜
                <select id="bq-plan" value={form.plan} onChange={set("plan")} style={field}>
                  {PLAN_CHOICES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label style={labelStyle}>예상 월 호출 수
                <input id="bq-volume" maxLength={40} value={form.volume} onChange={set("volume")} style={field} placeholder="예: 1,200건" />
              </label>
            </div>
            <label style={labelStyle}>어디에 쓰실 건가요? *
              <textarea id="bq-message" required minLength={10} maxLength={3000} rows={4} value={form.message} onChange={set("message")}
                style={{ ...field, resize: "vertical", lineHeight: 1.6 }} placeholder="예: 법률 상담 챗봇이 고객에게 보내는 답변을 발송 전에 검증하고 싶습니다." />
            </label>
            {/* 사람 눈에는 안 보이는 칸. 자동 제출 봇만 채운다. */}
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            {error && <div style={{ fontSize: 13.5, color: "#B23B2B", background: "#FDEFEC", borderRadius: 10, padding: "10px 12px" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={onClose} style={{ padding: "11px 16px", borderRadius: 12, border: `1px solid ${UI.hairline}`, background: "#fff", color: UI.ink2, fontSize: 14, cursor: "pointer" }}>취소</button>
              <button type="submit" disabled={state === "sending"} style={{ padding: "11px 20px", borderRadius: 12, border: 0, background: UI.accent, color: "#fff", fontWeight: 600, fontSize: 14.5, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}>
                {state === "sending" ? "보내는 중…" : "문의 보내기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
