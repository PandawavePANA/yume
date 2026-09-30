// 글자에 붙는 움직임 — 리머 사이트의 모든 글이 가만히 있지 않게.
//
//   Txt     글 한 덩어리. 화면에 들어오면 낱말이 흐릿하게 가라앉아 있다가 차례로 떠오르고,
//           다 뜬 뒤에는 빛 한 줄기가 주기적으로 훑고 지나간다. 커서가 닿는 낱말과 그 양옆이 들린다.
//           split="chars"면 낱말 대신 글자 단위로(카드 제목 같은 짧은 글).
//   Roll    버튼·링크 글자. 커서를 올리면 글자가 한 자씩 위로 빠지고 아래에서 같은 글자가 올라온다.
//   Odo     숫자. 화면에 들어오면 주행기록계처럼 굴러서 제자리에 선다.
//   useMagnetText  큰 제목의 글자가 커서를 피해 밀려났다가 돌아온다.
//
// 지키는 것 셋.
//   ① 글자 자리를 바꾸지 않는다. 움직이는 것은 transform · translate · opacity · filter뿐이고,
//     쪼갠 조각은 처음부터 제 자리를 차지한다. 지난번 터미널처럼 사이트가 밀리는 일이 없게.
//   ② 리액트가 글을 그린다. 그려진 글자 노드를 나중에 바꿔 끼우지 않는다 — 접었다 펴는 글(FAQ,
//     "더 보기")에서 리액트가 없어진 노드를 지우려다 예외를 내면 사이트 전체가 빈 화면이 된다.
//   ③ 스크립트가 안 돌면 전부 보인다. 감추는 규칙은 <html class="reveal-on">일 때만 붙고,
//     그 클래스는 스크립트가 켠다(ReamerSite의 useReveal). 첫 화면 글에는 감추기를 걸지 않는다(stay).
import { Children, cloneElement, createElement, isValidElement, useEffect, useRef } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const fine = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

// ── 화면에 들어왔는지 — 관찰자 하나를 모두가 나눠 쓴다 ─────────────────────────
let io = null;
function watch(el) {
  if (!el) return undefined;
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    el.classList.add("fx-in");
    return undefined;
  }
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("fx-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" },
    );
  }
  io.observe(el);
  return () => io?.unobserve(el);
}
function useWatch() {
  const ref = useRef(null);
  useEffect(() => watch(ref.current), []);
  return ref;
}

// ── 쪼개기 ─────────────────────────────────────────────────────────────────
// 낱말 사이의 공백은 그대로 글 노드로 남긴다. 줄바꿈은 원래처럼 공백에서 일어난다.
function splitWords(text, n) {
  return text.split(/(\s+)/).map((w, k) => {
    if (!w || /^\s+$/.test(w)) return w;
    const i = n.i++;
    return (
      <span className="fx-w" key={`w${i}-${k}`} style={{ "--wi": i }}>
        {w}
      </span>
    );
  });
}
// 글자 단위. 낱말은 한 덩어리로 묶는다 — 줄바꿈이 낱말 가운데서 일어나면 안 된다.
function splitChars(text, n) {
  return text.split(/(\s+)/).map((w, k) => {
    if (!w || /^\s+$/.test(w)) return w;
    return (
      <span className="fx-word" key={`c${n.i}-${k}`}>
        {Array.from(w).map((ch) => {
          const i = n.i++;
          return (
            <span className="fx-c" key={i} style={{ "--ci": i }}>
              {ch}
            </span>
          );
        })}
      </span>
    );
  });
}
// 글 사이에 <b>, <a>, <span> 같은 요소가 섞여 있으면 그 안의 글도 같은 순번으로 쪼갠다.
// 번호가 이어져야 낱말이 문장 순서대로 떠오른다.
function splitTree(children, mode, n) {
  return Children.map(children, (child) => {
    if (typeof child === "string") return mode === "chars" ? splitChars(child, n) : splitWords(child, n);
    if (typeof child === "number") return mode === "chars" ? splitChars(String(child), n) : splitWords(String(child), n);
    if (isValidElement(child) && child.props?.children != null && !child.props["data-fx-skip"]) {
      return cloneElement(child, undefined, splitTree(child.props.children, mode, n));
    }
    return child;
  });
}

/**
 * 글 한 덩어리.
 *   as     그릴 태그(p · li · h3 · dd · blockquote …)
 *   split  "words"(기본) | "chars"
 *   stay   감추지 않는다. 첫 화면 글 — 스크립트가 늦으면 빈 화면을 먼저 보게 되므로.
 */
