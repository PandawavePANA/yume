// 공헌도 랭킹 — 오른쪽 사이드바의 한 탭.
//
// 공헌도는 크레딧과 다른 값이다. 크레딧은 검증을 돌리면 줄어들고, 공헌도는 줄지 않는다.
// 그래서 "많이 쓴 사람"이 아니라 "많이 보탠 사람"이 위로 올라온다.
//
// 이름은 display_name이거나 계정 id로 만든 고정 핸들이고, 이메일은 절대 보드에 올리지
// 않는다 — 랭킹 하나 보여주자고 가입자 명단을 공개할 수는 없다.
//
// 예전에는 화면 한가운데 모달이었다. 랭킹을 보려면 화면 전체가 덮이고 하던 일이 멈췄다.
// 폭이 320px로 좁아졌으므로 넓을 때 쓰던 배치를 그대로 옮기지 않는다 — 네 칸이던 점수표는
// 두 칸씩, 순위 줄은 한 줄로 눌러 담는다.
import { useEffect, useState } from "react";
import { apiJson } from "./api.js";
import { t, useLang } from "../../i18n.js";

const MEDAL = ["🥇", "🥈", "🥉"];

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
};

const REASON = {
  verify: "검증", referral: "친구 초대", finding: "사실과 다른 주장 발견",
  report: "제보 승인", adjust: "운영자 조정",
};

