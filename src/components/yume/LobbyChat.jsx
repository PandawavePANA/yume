// 전체 채팅 — 오른쪽 사이드바의 한 탭.
//
// 여기 있는 것 중 진짜 기능은 이름 옆의 등수다. 대화 자체보다 그 숫자가 이 화면의
// 이유다. 혼자 보는 순위는 잘 안 움직이지만, 남들이 보는 자리에 붙어 있으면 움직인다.
//
// 색은 서버가 정해서 내려준다(공헌도 상위 100명까지). 화면에서 다시 계산하지 않는
// 이유는, 같은 등수가 화면마다 다른 색으로 보이면 그 숫자를 믿지 않게 되기 때문이다.
//
// 여기는 **내용만** 그린다. 서랍으로 덮을지 본문을 밀지, 탭을 어떻게 보일지는
// SidePanel이 정한다. 그래야 랭킹과 같은 껍데기를 쓰고, 둘 중 하나를 고칠 때
// 다른 하나가 딸려 오지 않는다.
//
// active는 "지금 이 탭이 보이는가"다. 안 보일 때 5초마다 서버를 부르면, 랭킹을 보는
// 내내 쓰지도 않을 대화를 계속 받아 온다.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "./api.js";
import { useLang } from "../../i18n.js";

const POLL_MS = 5000;

// 등급 이름표의 영어. 서버가 주는 key로 찾는다 — 한국어 이름표가 바뀌어도 안 깨진다.
const TIER_EN = { top1: "#1", top10: "Top 10", top50: "Top 50", top100: "Top 100" };

/** 이름 앞에 붙는 등수 뱃지. 100위 밖은 아무것도 붙지 않는다. */
function RankBadge({ rank, color }) {
  if (!rank || !color) return null;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 20, height: 16, padding: "0 5px", marginRight: 5,
        borderRadius: 4, background: color, color: "#fff",
        fontSize: 10, fontWeight: 800, letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums", verticalAlign: "1px",
      }}
    >
      {rank}
    </span>
  );
}

