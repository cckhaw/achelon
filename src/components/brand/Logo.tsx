import Link from "next/link";

/**
 * Achelon mark: an "A" whose right leg is the lead rider and whose left leg is three riders dropping back in a staggered
 * line, an echelon (the formation cyclists ride in a crosswind). Same geometry as public/icon.svg.
 */
export function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" style={{ fill: "var(--mark-bg)" }} />
      <g fill="none" strokeWidth="6.4" strokeLinecap="round" style={{ stroke: "var(--mark-fg)" }}>
        <path d="M32.5 14 L50.5 51"/>
        <path d="M29.18 20.83 L27.52 24.25"/>
        <path d="M23.5 32.52 L21.84 35.94"/>
        <path d="M17.82 44.21 L16.16 47.62"/>
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
