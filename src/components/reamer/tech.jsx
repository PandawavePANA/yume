// 리머 사이트의 "기술적인" 움직임 — 개발 스튜디오의 작업대에서 가져온 것들.
//
//   BuildTerminal     히어로 터미널. 아이디어 한 줄이 기획 → 설계 → 연동 → 배포로 빌드되고,
//                     실제 작업물(유메·프로바…)의 주소로 배포되며 끝난다. 다음 작업물로 넘어가며 반복
//   useScrambleLabels 섹션 이름표가 뒤섞인 기호에서 한 자씩 제자리를 찾는다(해독)
//   LivePing          작업물 사이트에 이 브라우저가 지금 접속해 잰 응답 시간과 작은 그래프.
//                     지어낸 숫자가 아니다 — 매번 실제로 요청을 보내 걸린 시간을 잰다
//   ParticleWord      맨 아래 REAMER가 입자 수천 개로 모인다. 커서가 지나가면 흩어졌다 되돌아온다
//
// 화면 밖에서는 멈추고(IntersectionObserver), "움직임 줄이기"에서는 완성된 정지 화면을 보여준다.
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function useInView(ref, margin = "0px") {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 히어로 터미널 ───────────────────────────────────────────────────────────
const stagesFor = (p) => ["요구사항 정리", "화면 설계", `${p.stack.slice(0, 2).join(" · ")} 구현`, "배포"];
const cmdFor = (p) => `reamer build "${p.blurb.split(".")[0]}"`;
// 터미널에 한 번에 보이는 줄 수. 명령 1 + 단계 4 + 배포 1. CSS의 .term__body 높이와 같은 값이다.
const TERM_ROWS = 6;

export function BuildTerminal({ projects }) {
  const ref = useRef(null);
  const visible = useInView(ref);
  // 화면 밖으로 나가면 **멈췄다가 그 자리에서 이어 간다.** 예전에는 나갈 때 실행을 끝내고
  // 들어올 때 새로 시작해서, 터미널이 비워지고 첫 글자부터 다시 쳐졌다. 휴대폰에서 터미널
  // 언저리를 오르내리면 그게 몇 초마다 반복돼 사이트가 새로고침되는 것처럼 보였다.
  const shown = useRef(false);
  shown.current = visible;
  const [lines, setLines] = useState([]);
  const [typing, setTyping] = useState("");

  useEffect(() => {
    // 중단 표시는 **이번 실행만의 것**이어야 한다.
    //
    // 예전에는 컴포넌트 전체가 ref 하나(alive)를 나눠 썼다. 화면 밖으로 나갔다 들어오면
    // 정리 함수가 alive=false로 끄고, 곧바로 새 실행이 alive=true로 다시 켠다. 그런데 옛
    // 실행은 sleep() 안에서 기다리는 중이었고, 깨어나서 보면 alive가 true다 — 자기가
    // 멈춰야 한다는 걸 모른 채 계속 돈다. 두 루프가 같은 줄 목록에 번갈아 쓰면서
    // "요구사항 정리 43%"와 "요구사항 정리 ✓ 100%"가 한 화면에 같이 떴다.
    //
    // 줄이 늘어나면 터미널이 커진다. 좁은 화면에서는 터미널이 글 흐름 안에 있어서, 커질
    // 때마다 아래 사이트 전체가 밀려 내려갔다가 루프가 처음으로 돌아가면 다시 올라왔다.
    let cancelled = false;
    const live = () => !cancelled;
    // 몇 줄이 오든 정해 둔 줄 수를 넘지 않는다. 높이는 CSS에서도 고정하지만, 넘치는 줄이
    // 아예 생기지 않게 여기서도 막는다.
    const put = (next) => setLines((l) => (typeof next === "function" ? next(l) : next).slice(-TERM_ROWS));
    const list = projects.filter((p) => p.go);
    if (reduced()) {
      const p = list[0];
      setTyping("");
      setLines([
        { k: "cmd", t: cmdFor(p) },
        ...stagesFor(p).map((s) => ({ k: "stage", t: s, pct: 100 })),
        { k: "done", t: `https://${p.go}`, name: p.name },
      ]);
      return undefined;
    }
    // 기다린 뒤, 화면 밖이면 다시 보일 때까지 그 자리에서 멈춘다.
    const sleep = async (ms) => {
      await wait(ms);
      while (live() && !shown.current) await wait(250);
    };
    let idx = 0;
    const run = async () => {
      while (live() && !shown.current) await wait(250);
      while (live()) {
        const p = list[idx % list.length];
        idx += 1;
        put([]);
        const cmd = cmdFor(p);
        for (let i = 1; i <= cmd.length && live(); i += 1) {
          setTyping(cmd.slice(0, i));
          await sleep(cmd[i - 1] === " " ? 40 : 26 + Math.random() * 34);
        }
        if (!live()) return;
        setTyping("");
        put([{ k: "cmd", t: cmd }]);
        await sleep(380);
        for (const s of stagesFor(p)) {
          if (!live()) return;
          put((l) => [...l, { k: "stage", t: s, pct: 0 }]);
          for (let pct = 0; pct <= 100 && live(); pct += 7 + Math.round(Math.random() * 12)) {
            put((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, pct: Math.min(100, pct) } : x)));
            await sleep(55);
          }
          if (!live()) return;
          put((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, pct: 100 } : x)));
          await sleep(140);
        }
        if (!live()) return;
        put((l) => [...l, { k: "done", t: `https://${p.go}`, name: p.name }]);
        await sleep(3200);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [projects]);

  return (
    <div className="term" ref={ref} aria-label="리머의 작업 과정을 보여주는 터미널 연출" role="img">
      <div className="term__bar">
        <span className="term__dot" /><span className="term__dot" /><span className="term__dot" />
        <span className="term__title">reamer — build</span>
      </div>
      <div className="term__body">
        {lines.map((l, i) =>
          l.k === "cmd" ? (
            <div className="term__line" key={i}><span className="term__ps">$</span> {l.t}</div>
          ) : l.k === "stage" ? (
            <div className="term__line term__stage" key={i}>
              <span className={l.pct >= 100 ? "term__ok" : "term__spin"}>{l.pct >= 100 ? "✓" : "◐"}</span>
              <span className="term__stage-name">{l.t}</span>
              <span className="term__bar-track"><span className="term__bar-fill" style={{ transform: `scaleX(${l.pct / 100})` }} /></span>
              <span className="term__pct">{String(l.pct).padStart(3, " ")}%</span>
            </div>
          ) : (
            <div className="term__line term__done" key={i}>
              <span className="term__live" /> {l.name} 운영 중 → <span className="term__url">{l.t}</span>
            </div>
          ),
        )}
        {typing && <div className="term__line"><span className="term__ps">$</span> {typing}<span className="term__caret" /></div>}
        {!typing && !lines.length && <div className="term__line"><span className="term__ps">$</span> <span className="term__caret" /></div>}
      </div>
    </div>
  );
}

