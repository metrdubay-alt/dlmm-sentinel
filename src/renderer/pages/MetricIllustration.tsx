import moneyBags from "../assets/money-bags.png";
import holdersCrowd from "../assets/holders-crowd.png";

export function MetricIllustration({
  kind,
}: {
  kind: "capitalization" | "holders";
}) {
  return (
    <img
      src={kind === "capitalization" ? moneyBags : holdersCrowd}
      alt=""
      aria-hidden="true"
      width={38}
      height={38}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginRight: 6,
        objectFit: "contain",
      }}
    />
  );
}
