import { useEffect, useState } from "react";

/**
 * CSS 미디어 쿼리를 자바스크립트에서 읽는다.
 *
 * 화면 폭을 innerWidth로 재고 resize를 듣는 방식과 다르다. matchMedia는 조건이
 * 넘어가는 순간에만 알려 주므로, 창을 끄는 동안 수십 번 다시 그리는 일이 없다.
 *
 * 서버에서 그릴 때와 첫 칠에서는 fallback을 쓴다 — 없으면 창 크기를 모르는 채로
 * 한 번 그렸다가 곧바로 다시 그려서 화면이 덜컥거린다.
 */
export function useMediaQuery(query, fallback = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    // 사파리 14 미만은 addEventListener가 없다. 앱 웹뷰가 그 언저리라 둘 다 받는다.
    if (mq.addEventListener) mq.addEventListener("change", on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", on);
      else mq.removeListener(on);
    };
  }, [query]);

  return matches;
}

/** 사이드 패널이 본문을 밀어낼 만큼 넓은 화면인가. 좁으면 덮는 서랍이 된다. */
export const useWideScreen = () => useMediaQuery("(min-width: 1180px)", true);
