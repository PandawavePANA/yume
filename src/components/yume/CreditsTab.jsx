import { useEffect, useState } from "react";
import { apiJson } from "./api";

// 계정 설정 → 크레딧 탭. 잔액·내역, 상품 교환, 친구 추천을 한 화면에서 본다.
const REASON = {
  bounty: "제보 보상",
  referral: "친구 추천",
  redeem: "상품 교환",
  redeem_cancel: "교환 취소 환급",
  admin: "운영자 지급",
};
const BOUNTY_STATUS = {
  pending: { label: "검토 중", color: "#B4690E", bg: "#FBEEDA" },
  approved: { label: "지급 완료", color: "#1F9D66", bg: "#E4F5EC" },
  rejected: { label: "반려", color: "#C6402F", bg: "#FBE8E5" },
  duplicate: { label: "이미 등록된 인용", color: "#6E6389", bg: "#F1EDF8" },
};
const REDEEM_STATUS = { requested: "신청 접수", fulfilled: "발송 완료", cancelled: "취소(환급됨)" };

const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-");
const card = { border: "1px solid #EDE3FA", borderRadius: 12, padding: 14, marginBottom: 10 };
const ghostBtn = { padding: "7px 13px", borderRadius: 999, border: "1px solid #D4BEF0", background: "#fff", color: "#6B4FA8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

export default function CreditsTab() {
  const [data, setData] = useState(null);
  const [referral, setReferral] = useState(null);
  const [msg, setMsg] = useState(null);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [c, r] = await Promise.all([apiJson("/api/credits"), apiJson("/api/referral")]);
      setData(c);
      setReferral(r);
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  useEffect(() => {
    load();
  }, []);

  const redeem = async (item) => {
    if (!contact.trim()) return setMsg({ type: "err", text: "받으실 연락처를 먼저 입력해주세요." });
    if (!window.confirm(`${item.label}으로 ${item.credits.toLocaleString()} 크레딧을 사용할까요?`)) return;
    setBusy(true);
    try {
      await apiJson("/api/redemptions", { method: "POST", body: { itemKey: item.key, contact } });
      setMsg({ type: "ok", text: "신청했어요. 확인 후 입력하신 연락처로 보내드릴게요." });
      setContact("");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div style={{ fontSize: 13, color: "#A99BC9" }}>{msg?.text || "불러오는 중…"}</div>;

  const link = referral ? `${window.location.origin}/?ref=${referral.code}` : "";

  return (
    <>
      {msg && (
        <div style={{ fontSize: 12.5, color: msg.type === "ok" ? "#1F7A52" : "#C6402F", background: msg.type === "ok" ? "#EAF7F0" : "#FBE9E7", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg,#F3EBFF,#EDE4FC)", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#6E6389", fontWeight: 600 }}>보유 크레딧</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#4E3391", letterSpacing: "-0.02em" }}>
          {data.balance.toLocaleString()}
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 4 }}>크레딧</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#8577A8", marginTop: 2 }}>약 {(data.balance * data.creditKrw).toLocaleString()}원 상당</div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>크레딧 모으기</div>
      <div style={{ ...card, background: "#FBF8FF" }}>
        <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.7 }}>
          검증 결과에서 <b>존재하지 않는 판례·법령·논문</b>이 발견되면, 그 답변을 만든 AI의 대화 공유 링크와 함께 제보할 수 있어요.
          확인되면 건당 <b>{data.bountyCredits} 크레딧</b>을 드립니다. 이미 등록된 인용은 보상 대상이 아니에요.
        </div>
      </div>

      {data.bounties.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {data.bounties.slice(0, 5).map((b) => {
            const s = BOUNTY_STATUS[b.status] || BOUNTY_STATUS.pending;
            return (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F4EEFC" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#241F33", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.identifier_value}</div>
                  <div style={{ fontSize: 11, color: "#A99BC9" }}>{fmt(b.created_at)}{b.reviewer_note ? ` · ${b.reviewer_note}` : ""}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 999 }}>
                  {s.label}{b.credits ? ` +${b.credits}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>상품으로 교환</div>
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="받으실 연락처 (휴대폰 번호 또는 이메일)"
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0", marginBottom: 10, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }}
      />
      {data.catalog.map((item) => {
        const enough = data.balance >= item.credits;
        return (
          <div key={item.key} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 11.5, color: "#A99BC9" }}>{item.credits.toLocaleString()} 크레딧</div>
            </div>
            <button onClick={() => redeem(item)} disabled={!enough || busy} style={{ ...ghostBtn, opacity: enough && !busy ? 1 : 0.45, cursor: enough && !busy ? "pointer" : "default", flexShrink: 0 }}>
              {enough ? "교환 신청" : "크레딧 부족"}
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "#A99BC9", lineHeight: 1.6, marginBottom: 18 }}>
        신청하면 운영자가 확인한 뒤 입력하신 연락처로 보내드려요. 금·상품권은 시세에 따라 교환에 필요한 크레딧이 달라질 수 있습니다.
        현금으로는 바꿔드리지 않습니다.
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>친구 추천</div>
      <div style={card}>
        <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.7, marginBottom: 10 }}>
          내 링크로 가입한 친구가 첫 검증을 마치면 <b>{referral?.creditsPerReferral ?? 0} 크레딧</b>을 드려요.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #EDE3FA", background: "#FBF8FF", fontSize: 12, color: "#6E6389", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => setMsg({ type: "ok", text: "추천 링크를 복사했어요." }),
                () => setMsg({ type: "err", text: "복사하지 못했어요. 직접 선택해 복사해주세요." }),
              );
            }}
            style={{ ...ghostBtn, flexShrink: 0 }}
          >
            복사
          </button>
        </div>
        {referral && (
          <div style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 8 }}>
            초대 {referral.invited}명 · 지급 완료 {referral.credited}명
          </div>
        )}
      </div>

      {data.redemptions.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>교환 신청 내역</div>
          {data.redemptions.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid #F4EEFC" }}>
              <span>{r.item_label}</span>
              <span style={{ color: "#A99BC9" }}>{REDEEM_STATUS[r.status] || r.status} · {fmt(r.created_at)}</span>
            </div>
          ))}
        </>
      )}

      {data.ledger.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>크레딧 내역</div>
          {data.ledger.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid #F4EEFC" }}>
              <span style={{ color: "#5B5470" }}>{REASON[l.reason] || l.reason}{l.memo ? ` · ${l.memo}` : ""}</span>
              <span style={{ fontWeight: 700, color: l.delta > 0 ? "#1F9D66" : "#6E6389", fontVariantNumeric: "tabular-nums" }}>
                {l.delta > 0 ? "+" : ""}{l.delta.toLocaleString()}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
