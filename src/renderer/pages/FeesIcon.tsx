export function FeesIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 28 28"
      aria-hidden="true"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginRight: 6,
      }}
    >
      {[17, 12, 7].map((y) => (
        <g key={y} stroke="#a66b12" strokeWidth="1.2">
          <path d={`M4 ${y}v4c0 5 20 5 20 0v-4Z`} fill="#d59c27" />
          <ellipse cx="14" cy={y} rx="10" ry="3.8" fill="#f9d76c" />
          <path d={`M7 ${y + 2}v3m4-2v3m6-3v3m4-4v3`} stroke="#f3c953" />
        </g>
      ))}
    </svg>
  );
}
