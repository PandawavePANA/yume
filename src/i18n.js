// 한국어 ↔ 영어.
//
// 키를 따로 만들지 않고 **한국어 원문을 키로 쓴다.** 이유가 셋이다.
//
// 하나. 번역이 빠진 자리에 빈 칸이 아니라 한국어가 나온다. 키 방식은 오타 하나로
// 화면에 아무것도 안 나오는데, 그건 번역이 없는 것보다 나쁘다.
//
// 둘. 코드를 읽을 때 무슨 글자가 나오는지 그 자리에서 보인다. t("hero.title")은
// 화면을 띄워 봐야 알고, 이 저장소는 한국어가 모국어인 사람이 읽는다.
//
// 셋. 문구를 고칠 때 키를 새로 짓는 단계가 없다.
//
// 대신 치르는 값 — 한국어를 고치면 번역이 끊긴다. 그래서 `npm run i18n:check`로
// 사전에 없는 문구를 훑을 수 있게 해 두었다(scripts/i18n-check.mjs).

import { useCallback, useEffect, useState } from "react";
import EN from "./i18n.en.js";

export const LANGS = ["ko", "en"];
const STORE_KEY = "yume:lang";

// 처음 온 사람의 언어. 저장해 둔 선택이 있으면 그것이 먼저다 — 브라우저 설정보다
// 본인이 직접 누른 것이 늘 우선한다.
function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // 시크릿 창이나 저장소를 막아 둔 브라우저. 감지로 넘어간다.
  }
  const nav = typeof navigator !== "undefined" ? (navigator.languages?.[0] || navigator.language || "") : "";
  return /^ko\b/i.test(nav) ? "ko" : "en";
}

let current = detect();
const listeners = new Set();

export function getLang() {
  return current;
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    // 저장이 막혀 있어도 이번 방문 동안은 바뀐 채로 쓴다.
  }
  // 화면을 읽어 주는 프로그램과 검색 엔진이 보는 값. 이게 틀리면 한국어를 영어처럼 읽는다.
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const fn of listeners) fn(next);
}

/** 언어가 바뀌면 다시 그리게 한다. t를 쓰는 컴포넌트는 이것만 부르면 된다. */
export function useLang() {
  const [lang, setState] = useState(current);
  useEffect(() => {
    const fn = (next) => setState(next);
    listeners.add(fn);
    // 구독하는 사이에 바뀌었을 수 있다.
    if (current !== lang) setState(current);
    return () => listeners.delete(fn);
  }, [lang]);

  const t = useCallback((ko, vars) => translate(ko, vars, lang), [lang]);
  return { lang, setLang, t };
}

/**
 * 한국어 문구를 현재 언어로. 사전에 없으면 한국어를 그대로 돌려준다.
 *
 * vars로 `{n}` 같은 자리를 채운다 — 숫자가 문장 가운데 오는데 어순이 언어마다
 * 달라서, 문장을 쪼개면 번역이 불가능해진다.
 */
export function translate(ko, vars, lang = current) {
  const dict = lang === "ko" ? null : EN;
  // 빈 문자열도 번역 결과다. "건"처럼 영어에서는 아예 빼야 하는 조사·단위가 있는데,
  // 참/거짓으로 고르면 빈 값이 거짓이라 한국어가 도로 나온다.
  const hit = dict ? dict[ko] : undefined;
  let out = hit === undefined ? ko : hit;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** 훅을 못 쓰는 자리(이벤트 처리기, 모듈 최상단)용. */
export const t = (ko, vars) => translate(ko, vars);

// 숫자·날짜는 언어에 맞춰 찍는다. 12,000원과 ₩12,000은 다른 글이다.
export function formatNumber(n, lang = current) {
  return Number(n || 0).toLocaleString(lang === "ko" ? "ko-KR" : "en-US");
}

export function formatWon(n, lang = current) {
  const v = formatNumber(n, lang);
  return lang === "ko" ? `${v}원` : `KRW ${v}`;
}

export function formatDate(ms, lang = current) {
  return new Date(ms).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
    year: "numeric", month: lang === "ko" ? "long" : "short", day: "numeric",
  });
}

if (typeof document !== "undefined") document.documentElement.lang = current;
