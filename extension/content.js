// AI 사이트에 "유메로 확인" 버튼을 붙인다.
//
// 이게 왜 캡처나 공유 링크보다 나은가 — 화면에 이미 글자가 있다. 공유 링크는 서버에서
// 열리지 않고(클라이언트 핑거프린팅), 캡처는 읽는 값이 들고 잘못 읽을 위험이 있다.
// DOM에서 그대로 가져오면 둘 다 없다.
//
// ── 이 파일이 가장 조심하는 것 ──
// 남의 사이트 구조는 예고 없이 바뀐다. 선택자를 기준으로 삼으면 어느 날 조용히 죽는다.
// 그래서 두 층으로 둔다.
//   1) 아는 사이트면 답변마다 버튼을 붙인다 (편하지만 깨질 수 있는 길)
//   2) 무엇이 됐든 **글을 드래그하면 뜨는 버튼** (구조를 안 보므로 깨지지 않는 길)
// 1이 죽어도 2는 남는다. 사용자는 기능이 사라진 게 아니라 손이 한 번 더 가는 것뿐이다.
//
// 글은 서버로 보내지 않는다. 확장 저장소에 넣고 유메 탭을 연 뒤, 그 탭에서 꺼내
// 입력칸에 넣는다(fill.js). 주소창에 실으면 길이 제한에 걸리고 접속 로그에도 남는다.

const MIN_CHARS = 20;
const MAX_CHARS = 10000;

// 사이트마다 "AI가 한 말" 덩어리를 찾는 방법. 여러 개를 두는 이유는 하나가 바뀌어도
// 나머지가 받치기 때문이다. 위에서부터 먼저 걸리는 것을 쓴다.
const SITES = [
  {
    host: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/,
    name: "ChatGPT",
    blocks: ['[data-message-author-role="assistant"]', ".markdown.prose"],
  },
  {
    host: /(^|\.)claude\.ai$/,
    name: "Claude",
    blocks: ['[data-testid="assistant-message"]', ".font-claude-message", ".font-claude-response"],
  },
  {
    host: /(^|\.)gemini\.google\.com$/,
    name: "Gemini",
    blocks: ["model-response", "message-content"],
  },
  {
    host: /(^|\.)perplexity\.ai$/,
    name: "Perplexity",
    blocks: ['[class*="prose"]'],
  },
];

const site = SITES.find((s) => s.host.test(location.hostname));

// 덩어리에서 **읽을 글만** 꺼낸다.
//
// innerText를 그대로 쓰면 안 되는 이유를 시험대에서 확인했다. 내가 붙인 "유메로 확인"
// 버튼이 그 덩어리 안에 있어서 검증할 글에 그대로 딸려 들어갔다. 사이트 쪽 UI —
// 복사 버튼, 아이콘, "assistant" 같은 라벨 — 도 마찬가지다.
//
// 그래서 복사본을 떠서 지우고 읽는다. 원본을 건드리면 남의 화면이 망가진다.
function extractText(node) {
  const copy = node.cloneNode(true);
  // 내가 넣은 것, 그리고 글이 아닌 것들.
  for (const el of copy.querySelectorAll('.yume-bar, .yume-check-btn, button, svg, [role="button"], [aria-hidden="true"]')) {
    el.remove();
  }
  return clean(copy.innerText);
}

const clean = (s) =>
  String(s || "")
    // 줄바꿈 없는 공백(nbsp). AI 사이트가 많이 쓰는데 그냥 두면 글자 수가 어긋난다.
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);

/** 글을 확장 저장소에 넣고 유메를 연다. 서버로 보내는 것이 아니다. */
async function sendToYume(text, source) {
  const body = clean(text);
  if (body.length < MIN_CHARS) {
    toast("확인할 내용이 너무 짧아요.");
    return;
  }
  await chrome.storage.local.set({ yumeDraft: { text: body, source, at: Date.now() } });
  // 탭 여는 일은 배경 스크립트가 한다 — 콘텐츠 스크립트에는 tabs 권한이 없다.
  chrome.runtime.sendMessage({ type: "openYume" });
}

// ── 1) 답변마다 버튼 ───────────────────────────────────────────────────
const MARK = "data-yume-marked";

function button(onClick) {
  const b = document.createElement("button");
  b.className = "yume-check-btn";
  b.type = "button";
  b.textContent = "유메로 확인";
  b.title = "이 답변의 사실 주장을 유메로 확인합니다";
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function decorate() {
  if (!site) return;
  for (const selector of site.blocks) {
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue; // 선택자가 더 이상 유효하지 않으면 조용히 다음 것으로
    }
    for (const node of nodes) {
      if (node.hasAttribute(MARK)) continue;
      // 글이 거의 없는 껍데기에는 붙이지 않는다(로딩 중 자리표시자 등).
      if (clean(node.innerText).length < MIN_CHARS) continue;
      node.setAttribute(MARK, "1");
      const bar = document.createElement("div");
      bar.className = "yume-bar";
      bar.appendChild(button(() => sendToYume(extractText(node), site.name)));
      node.appendChild(bar);
    }
  }
}

// AI 사이트는 답변을 한 글자씩 그린다. 그릴 때마다 전부 훑으면 타이핑이 버벅인다 —
// 변화가 멎고 나서 한 번만 본다.
let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(decorate, 400);
};

if (site) {
  decorate();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
}

// ── 2) 드래그해서 확인 (구조를 안 보므로 안 깨진다) ────────────────────
let floating = null;

function hideFloating() {
  floating?.remove();
  floating = null;
}

document.addEventListener("selectionchange", () => {
  // 선택이 풀리면 버튼도 사라져야 한다. 남아 있으면 엉뚱한 글이 보내진다.
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || clean(sel.toString()).length < MIN_CHARS) hideFloating();
});

document.addEventListener("mouseup", (e) => {
  if (e.target?.closest?.(".yume-float, .yume-check-btn")) return;
  setTimeout(() => {
    const sel = document.getSelection();
    const text = clean(sel?.toString());
    if (!sel || sel.isCollapsed || text.length < MIN_CHARS) return hideFloating();

    hideFloating();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    floating = document.createElement("div");
    floating.className = "yume-float";
    floating.style.top = `${Math.max(8, rect.top + window.scrollY - 44)}px`;
    floating.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    floating.appendChild(button(() => {
      hideFloating();
      sendToYume(text, site?.name || location.hostname);
    }));
    document.body.appendChild(floating);
  }, 10);
});

document.addEventListener("scroll", hideFloating, { passive: true });

// ── 도구막대 아이콘·우클릭에서 오는 요청 ───────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "checkSelection") return;
  const text = clean(document.getSelection()?.toString());
  if (text.length < MIN_CHARS) {
    toast("확인할 글을 먼저 드래그해서 선택해주세요.");
    return;
  }
  sendToYume(text, site?.name || location.hostname);
});

// ── 짧은 안내 ──────────────────────────────────────────────────────────
function toast(message) {
  const el = document.createElement("div");
  el.className = "yume-toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
