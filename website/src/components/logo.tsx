type MarkSize = "nav" | "hero";

const sizes: Record<MarkSize, { width: number; height: number }> = {
  nav: { width: 27, height: 24 },
  hero: { width: 78, height: 70 },
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
        x="2.4"
        y="5.2"
        width="19.4"
        height="21.6"
        rx="6.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12.05" cy="16" r="4.55" fill="currentColor" />
      <path d="M16.6 16H27.15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="29.45" cy="16" r="2.2" fill="currentColor" />
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
