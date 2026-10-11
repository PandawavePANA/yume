// 서버가 대신 여는 주소가 내부망이 아닌지(SSRF 방지). 웹훅 전송과 근거 페이지 열기가 같이 쓴다.
// DB를 물지 않는 작은 모듈로 둔다 — 그래야 쓰는 쪽을 따로 시험할 수 있다.
import net from "node:net";

export function privateHost(host) {
  const h = String(host).replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const kind = net.isIP(h);
  if (kind === 4) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (kind === 6) return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  return false;
}
