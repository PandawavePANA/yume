// 오른쪽 사이드바 — 채팅과 랭킹이 탭으로 같이 산다.
//
// 예전에는 채팅은 사이드바, 랭킹은 화면 한가운데 모달이었다. 둘이 같은 것을 말하는데
// (누가 얼마나 보탰나) 여는 방식이 달라서, 랭킹을 보려면 화면 전체가 덮이고 하던 일이
// 멈췄다. 한 자리에 두면 검증을 돌려 놓고 순위를 보다가 채팅으로 넘어갈 수 있다.
//
// ── 넓은 화면과 좁은 화면이 다르게 동작한다 ──
// 넓으면 본문을 **밀고**(부모가 paddingRight를 준다), 좁으면 덮는 서랍이 된다.
// 덮을 때는 뒤를 어둡게 하고 Esc와 바깥 클릭으로 닫힌다 — 덮은 것은 닫을 수 있어야 한다.
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { t } from "../../i18n.js";
import { useWideScreen } from "../../useMedia.js";
import LobbyPanel from "./LobbyChat.jsx";
import RankingPanel from "./RankingPanel.jsx";

export const PANEL_WIDTH = 320;
const EASE = [0.22, 1, 0.36, 1];

const TABS = [
  { key: "chat", label: "채팅" },
  { key: "rank", label: "랭킹" },
];

export default function SidePanel({ tab, onTab, onClose, loggedIn, onNeedLogin }) {
  const wide = useWideScreen();
  const open = !!tab;

  // 덮고 있을 때만 Esc로 닫는다. 밀어내는 중에는 본문이 멀쩡히 보이므로,
  // Esc가 이걸 닫아 버리면 다른 것을 닫으려던 사람이 놀란다.
  useEffect(() => {
    if (!open || wide) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {!wide && (
            <motion.div
              key="panel-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              style={{ position: "fixed", inset: 0, zIndex: 47, background: "rgba(18,14,26,0.34)", backdropFilter: "blur(2px)" }}
            />
          )}

          <motion.aside
            key="panel"
            role={wide ? "complementary" : "dialog"}
            aria-modal={wide ? undefined : "true"}
            aria-label={t(TABS.find((x) => x.key === tab)?.label || "채팅")}
            initial={{ x: PANEL_WIDTH }} animate={{ x: 0 }} exit={{ x: PANEL_WIDTH }}
            transition={{ duration: 0.32, ease: EASE }}
            style={{
              position: "fixed", top: 0, right: 0, height: "100dvh", width: PANEL_WIDTH,
              maxWidth: "calc(100vw - 32px)", zIndex: 48,
              display: "flex", flexDirection: "column",
              background: "rgba(250,248,254,0.94)",
              backdropFilter: "saturate(140%) blur(18px)", WebkitBackdropFilter: "saturate(140%) blur(18px)",
              borderLeft: "1px solid rgba(20,17,24,0.10)",
              boxShadow: wide ? "none" : "-12px 0 48px rgba(60,35,120,0.18)",
              paddingTop: "var(--yume-safe-top)", paddingBottom: "var(--yume-safe-bottom)",
            }}
          >
            {/* 탭. 어느 쪽을 보고 있든 다른 쪽이 한 번에 보여야 한 자리에 둔 값을 한다. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 10px 10px 12px",
              borderBottom: "1px solid rgba(20,17,24,0.10)",
            }}>
              <div style={{ flex: 1, display: "flex", gap: 3, padding: 3, borderRadius: 11, background: "rgba(118,118,128,0.10)" }}>
                {TABS.map((x) => {
                  const on = x.key === tab;
                  return (
                    <button
                      key={x.key}
                      onClick={() => onTab(x.key)}
                      aria-pressed={on}
                      style={{
                        flex: 1, padding: "7px 0", border: "none", borderRadius: 9, cursor: "pointer",
                        background: on ? "#fff" : "transparent",
                        boxShadow: on ? "0 2px 6px rgba(20,17,24,0.08)" : "none",
                        color: on ? "#141118" : "#6F6A7C",
                        fontSize: 13, fontWeight: on ? 750 : 600, fontFamily: "inherit",
                        letterSpacing: "-0.01em", transition: "background 0.18s ease, color 0.18s ease",
                      }}
                    >
                      {t(x.label)}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={onClose}
                aria-label={t("닫기")}
                style={{
                  width: 28, height: 28, flex: "none", borderRadius: 999, border: "none",
                  background: "rgba(118,118,128,0.10)", color: "#54505E", fontSize: 14, cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* 내용. 탭을 옮겨도 각자의 상태(스크롤·입력 중이던 글)가 날아가지 않도록
                둘 다 붙여 두고 보이는 쪽만 바꾼다. */}
            <div style={{ flex: 1, minHeight: 0, display: tab === "chat" ? "flex" : "none", flexDirection: "column" }}>
              <LobbyPanel active={tab === "chat"} loggedIn={loggedIn} onNeedLogin={onNeedLogin} />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: tab === "rank" ? "block" : "none", overflowY: "auto" }}>
              <RankingPanel active={tab === "rank"} loggedIn={loggedIn} onNeedLogin={onNeedLogin} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
