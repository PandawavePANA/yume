// 전체 채팅 — 오른쪽 사이드바.
//
// 여기 있는 것 중 진짜 기능은 이름 옆의 등수다. 대화 자체보다 그 숫자가 이 화면의
// 이유다. 혼자 보는 순위는 잘 안 움직이지만, 남들이 보는 자리에 붙어 있으면 움직인다.
//
// 색은 서버가 정해서 내려준다(공헌도 상위 100명까지). 화면에서 다시 계산하지 않는
// 이유는, 같은 등수가 화면마다 다른 색으로 보이면 그 숫자를 믿지 않게 되기 때문이다.
//
// ── 넓은 화면과 좁은 화면이 다르게 동작한다 ──
// 예전에는 어느 폭에서든 position:fixed로 본문 위에 얹었다. 1440px 화면에서 오른쪽
// 320px이 그대로 가려져서, 세 칸짜리 카드의 마지막 칸과 문단 오른쪽이 잘렸다.
// 지금은 넓으면 본문을 **밀고**(부모가 paddingRight를 준다), 좁으면 덮는 서랍이 된다.
// 덮을 때는 뒤를 어둡게 하고 Esc와 바깥 클릭으로 닫힌다 — 덮은 것은 닫을 수 있어야 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiJson } from "./api.js";
import { useLang } from "../../i18n.js";
import { useWideScreen } from "../../useMedia.js";

const POLL_MS = 5000;
export const LOBBY_WIDTH = 320;

const EASE = [0.22, 1, 0.36, 1];

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

export default function LobbyChat({ open, onClose, loggedIn, onNeedLogin }) {
  const { lang, t } = useLang();
  const wide = useWideScreen();
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
    if (!open || !loggedIn) return undefined;
    load(false);
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
  }, [open, loggedIn, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  // 덮고 있을 때만 Esc로 닫는다. 밀어내는 중에는 본문이 멀쩡히 보이므로,
  // Esc가 채팅을 닫아 버리면 다른 것을 닫으려던 사람이 놀란다.
  useEffect(() => {
    if (!open || wide) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose]);

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
    <AnimatePresence>
      {open && (
        <>
          {/* 좁은 화면에서만 뒤를 덮는다. 덮은 것은 바깥을 눌러 닫을 수 있어야 한다. */}
          {!wide && (
            <motion.div
              key="lobby-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              style={{ position: "fixed", inset: 0, zIndex: 47, background: "rgba(18,14,26,0.34)", backdropFilter: "blur(2px)" }}
            />
          )}

          <motion.aside
            key="lobby"
            aria-label={t("전체 채팅")}
            role={wide ? "complementary" : "dialog"}
            aria-modal={wide ? undefined : "true"}
            initial={{ x: LOBBY_WIDTH }} animate={{ x: 0 }} exit={{ x: LOBBY_WIDTH }}
            transition={{ duration: 0.32, ease: EASE }}
            style={{
              position: "fixed", top: 0, right: 0, height: "100dvh", width: LOBBY_WIDTH,
              maxWidth: "calc(100vw - 32px)", zIndex: 48,
              display: "flex", flexDirection: "column",
              background: "rgba(250,248,254,0.94)",
              backdropFilter: "saturate(140%) blur(18px)", WebkitBackdropFilter: "saturate(140%) blur(18px)",
              borderLeft: "1px solid rgba(20,17,24,0.10)",
              boxShadow: wide ? "none" : "-12px 0 48px rgba(60,35,120,0.18)",
              paddingTop: "var(--yume-safe-top)", paddingBottom: "var(--yume-safe-bottom)",
            }}
          >
            {/* 머리 — 내 등수를 제일 먼저 보여 준다. 내 숫자가 안 보이면 남의 숫자도 안 궁금하다. */}
            <div style={{
              padding: "14px 14px 12px 16px", borderBottom: "1px solid rgba(20,17,24,0.10)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 750, color: "#141118", letterSpacing: "-0.02em" }}>{t("전체 채팅")}</div>
                {me && (
                  <div style={{ marginTop: 3, fontSize: 11.5, color: "#8B8694", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                    <RankBadge rank={me.rank} color={me.color} />
                    <b style={{ color: me.color || "#54505E", fontWeight: 700 }}>{me.name}</b>
                    <span>· {t("공헌도")} {me.points.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label={t("채팅 닫기")}
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
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
