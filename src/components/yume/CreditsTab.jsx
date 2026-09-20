import { useEffect, useState } from "react";
import BusinessInfo from "@/components/yume/BusinessInfo";
import { apiJson } from "./api";
import { copyText } from "../../clipboard.js";
import { payForPack, verifyIdentity } from "../../payments.js";

// 계정 설정 → 크레딧 탭.
//
// 크레딧은 검증을 돌리는 데 쓰는 재화다. 요금제마다 매달 정해진 양이 들어오고,
// 다 쓰면 최고 등급이라도 추가로 사야 한다. 기여도 점수와는 완전히 다른 값이라
// 이 화면에 섞어 보여주지 않는다 — 랭킹은 따로 있다.
const REASON = {
  plan_grant: "요금제 월 지급",
  purchase: "크레딧 구매",
  referral: "친구 추천",
  verify: "검증 사용",
  admin: "운영자 지급",
};
const BOUNTY_STATUS = {
  pending: { label: "검토 중", color: "#B4690E", bg: "#FBEEDA" },
  approved: { label: "점수 지급 완료", color: "#1F9D66", bg: "#E4F5EC" },
  rejected: { label: "반려", color: "#C6402F", bg: "#FBE8E5" },
  duplicate: { label: "이미 등록된 인용", color: "#6E6389", bg: "#F1EDF8" },
};
const PURCHASE_STATUS = { requested: "입금 확인 중", fulfilled: "지급 완료", cancelled: "취소됨" };

