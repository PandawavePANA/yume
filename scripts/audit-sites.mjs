// 감사 러너(audit-runner.mjs)가 상대 서비스 화면을 다루는 방법 — 서비스마다 하나씩.
//
// 각 함수는 그 페이지 안에서 실행할 자바스크립트 "문자열"을 돌려준다(DevTools의 Runtime.evaluate로 실행).
// 사람이 하는 일과 같은 일만 한다: 새 대화 열기 → 질문 입력 → 보내기 → (분류를 물으면 고르기) → 답 기다리기.
// 화면 구조가 바뀌면 여기만 고친다.
//
//   ask(q)        새 대화를 열고 질문을 보낸다. 반환: "SENT" 또는 실패 코드
//   follow(text)  같은 대화에서 이어서 보낸다
//   answer(tail)  질문 끝부분(tail) 다음에 나온 답 텍스트(아직이면 null)
//   done(tail)    답이 끝났는지(마무리 표시가 나왔거나, 몇 초째 글자가 늘지 않으면 러너가 판단)
//   credits()     남은 크레딧(숫자, 모르면 null)
//   costPerTurn   한 번 보낼 때 드는 크레딧

/* global document, location, HTMLInputElement, HTMLTextAreaElement, Event, getComputedStyle */
// 위 전역은 아래 함수들이 상대 페이지 안에서 실행되기 때문에 있다(이 파일이 직접 쓰지 않는다).
const js = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;

export const SITES = {
  lawmutok: {
    label: "로무앤톡",
    url: "https://lawmutok.com/",
    host: "lawmutok.com",
    costPerTurn: 100,
    ask: (q) =>
      js(async (question) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const btns = () => [...document.querySelectorAll("button")];
        // 첫 방문 이벤트 팝업이 대화를 가리면 캡처가 쓸모없어진다 — 먼저 닫는다.
        for (const x of btns().filter((b) => b.textContent.trim() === "닫기")) x.click();
        const back = btns().find((b) => b.getAttribute("aria-label") === "뒤로: 홈");
        if (back) {
          back.click();
          await sleep(1500);
        }
        if (!document.querySelector('input[placeholder*="AI에게 물어보세요"],textarea[placeholder*="AI에게 물어보세요"]')) {
          location.href = "/";
          await sleep(2500);
        }
        const inp = document.querySelector('input[placeholder*="AI에게 물어보세요"],textarea[placeholder*="AI에게 물어보세요"]');
        if (!inp) return "NO_INPUT";
        const proto = inp.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(inp, question.replace(/\n+/g, " "));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(400);
        const go = btns().find((b) => b.textContent.trim() === "AI에게 묻기");
        if (!go) return "NO_BUTTON";
        go.click();
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          const c = btns().find((b) => b.textContent.trim() === "노무 문제");
          if (c) {
            c.click();
            return "SENT";
          }
          if (document.body.innerText.includes("노무상담 게시판에 올리기")) return "SENT";
        }
        return "SENT";
      }, q),
    follow: (text) =>
      js(async (t) => {
        const ta = document.querySelector('textarea[placeholder="메시지를 입력하세요"]');
        if (!ta) return "NO_TEXTAREA";
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, t);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 400));
        const send = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "보내기");
        if (!send) return "NO_SEND";
        send.click();
        return "SENT";
      }, text),
    answer: (tail) =>
      js((tl) => {
        const t = document.body.innerText;
        const qi = t.lastIndexOf(tl);
        if (qi < 0) return null;
        const rest = t.slice(qi + tl.length);
        const ends = ["노무상담 게시판에 올리기", "본 안내는 참고용 정보"].map((m) => rest.indexOf(m)).filter((i) => i >= 0);
        const out = (ends.length ? rest.slice(0, Math.min(...ends)) : rest).trim();
        return out.length ? out : null;
      }, tail),
    done: (tail) =>
      js((tl) => {
        const t = document.body.innerText;
        return t.lastIndexOf("노무상담 게시판에 올리기") > t.lastIndexOf(tl);
      }, tail),
    credits: () => js(() => {
      const m = document.body.innerText.match(/⚡\s*([\d,]+)/);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    }),
  },
};

