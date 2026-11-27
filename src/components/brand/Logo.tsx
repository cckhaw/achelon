import Link from "next/link";

/** Achelon mark: three staggered bars (an echelon, the formation cyclists ride in a crosswind) in a rounded square. */
export function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" style={{ fill: "var(--mark-bg)" }} />
      <g fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: "var(--mark-fg)" }}>
        <path d="M17 41 26 32" />
        <path d="M23 49 38 34" opacity="0.8" />
        <path d="M33 51 48 36" opacity="0.6" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/login" }: { href?: string }) {
  return (
    <Link href={href} className="b-logo" aria-label="Achelon">
      <LogoMark />
      <span>Achelon</span>
    </Link>
  );
}

/** Decorative staggered bars behind the hero. */
export function EchelonArt() {
  const bars = [0, 1, 2, 3, 4];
  return (
    <svg className="b-art" viewBox="0 0 800 520" aria-hidden="true" focusable="false">
      {bars.map((i) => (
        <rect key={i} x={120 + i * 110} y={330 - i * 62} width="360" height="46" rx="23" transform={`rotate(-32 ${300 + i * 110} ${353 - i * 62})`} opacity={1 - i * 0.14} />
      ))}
    </svg>
  );
}
