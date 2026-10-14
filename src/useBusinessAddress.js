// 사이트 하단 사업장 주소 — 서버(/api/public/business)에 있는 최신 주소를 쓴다. 사업자등록 소재지가 바뀌면 대표가 AI 본사 할 일에서
// 완료를 누르는 순간 서버 값이 바뀌고, 세 사이트(유메·기업용·리머)가 다시 배포하지 않아도 이 값을 따라간다.
// 못 읽으면(오프라인·로컬 개발) 빌드에 든 주소(businessInfo.js)를 그대로 보여 준다.
import { useEffect, useState } from "react";
import { BUSINESS } from "./businessInfo.js";

const ORIGIN = (import.meta.env?.VITE_YUME_API_ORIGIN || "https://www.yume-reamer.com").replace(/\/+$/, "");
let cached = null;

export function useBusinessAddress() {
  const [address, setAddress] = useState(cached || BUSINESS.address);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    fetch(`${ORIGIN}/api/public/business`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.address) {
          cached = d.address;
          if (alive) setAddress(d.address);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return address;
}
