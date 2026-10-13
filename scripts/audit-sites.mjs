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

/* global document, location, HTMLInputElement, HTMLTextAreaElement, Event */
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
