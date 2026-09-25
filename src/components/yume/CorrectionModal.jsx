import { useState } from "react";
import { motion } from "framer-motion";
import { apiJson } from "./api";
import { t } from "../../i18n.js";

// 유메가 틀렸다고 알려주는 창.
//
// 이 문이 없던 동안 사용자가 할 수 있는 일이 없었다. 화면에 "사실과 다름"이 붙어 있는데
// 본인은 그게 아니라는 걸 알고 근거도 손에 쥐고 있는데, 그걸 넘길 자리가 없었다.
// 우리는 그 사실을 영영 모르고 같은 판정을 다음 사람에게도 내보냈다.
//
// 제보(BountyModal)와 대상이 반대다. 저쪽은 남의 AI가 지어낸 인용을 넘겨주는 것이고,
// 이쪽은 우리가 낸 판정이 틀렸다고 알려주는 것이다. 그래서 공유 링크를 받지 않는다 —
// 대상이 이미 우리 검증 기록 안에 있다.
//
// 근거 링크를 필수로 하지 않는 이유가 있다. 잡지 지면, 구독자 전용 데이터베이스처럼
// 링크를 댈 수 없는 근거가 있고, 그게 바로 유메가 틀리는 자리다. 링크를 요구하면
// 우리가 가장 자주 틀리는 종류의 오류를 스스로 못 듣게 된다.

const VERDICT_LABEL = { confirmed: "사실로 확인됨", false: "사실과 다름", uncertain: "확인되지 않음" };
const VERDICT_ORDER = ["confirmed", "false", "uncertain"];

const box = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0",
  fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginTop: 6,
};

// 판정 카드 아래에 붙는 한 줄. 판정이 붙은 주장이면 모두 보인다 — 유메가 틀리는 건
// "사실과 다름"만이 아니고, 맞다고 한 것이 틀렸을 때가 더 위험하다.
export function CorrectionPrompt({ claim, claimIdx, verificationId, user, onNeedLogin, points = 1000 }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={{ marginTop: 10, fontSize: 12.5, color: "#1F7A52", background: "#EAF7F0", borderRadius: 10, padding: "9px 12px", lineHeight: 1.6 }}>
        {t("알려주셔서 고맙습니다. 확인 후 판정을 고치고 공헌도를 드립니다.")}
      </div>
    );
  }
  return (
    <>
      <button
        onClick={() => (user ? setOpen(true) : onNeedLogin?.())}
        style={{
          marginTop: 10, padding: 0, border: "none", background: "transparent", cursor: "pointer",
          fontSize: 12.5, color: "#8577A8", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "inherit", textAlign: "left",
        }}
      >
        {t("이 판정이 틀렸나요? 근거를 알려주시면 공헌도를 드려요")}
      </button>
      {open && (
        <CorrectionModal
          verificationId={verificationId}
          claimIdx={claimIdx}
          claim={claim}
          points={points}
          onClose={() => setOpen(false)}
          onDone={() => setSubmitted(true)}
        />
      )}
    </>
  );
}

export default function CorrectionModal({ verificationId, claimIdx, claim, points = 1000, onClose, onDone }) {
  // 처음 고른 값은 유메가 낸 판정이 아닌 것 중 하나다 — 같은 값이면 정정이 아니다.
  const [correctVerdict, setCorrectVerdict] = useState(VERDICT_ORDER.find((v) => v !== claim?.verdict) || "confirmed");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setErr("");
    if (note.trim().length < 10) return setErr("무엇이 왜 다른지 10자 이상 적어주세요.");
    if (!consent) return setErr("판정 개선에 활용하는 데 동의가 필요해요.");
    setBusy(true);
    try {
      await apiJson("/api/corrections", {
        method: "POST",
        body: { verificationId, claimIdx, correctVerdict, evidenceUrl: evidenceUrl.trim(), note: note.trim(), consent: true },
      });
      setDone(true);
      onDone?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

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
        <button onClick={onClose} aria-label={t("닫기")} style={{ position: "absolute", top: 14, right: 16, border: "none", background: "transparent", color: "#9C8FC2", fontSize: 18, cursor: "pointer" }}>×</button>

        {done ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("알려주셔서 고맙습니다")}</div>
            <div style={{ fontSize: 13, color: "#5B5470", lineHeight: 1.7, marginBottom: 18 }}>
              {t("근거를 직접 확인한 뒤 판정을 고치고 공헌도를 드립니다. 결과는 랭킹 → 내 적립 내역에서 볼 수 있어요.")}
            </div>
            <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#5B3FA0", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              {t("확인")}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("이 판정이 틀렸어요")}</div>
            <div style={{ fontSize: 12.5, color: "#A99BC9", marginBottom: 16 }}>
              {t("채택되면 공헌도 {n}점 · 그 주장의 판정도 함께 고칩니다", { n: points.toLocaleString() })}
            </div>

            <div style={{ background: "#FBF8FF", border: "1px solid #EDE3FA", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, color: "#8577A8", fontWeight: 600, marginBottom: 4 }}>{t("유메가 이렇게 판정했어요")}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#4E3391" }}>{claim?.text}</div>
              <div style={{ fontSize: 12, color: "#6E6389", marginTop: 6, lineHeight: 1.6 }}>
                <b>{t(VERDICT_LABEL[claim?.verdict] || "확인되지 않음")}</b> — {claim?.explanation}
              </div>
            </div>

            <label style={{ fontSize: 12, color: "#6E6389", fontWeight: 600 }}>{t("맞는 판정은 무엇인가요?")}</label>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {VERDICT_ORDER.filter((v) => v !== claim?.verdict).map((v) => (
                <button key={v} onClick={() => setCorrectVerdict(v)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                  border: `1px solid ${correctVerdict === v ? "#5B3FA0" : "#D4BEF0"}`,
                  background: correctVerdict === v ? "#F3EBFF" : "#fff",
                  color: correctVerdict === v ? "#4E3391" : "#6E6389",
                  fontWeight: correctVerdict === v ? 700 : 500,
                }}>
                  {t(VERDICT_LABEL[v])}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, color: "#6E6389", fontWeight: 600, display: "block", marginTop: 14 }}>{t("무엇이 왜 다른가요?")}</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder={t("예: 이 평점은 Wine Enthusiast 2024년 10월호에 실려 있습니다. 검색으로는 안 나오지만 구독자 데이터베이스에서 확인됩니다.")}
              style={{ ...box, resize: "vertical", lineHeight: 1.6 }}
            />

            <label style={{ fontSize: 12, color: "#6E6389", fontWeight: 600, display: "block", marginTop: 14 }}>{t("근거 링크 (있으면)")}</label>
            <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" style={box} />
            <div style={{ fontSize: 11.5, color: "#A99BC9", lineHeight: 1.6, marginTop: 6 }}>
              {t("링크가 없어도 됩니다. 지면 기사나 구독자 전용 자료처럼 링크를 댈 수 없는 근거가 있고, 유메는 그런 자리에서 자주 틀립니다.")}
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#5B5470", lineHeight: 1.6, marginTop: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span>{t("보낸 내용을 유메가 판정 알고리즘 개선에 활용하는 데 동의합니다.")}</span>
            </label>

            {err && <div style={{ fontSize: 12.5, color: "#C6402F", background: "#FBE9E7", borderRadius: 10, padding: "8px 12px", marginTop: 12 }}>{err}</div>}

            <button onClick={submit} disabled={busy} style={{
              marginTop: 16, width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
              background: "#5B3FA0", color: "#fff", fontSize: 13.5, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            }}>
              {busy ? t("보내는 중…") : t("알려주기")}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
