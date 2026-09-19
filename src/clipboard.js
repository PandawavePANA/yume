// 클립보드 복사. navigator.clipboard.writeText는 카카오톡·인스타그램 같은 인앱 브라우저,
// iframe 안, http 주소, 일부 보안 설정에서 막히거나 아예 없다. 그때 버튼이 아무 반응 없이
// 끝나거나 "복사할 수 없어요"만 뜨면 쓸 수가 없으므로, 옛 방식(숨긴 textarea를 선택하고
// execCommand("copy"))으로 한 번 더 시도한다. 둘 다 안 되면 false를 돌려준다.
function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // 화면 밖에 두되 display:none이면 선택이 안 되므로 위치만 옮긴다. 16px 미만이면 iOS가 확대한다.
  ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  const prevFocus = document.activeElement;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 사파리는 select()만으로는 선택되지 않는다
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
    prevFocus?.focus?.({ preventScroll: true });
  }
}

export async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 막혔으면 아래 옛 방식으로 넘어간다.
  }
  return legacyCopy(value);
}
