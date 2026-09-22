// 유메 쪽에서 도는 조각. 확장 저장소에 담아 온 글을 입력칸에 넣는다.
//
// 주소창에 실어 보내지 않는 이유 — 1만 자까지 받는데 URL로는 다 못 싣고,
// 실었다면 그 글이 접속 로그와 브라우저 기록에 그대로 남는다. 저장소는 이 브라우저
// 안에만 있고, 한 번 꺼내면 지운다.
(async () => {
  const { yumeDraft } = await chrome.storage.local.get("yumeDraft");
  if (!yumeDraft?.text) return;
  // 오래된 것은 쓰지 않는다. 어제 눌러 둔 글이 오늘 뜬금없이 채워지면 안 된다.
  if (Date.now() - (yumeDraft.at || 0) > 5 * 60 * 1000) {
    await chrome.storage.local.remove("yumeDraft");
    return;
  }
  await chrome.storage.local.remove("yumeDraft");

  // React가 그린 입력칸이라 value만 바꾸면 화면이 안 따라온다. 네이티브 setter로 넣고
  // input 이벤트를 직접 띄워야 상태가 함께 움직인다.
  const fill = (el, text) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  };

  // 화면이 그려지기 전에 들어올 수 있어 잠깐 기다린다.
  for (let i = 0; i < 40; i += 1) {
    const box = document.querySelector("textarea.yume-field") || document.querySelector("textarea");
    if (box) {
      fill(box, yumeDraft.text);
      box.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
})();
