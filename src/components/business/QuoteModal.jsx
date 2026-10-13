// 견적서 바로 받기 — 공개 단가가 있는 API 상품은 문의를 기다리지 않고 그 자리에서 견적서를 만든다.
//
// 구매 담당자가 결재를 올리려면 견적서(공급자 정보·VAT 별도·유효기간)가 먼저 있어야 한다. 예전에는
// 문의를 남기고 하루를 기다려야 했다. 금액은 서버가 요율표(server/apiRates.js)로 계산하고, 여기서는
// 같은 표로 미리 보여 주기만 한다 — 화면 숫자와 견적서 숫자가 어긋날 자리가 없다.
import { useEffect, useMemo, useState } from "react";
import { API_ORIGIN } from "../../businessConfig.js";
import { API_RATES } from "../../../server/apiRates.js";

const UI = { ink: "#1D1A24", ink2: "#5E5870", ink3: "#9A93AC", accent: "#6B4FA8", hairline: "rgba(60, 40, 110, 0.12)", soft: "#F6F2FC" };
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const tier = (k) => API_RATES.tiers.find((t) => t.key === k);
export const QUOTE_PRODUCTS = {
  ...Object.fromEntries(API_RATES.tiers.map((t) => [t.key, { label: `${t.label} — 월 ${won(t.monthlyKrw)} · ${t.calls.toLocaleString("ko-KR")}회`, unit: "개월", min: 1, max: 12, step: 1, def: 1, unitKrw: t.monthlyKrw, qtyLabel: "기간(개월)" }])),
  metered: { label: `종량제 — 호출당 ${won(API_RATES.metered.unitKrw)} (후불 월 정산)`, unit: "회", min: 100, max: 100000, step: 100, def: 1000, unitKrw: API_RATES.metered.unitKrw, qtyLabel: "예상 월 호출 수" },
};

const field = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, border: `1px solid ${UI.hairline}`, background: "#fff", color: UI.ink, font: "inherit", fontSize: 14.5 };
const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: UI.ink2 };

export default function QuoteModal({ product = "growth", onClose }) {
  const start = QUOTE_PRODUCTS[product] ? product : "growth";
  const [form, setForm] = useState({ product: start, qty: QUOTE_PRODUCTS[start].def, company: "", name: "", email: "", note: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const p = QUOTE_PRODUCTS[form.product];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pick = (e) => {
    const k = e.target.value;
    setForm((f) => ({ ...f, product: k, qty: QUOTE_PRODUCTS[k].def }));
  };

  const preview = useMemo(() => {
    const n = Math.floor(Number(form.qty));
    if (!Number.isFinite(n) || n < p.min || n > p.max || n % p.step) return null;
    const supply = n * p.unitKrw;
    const vat = Math.floor(supply * 0.1);
    return { supply, vat, total: supply + vat };
  }, [form.qty, p]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const r = await fetch(`${API_ORIGIN}/api/b2b/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: form.product, qty: Number(form.qty), company: form.company, name: form.name, email: form.email, note: form.note, website: form.website }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "견적서를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      setDone(data);
      setState("done");
      if (data.url) window.open(data.url, "_blank", "noopener");
    } catch (err) {
      setError(err.message || "견적서를 만들지 못했어요.");
      setState("idle");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="견적서 바로 받기" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(24, 16, 44, 0.32)", zIndex: 80, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(540px, 100%)", background: "#fff", borderRadius: 22, padding: "26px 24px 22px", boxShadow: "0 30px 80px rgba(40, 20, 90, 0.22)" }}>
        {state === "done" && done ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>견적서가 나왔습니다</div>
            <p style={{ margin: 0, fontSize: 14.5, color: UI.ink2, lineHeight: 1.7 }}>
              견적번호 <b>{done.number}</b> · 합계 <b>{won(done.total)}</b>(부가세 포함). 같은 링크를 {form.email}로도 보냈습니다.
              견적서 화면에서 인쇄·PDF 저장을 하고, 결재가 끝나면 그 화면에서 바로 계약 신청을 하시면 됩니다.
            </p>
            {done.url && <a href={done.url} target="_blank" rel="noreferrer" style={{ justifySelf: "start", padding: "11px 18px", borderRadius: 12, background: UI.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14.5 }}>견적서 열기 →</a>}
            <button type="button" onClick={onClose} style={{ justifySelf: "end", border: 0, background: "none", color: UI.ink3, fontSize: 13.5, cursor: "pointer" }}>닫기</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>견적서 바로 받기</div>
              <p style={{ margin: "6px 0 0", fontSize: 13.5, color: UI.ink3, lineHeight: 1.6 }}>
                공급자 정보·부가세·유효기간({30}일)이 들어간 A4 견적서를 바로 만들어 드립니다. 결재가 끝나면 견적서 화면에서 세금계산서 정보를 적고 계약을 신청하시면 됩니다.
              </p>
            </div>
            <label style={labelStyle}>상품
              <select id="qm-product" value={form.product} onChange={pick} style={field}>
                {Object.entries(QUOTE_PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>{p.qtyLabel}
              <input id="qm-qty" type="number" inputMode="numeric" min={p.min} max={p.max} step={p.step} value={form.qty} onChange={set("qty")} style={field} required />
            </label>
            <div style={{ background: UI.soft, borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, fontVariantNumeric: "tabular-nums" }}>
              {preview
                ? <>공급가액 {won(preview.supply)} + 부가세 {won(preview.vat)} = <b style={{ color: UI.ink, fontSize: 15 }}>{won(preview.total)}</b>{form.product === "metered" ? " (예상 · 실제 사용량으로 정산)" : ""}</>
                : `수량은 ${p.min.toLocaleString("ko-KR")}~${p.max.toLocaleString("ko-KR")}${p.unit}${p.step > 1 ? `, ${p.step}${p.unit} 단위` : ""}로 입력해 주세요.`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <label style={labelStyle}>회사명 *<input id="qm-company" required maxLength={100} value={form.company} onChange={set("company")} style={field} autoComplete="organization" /></label>
              <label style={labelStyle}>담당자 성함 *<input id="qm-name" required maxLength={60} value={form.name} onChange={set("name")} style={field} autoComplete="name" /></label>
            </div>
            <label style={labelStyle}>견적서 받을 이메일 *<input id="qm-email" type="email" required maxLength={200} value={form.email} onChange={set("email")} style={field} autoComplete="email" /></label>
            <label style={labelStyle}>메모 <span style={{ fontWeight: 400, color: UI.ink3 }}>선택 · 견적서에는 실리지 않습니다</span>
              <input id="qm-note" maxLength={500} value={form.note} onChange={set("note")} style={field} placeholder="예: 연 단위 계약 희망, 세금계산서 월합계" />
            </label>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            {error && <div role="alert" style={{ color: "#C2410C", fontSize: 13.5 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={onClose} style={{ padding: "11px 16px", borderRadius: 12, border: 0, background: "none", color: UI.ink3, cursor: "pointer", fontSize: 14 }}>닫기</button>
              <button type="submit" disabled={state === "sending" || !preview} style={{ padding: "11px 18px", borderRadius: 12, border: 0, background: UI.accent, color: "#fff", fontWeight: 650, fontSize: 14.5, cursor: "pointer", opacity: state === "sending" || !preview ? 0.6 : 1 }}>
                {state === "sending" ? "만드는 중…" : "견적서 만들기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export const tierLabel = (k) => tier(k)?.label || k;
