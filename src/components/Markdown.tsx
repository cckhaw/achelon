import type { ReactNode } from "react";

/**
 * Tiny, safe Markdown subset rendered as React nodes (never innerHTML): paragraphs, "- " lists, **bold**, *italic*,
 * [text](https://link). Anything else is plain text. No raw HTML, no images, no non-https links.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
    const m = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
    if (m) return <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer nofollow">{m[1]}</a>;
    return part;
  });
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className={className} style={{ display: "grid", gap: "0.75rem", overflowWrap: "anywhere" }}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return <ul key={i} style={{ listStyle: "disc", paddingLeft: "1.25rem" }}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ""), `${i}-${j}`)}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j ? <br /> : null}{inline(l, `${i}-${j}`)}</span>)}</p>;
      })}
    </div>
  );
}
