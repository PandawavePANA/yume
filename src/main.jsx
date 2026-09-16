import React from "react";
import ReactDOM from "react-dom/client";
import YumeDashboard from "./YumeDashboard.jsx";
import { initNativeApp, hideNativeSplash } from "./native.js";
import "./yume.css";

initNativeApp();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <YumeDashboard />
  </React.StrictMode>
);

requestAnimationFrame(() => requestAnimationFrame(hideNativeSplash));
