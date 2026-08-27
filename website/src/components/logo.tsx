type MarkSize = "nav" | "hero";

const sizes: Record<MarkSize, { width: number; height: number }> = {
  nav: { width: 32, height: 28 },
  hero: { width: 84, height: 75 },
};

/** Viewport + node + edge wire. Same core, two sides of R2WP. */
export function RclwebMark({ size = "nav" }: { size?: MarkSize }) {
  const { width, height } = sizes[size];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 36 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="rclweb-mark"
    >
      <rect
        x="2.5"
        y="6"
        width="18.6"
        height="20"
        rx="5.6"
        stroke="currentColor"
        strokeWidth="1.85"
      />
      <circle cx="10.35" cy="16" r="2.95" fill="currentColor" />
      <path d="M13.4 16H26.4" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
      <circle cx="28.85" cy="16" r="2.35" fill="currentColor" />
    </svg>
  );
}

export function RclwebWordmark() {
  return (
    <span className="rclweb-lockup">
      <RclwebMark size="nav" />
      <span className="rclweb-name">rclweb</span>
    </span>
  );
}
