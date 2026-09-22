// 전체 채팅 — 오른쪽 사이드바.
//
// 여기 있는 것 중 진짜 기능은 이름 옆의 등수다. 대화 자체보다 그 숫자가 이 화면의
// 이유다. 혼자 보는 순위는 잘 안 움직이지만, 남들이 보는 자리에 붙어 있으면 움직인다.
//
// 색은 서버가 정해서 내려준다(공헌도 상위 100명까지). 화면에서 다시 계산하지 않는
// 이유는, 같은 등수가 화면마다 다른 색으로 보이면 그 숫자를 믿지 않게 되기 때문이다.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "./api.js";

const POLL_MS = 5000;

const clock = (t) =>
  new Date(Number(t) || 0).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

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

export default function LobbyChat({ open, onClose, loggedIn, onNeedLogin }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(0);

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
    if (!open || !loggedIn) return undefined;
    load(false);
    const id = setInterval(() => {
      if (!document.hidden) load(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, loggedIn, load]);

  // 새 말이 오면 따라 내려간다. 위쪽을 읽고 있는 중이면 끌어내리지 않는다.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
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

  if (!open) return null;

  const me = data?.me;
  const canChat = !!me?.canChat;

  return (
    <aside
      aria-label="전체 채팅"
      style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: 320,
        maxWidth: "calc(100vw - 24px)", zIndex: 48,
        display: "flex", flexDirection: "column",
        background: "rgba(250,248,254,0.92)",
        backdropFilter: "saturate(140%) blur(18px)", WebkitBackdropFilter: "saturate(140%) blur(18px)",
        borderLeft: "1px solid rgba(20,17,24,0.10)",
        boxShadow: "-12px 0 48px rgba(60,35,120,0.10)",
        paddingTop: "var(--yume-safe-top)", paddingBottom: "var(--yume-safe-bottom)",
      }}
    >
      {/* 머리 — 내 등수를 제일 먼저 보여 준다. 내 숫자가 안 보이면 남의 숫자도 안 궁금하다. */}
      <div style={{
        padding: "14px 14px 12px 16px", borderBottom: "1px solid rgba(20,17,24,0.10)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 750, color: "#141118", letterSpacing: "-0.02em" }}>전체 채팅</div>
          {me && (
            <div style={{ marginTop: 3, fontSize: 11.5, color: "#8B8694", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <RankBadge rank={me.rank} color={me.color} />
              <b style={{ color: me.color || "#54505E", fontWeight: 700 }}>{me.name}</b>
              <span>· 공헌도 {me.points.toLocaleString()}</span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="채팅 닫기"
          style={{
            width: 28, height: 28, flex: "none", borderRadius: 999, border: "none",
            background: "rgba(118,118,128,0.10)", color: "#54505E", fontSize: 14, cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* 등수 색 안내. 처음 보는 사람에게 저 색이 무슨 뜻인지 한 줄로 알려 준다. */}
      {data?.tiers && (
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid rgba(20,17,24,0.06)",
          display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "#8B8694",
        }}>
          {data.tiers.map((t) => (
            <span key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: t.color, display: "inline-block" }} />
              {t.label}
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
            로그인하면 전체 채팅을 볼 수 있어요.
            <button onClick={onNeedLogin} style={linkBtn}>로그인하기</button>
          </Empty>
        ) : !data ? (
          <Empty>불러오는 중…</Empty>
        ) : data.messages.length === 0 ? (
          <Empty>아직 오간 말이 없어요. 첫 마디를 남겨보세요.</Empty>
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
                placeholder="메시지를 입력하세요"
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
                보내기
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
              ? "휴대폰 본인확인을 마치면 채팅에 참여할 수 있어요."
              : <>검증을 <b style={{ color: "#5B3FA0" }}>{me?.needVerifications ?? 4}번</b> 더 하시면 채팅에 참여할 수 있어요.
                  <span style={{ display: "block", marginTop: 2, color: "#8B8694" }}>
                    공헌도 {me?.earned ?? 0} / {me?.minPoints ?? 40}
                  </span></>}
          </div>
        )}
      </div>
    </aside>
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
