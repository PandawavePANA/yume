// 리머 사이트의 움직임을 이끄는 값들 — 전부 CSS 변수로 내려보내고, 실제 움직임은 CSS가 한다.
//
// 라이브러리를 쓰지 않는다. 이 사이트는 한 장짜리이고 첫 화면이 가벼워야 하는데, 필요한 건
// "지금 얼마나 지나갔나"와 "커서가 어디 있나" 두 값뿐이다. 그 둘을 스크롤·포인터 한 번에 한
// 번씩만 재서 변수로 넘기면, 나머지(기울기·빛·선 긋기·불 켜기)는 CSS가 GPU로 처리한다.
//
//   data-scrub   구역이 화면을 지나가는 정도 --s (0 → 1). 선언 문장·진행 선·연혁 점이 이걸 쓴다
//   data-spot    커서 위치 --mx/--my (px). 카드 테두리의 빛이 이걸 따라간다
//   data-tilt    커서 기울기 --rx/--ry (deg). 작업물 화면이 이걸로 기운다
//   data-magnet  커서 쪽으로 끌리는 거리 --tx/--ty (px). 버튼
//   <html> --vel 스크롤 속도(-1~1). 흐르는 띠가 이만큼 빨라지고 기운다
import { useEffect, useState } from "react";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const fine = () => window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

export function useScrub() {
  useEffect(() => {
    if (reduced()) {
      document.querySelectorAll("[data-scrub]").forEach((el) => el.style.setProperty("--s", "1"));
      return undefined;
    }
    const root = document.documentElement;
    let raf = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let vel = 0;
    const els = () => document.querySelectorAll("[data-scrub]");

    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of els()) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        // 윗변이 화면 아래 85%에 닿을 때 0, 아랫변이 화면 위 35%를 지날 때 1.
        const start = vh * 0.85;
        const end = vh * 0.35 - r.height;
        const s = (start - r.top) / (start - end);
        el.style.setProperty("--s", Math.max(0, Math.min(1, s)).toFixed(4));
      }
      // 스크롤 속도 — 흐르는 띠가 쓴다. 천천히 가라앉게 이전 값과 섞는다.
      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(16, now - lastT);
      lastY = window.scrollY;
      lastT = now;
      vel = vel * 0.8 + Math.max(-1, Math.min(1, dy / dt / 3)) * 0.2;
      root.style.setProperty("--vel", vel.toFixed(3));
      if (Math.abs(vel) > 0.002) raf = requestAnimationFrame(apply);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
}

export function usePointerFx() {
  useEffect(() => {
    if (reduced() || !fine()) return undefined;
    let raf = 0;
    let ev = null;
    let lastMag = null;
    let lastTilt = null;
    const apply = () => {
      raf = 0;
      const e = ev;
      if (!e) return;
      const t = e.target instanceof Element ? e.target : null;
      const spot = t?.closest("[data-spot]");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const tilt = t?.closest("[data-tilt]");
      if (lastTilt && lastTilt !== tilt) { lastTilt.style.setProperty("--rx", "0deg"); lastTilt.style.setProperty("--ry", "0deg"); }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", `${(px * 8).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${(-py * 6).toFixed(2)}deg`);
        tilt.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
        tilt.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
      }
      lastTilt = tilt;
      const mag = t?.closest("[data-magnet]");
      if (lastMag && lastMag !== mag) { lastMag.style.setProperty("--tx", "0px"); lastMag.style.setProperty("--ty", "0px"); }
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.setProperty("--tx", `${((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1)}px`);
        mag.style.setProperty("--ty", `${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px`);
      }
      lastMag = mag;
    };
    const move = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);
}

/** 지금 화면 한가운데에 걸린 구역의 id. 상단 메뉴가 그 항목에 불을 켠다. */
export function useScrollSpy(ids) {
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return undefined;
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const hit = ids.find((id) => seen.get(id));
        setActive(hit || "");
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/** 폰에서 아래에 따라다니는 문의 버튼 — 히어로를 지나면 나오고, 문의 구역이 보이면 숨는다. */
export function useFloatingCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const contact = document.getElementById("contact");
      const past = window.scrollY > window.innerHeight * 0.7;
      const nearContact = contact ? contact.getBoundingClientRect().top < window.innerHeight * 0.9 : false;
      setShow(past && !nearContact);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, []);
  return show;
}
