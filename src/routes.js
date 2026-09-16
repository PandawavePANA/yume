// 아주 작은 경로 라우터.
//
// 유메는 지금까지 한 화면뿐이라 라우터가 없었다. 개인용·기업용을 가르면서 세 화면이
// 됐지만, 그것 때문에 react-router를 들이면 번들만 커지고 얻는 게 없다. 필요한 건
// "지금 경로가 뭔지"와 "새로고침 없이 옮기기" 둘뿐이라 그 둘만 만든다.
//
// 서버는 /api·/v1이 아닌 모든 경로에 index.html을 돌려주므로(app.js의 catch-all),
// 주소창에 /business를 직접 쳐서 들어와도 여기서 받는다.
import { useEffect, useState } from "react";

export const ROUTES = { home: "/", app: "/app", business: "/business" };

function normalize(pathname) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  return p === ROUTES.app || p === ROUTES.business ? p : ROUTES.home;
}

export function currentRoute() {
  return normalize(window.location.pathname);
}

export function navigate(to) {
  if (normalize(to) === currentRoute() && window.location.pathname === to) return;
  window.history.pushState({}, "", to);
  // pushState는 popstate를 쏘지 않는다. 구독자들이 알아차리도록 직접 알린다.
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [route, setRoute] = useState(() => currentRoute());
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return route;
}