export default function RankingPanel({ active, loggedIn, onNeedLogin }) {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // 탭을 열 때 받아 온다. 채팅만 보고 있는 사람에게까지 미리 받아 둘 이유가 없다.
  useEffect(() => {
    if (!active || !loggedIn || data) return;
    apiJson("/api/contribution").then(setData, (e) => setError(e.message));
  }, [active, loggedIn, data]);

  const daysLeft = (endsAt) => {
    const ms = Number(endsAt) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return t("곧 마감");
    const d = Math.ceil(ms / 86400000);
    return d > 1 ? t("{n}일 남음", { n: d }) : t("오늘 마감");
  };
  const day = (ts) =>
    ts ? new Date(ts).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" }) : "-";

  if (!loggedIn) {
    return (
      <Pad>
        <p style={{ fontSize: 12.5, color: UI.ink2, lineHeight: 1.7, marginBottom: 14 }}>{t("랭킹은 로그인하면 볼 수 있어요.")}</p>
        <button onClick={onNeedLogin} style={{
          padding: "9px 18px", borderRadius: 999, border: "none", background: UI.accent,
          color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>{t("로그인하기")}</button>
      </Pad>
    );
  }
  if (error) return <Pad><span style={{ fontSize: 12.5, color: "#C6402F" }}>{error}</span></Pad>;
  if (!data) return <Pad><span style={{ fontSize: 12.5, color: UI.ink3 }}>{t("불러오는 중…")}</span></Pad>;

  return (
    <div style={{ padding: "14px 14px 22px" }}>
      <p style={{ fontSize: 11.5, color: UI.ink2, lineHeight: 1.65, margin: "0 0 12px" }}>
        {t("검증 횟수가 아니라 찾아낸 것에 점수를 둡니다. 랭킹과 보상은 분기마다 초기화돼요.")}
      </p>

      {/* 어떤 행동이 몇 점인지. 점수를 올리려면 무엇을 해야 하는지가 여기서 정해진다. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[["검증", data.scoring.verify], ["초대", data.scoring.referral], ["발견", data.scoring.finding], ["제보", data.scoring.report]].map(([label, pts]) => (
          <div key={label} style={{ padding: "8px 10px", borderRadius: 10, background: "#FBF8FF", border: `1px solid ${UI.hairline}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 11.5, color: UI.ink3 }}>{t(label)}</span>
            <b style={{ fontSize: 13.5, color: UI.accent, fontVariantNumeric: "tabular-nums" }}>{pts.toLocaleString()}</b>
          </div>
        ))}
      </div>

      {/* 내 점수 — 남의 순위보다 내 숫자가 먼저 궁금하다. */}
      <div style={{ marginTop: 10, padding: "13px 14px", borderRadius: 13, background: "linear-gradient(135deg,#F3EBFF,#EDE4FC)" }}>
        <div style={{ fontSize: 11, color: "#6E6389", fontWeight: 700 }}>{t("내 공헌도")}</div>
        <div style={{ fontSize: 25, fontWeight: 800, color: "#4E3391", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1.25 }}>
          {data.points.toLocaleString()}
        </div>
        <div style={{ fontSize: 11.5, color: "#6E6389", lineHeight: 1.5 }}>
          {data.rank ? `${data.name} · ${t("전체 {n}위", { n: data.rank })}` : t("아직 점수가 없어요 — 검증을 한 번 해보세요")}
        </div>
      </div>

      {/* 이번 분기 상 */}
      <Section label={`${data.period} ${t("보상")}`} right={daysLeft(data.periodEndsAt)} />
      <div style={{ border: `1px solid ${UI.hairline}`, borderRadius: 12, padding: "10px 12px" }}>
        {data.rewards.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, padding: "4px 0" }}>
            <span style={{ color: UI.ink2 }}>{r.from === r.to ? t("{n}위", { n: r.from }) : t("{a}~{b}위", { a: r.from, b: r.to })}</span>
            <span style={{ fontWeight: 700, color: r.kind === "goldbar" ? "#8A5A14" : UI.accent, textAlign: "right" }}>{t(r.label)}</span>
          </div>
        ))}

        {/* 다음 단계까지 남은 인원. 이게 이 화면에서 가장 센 문장이다 —
            "몇 명만 더 오면 상이 올라간다"는 사람을 데려올 이유가 되고,
            데려온 사람이 또 순위를 다툰다. 남은 수를 숨기면 그 고리가 끊긴다. */}
        {data.nextTier && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(20,17,24,0.08)" }}>
            <div style={{ fontSize: 11.5, color: "#8A5A14", fontWeight: 700, marginBottom: 6, lineHeight: 1.5 }}>
              {t("{n}명 더 모이면 상이 올라갑니다", { n: data.nextTier.remaining.toLocaleString() })}
            </div>
            <div style={{ height: 5, borderRadius: 999, background: "rgba(138,90,20,0.14)", overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(2, Math.min(100, Math.round((data.users / data.nextTier.minUsers) * 100)))}%`,
                height: "100%", borderRadius: 999,
                background: "linear-gradient(90deg,#D9A441,#8A5A14)", transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: UI.ink3, fontVariantNumeric: "tabular-nums", lineHeight: 1.5 }}>
              {t("가입 {a}명 / {b}명", { a: data.users.toLocaleString(), b: data.nextTier.minUsers.toLocaleString() })}
              <br />
              {t("1위 {label}", { label: t(data.nextTier.rewards[0]?.label || "") })}
            </div>
          </div>
        )}
      </div>

      <Section label={t("전체 랭킹")} />
      {data.leaderboard.length === 0 ? (
        <div style={{ fontSize: 12, color: UI.ink3 }}>{t("아직 순위가 없어요. 첫 번째가 되어보세요.")}</div>
      ) : (
        data.leaderboard.map((r) => {
          const mine = r.name === data.name;
          return (
            <div key={r.userId} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 9,
              background: mine ? "rgba(139,111,216,0.10)" : "transparent",
              borderBottom: `1px solid ${UI.hairline}`,
            }}>
              <span style={{ width: 22, flex: "none", fontSize: r.rank <= 3 ? 14 : 11.5, fontWeight: 700, color: UI.ink3, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {MEDAL[r.rank - 1] || r.rank}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: mine ? 750 : 500, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}{mine ? ` ${t("(나)")}` : ""}
              </span>
              <span style={{ flex: "none", fontSize: 12.5, fontWeight: 700, color: UI.accent, fontVariantNumeric: "tabular-nums" }}>
                {r.points.toLocaleString()}
              </span>
            </div>
          );
        })
      )}

      {data.ledger.length > 0 && (
        <>
          <Section label={t("내 적립 내역")} />
          {data.ledger.slice(0, 10).map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, padding: "6px 0", borderBottom: `1px solid ${UI.hairline}` }}>
              <span style={{ color: UI.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(REASON[l.reason] || l.reason)}
              </span>
              <span style={{ flex: "none", color: UI.ink3 }}>
                {day(l.created_at)} <b style={{ color: "#1F9D66" }}>+{l.points.toLocaleString()}</b>
              </span>
            </div>
          ))}
        </>
      )}

      <p style={{ fontSize: 10.5, color: UI.ink3, lineHeight: 1.6, marginTop: 14 }}>
        {t("제보 점수는 운영자 확인이 끝난 뒤에 쌓입니다. 분기가 끝나면 순위가 확정되고 점수는 0부터 다시 시작해요 — 지난 기록은 그대로 남습니다.")}
      </p>
    </div>
  );
}

function Section({ label, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, margin: "18px 0 7px" }}>
      <span style={{ fontSize: 12, fontWeight: 750, color: UI.ink }}>{label}</span>
      {right && <span style={{ fontSize: 11, color: UI.ink3 }}>{right}</span>}
    </div>
  );
}

function Pad({ children }) {
  return <div style={{ padding: "28px 18px", textAlign: "center" }}>{children}</div>;
}
