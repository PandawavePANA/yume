// 결제 화면.
//
// 모달 안에서 곧장 결제창을 띄우던 것을 별도 화면으로 뺐다. 이유가 두 가지다.
//
//  1) 이니시스 V2는 구매자 이메일과 휴대폰 번호가 없으면 결제창을 아예 열지 않는다.
//     본인확인에서 받아 둔 번호를 쓰지만, 번호를 저장하기 전에 인증한 회원은 그 값이
//     비어 있다. 그때 "결제 창 호출에 실패하였습니다"만 뜨면 사용자는 고칠 방법이 없다.
//     여기서 직접 받아 채운다.
//
//  2) 무엇을 얼마에 사는지, 환불 조건이 무엇인지, 파는 사람이 누구인지를 결제 직전에
//     한 화면에서 보여줄 자리가 필요하다. 결제대행 심사도 같은 것을 본다.
//
// 금액은 서버가 정한다. 이 화면이 보여 주는 금액은 서버가 만든 주문에서 온 값이고,
// 청구도 그 값으로 된다 — 화면에서 고칠 수 있는 곳이 없다.
import { useEffect, useState } from "react";
import BusinessInfo from "@/components/yume/BusinessInfo";
import { apiJson } from "./api";
import { startCheckout } from "../../payments.js";
import { t } from "../../i18n.js";

const UI = {
  ink: "#141118", ink2: "#54505E", ink3: "#8B8694",
  line: "rgba(20,17,24,0.12)", accent: "#5B3FA0",
};

const input = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(20,17,24,0.16)",
  fontSize: 15, marginTop: 6, boxSizing: "border-box", fontFamily: "inherit", color: UI.ink,
};
const label = { fontSize: 13, fontWeight: 600, color: UI.ink2, display: "block", marginTop: 14 };

// 하이픈·공백을 흘려 넣어도 받아 준다. 사람은 010-1234-5678로 쓴다.
const digits = (v) => String(v || "").replace(/\D/g, "");
const phoneOk = (v) => /^01[016789]\d{7,8}$/.test(digits(v));

export default function CheckoutPage({ order, user, onClose, onDone }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 아는 값은 미리 채운다. 본인확인을 마친 회원이면 손댈 것이 없다.
  useEffect(() => {
    setName(order?.customer?.fullName || user?.name || "");
    setPhone(order?.customer?.phoneNumber || "");
  }, [order, user]);

  const pay = async () => {
    setError("");
    if (!name.trim()) return setError("이름을 입력해주세요.");
    if (!phoneOk(phone)) return setError("휴대폰 번호를 정확히 입력해주세요.");
    if (!agree) return setError("결제 내용과 환불 조건에 동의해주세요.");
    setBusy(true);
    try {
      const r = await startCheckout(order, { fullName: name.trim(), phoneNumber: digits(phone) });
      onDone(r);
    } catch (e) {
      if (!e?.cancelled) setError(e?.message || "결제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const won = (n) => `${Number(n).toLocaleString()}원`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 80, background: "#FBFAF8", overflowY: "auto",
      padding: "calc(20px + var(--yume-safe-top)) 20px calc(40px + var(--yume-safe-bottom))",
    }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <button onClick={onClose} disabled={busy} style={{
          border: "none", background: "transparent", color: UI.ink2, fontSize: 14,
          cursor: busy ? "not-allowed" : "pointer", padding: "6px 0", marginBottom: 10,
        }}>{t("← 돌아가기")}</button>

        <div style={{ background: "#fff", border: `1px solid ${UI.line}`, borderRadius: 14, padding: "24px 22px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.08em", color: UI.accent }}>{t("결제")}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "6px 0 0", color: UI.ink }}>
            {order?.orderName}
          </h1>

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginTop: 18, paddingTop: 16, borderTop: `1px solid ${UI.line}`,
          }}>
            <span style={{ fontSize: 14, color: UI.ink2 }}>{t("결제 금액")}</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em",
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace', fontVariantNumeric: "tabular-nums" }}>{won(order?.totalAmount)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 6, lineHeight: 1.6 }}>
            부가세 포함 · 배송되는 실물이 없으며 결제가 확인되면 즉시 적용됩니다.
            {order?.kind === "plan" && " 자동 갱신되지 않습니다."}
          </div>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${UI.line}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: UI.ink }}>{t("구매자 정보")}</div>
            <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 5, lineHeight: 1.6 }}>
              카드사 확인에 쓰입니다. 영수증은 가입하신 이메일로 갑니다.
            </div>

            <label style={label} htmlFor="co-name">{t("이름")}</label>
            <input id="co-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("홍길동")} style={input} autoComplete="name" />

            <label style={label} htmlFor="co-phone">{t("휴대폰 번호")}</label>
            <input id="co-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678"
              inputMode="numeric" autoComplete="tel" style={input} />

            <label style={label} htmlFor="co-email">{t("이메일")}</label>
            {/* 영수증이 계정이 아닌 곳으로 가면 안 되므로 계정 이메일로 고정한다. */}
            <input id="co-email" value={order?.customer?.email || user?.email || ""} readOnly
              style={{ ...input, background: "#F5F2ED", color: UI.ink3 }} />
          </div>

          <label style={{
            display: "flex", gap: 10, alignItems: "flex-start", marginTop: 20,
            fontSize: 13, color: UI.ink2, lineHeight: 1.6, cursor: "pointer",
          }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              위 결제 내용을 확인했으며,{" "}
              <a href="/refund" target="_blank" rel="noreferrer" style={{ color: UI.accent }}>{t("환불정책")}</a>과{" "}
              <a href="/terms" target="_blank" rel="noreferrer" style={{ color: UI.accent }}>{t("이용약관")}</a>에 동의합니다.
            </span>
          </label>

          {error && (
            <div style={{
              fontSize: 13, color: "#B3372A", background: "#FDF1EF", border: "1px solid #F5D3CD",
              borderRadius: 12, padding: "11px 14px", marginTop: 14, lineHeight: 1.6,
            }}>{error}</div>
          )}

          <button onClick={pay} disabled={busy} style={{
            width: "100%", marginTop: 18, padding: "15px 0", borderRadius: 12, border: "none",
            background: busy ? "rgba(118,118,128,0.18)" : "#5B3FA0",
            color: busy ? UI.ink3 : "#fff", fontSize: 16, fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer", letterSpacing: "-0.01em",
          }}>{busy ? "결제창을 여는 중…" : `${won(order?.totalAmount)} 결제하기`}</button>

          <BusinessInfo />
        </div>
      </div>
    </div>
  );
}