export default function LobbyPanel({ active, loggedIn, onNeedLogin }) {
  const { lang, t } = useLang();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(0);

  const clock = useCallback(
    (ts) => new Date(Number(ts) || 0).toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" }),
    [lang],
  );

  const load = useCallback(async (append = false) => {
    if (!loggedIn) return;
    try {
      const after = append ? lastId.current : 0;
      const d = await apiJson(`/api/lobby${after ? `?after=${after}` : ""}`);
      setData((prev) => {
        if (!append || !prev) return d;
        // 새로 온 것만 이어 붙인다. 통째로 다시 받으면 스크롤이 매번 튄다.
        return { ...d, messages: [...prev.messages, ...d.messages].slice(-200) };
      });
      const last = d.messages.at(-1);
      if (last) lastId.current = last.id;
      setError("");
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    }
  }, [loggedIn]);

  useEffect(() => {
    if (!active || !loggedIn) return undefined;
    load(false);
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
  }, [active, loggedIn, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // 바닥 근처에 있을 때만 새 글을 따라 내려간다. 위를 읽는 중에 끌려가면 안 된다.
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await apiJson("/api/lobby", { method: "POST", body: { body } });
      setDraft("");
      stick.current = true;
      await load(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const me = data?.me;
  const canChat = !!me?.canChat;

  return (
    <>
      {/* 내 등수를 제일 먼저 보여 준다. 내 숫자가 안 보이면 남의 숫자도 안 궁금하다. */}
      {me && (
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid rgba(20,17,24,0.08)",
          fontSize: 11.5, color: "#8B8694", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2,
        }}>
          <RankBadge rank={me.rank} color={me.color} />
          <b style={{ color: me.color || "#54505E", fontWeight: 700 }}>{me.name}</b>
          <span>· {t("공헌도")} {me.points.toLocaleString()}</span>
        </div>
      )}

      {/* 등수 색 안내. 처음 보는 사람에게 저 색이 무슨 뜻인지 한 줄로 알려 준다. */}
      {data?.tiers && (
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid rgba(20,17,24,0.06)",
          display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "#8B8694",
        }}>
          {data.tiers.map((tier) => (
            <span key={tier.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: tier.color, display: "inline-block" }} />
              {/* 서버가 보내는 이름표는 한국어다("10위권"). 영어에서는 등급 이름으로 바꾼다 —
                  "10th place"로 직역하면 10등 한 사람만 그 색인 것처럼 읽힌다. */}
              {lang === "ko" ? tier.label : (TIER_EN[tier.key] || tier.label)}
            </span>
          ))}
        </div>
      )}

      {/* 대화 */}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9 }}
      >
        {!loggedIn ? (
          <Empty>
            {t("로그인하면 전체 채팅을 볼 수 있어요.")}
            <button onClick={onNeedLogin} style={linkBtn}>{t("로그인하기")}</button>
          </Empty>
        ) : !data ? (
          <Empty>{t("불러오는 중…")}</Empty>
        ) : data.messages.length === 0 ? (
          <Empty>{t("아직 대화가 없어요. 첫 마디를 남겨보세요.")}</Empty>
        ) : (
          data.messages.map((m) => (
            <div key={m.id} style={{ fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>
              <RankBadge rank={m.rank} color={m.color} />
              <b style={{ color: m.color || "#54505E", fontWeight: 700, letterSpacing: "-0.01em" }}>{m.name}</b>
              <span style={{ color: "#B5B0BE", fontSize: 10.5, marginLeft: 5 }}>{clock(m.at)}</span>
              {/* 링크는 일부러 걸지 않는다. 자동 링크는 채팅을 가장 빨리 광고판으로 만든다. */}
              <div style={{ color: "#241F33", marginTop: 1 }}>{m.body}</div>
            </div>
          ))
        )}
      </div>

      {/* 입력

      {/* 입력 — 문턱을 못 넘었으면 왜 못 쓰는지, 얼마나 남았는지 적는다 */}
      <div style={{ borderTop: "1px solid rgba(20,17,24,0.10)", padding: 10 }}>
        {!loggedIn ? null : canChat ? (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="lobby-say"
                value={draft}
                maxLength={data?.maxLength || 200}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
                placeholder={t("메시지를 입력하세요")}
                style={{
                  flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 10,
                  border: "1px solid rgba(20,17,24,0.16)", background: "#fff",
                  fontSize: 13, fontFamily: "inherit", color: "#141118", boxSizing: "border-box",
                }}
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                style={{
                  flex: "none", padding: "0 14px", borderRadius: 10, border: "none",
                  background: draft.trim() ? "#5B3FA0" : "rgba(118,118,128,0.14)",
                  color: draft.trim() ? "#fff" : "#8B8694",
                  fontSize: 13, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default",
                }}
              >
                {t("보내기")}
              </button>
            </div>
            {error && <p style={{ margin: "7px 0 0", fontSize: 11.5, color: "#B4452C" }}>{error}</p>}
          </>
        ) : (
          <div style={{
            padding: "10px 12px", borderRadius: 10, background: "rgba(91,63,160,0.06)",
            border: "1px solid rgba(91,63,160,0.14)", fontSize: 11.5, lineHeight: 1.7, color: "#54505E",
          }}>
            {me?.identityRequired
              ? t("휴대폰 본인확인을 마치면 채팅에 참여할 수 있어요.")
              : (
                <>
                  {t("검증 {n}회를 더 하면 채팅에 참여할 수 있어요.", { n: me?.needVerifications ?? 4 })}
                  {/* 남은 횟수만 적으면 얼마나 왔는지 모른다. 진행 막대가 그걸 보여 준다. */}
                  <Progress now={me?.earned ?? 0} goal={me?.minPoints ?? 40} label={t("공헌도")} />
                </>
              )}
          </div>
        )}
      </div>
    </>
  );
}

/** 문턱까지 얼마나 왔는지. 숫자만 적는 것보다 한 눈에 들어온다. */
function Progress({ now, goal, label }) {
  const pct = Math.max(0, Math.min(100, Math.round((now / Math.max(1, goal)) * 100)));
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ height: 4, borderRadius: 999, background: "rgba(91,63,160,0.14)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#5B3FA0", borderRadius: 999, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 10.5, color: "#8B8694", fontVariantNumeric: "tabular-nums" }}>
        {label} {now} / {goal}
      </div>
    </div>
  );
}

const linkBtn = {
  display: "block", margin: "8px auto 0", padding: "6px 14px", borderRadius: 999,
  border: "1px solid rgba(91,63,160,0.3)", background: "transparent",
  color: "#5B3FA0", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};

function Empty({ children }) {
  return (
    <div style={{ margin: "auto", textAlign: "center", fontSize: 12.5, color: "#8B8694", lineHeight: 1.8, padding: "0 10px" }}>
      {children}
    </div>
  );
}