const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-");
const card = { border: "1px solid #EDE3FA", borderRadius: 12, padding: 14, marginBottom: 10 };
const ghostBtn = { padding: "7px 13px", borderRadius: 999, border: "1px solid #D4BEF0", background: "#fff", color: "#6B4FA8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

export default function CreditsTab() {
  const [data, setData] = useState(null);
  const [referral, setReferral] = useState(null);
  const [msg, setMsg] = useState(null);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  // 결제 연동이 켜져 있으면 결제창으로, 아직이면 예전처럼 입금 신청으로 받는다.
  const [pay, setPay] = useState(null);
  // 동의 항목이 생기기 전에 가입한 회원은 이 자리에서 CI 동의를 받는다.
  const [ciAgree, setCiAgree] = useState(false);

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
    apiJson("/api/checkout/config").then(setPay).catch(() => setPay({ payment: null, identity: null }));
  }, []);

  // 포트원 결제창으로 바로 결제한다. 크레딧은 서버가 포트원에 금액을 확인한 뒤에만 들어온다.
  const buyNow = async (pack) => {
    if (!window.confirm(`${pack.label}을(를) ${pack.krw.toLocaleString()}원에 결제할까요?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await payForPack(pack.key);
      if (r.pending) setMsg({ type: "ok", text: "입금이 확인되면 크레딧이 지급돼요." });
      else setMsg({ type: "ok", text: `결제가 완료됐어요. 크레딧 ${r.credits}개를 넣어드렸어요.` });
      await load();
    } catch (e) {
      if (e.cancelled) setMsg(null);
      else setMsg({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const doVerifyIdentity = async () => {
    if (pay && !pay.identityAgreed && !ciAgree) {
      setMsg({ type: "err", text: "본인확인 정보(CI) 수집·이용에 동의해주세요." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await verifyIdentity({ agree: ciAgree });
      setPay((v) => ({ ...v, identityVerified: true, identityAgreed: true }));
      setMsg({ type: "ok", text: r.name ? `${r.name}님 본인확인이 완료됐어요.` : "본인확인이 완료됐어요." });
    } catch (e) {
      if (!e.cancelled) setMsg({ type: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const buy = async (pack) => {
    if (!contact.trim()) return setMsg({ type: "err", text: "연락받으실 번호나 이메일을 먼저 입력해주세요." });
    if (!window.confirm(`${pack.label}을(를) ${pack.krw.toLocaleString()}원에 신청할까요?`)) return;
    setBusy(true);
    try {
      await apiJson("/api/credit-packs", { method: "POST", body: { packKey: pack.key, contact } });
      setMsg({ type: "ok", text: "신청했어요. 결제 안내를 보내드리고, 입금이 확인되면 크레딧을 넣어드릴게요." });
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
        <div style={{ fontSize: 12, color: "#6E6389", fontWeight: 600 }}>남은 크레딧</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#4E3391", letterSpacing: "-0.02em" }}>
          {data.balance.toLocaleString()}
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 4 }}>크레딧</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#8577A8", marginTop: 2 }}>
          2,000자당 1크레딧 · 매달 {data.planCredits.toLocaleString()}크레딧이 들어옵니다
        </div>
      </div>

      <div style={{ ...card, background: "#FBF8FF" }}>
        <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.7 }}>
          요금제에 따라 매달 크레딧이 들어오고, 검증할 때마다 1개씩 씁니다.
          다 쓰면 <b>요금제를 올려도 자동으로 늘어나지 않고</b> 크레딧을 추가로 구매하셔야 해요.
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>크레딧 추가 구매</div>
      {pay?.identity && !pay.identityVerified && (
        <div style={{ ...card, background: "#FBF8FF", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.6 }}>
            결제 전 <b>본인확인</b>을 한 번 해주세요. 카카오·네이버·PASS 인증서 중에 고르실 수 있어요.
            {!pay.identityAgreed && (
              <label style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={ciAgree} onChange={(e) => setCiAgree(e.target.checked)} style={{ marginTop: 2, accentColor: "#6B4FA8" }} />
                <span style={{ fontSize: 11.5, color: "#6E6389", lineHeight: 1.6 }}>
                  <b>[필수]</b> 이름·생년월일·성별·휴대전화번호·연계정보(CI)·중복가입확인정보(DI) 수집·이용에 동의합니다.
                  탈퇴 시까지 보관하며 주민등록번호는 수집하지 않아요.{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#6B4FA8" }}>개인정보처리방침</a>
                </span>
              </label>
            )}
          </div>
          <button onClick={doVerifyIdentity} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.45 : 1, flexShrink: 0 }}>본인확인</button>
        </div>
      )}
      {!pay?.payment && <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="연락받으실 휴대폰 번호 또는 이메일"
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0", marginBottom: 10, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }}
      />}
      {data.packs.map((pack) => (
        <div key={pack.key} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{pack.label}</div>
            <div style={{ fontSize: 11.5, color: "#A99BC9" }}>{pack.krw.toLocaleString()}원</div>
          </div>
          <button
            onClick={() => (pay?.payment ? buyNow(pack) : buy(pack))}
            disabled={busy}
            style={{ ...ghostBtn, opacity: busy ? 0.45 : 1, flexShrink: 0 }}
          >
            {pay?.payment ? "결제하기" : "구매 신청"}
          </button>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "#A99BC9", lineHeight: 1.6, marginBottom: 18 }}>
        크레딧은 AI 답변 속 사실 주장을 유메가 검증하는 데 쓰는 이용권입니다. 검증 1회에 1크레딧이 차감되고(입력 2,000자마다 1개),
        유효기간은 없습니다. 배송되는 실물은 없으며 결제가 확인되면 계정에 바로 적립됩니다.
        {pay?.payment
          ? "결제가 끝나면 서버가 결제 내역을 확인한 뒤 크레딧을 바로 넣어드립니다."
          : "온라인 결제는 준비 중이라 지금은 신청만 받고 있어요. 입금이 확인되면 운영자가 크레딧을 넣어드립니다."}
        크레딧은 현금으로 바꿔드리지 않으며, 환불 조건은 아래 <a href="/refund" target="_blank" rel="noopener noreferrer" style={{ color: "#8577A8" }}>환불정책</a>을 따릅니다.
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>친구 추천</div>
      <div style={card}>
        <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.7, marginBottom: 10 }}>
          내 링크로 가입한 친구가 첫 검증을 마치면 <b>{referral?.creditsPerReferral ?? 0} 크레딧</b>과 <b>기여도 {referral?.pointsPerReferral ?? 0}점</b>을 드려요.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #EDE3FA", background: "#FBF8FF", fontSize: 12, color: "#6E6389", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          <button
            onClick={async () => {
              setMsg(
                (await copyText(link))
                  ? { type: "ok", text: "추천 링크를 복사했어요." }
                  : { type: "err", text: "복사하지 못했어요. 직접 선택해 복사해주세요." },
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

      {data.bounties.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>내 제보</div>
          <div style={{ fontSize: 11.5, color: "#A99BC9", lineHeight: 1.6, marginBottom: 8 }}>
            제보가 확인되면 크레딧이 아니라 <b>기여도 {data.reportPoints.toLocaleString()}점</b>이 쌓입니다. 점수와 순위는 랭킹에서 볼 수 있어요.
          </div>
          {data.bounties.slice(0, 5).map((b) => {
            const s = BOUNTY_STATUS[b.status] || BOUNTY_STATUS.pending;
            return (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F4EEFC" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#241F33", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.identifier_value}</div>
                  <div style={{ fontSize: 11, color: "#A99BC9" }}>{fmt(b.created_at)}{b.reviewer_note ? ` · ${b.reviewer_note}` : ""}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 999 }}>
                  {s.label}{b.credits ? ` +${b.credits.toLocaleString()}` : ""}
                </span>
              </div>
            );
          })}
        </>
      )}

      {data.purchases.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>구매 신청 내역</div>
          {data.purchases.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid #F4EEFC" }}>
              <span>{r.item_label}</span>
              <span style={{ color: "#A99BC9" }}>{PURCHASE_STATUS[r.status] || r.status} · {fmt(r.created_at)}</span>
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

      {/* 실제로 돈을 내는 화면이다. 사업자 정보와 환불 조건이 이 화면 안에 있어야 한다. */}
      <BusinessInfo />
    </>
  );
}
