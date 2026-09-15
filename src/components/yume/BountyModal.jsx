import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiJson } from "./api";

// 존재하지 않는 인용을 찾았을 때 제보하는 창.
//
// 공유 링크를 필수로 받는 이유를 화면에도 적어둔다 — 링크가 없으면 "AI가 실제로 한 말"과
// "지금 지어낸 문자열"을 구분할 방법이 없어서, 그 상태로는 보상을 드릴 수 없다.
const box = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0",
  fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginTop: 6,
};

// 판정 카드 아래에 붙는 안내 + 버튼. 존재하지 않는 인용이 나왔을 때만 보인다.
export function BountyPrompt({ claim, claimIdx, verificationId, user, onNeedLogin }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={{ marginTop: 10, fontSize: 12.5, color: "#1F7A52", background: "#EAF7F0", borderRadius: 10, padding: "9px 12px" }}>
        제보를 접수했어요. 확인 후 크레딧을 드립니다.
      </div>
    );
  }
  return (
    <>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(139,111,216,0.08)", borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontSize: 12.5, color: "#5B5470", lineHeight: 1.6, flex: 1, minWidth: 180 }}>
          아직 알려지지 않은 인용이라면 제보하고 크레딧을 받을 수 있어요.
        </div>
        <button
          onClick={() => (user ? setOpen(true) : onNeedLogin?.())}
          style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: "none",
            background: "linear-gradient(90deg,#B49AEE,#6B4FA8)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          조사하고 크레딧 받기
        </button>
      </div>
      {open && (
        <BountyModal
          verificationId={verificationId}
          claimIdx={claimIdx}
          claim={claim}
          onClose={() => setOpen(false)}
          onDone={() => setSubmitted(true)}
        />
      )}
    </>
  );
}

export default function BountyModal({ verificationId, claimIdx, claim, bountyCredits = 20, onClose, onDone }) {
  const [platforms, setPlatforms] = useState([]);
  const [platform, setPlatform] = useState("chatgpt");
  const [shareUrl, setShareUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiJson("/api/credits")
      .then((d) => setPlatforms(d.platforms || []))
      .catch(() => setPlatforms([{ key: "chatgpt", label: "ChatGPT", host: "chatgpt.com" }]));
  }, []);

  const submit = async () => {
    setErr("");
    if (!shareUrl.trim()) return setErr("대화 공유 링크를 넣어주세요.");
    if (!consent) return setErr("데이터 활용 동의가 필요해요.");
    setBusy(true);
    try {
      await apiJson("/api/bounty", { method: "POST", body: { verificationId, claimIdx, platform, shareUrl: shareUrl.trim(), consent: true } });
      setDone(true);
      onDone?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const host = platforms.find((p) => p.key === platform)?.host || "chatgpt.com";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(75,55,120,0.28)", display: "flex",
      alignItems: "flex-start", justifyContent: "center", zIndex: 70, backdropFilter: "blur(2px)", padding: "8vh 16px", overflowY: "auto",
    }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
        style={{ width: "min(480px, 100%)", background: "#fff", borderRadius: 20, padding: 26, boxShadow: "0 20px 60px rgba(75,55,120,0.22)", position: "relative" }}
      >
        <button onClick={onClose} aria-label="닫기" style={{ position: "absolute", top: 14, right: 16, border: "none", background: "transparent", color: "#9C8FC2", fontSize: 18, cursor: "pointer" }}>×</button>

        {done ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>제보 접수했어요</div>
            <div style={{ fontSize: 13, color: "#5B5470", lineHeight: 1.7, marginBottom: 18 }}>
              공유 링크를 확인한 뒤 크레딧을 드립니다. 결과는 계정 설정 → 크레딧에서 볼 수 있어요.
            </div>
            <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#B49AEE,#6B4FA8)", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              확인
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>제보하고 크레딧 받기</div>
            <div style={{ fontSize: 12.5, color: "#A99BC9", marginBottom: 16 }}>확인되면 {bountyCredits} 크레딧을 드려요</div>

            <div style={{ background: "#FBF8FF", border: "1px solid #EDE3FA", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, color: "#8577A8", fontWeight: 600, marginBottom: 4 }}>제보할 인용</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#4E3391" }}>{claim?.nec?.identifier?.value || claim?.nec?.identifier?.canonical}</div>
              <div style={{ fontSize: 12, color: "#6E6389", marginTop: 4, lineHeight: 1.6 }}>{claim?.text}</div>
            </div>

            <label style={{ fontSize: 12, color: "#6E6389", fontWeight: 600 }}>어느 AI의 답변이었나요?</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={box}>
              {platforms.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: "#6E6389", fontWeight: 600, display: "block", marginTop: 14 }}>대화 공유 링크</label>
            <input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} placeholder={`https://${host}/share/...`} style={box} />
            <div style={{ fontSize: 11.5, color: "#A99BC9", lineHeight: 1.6, marginTop: 6 }}>
              해당 AI에서 대화를 공유하기로 만든 링크가 필요해요. 링크가 있어야 그 AI가 실제로 한 말인지 확인할 수 있고,
              확인이 안 되면 보상을 드릴 수 없습니다.
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#5B5470", lineHeight: 1.6, marginTop: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span>제보한 인용과 판정 내용을 유메가 할루시네이션 데이터로 활용하는 데 동의합니다.</span>
            </label>

            {err && <div style={{ fontSize: 12.5, color: "#C6402F", background: "#FBE9E7", borderRadius: 10, padding: "8px 12px", marginTop: 12 }}>{err}</div>}

            <button onClick={submit} disabled={busy} style={{
              marginTop: 16, width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
              background: "linear-gradient(90deg,#B49AEE,#6B4FA8)", color: "#fff", fontSize: 13.5, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            }}>
              {busy ? "보내는 중…" : "제보하기"}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