// 처음 보는 채팅 화면용 — 사람이 하듯 "화면 아래쪽의 넓은 입력창"에 질문을 쓰고 보내기 버튼(없으면 Enter)을 누른다.
// 로그인 창만 보이면 LOGIN을 돌려준다(현장 요원이 대표에게 "가입·로그인 필요" 결재를 올린다).
// 서비스마다 화면이 달라 완벽하지 않다 — 자주 쓰는 곳은 위 SITES에 전용 설정을 만든다.
export function genericSite(url) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return {
    label: host || url,
    url,
    host,
    generic: true,
    costPerTurn: 0,
    ask: (q) =>
      js(async (question) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const shown = (el, minW) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width >= minW && r.height >= 16 && s.visibility !== "hidden" && s.display !== "none" && !el.disabled && !el.readOnly;
        };
        const meta = (el) => `${el.placeholder || ""} ${el.getAttribute("aria-label") || ""} ${el.name || ""} ${el.id || ""}`;
        const inputs = [...document.querySelectorAll('textarea, input[type="text"], input:not([type]), input[type="search"], [contenteditable="true"], [contenteditable=""]')]
          .filter((el) => shown(el, 120))
          .filter((el) => !/이메일|email|아이디|비밀번호|password|전화|phone|휴대폰|이름|생년|주소|쿠폰|코드/i.test(meta(el)));
        if (!inputs.length) {
          const wall = document.querySelector('input[type="password"]') || /로그인|회원가입|sign\s*in|log\s*in/i.test(document.body.innerText.slice(0, 4000));
          return wall ? "LOGIN" : "NO_INPUT";
        }
        inputs.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom || b.offsetWidth - a.offsetWidth);
        const inp = inputs[0];
        inp.focus();
        const text = question.replace(/\n+/g, " ");
        if (inp.isContentEditable) {
          document.execCommand("selectAll");
          document.execCommand("insertText", false, text);
        } else {
          const proto = inp.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(inp, text);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await sleep(600);
        const scope = inp.closest("form") || inp.parentElement?.parentElement?.parentElement || document.body;
        const label = (b) => `${b.innerText || ""} ${b.getAttribute("aria-label") || ""} ${b.title || ""} ${b.value || ""}`.trim();
        const buttons = [...scope.querySelectorAll('button, [role="button"], input[type="submit"]')].filter((b) => shown(b, 16));
        const r0 = inp.getBoundingClientRect();
        const dist = (b) => {
          const r = b.getBoundingClientRect();
          return Math.abs(r.left - r0.right) + Math.abs(r.top + r.height / 2 - (r0.top + r0.height / 2));
        };
        const named = buttons.find((b) => /보내기|전송|질문하기|묻기|send|submit|ask/i.test(label(b)));
        const near = buttons.filter((b) => !/첨부|파일|음성|마이크|attach|file|voice|mic/i.test(label(b))).sort((a, b) => dist(a) - dist(b))[0];
        const send = named || (near && dist(near) < 160 ? near : null);
        if (send) {
          send.click();
          return "SENT";
        }
        return "NEED_ENTER";
      }, q),
    follow: (text) => genericSite(url).ask(text),
    answer: (tail) =>
      js((tl) => {
        const t = document.body.innerText;
        const qi = t.lastIndexOf(tl);
        if (qi < 0) return null;
        let out = t.slice(qi + tl.length).trim();
        // 답 뒤에 붙는 입력창 영역 글자(보내기 버튼 ➤, 안내 문구)는 뺀다.
        const box = document.querySelector('textarea, input[type="text"], [contenteditable="true"]')?.closest("form");
        const boxText = box ? box.innerText.trim() : "";
        if (boxText && out.endsWith(boxText)) out = out.slice(0, -boxText.length).trim();
        const lines = out.split("\n");
        while (lines.length > 1 && lines[lines.length - 1].trim().length <= 2) lines.pop();
        out = lines.join("\n").trim().slice(0, 6000);
        return out.length ? out : null;
      }, tail),
    done: () => js(() => false),
    credits: () => js(() => null),
  };
}

/** 주소에 맞는 설정 — 전용 설정이 있으면 그것, 없으면 범용. */
export function siteFor(url) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return Object.values(SITES).find((s) => host && host.endsWith(s.host)) || genericSite(url);
}
