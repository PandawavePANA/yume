// 결제·본인인증 화면에 고정으로 붙는 사업자 정보 블록.
//
// PG 심사는 "결제를 진행하는 페이지에도 하단의 사업자정보 노출이 고정되어야 한다"고
// 본다. 유메는 요금제와 크레딧 구매가 모달 안에서 일어나므로, 페이지 맨 아래 푸터에만
// 있으면 결제하는 순간에는 화면에 없다 — 모달이 덮고 있기 때문이다. 그래서 결제가
// 일어나는 자리마다 이 블록을 직접 넣는다.
//
// 모바일 앱은 스크롤 끝까지 가야 푸터가 보이므로 사이드 메뉴에도 같은 블록을 둔다.
// 심사 필수 항목은 다섯 개다 — 상호명, 사업자번호, 대표자명, 사업장주소지, 전화번호.
import { BUSINESS, telHref, businessLine } from "@/businessInfo";
import { t } from "../../i18n.js";

export default function BusinessInfo({ compact = false, style = {} }) {
  const size = compact ? 11 : 11.5;
  return (
    <address
      style={{
        fontStyle: "normal",
        fontSize: size,
        lineHeight: 1.75,
        color: "#A99BC9",
        borderTop: "1px solid rgba(139,111,216,0.14)",
        paddingTop: compact ? 10 : 12,
        marginTop: compact ? 12 : 16,
        ...style,
      }}
    >
      <div>
        {businessLine([
          `상호 ${BUSINESS.name}(${BUSINESS.nameEn})`,
          `대표 ${BUSINESS.ceo}`,
          `사업자등록번호 ${BUSINESS.regNo}`,
          BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`,
        ])}
      </div>
      <div>주소 {BUSINESS.address}</div>
      <div>
        {BUSINESS.tel && (
          <>
            대표전화 <a href={telHref} style={{ color: "#A99BC9", textDecoration: "none" }}>{BUSINESS.tel}</a>
            {" · "}
          </>
        )}
        이메일 <a href={`mailto:${BUSINESS.email}`} style={{ color: "#A99BC9", textDecoration: "none" }}>{BUSINESS.email}</a>
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#8577A8", textDecoration: "none" }}>{t("이용약관")}</a>
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#8577A8", textDecoration: "none" }}>{t("개인정보처리방침")}</a>
        <a href="/refund" target="_blank" rel="noopener noreferrer" style={{ color: "#8577A8", textDecoration: "none", fontWeight: 600 }}>{t("환불정책")}</a>
        <a href="/products" target="_blank" rel="noopener noreferrer" style={{ color: "#8577A8", textDecoration: "none" }}>{t("상품 안내")}</a>
      </div>
    </address>
  );
}
