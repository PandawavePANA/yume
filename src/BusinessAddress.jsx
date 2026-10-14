// 사이트 하단의 사업장 주소 한 줄 — 서버에 있는 최신 주소를 보여 준다(useBusinessAddress.js).
import { useBusinessAddress } from "./useBusinessAddress.js";

export default function BusinessAddress() {
  return <>{useBusinessAddress()}</>;
}
