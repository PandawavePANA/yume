import React from "react";
import ReactDOM from "react-dom/client";
import BusinessPage from "./BusinessPage.jsx";
import { setApiBase } from "./components/yume/api.js";
import { API_ORIGIN } from "./businessConfig.js";
import "./yume.css";

// 이 사이트는 정적 호스팅이라 자체 백엔드가 없다. 무료 점검 API는 유메 서버로 보낸다.
setApiBase(API_ORIGIN);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BusinessPage />
  </React.StrictMode>
);
