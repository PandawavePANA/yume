import React from "react";
import ReactDOM from "react-dom/client";
import YumeDashboard from "./YumeDashboard.jsx";
import HomeGate from "./HomeGate.jsx";
import BusinessPage from "./BusinessPage.jsx";
import { initNativeApp, hideNativeSplash, IS_NATIVE_APP } from "./native.js";
import { useRoute, ROUTES } from "./routes.js";
import "./yume.css";

initNativeApp();

// 앱으로 들어온 사람은 제품을 쓰러 온 개인이다. 기업 도입 상담을 하러 앱을 깔지는
// 않으므로, 네이티브에서는 갈림길을 건너뛰고 바로 검증 화면을 띄운다.
function Root() {
  const route = useRoute();
  if (IS_NATIVE_APP) return <YumeDashboard />;
  if (route === ROUTES.business) return <BusinessPage />;
  if (route === ROUTES.app) return <YumeDashboard />;
  return <HomeGate />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

requestAnimationFrame(() => requestAnimationFrame(hideNativeSplash));
