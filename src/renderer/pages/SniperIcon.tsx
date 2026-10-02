import sniperImage from "../assets/sniper-selected.png";

export function SniperIcon() {
  return (
    <img
      src={sniperImage}
      alt=""
      aria-hidden="true"
      width={38}
      height={32}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginRight: 6,
        objectFit: "contain",
        filter: "brightness(0) invert(1)",
      }}
    />
  );
}
