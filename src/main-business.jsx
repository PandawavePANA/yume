import React from "react";
import ReactDOM from "react-dom/client";
import BusinessPage from "./BusinessPage.jsx";
import { setApiBase } from "./components/yume/api.js";
import { API_ORIGIN } from "./businessConfig.js";
import "./yume.css";

// 별도 도메인(정적 호스팅)에서는 무료 점검 API를 베리라인 서버로 보낸다. 베리라인 본체의 /business로
// 열렸으면 같은 출처이므로 상대 경로를 쓴다(쿠키·유입 측정이 그대로 붙는다).
const sameOrigin = (() => {
  try {
    return window.location.origin === new URL(API_ORIGIN).origin;
  } catch {
    return false;
  }
})();
setApiBase(sameOrigin ? "" : API_ORIGIN);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BusinessPage />
  </React.StrictMode>
);
