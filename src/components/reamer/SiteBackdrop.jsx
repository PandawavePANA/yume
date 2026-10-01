import { useEffect, useRef } from "react";
import { createBloomLayer } from "./layers/bloom";
import { createDiscLayer } from "./layers/disc";
import { createHudLayer } from "./layers/hud";
import { createTrailLayer } from "./layers/trail";
import "./SiteBackdrop.css";

// One fixed scene behind the entire document. Every section is transparent
// and scrolls over it, which is why there are no seams between them and no
// point where the background "changes" — there is only ever one background.
//
// All three layers share a single rAF loop and one motion state object, so
// they stay frame-locked to each other, and nothing here re-renders React
// during scroll.
export const SiteBackdrop = () => {
  const bloomRef = useRef(null);
  const discRef = useRef(null);
  const trailRef = useRef(null);
  const hudRef = useRef(null);

  useEffect(() => {
    const bloomCanvas = bloomRef.current;
    const discCanvas = discRef.current;
    const trailCanvas = trailRef.current;
    const hudCanvas = hudRef.current;
    if (!bloomCanvas || !discCanvas || !trailCanvas || !hudCanvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const m = {
      progress: 0,
      progressSmooth: 0,
      pointerX: 0.62,
      pointerY: 0.45,
      pointerXSmooth: 0.62,
      pointerYSmooth: 0.45,
      pointerPx: -9999,
      pointerPy: -9999,
      pointerInside: false,
      pointer: 0,
      time: 0,
      scrollY: 0,
    };

    const bloom = createBloomLayer(bloomCanvas);
    const disc = createDiscLayer(discCanvas, {
      count: coarse ? 1100 : 2400,
    });
    // Touch fires pointermove too (that's what a scroll drag is), so the
    // trail works there as well — it was previously skipped on coarse
    // pointers, which is why it never showed up on a phone.
    const trail = createTrailLayer(trailCanvas, { coarse, reduced });
    // 원반과 같은 면에 얹는 측정 눈금. 히어로에서만 보인다.
    const hud = createHudLayer(hudCanvas, { reduced });

    let vw = 0;
    let vh = 0;

    // 휴대폰은 픽셀 배율을 2로 묶는다. 아이폰은 3이라 캔버스 넷이 화면의 9배 픽셀을 잡는데,
    // 인앱 브라우저(인스타그램 등)는 메모리가 빠듯해서 넘치면 페이지를 통째로 새로고침해 버린다.
    // 입자는 점이라 2배와 3배를 눈으로 구분하기 어렵다.
    const maxDpr = coarse ? 2 : 3;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 주소창·툴바가 숨고 나타날 때마다 높이만 바뀐다(인앱 브라우저는 스크롤할 때마다).
      // 그때마다 캔버스를 새로 잡으면 그림이 지워졌다 다시 그려지며 끊기고, 원반 중심도 튄다.
      // 그래서 폭이 같으면 본 것 중 가장 큰 높이를 유지한다 — 툴바가 나타나 화면이 짧아져도
      // 캔버스가 조금 길 뿐 화면은 다 덮는다. 폭이 바뀌면(회전) 새로 잡는다.
      if (w === vw && h <= vh) return;
      vh = w === vw ? Math.max(vh, h) : h;
      vw = w;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      bloom.resize(vw, vh, dpr);
      disc.resize(vw, vh, dpr);
      hud.resize(vw, vh, dpr);
      trail?.resize(vw, vh, dpr);
    };
    resize();

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      m.scrollY = window.scrollY;
      m.progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    readScroll();
    m.progressSmooth = m.progress;

    const setPointer = (x, y) => {
      m.pointerPx = x;
      m.pointerPy = y;
      m.pointerX = x / Math.max(vw, 1);
      m.pointerY = y / Math.max(vh, 1);
      m.pointerInside = true;
    };
    const onPointerMove = (e) => setPointer(e.clientX, e.clientY);
    const onPointerLeave = () => {
      m.pointerInside = false;
    };
    // Touch doesn't reliably fire pointerleave when the finger lifts —
    // without this the last touch position would stay "hot" forever.
    const onPointerEnd = (e) => {
      if (e.pointerType === "touch") m.pointerInside = false;
    };

    // The moment a touch turns into a page scroll, the browser cancels the
    // *pointer* event stream (fires pointercancel) and drives scrolling
    // itself — pointermove goes silent for the rest of the gesture. That's
    // why the trail worked for an instant and then stopped. touchmove is
    // the lower-level event and keeps firing throughout native scrolling
    // as long as the listener is passive, so it's what actually tracks a
    // swipe/scroll drag start to finish.
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      m.pointerInside = false;
    };

    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    document.fonts?.ready.then(() => trail?.markDirty());

    let raf = 0;
    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      m.time += dt;

      // Critical-damped smoothing, frame-rate independent. This is where
      // the weight comes from: the scene chases the scrollbar rather than
      // being welded to it, so a flick of the wheel glides to a stop.
      const k = reduced ? 1 : 1 - Math.exp(-6.5 * dt);
      m.progressSmooth += (m.progress - m.progressSmooth) * k;

      const pk = 1 - Math.exp(-5 * dt);
      m.pointerXSmooth += (m.pointerX - m.pointerXSmooth) * pk;
      m.pointerYSmooth += (m.pointerY - m.pointerYSmooth) * pk;
      m.pointer += ((m.pointerInside ? 1 : 0) - m.pointer) * pk;

      bloom.draw(m, dt);
      hud.draw(m, dt, disc.draw(m, dt));
      trail?.draw(m, dt, now);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      bloom.dispose();
      disc.dispose();
      hud.dispose();
      trail?.dispose();
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden>
      <canvas className="backdrop__layer backdrop__layer--bloom" ref={bloomRef} />
      <canvas className="backdrop__layer backdrop__layer--disc" ref={discRef} />
      <canvas className="backdrop__layer backdrop__layer--hud" ref={hudRef} />
      <canvas className="backdrop__layer backdrop__layer--trail" ref={trailRef} />
    </div>
  );
};

export default SiteBackdrop;
