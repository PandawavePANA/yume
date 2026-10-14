// 사업장 주소 — 사업자등록증 주소가 바뀌면(대표가 할 일 "소재지 정정"을 완료) 코드 배포 없이 세 사이트가 함께 바뀌게 한다.
//   서버 화면(약관·견적서·메일 하단): renderPages.js COMPANY.address가 이 값을 읽는다
//   유메·기업용·리머 사이트 하단: /api/public/business 를 읽어 바꿔 끼운다(src/useBusinessAddress.js), 못 읽으면 빌드에 든 주소
import { getSetting, setSetting } from "./auditDesk.js";
import { COMPANY, setAddressOverride } from "./renderPages.js";

export const NEW_ADDRESS = "대구광역시 달성군 유가읍 테크노상업로 112, 204호";
const KEY = "business_address";

export async function loadBusinessAddress() {
  const v = await getSetting(KEY).catch(() => null);
  setAddressOverride(v || null);
  return COMPANY.address;
}

export async function setBusinessAddress(v) {
  await setSetting(KEY, String(v));
  setAddressOverride(String(v));
  return COMPANY.address;
}

/** 공개 정보 — 사이트 하단 표시용(누구나 읽어도 되는 사업자 정보만). */
export const publicBusiness = () => ({ name: COMPANY.name, ceo: COMPANY.ceo, regNo: COMPANY.regNo, address: COMPANY.address, tel: COMPANY.tel, email: COMPANY.email });