export function Txt({ as = "p", className = "", split = "words", stay = false, style, children, ...rest }) {
  const ref = useWatch();
  const n = { i: 0 };
  const parts = splitTree(children, split, n);
  const cls = ["fx-t", `fx-t--${split}`, stay ? "fx-t--stay" : "", className].filter(Boolean).join(" ");
  return createElement(
    as,
    { ...rest, ref, className: cls, style: { ...(style || {}), "--wn": n.i } },
    parts,
    // 훑고 지나가는 빛. 글 위에 겹쳐 밝은 곳만 더 밝게 한다(mix-blend-mode). 가상 요소 대신
    // 조각을 따로 두는 건, 이미 ::before/::after를 쓰는 글에도 그대로 붙이기 위해서다.
    <span className="fx-glint" aria-hidden key="fx-glint" />,
  );
}

/** 버튼·링크 글자. 두 벌을 겹쳐 두고, 올리면 위 벌이 빠지고 아래 벌이 올라온다. */
export function Roll({ children }) {
  if (typeof children !== "string") return children;
  const text = children;
  const set = (k) =>
    Array.from(text).map((ch, i) => (
      <span className="rc" key={`${k}${i}`} style={{ "--i": i }}>
        {ch === " " ? " " : ch}
      </span>
    ));
  return (
    <span className="roll">
      <span className="fx-sr">{text}</span>
      <span className="roll__a" aria-hidden>{set("a")}</span>
      <span className="roll__b" aria-hidden>{set("b")}</span>
    </span>
  );
}

/** 숫자. 자릿수마다 0–9 띠를 두고, 화면에 들어오면 9에서 굴러 제 숫자에 선다. */
export function Odo({ children }) {
  const ref = useWatch();
  const text = String(children);
  return (
    <span className="odo" ref={ref}>
      <span className="fx-sr">{text}</span>
      {Array.from(text).map((ch, i) =>
        /\d/.test(ch) ? (
          <span className="odo__col" aria-hidden key={i} style={{ "--d": ch, "--i": i }}>
            <span className="odo__strip">
              {"0123456789".split("").map((d) => (
                <span className="odo__d" key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span aria-hidden key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}

/**
 * 큰 제목의 글자가 커서를 피한다.
 *
 * 글자마다 --mx/--my/--ms만 적고, 실제 이동은 CSS의 translate·scale이 한다. transform은
 * 나타나는 연출이 쓰고 있어서, 따로 도는 속성을 써야 둘이 서로를 덮지 않는다.
 * 화면에 보이는 제목만 계산한다 — 페이지의 모든 글자를 매 프레임 재면 느려진다.
 */
export function useMagnetText(hostSelector = ".display, .title") {
  useEffect(() => {
    if (reduced() || !fine() || !("IntersectionObserver" in window)) return undefined;
    const hosts = [...document.querySelectorAll(hostSelector)];
    if (!hosts.length) return undefined;
    const active = new Set();
    const vis = new IntersectionObserver(
      (es) => { for (const e of es) (e.isIntersecting ? active.add(e.target) : active.delete(e.target)); },
      { rootMargin: "80px" },
    );
    hosts.forEach((h) => vis.observe(h));

    const R = 120;
    let px = -1e5;
    let py = -1e5;
    let raf = 0;
    let touched = new Set();
    const frame = () => {
      raf = 0;
      const next = new Set();
      for (const host of active) {
        const hr = host.getBoundingClientRect();
        if (py < hr.top - R || py > hr.bottom + R || px < hr.left - R || px > hr.right + R) continue;
        for (const ch of host.querySelectorAll(".trail-ch")) {
          const r = ch.getBoundingClientRect();
          const dx = r.left + r.width / 2 - px;
          const dy = r.top + r.height / 2 - py;
          const d = Math.hypot(dx, dy) || 1;
          if (d >= R) continue;
          const f = (1 - d / R) ** 2;
          ch.style.setProperty("--mx", `${((dx / d) * f * 16).toFixed(2)}px`);
          ch.style.setProperty("--my", `${((dy / d) * f * 16).toFixed(2)}px`);
          ch.style.setProperty("--ms", (1 + f * 0.4).toFixed(3));
          ch.style.setProperty("--mg", f.toFixed(3));
          next.add(ch);
        }
      }
      for (const ch of touched) {
        if (next.has(ch)) continue;
        ch.style.removeProperty("--mx");
        ch.style.removeProperty("--my");
        ch.style.removeProperty("--ms");
        ch.style.removeProperty("--mg");
      }
      touched = next;
    };
    const move = (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const leave = () => { px = -1e5; py = -1e5; if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vis.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [hostSelector]);
}
