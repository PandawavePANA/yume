import { useEffect, useState } from "react";
import { apiJson } from "./api";

// 공헌도 랭킹 보드.
//
// 공헌도는 크레딧과 다른 값이다. 크레딧은 검증을 돌리면 줄어들고, 공헌도는 줄지 않는다.
// 그래서 "많이 쓴 사람"이 아니라 "많이 보탠 사람"이 위로 올라온다.
//
// 이름은 display_name이거나 계정 id로 만든 고정 핸들이고, 이메일은 절대 보드에 올리지
// 않는다 — 랭킹 하나 보여주자고 가입자 명단을 공개할 수는 없다.
const MEDAL = ["🥇", "🥈", "🥉"];

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
  backdrop: "rgba(24, 16, 44, 0.32)",
};

const REASON = { verify: "검증", referral: "친구 초대", finding: "사실과 다른 주장 발견", report: "제보 승인", adjust: "운영자 조정" };
const daysLeft = (endsAt) => {
  const ms = Number(endsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "곧 마감";
  const d = Math.ceil(ms / 86400000);
  return d > 1 ? `${d}일 남음` : "오늘 마감";
};

const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-");

export default function RankingModal({ onClose, onNeedLogin, loggedIn }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loggedIn) return;
    apiJson("/api/contribution").then(setData, (e) => setError(e.message));
  }, [loggedIn]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: UI.backdrop, display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)",
        padding: "calc(20px + var(--yume-safe-top)) 20px calc(20px + var(--yume-safe-bottom))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", maxHeight: "86vh", overflowY: "auto", background: "#fff",
          borderRadius: 28, padding: "clamp(22px, 4vw, 34px)", boxShadow: "0 40px 100px rgba(24,16,44,0.28)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", color: UI.ink3, textTransform: "uppercase" }}>공헌도 랭킹</div>
            <h2 style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, margin: "8px 0 0" }}>가장 많이 찾아낸 사람들</h2>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: "none", background: "rgba(118,118,128,0.12)", color: UI.ink2, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <p style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, margin: "10px 0 0" }}>
          AI가 지어낸 걸 찾아내 알려주실수록 유메가 정확해집니다. 그래서 검증 횟수가 아니라 <b>찾아낸 것</b>에 점수를 둡니다.
          랭킹과 보상은 <b>분기마다 초기화</b>돼요.
        </p>

        {!loggedIn ? (
          <div style={{ marginTop: 20, padding: 20, borderRadius: 16, background: "#FBF8FF", border: `1px solid ${UI.hairline}`, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: UI.ink2, marginBottom: 14 }}>랭킹은 로그인하면 볼 수 있어요.</div>
            <button onClick={onNeedLogin} style={{ padding: "11px 22px", borderRadius: 999, border: "none", background: UI.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              로그인하기
            </button>
          </div>
        ) : error ? (
          <div style={{ marginTop: 20, fontSize: 13.5, color: "#C6402F" }}>{error}</div>
        ) : !data ? (
          <div style={{ marginTop: 20, fontSize: 13.5, color: UI.ink3 }}>불러오는 중…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 20 }}>
              {[["검증", data.scoring.verify], ["초대", data.scoring.referral], ["발견", data.scoring.finding], ["제보", data.scoring.report]].map(([label, pts]) => (
                <div key={label} style={{ padding: "12px 10px", borderRadius: 14, background: "#FBF8FF", border: `1px solid ${UI.hairline}`, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: UI.ink3 }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: UI.accent, fontVariantNumeric: "tabular-nums" }}>{pts.toLocaleString()}점</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 14, border: `1px solid ${UI.hairline}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: UI.ink }}>{data.period} 보상</span>
                <span style={{ fontSize: 12, color: UI.ink3 }}>{daysLeft(data.periodEndsAt)}</span>
              </div>
              {data.rewards.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "5px 0" }}>
                  <span style={{ color: UI.ink2 }}>{r.from === r.to ? `${r.from}위` : `${r.from}~${r.to}위`}</span>
                  <span style={{ fontWeight: 600, color: r.kind === "goldbar" ? "#8A5A14" : UI.accent }}>{r.label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, padding: "16px 18px", borderRadius: 16, background: "linear-gradient(135deg,#F3EBFF,#EDE4FC)" }}>
              <div style={{ fontSize: 12, color: "#6E6389", fontWeight: 600 }}>내 공헌도</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "#4E3391", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {data.points.toLocaleString()}점
                </span>
                <span style={{ fontSize: 13.5, color: "#6E6389" }}>
                  {data.rank ? `${data.name} · 전체 ${data.rank}위` : "아직 점수가 없어요 — 검증을 한 번 해보세요"}
                  {data.reward ? ` · 현재 ${data.reward.label} 구간` : ""}
                </span>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, margin: "22px 0 8px" }}>전체 랭킹</div>
            {data.leaderboard.length === 0 ? (
              <div style={{ fontSize: 13, color: UI.ink3 }}>아직 순위가 없어요. 첫 번째가 되어보세요.</div>
            ) : (
              data.leaderboard.map((r) => {
                const mine = r.name === data.name;
                return (
                  <div
                    key={r.userId}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
                      background: mine ? "rgba(139,111,216,0.10)" : "transparent",
                      borderBottom: `1px solid ${UI.hairline}`,
                    }}
                  >
                    <span style={{ width: 30, flexShrink: 0, fontSize: r.rank <= 3 ? 17 : 13, fontWeight: 700, color: UI.ink3, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                      {MEDAL[r.rank - 1] || r.rank}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: mine ? 700 : 500, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}{mine ? " (나)" : ""}
                    </span>
                    {r.reward && (
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: r.reward.kind === "goldbar" ? "#8A5A14" : UI.accent, background: r.reward.kind === "goldbar" ? "#FBF1DC" : "rgba(139,111,216,0.12)", borderRadius: 999, padding: "3px 9px" }}>
                        {r.reward.label}
                      </span>
                    )}
                    <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: UI.accent, fontVariantNumeric: "tabular-nums" }}>
                      {r.points.toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}

            {data.ledger.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, margin: "22px 0 8px" }}>내 적립 내역</div>
                {data.ledger.slice(0, 12).map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "7px 0", borderBottom: `1px solid ${UI.hairline}` }}>
                    <span style={{ color: UI.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {REASON[l.reason] || l.reason}{l.memo ? ` · ${l.memo}` : ""}
                    </span>
                    <span style={{ flexShrink: 0, color: UI.ink3 }}>
                      {fmt(l.created_at)} <b style={{ color: "#1F9D66" }}>+{l.points.toLocaleString()}</b>
                    </span>
                  </div>
                ))}
              </>
            )}

            <div style={{ fontSize: 11.5, color: UI.ink3, lineHeight: 1.65, marginTop: 18 }}>
              제보 점수는 제출한 순간이 아니라 운영자 확인이 끝난 뒤에 쌓입니다. 이미 등록된 인용은 점수 대상이 아니에요.
              순위가 같으면 먼저 도달한 분이 앞에 옵니다.
              분기가 끝나면 순위가 확정되고 점수는 0부터 다시 시작합니다 — 지난 분기 기록은 그대로 남습니다.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
