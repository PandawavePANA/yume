import { useEffect, useRef } from "react";
import { createBloomLayer } from "./layers/bloom";
import { createDiscLayer } from "./layers/disc";
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

  useEffect(() => {
    const bloomCanvas = bloomRef.current;
    const discCanvas = discRef.current;
    const trailCanvas = trailRef.current;
    if (!bloomCanvas || !discCanvas || !trailCanvas) return;

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
    };

    const bloom = createBloomLayer(bloomCanvas);
    const disc = createDiscLayer(discCanvas, {
      count: coarse ? 1100 : 2400,
    });
    // Touch fires pointermove too (that's what a scroll drag is), so the
    // trail works there as well — it was previously skipped on coarse
    // pointers, which is why it never showed up on a phone.
    const trail = createTrailLayer(trailCanvas, { coarse });

    let vw = 0;
    let vh = 0;

    const resize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      bloom.resize(vw, vh, dpr);
      disc.resize(vw, vh, dpr);
      trail?.resize(vw, vh, dpr);
    };
    resize();

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
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
      disc.draw(m, dt);
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
      trail?.dispose();
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden>
      <canvas className="backdrop__layer" ref={bloomRef} />
      <canvas className="backdrop__layer" ref={discRef} />
      <canvas className="backdrop__layer backdrop__layer--trail" ref={trailRef} />
    </div>
  );
};

export default SiteBackdrop;
