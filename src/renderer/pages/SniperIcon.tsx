import sniperImage from "../assets/sniper-user.png";

export function SniperIcon() {
  return (
    <img
      src={sniperImage}
      alt=""
      aria-hidden="true"
      width={30}
      height={25}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginRight: 6,
        objectFit: "contain",
        filter: "grayscale(1) contrast(5) invert(1)",
        mixBlendMode: "screen",
      }}
    />
  );
}
