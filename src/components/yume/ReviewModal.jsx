import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiJson } from "./api";
import { t } from "../../i18n.js";

// 운영자 검토함 — 유메 화면 안에서 바로 승인/반려.
//
// 왜 여기에 만드는가. 검토 화면은 /admin에 이미 있었는데 그쪽은 ADMIN_PASSWORD로 한 번
// 더 잠겨 있다. 그 값이 설정되기 전에는 문이 열리지 않아서, 사용자가 실제로 제보를
// 보냈는데 확인할 방법이 없었다. 보상이 걸린 접수함을 아무도 못 여는 것은 그 자체로
// 사고다 — 보낸 사람은 기다리는데 우리는 보지도 못한다.
//
// 권한은 새로 만들지 않는다. 이미 로그인한 관리자 세션(role=admin)을 그대로 쓰고,
// 서버도 /api/admin/*와 같은 문(requireAdmin)이다.
//
// 반려 사유를 필수로 받는다. 이유 없이 반려하면 보낸 사람은 무엇이 잘못됐는지 모르고,
// 같은 것을 또 보내거나 다시는 안 보낸다. 둘 다 우리 손해다.

const VERDICT_LABEL = { confirmed: "사실로 확인됨", false: "사실과 다름", uncertain: "확인되지 않음" };
const LINK_LABEL = {
  found: { text: "링크에서 확인됨", color: "#1F7A52", bg: "#E4F5EC" },
  not_found: { text: "링크에서 못 찾음", color: "#B4690E", bg: "#FBEEDA" },
  unreachable: { text: "링크를 열지 못함", color: "#C6402F", bg: "#FBE8E5" },
  checking: { text: "확인 중", color: "#6E6389", bg: "#F1EDF8" },
};

const card = {
  border: "1px solid #EDE3FA", borderRadius: 14, padding: "14px 16px", marginBottom: 10, background: "#fff",
};
const btn = (primary) => ({
  padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  border: primary ? "none" : "1px solid #D4BEF0",
  background: primary ? "#5B3FA0" : "#fff",
  color: primary ? "#fff" : "#6E6389",
});
const box = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0",
  fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginTop: 8, resize: "vertical", lineHeight: 1.6,
};
const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-");

