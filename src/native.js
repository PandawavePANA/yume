// 앱(플레이스토어·앱스토어) 안에서 돌 때만 켜지는 네이티브 연결부.
// 앱은 이 웹사이트를 그대로 띄우므로(capacitor.config.json의 server.url), 웹에서는 전부 아무 일도 하지 않는다.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export const IS_NATIVE_APP = Capacitor.isNativePlatform();
export const NATIVE_PLATFORM = Capacitor.getPlatform(); // "ios" | "android" | "web"

// 뒤로가기(안드로이드 하드웨어 버튼)가 눌리면 가장 최근에 등록된 핸들러부터 기회를 준다.
// 핸들러가 true를 돌려주면(모달을 닫는 등) 처리된 것으로 본다.
const backHandlers = [];
export function onNativeBack(handler) {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.lastIndexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

function isSameSite(url) {
  return url.origin === window.location.origin;
}

// 앱 안에서 새 창 링크(약관, API 문서, 근거 자료, 쿠팡 등)는 앱을 벗어나지 않게 인앱 브라우저로 연다.
function interceptLinks() {
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.target.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.protocol === "mailto:" || url.protocol === "tel:") return; // 시스템이 메일·전화 앱으로 넘긴다
      if (!/^https?:$/.test(url.protocol)) return;
      const opensNewWindow = a.target === "_blank";
      if (!opensNewWindow && isSameSite(url)) return; // 같은 사이트 안의 일반 이동은 웹뷰에서 그대로
      e.preventDefault();
      Browser.open({ url: url.href, presentationStyle: "popover" }).catch(() => {});
    },
    true,
  );
  // 코드에서 여는 새 창(window.open)도 같은 방식으로.
  const originalOpen = window.open.bind(window);
  window.open = (target, name, features) => {
    try {
      const url = new URL(String(target), window.location.href);
      if (/^https?:$/.test(url.protocol)) {
        Browser.open({ url: url.href, presentationStyle: "popover" }).catch(() => {});
        return null;
      }
    } catch { /* 아래 기본 동작으로 */ }
    return originalOpen(target, name, features);
  };
}

export function initNativeApp() {
  if (!IS_NATIVE_APP) return;
  document.documentElement.classList.add("yume-native", `yume-${NATIVE_PLATFORM}`);
  StatusBar.setStyle({ style: Style.Light }).catch(() => {}); // 밝은 배경 위 어두운 글자
  interceptLinks();
  App.addListener("backButton", ({ canGoBack }) => {
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      if (backHandlers[i]()) return;
    }
    if (canGoBack) window.history.back();
    else App.minimizeApp().catch(() => {});
  });
}

// 첫 화면이 그려진 뒤 스플래시를 닫는다(설정의 자동 숨김은 네트워크가 느릴 때의 안전장치).
export function hideNativeSplash() {
  if (!IS_NATIVE_APP) return;
  SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}

// 검증 결과 공유 — 앱은 시스템 공유 시트, 웹은 Web Share API, 둘 다 안 되면 링크 복사.
// 돌려주는 값: "shared" | "copied" | "cancelled" | "failed"
export async function shareLink({ title, text, url }) {
  if (IS_NATIVE_APP) {
    try {
      await Share.share({ title, text, url, dialogTitle: "검증 결과 공유" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
