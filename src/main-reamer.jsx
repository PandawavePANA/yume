import React from "react";
import ReactDOM from "react-dom/client";
import ReamerSite from "./ReamerSite.jsx";
import "./reamer.css";
import "@/components/reamer/site.css";

// 두 화면뿐이라 라우터를 넣지 않는다. 주소 하나만 갈라 보면 된다.
//
// /t 는 의뢰인 대화 화면이다. 열쇠(토큰)는 주소의 해시에 들어 있고 서버로 전송되지
// 않으므로, 이 갈림은 브라우저 안에서만 일어난다. 정적 호스팅은 -s(SPA) 모드라
// /t 로 들어와도 이 파일이 실행된다.
const isThread = window.location.pathname.replace(/\/+$/, "") === "/t";

if (isThread) {
  // 소개 페이지와 같은 index.html을 쓰므로 머리말도 그대로 따라온다. 대화 화면은
  // 한 사람의 것이라 색인에서 빼고, 제목도 바꾼다.
  document.title = "내 의뢰 · 리머";
  const robots = document.querySelector('meta[name="robots"]') || document.head.appendChild(Object.assign(document.createElement("meta"), { name: "robots" }));
  robots.setAttribute("content", "noindex, nofollow");
}

// 대화 화면은 문의를 넣은 사람만 온다. 첫 화면 번들에 들어갈 이유가 없다.
const Thread = React.lazy(() => import("@/components/reamer/Thread.jsx"));

ReactDOM.createRoot(document.getElementById("root")).render(
  isThread ? (
    <React.Suspense fallback={null}>
      <Thread />
    </React.Suspense>
  ) : (
    <ReamerSite />
  ),
);