// ── 이름표 해독 ─────────────────────────────────────────────────────────────
//
// 글자 폭이 바뀌면 안 된다. 예전에는 한글 자리에 "/"나 "0" 같은 반각 기호가 들어가기도
// 해서, 해독하는 동안 이름표의 폭이 매 프레임 달라졌다. 이름표가 한 줄에 다른 것과
// 나란히 있으면 그 줄 전체가 흔들리고, 줄바꿈 경계에 걸려 있으면 아래가 통째로 밀린다.
// 그래서 ① 글자마다 같은 폭의 기호만 쓰고(전각 자리에는 전각, 반각 자리에는 반각)
// ② 해독하는 동안은 이름표의 폭을 최종 폭으로 묶어 둔다. ②만으로 배치는 지켜지지만,
// ①이 없으면 좁은 기호 사이로 빈틈이 보여 글자가 덜컹거린다.
const WIDE_GLYPHS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ＃＝＋＊／＜＞";
const NARROW_GLYPHS = "/\\<>_-=+#01";
const isWide = (c) => /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]/.test(c);
const glyphFor = (c) => {
  const set = isWide(c) ? WIDE_GLYPHS : NARROW_GLYPHS;
  return set[(Math.random() * set.length) | 0];
};
export function useScrambleLabels(selector = ".label") {
  useEffect(() => {
    if (reduced() || !("IntersectionObserver" in window)) return undefined;
    const done = new WeakSet();
    const scramble = (el) => {
      if (done.has(el)) return;
      done.add(el);
      // React가 들고 있는 텍스트 노드를 갈아 끼우면 안 된다. 노드는 그대로 두고 값만 바꾼다.
      const node = el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.firstChild : null;
      if (!node) return;
      const final = node.nodeValue;
      const chars = Array.from(final);
      // 최종 글자일 때의 폭으로 묶는다. 해독이 끝나면 풀어서 원래대로 흐르게 한다.
      const prev = { width: el.style.width, whiteSpace: el.style.whiteSpace, display: el.style.display };
      const w = el.getBoundingClientRect().width;
      if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
      el.style.width = `${w}px`;
      el.style.whiteSpace = "nowrap";
      const release = () => { el.style.width = prev.width; el.style.whiteSpace = prev.whiteSpace; el.style.display = prev.display; };
      const start = performance.now();
      const dur = 380 + chars.length * 38;
      const tick = (now) => {
        const t = (now - start) / dur;
        const fixed = Math.floor(t * chars.length);
        node.nodeValue = chars.map((c, i) => (c === " " || c === "·" || i < fixed ? c : glyphFor(c))).join("");
        if (t < 1) requestAnimationFrame(tick);
        else { node.nodeValue = final; release(); }
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { scramble(e.target); io.unobserve(e.target); }
    }, { threshold: 0.9 });
    document.querySelectorAll(selector).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [selector]);
}

// ── 실시간 응답 시간 ────────────────────────────────────────────────────────
// 이 브라우저에서 그 사이트로 요청을 보내 걸린 시간을 잰다. 교차 출처라 응답 내용은 볼 수 없지만
// (no-cors) 걸린 시간은 잴 수 있다. 보이는 동안 12초마다 다시 재고, 최근 12번을 선으로 그린다.
export function LivePing({ url }) {
  const ref = useRef(null);
  const visible = useInView(ref, "100px");
  const [samples, setSamples] = useState([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible || !url) return undefined;
    let stop = false;
    const ping = async () => {
      const t0 = performance.now();
      try {
        await fetch(url, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout?.(6000) });
        if (stop) return;
        const ms = Math.round(performance.now() - t0);
        setFailed(false);
        setSamples((s) => [...s.slice(-11), ms]);
      } catch {
        if (!stop) setFailed(true);
      }
    };
    ping();
    const id = setInterval(ping, 12000);
    return () => { stop = true; clearInterval(id); };
  }, [visible, url]);
  const last = samples[samples.length - 1];
  const max = Math.max(...samples, 1);
  const pts = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 56},${14 - (v / max) * 12}`).join(" ");
  return (
    <span className="ping" ref={ref} title="이 브라우저에서 지금 이 사이트에 접속해 잰 응답 시간">
      <span className={`ping__dot${failed ? " ping__dot--off" : ""}`} />
      <span className="ping__ms">{failed ? "응답 없음" : last != null ? `${last}ms` : "재는 중"}</span>
      {samples.length > 1 && (
        <svg className="ping__spark" viewBox="0 0 56 16" width="56" height="16" aria-hidden>
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

// ── 입자 워드마크 ───────────────────────────────────────────────────────────
// 글자를 화면 밖 캔버스에 한 번 그리고, 그 픽셀 자리마다 입자를 둔다. 입자는 제자리로 당기는
// 용수철과 커서가 미는 힘을 받는다. 화면에 들어오면 흩어진 곳에서 모여들고, 밖에서는 멈춘다
// (보이는 동안만 매 프레임 돈다 — 화면을 벗어나면 useInView가 효과를 걷는다).
export function ParticleWord({ text = "REAMER" }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const visible = useInView(wrap, "120px");
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return undefined;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let parts = [];
    let W = 0;
    let H = 0;
    const pointer = { x: -9999, y: -9999 };
    const still = reduced();

    const build = () => {
      W = box.clientWidth;
      // 폭이 0이면 아무것도 그리지 않는다.
      //
      // 이 상자가 아직 자리를 못 잡은 순간(숨겨져 있거나, 배치 전이거나, 탭이 뒤에 있을 때)
      // 폭 0으로 getImageData를 부르면 IndexSizeError가 난다. 그게 효과 안에서 터지면
      // 리액트가 트리 전체를 내려서 **사이트 전체가 빈 화면**이 된다 — 꼬리의 장식 하나가
      // 본문까지 끌고 내려갔다. 폭이 생기면 아래 ResizeObserver가 다시 부른다.
      if (W < 2) { parts = []; return; }
      H = Math.round(Math.max(90, Math.min(300, W * (W < 600 ? 0.36 : 0.26))));
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const o = off.getContext("2d");
      o.fillStyle = "#fff";
      o.textAlign = "center";
      o.textBaseline = "middle";
      // 폭에 맞춰 글자 크기를 정한다 — 좁은 폰에서 양 끝이 잘리지 않게.
      let size = Math.round(H * 0.86);
      o.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
      const wide = o.measureText(text).width;
      if (wide > W * 0.96) {
        size = Math.floor((size * W * 0.96) / wide);
        o.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
      }
      o.fillText(text, W / 2, H / 2 + size * 0.05);
      const data = o.getImageData(0, 0, W, H).data;
      const step = W < 600 ? 3 : 4;
      parts = [];
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (data[(y * W + x) * 4 + 3] > 128) {
            parts.push({
              hx: x, hy: y,
              x: still ? x : Math.random() * W, y: still ? y : Math.random() * H * 2 - H / 2,
              vx: 0, vy: 0, c: colorAt(x / W),
            });
          }
        }
      }
    };
    function colorAt(t) {
      // 파랑(#3b82f6) → 가운데(#6d5ae0) → 보라(#8b5cf6)
      const a = t < 0.5 ? [59, 130, 246] : [109, 90, 224];
      const b = t < 0.5 ? [109, 90, 224] : [139, 92, 246];
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const size = W < 600 ? 1.5 : 2;
      for (const p of parts) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, size, size);
      }
    };

    build();
    // 글꼴이 늦게 도착하면 대체 글꼴로 뽑은 자리를 버리고 다시 뽑는다.
    let dead = false;
    document.fonts?.ready?.then(() => { if (dead) return; build(); if (still) draw(); else if (visible) kick(); });

    let raf = 0;
    const tick = () => {
      raf = 0;
      // 제자리도 가만있지 않는다 — 글자 전체에 느린 물결이 지나간다.
      const time = performance.now() / 1000;
      for (const p of parts) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 4200) {
          const f = (4200 - d2) / 4200;
          p.vx += (dx / Math.sqrt(d2 + 0.01)) * f * 3.2;
          p.vy += (dy / Math.sqrt(d2 + 0.01)) * f * 3.2;
        }
        p.vx += (p.hx - p.x) * 0.045;
        p.vy += (p.hy + Math.sin(time * 1.7 + p.hx * 0.03) * 1.6 - p.y) * 0.045;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && !still) raf = requestAnimationFrame(tick); };

    const move = (e) => {
      const r = cv.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      kick();
    };
    const leave = () => { pointer.x = -9999; pointer.y = -9999; kick(); };
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerleave", leave);
    let rw = W;
    const onResize = () => {
      if (box.clientWidth === rw) return;
      rw = box.clientWidth;
      build();
      if (still) draw();
      else if (visible) kick();
    };
    // 창 크기가 아니라 **이 상자의** 크기를 본다. 폭 0에서 시작한 경우(위 build 주석)
    // 창은 그대로인 채 상자만 자리를 잡으므로, 창 resize로는 다시 그릴 기회가 오지 않는다.
    const ro = "ResizeObserver" in window ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(box);
    else window.addEventListener("resize", onResize);
    if (still) draw();
    else if (visible) kick();
    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerleave", leave);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", onResize);
    };
  }, [text, visible]);
  return (
    <div className="pword" ref={wrap} aria-hidden>
      <canvas ref={canvas} />
    </div>
  );
}

// ── 커서가 비추는 청사진 격자 ─────────────────────────────────────────────────
// 화면 전체에 옅은 점 격자가 깔려 있지만 평소에는 보이지 않는다. 커서 둘레만 원형으로
// 드러나서, 커서를 움직이면 도면 위를 손전등으로 비추는 것처럼 보인다.
// 변수는 이 요소 하나에만 쓴다 — <html>에 쓰면 문서 전체가 스타일을 다시 계산한다.
export function CursorGrid() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches) return undefined;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--cx", `${x}px`);
      el.style.setProperty("--cy", `${y}px`);
      el.classList.add("is-on");
    };
    const move = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(apply); };
    const leave = () => el.classList.remove("is-on");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return <div className="cursor-grid" ref={ref} aria-hidden />;
}

// ── 스크롤 자 ─────────────────────────────────────────────────────────────────
// 오른쪽 레일 바깥에 붙은 눈금자. 스크롤하면 눈금이 흘러가고, 지금 위치(%)와 구역 이름이
// 기계식 계기판처럼 읽힌다. 넓은 화면에서만 보인다(좁은 화면에는 둘 여백이 없다).
export function ScrollRuler({ sections }) {
  const ref = useRef(null);
  const pctRef = useRef(null);
  const [section, setSection] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      el.style.setProperty("--y", `${(-window.scrollY * 0.35).toFixed(1)}px`);
      el.style.setProperty("--p", p.toFixed(4));
      if (pctRef.current) pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, "0");
      // 윗변이 화면 가운데를 지난 마지막 구역이 지금 구역이다.
      let now = "";
      for (const [id, label] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.5) now = label;
      }
      setSection(now);
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
  }, [sections]);
  return (
    <div className="ruler" ref={ref} aria-hidden>
      <span className="ruler__ticks" />
      <span className="ruler__mark" />
      <span className="ruler__read">
        <span ref={pctRef}>000</span>%<span className="ruler__sec" key={section}>{section || "시작"}</span>
      </span>
    </div>
  );
}

// ── 상단 메뉴를 미끄러져 다니는 표시 ──────────────────────────────────────────
// 항목마다 밑줄을 켰다 껐다 하는 대신, 막대 하나가 지금 구역으로 실제로 건너간다.
// 건너가는 동안 진행 방향으로 늘어났다가(--stretch) 도착하면 제자리 폭으로 돌아온다.
// 스크롤마다 재지 않는다 — 구역이 바뀔 때 한 번만 잰다.
export function useNavRail(active) {
  const ref = useRef(null);
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return undefined;
    const list = rail.parentElement;
    const link = active ? list?.querySelector(`a[href="#${active}"]`) : null;
    if (!list || !link) {
      rail.classList.remove("is-on");
      return undefined;
    }
    const from = parseFloat(rail.style.getPropertyValue("--rx")) || 0;
    const to = link.offsetLeft;
    rail.style.setProperty("--rx", `${to}px`);
    rail.style.setProperty("--rw", `${link.offsetWidth}px`);
    // 멀리 건너뛸수록 많이 늘어난다. 1.0(제자리) ~ 1.9.
    const far = Math.min(1, Math.abs(to - from) / 260);
    rail.style.setProperty("--stretch", (1 + far * 0.9).toFixed(2));
    rail.classList.add("is-on");
    const done = setTimeout(() => rail.style.setProperty("--stretch", "1"), 180);
    return () => clearTimeout(done);
  }, [active]);
  return ref;
}