// 카드 하나의 처리부. 승인이든 반려든 여기서 사유를 받고 보낸다.
function Actions({ endpoint, approveLabel, approveDecision, rejectDecision, rejectPlaceholder, points, onDone }) {
  const [mode, setMode] = useState(null); // null | "approve" | "reject"
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async (decision) => {
    setErr("");
    // 반려 사유는 보낸 사람에게 그대로 보인다. 비워 두면 왜 안 됐는지 알 길이 없다.
    if (decision === rejectDecision && note.trim().length < 5) return setErr("반려 사유를 적어주세요. 보낸 분에게 그대로 표시됩니다.");
    setBusy(true);
    try {
      await apiJson(endpoint, { method: "POST", body: { decision, note: note.trim() || undefined } });
      onDone(decision === approveDecision ? { approved: true, points } : { approved: false });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  if (!mode) {
    return (
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => setMode("approve")} style={btn(true)}>{approveLabel}</button>
        <button onClick={() => setMode("reject")} style={btn(false)}>{t("반려")}</button>
      </div>
    );
  }
  const rejecting = mode === "reject";
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6389" }}>
        {rejecting ? t("반려 사유 (보낸 분에게 표시됩니다)") : t("승인 메모 (선택)")}
      </label>
      <textarea
        value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
        placeholder={rejecting ? rejectPlaceholder : t("예: 공유 링크에서 해당 인용을 직접 확인했습니다.")}
        style={box}
      />
      {err && <div style={{ fontSize: 12, color: "#C6402F", marginTop: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button disabled={busy} onClick={() => send(rejecting ? rejectDecision : approveDecision)} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>
          {busy ? t("보내는 중…") : rejecting ? t("반려하기") : `${approveLabel} · ${points.toLocaleString()}점`}
        </button>
        <button disabled={busy} onClick={() => { setMode(null); setNote(""); setErr(""); }} style={btn(false)}>{t("취소")}</button>
      </div>
    </div>
  );
}

function Done({ result }) {
  return (
    <div style={{ ...card, background: result.approved ? "#EAF7F0" : "#F5F2FA", borderColor: result.approved ? "#CDE9DA" : "#E7E1F2" }}>
      <div style={{ fontSize: 13, color: result.approved ? "#1F7A52" : "#6E6389" }}>
        {result.approved ? t("승인했어요 — 공헌도 {n}점을 드렸습니다.", { n: result.points.toLocaleString() }) : t("반려했어요. 사유가 보낸 분에게 표시됩니다.")}
      </div>
    </div>
  );
}

export default function ReviewModal({ onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState({}); // "bounty:3" → { approved, points }

  useEffect(() => {
    apiJson("/api/admin/queue").then(setData).catch((e) => setErr(e.message));
  }, []);

  const pending = data ? data.bounties.length + data.corrections.length - Object.keys(done).length : 0;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(75,55,120,0.28)", display: "flex",
      alignItems: "flex-start", justifyContent: "center", zIndex: 75, backdropFilter: "blur(2px)", padding: "6vh 16px", overflowY: "auto",
    }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
        style={{ width: "min(620px, 100%)", background: "#FBF8FF", borderRadius: 20, padding: 24, boxShadow: "0 20px 60px rgba(75,55,120,0.22)", position: "relative" }}
      >
        <button onClick={onClose} aria-label={t("닫기")} style={{ position: "absolute", top: 14, right: 16, border: "none", background: "transparent", color: "#9C8FC2", fontSize: 18, cursor: "pointer" }}>×</button>

        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t("검토 대기")}</div>
        <div style={{ fontSize: 12.5, color: "#A99BC9", marginBottom: 18 }}>
          {t("근거를 직접 확인하고 처리하세요. 승인하면 그 자리에서 공헌도가 지급됩니다.")}
        </div>

        {err && <div style={{ fontSize: 13, color: "#C6402F", background: "#FBE9E7", borderRadius: 10, padding: "10px 12px" }}>{err}</div>}
        {!data && !err && <div style={{ fontSize: 13, color: "#A99BC9" }}>{t("불러오는 중…")}</div>}

        {data && pending === 0 && (
          <div style={{ fontSize: 13.5, color: "#6E6389", padding: "28px 0", textAlign: "center" }}>{t("검토할 것이 없어요.")}</div>
        )}

        {data?.bounties.map((b) => {
          const key = `bounty:${b.id}`;
          if (done[key]) return <Done key={key} result={done[key]} />;
          const link = LINK_LABEL[b.linkCheck] || LINK_LABEL.checking;
          return (
            <div key={key} style={card}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#5B3FA0", background: "#F3EBFF", borderRadius: 999, padding: "3px 9px" }}>{t("할루시네이션 제보")}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: link.color, background: link.bg, borderRadius: 999, padding: "3px 9px" }}>{t(link.text)}</span>
                <span style={{ fontSize: 11.5, color: "#A99BC9", marginLeft: "auto" }}>{b.email} · {fmt(b.createdAt)}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4E3391" }}>{b.identifier}</div>
              <div style={{ fontSize: 12.5, color: "#6E6389", marginTop: 4, lineHeight: 1.6 }}>{b.claimText}</div>
              {b.linkCheckNote && <div style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 4 }}>{b.linkCheckNote}</div>}
              <a href={b.shareUrl} target="_blank" rel="noreferrer noopener"
                style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "#5B3FA0", wordBreak: "break-all" }}>
                {t("{platform} 대화 열어보기", { platform: b.platform })} ↗
              </a>
              <div style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 6, lineHeight: 1.6 }}>
                {t("링크를 직접 열어 그 AI가 실제로 이 인용을 했는지 확인한 뒤 승인하세요. 자동 확인은 참고용입니다 — 공유 페이지 상당수가 본문을 자바스크립트로 그려서 못 찾을 수 있어요.")}
              </div>
              <Actions
                endpoint={`/api/admin/bounties/${b.id}/review`}
                approveLabel={t("승인")}
                approveDecision="approve" rejectDecision="reject"
                rejectPlaceholder={t("예: 공유 링크에서 해당 인용을 확인하지 못했어요.")}
                points={data.reportPoints}
                onDone={(r) => setDone((d) => ({ ...d, [key]: r }))}
              />
            </div>
          );
        })}

        {data?.corrections.map((c) => {
          const key = `correction:${c.id}`;
          if (done[key]) return <Done key={key} result={done[key]} />;
          return (
            <div key={key} style={card}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#A32B1A", background: "#FBEBE7", borderRadius: 999, padding: "3px 9px" }}>{t("유메 판정 정정")}</span>
                <span style={{ fontSize: 11.5, color: "#A99BC9", marginLeft: "auto" }}>{c.email} · {fmt(c.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#4E3391" }}>{c.claimText}</div>
              <div style={{ fontSize: 12.5, color: "#6E6389", marginTop: 6, lineHeight: 1.6 }}>
                {t(VERDICT_LABEL[c.yumeVerdict] || c.yumeVerdict)} → <b>{t(VERDICT_LABEL[c.correctVerdict] || c.correctVerdict)}</b>
              </div>
              <div style={{ fontSize: 12, color: "#8577A8", marginTop: 6, lineHeight: 1.6 }}>{t("유메가 한 말")}: {c.yumeExplanation}</div>
              <div style={{ fontSize: 12.5, color: "#241F33", marginTop: 8, lineHeight: 1.6, background: "#FBF8FF", borderRadius: 10, padding: "9px 12px" }}>{c.note}</div>
              {c.evidenceUrl && (
                <a href={c.evidenceUrl} target="_blank" rel="noreferrer noopener"
                  style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "#5B3FA0", wordBreak: "break-all" }}>
                  {t("근거 링크 열어보기")} ↗
                </a>
              )}
              <div style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 6, lineHeight: 1.6 }}>
                {t("채택하면 그 주장의 캐시가 함께 지워집니다 — 같은 주장이 다음 검증에서 같은 판정으로 또 나가지 않도록.")}
              </div>
              <Actions
                endpoint={`/api/admin/corrections/${c.id}/review`}
                approveLabel={t("채택")}
                approveDecision="accept" rejectDecision="reject"
                rejectPlaceholder={t("예: 제시한 근거에서 다른 판정으로 볼 만한 내용을 확인하지 못했어요.")}
                points={data.correctionPoints}
                onDone={(r) => setDone((d) => ({ ...d, [key]: r }))}
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
