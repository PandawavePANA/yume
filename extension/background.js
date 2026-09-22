// 탭을 열고 우클릭 메뉴를 다는 일만 한다.
//
// 콘텐츠 스크립트에는 tabs 권한이 없어서 새 탭을 못 연다. 권한을 그쪽에 더 주는 대신
// 여는 일만 여기로 넘긴다 — 남의 사이트에서 도는 코드에는 권한을 적게 줄수록 좋다.
const YUME = "https://www.yume-reamer.com/";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "openYume") {
    chrome.tabs.create({ url: YUME, index: (sender.tab?.index ?? 0) + 1 });
    sendResponse({ ok: true });
  }
  return false;
});

// 도구막대 아이콘 — 선택한 글을 확인한다.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "checkSelection" }).catch(() => {});
});

// 우클릭 메뉴. 아는 사이트가 아니어도 뜬다 — AI 답변은 어디에나 붙여져 있을 수 있다.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "yume-check",
    title: "유메로 사실 확인",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "yume-check" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "checkSelection" }).catch(async () => {
    // 콘텐츠 스크립트가 없는 사이트면 그 자리에서 넣어 준다.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    chrome.tabs.sendMessage(tab.id, { type: "checkSelection" }).catch(() => {});
  });
});
