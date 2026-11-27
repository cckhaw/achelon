import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURE_PAGES, featureBySlug } from "@/lib/feature-pages";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = featureBySlug((await params).slug);
  return { title: p ? `${p.title} · Achelon` : "Achelon" };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = featureBySlug((await params).slug);
  if (!page) notFound();
  const related = FEATURE_PAGES.filter((p) => p.group === page.group && p.slug !== page.slug);
  return (
    <>
      <p className="b-tag">{page.group}</p>
      <h1>{page.title}</h1>
      <p className="b-sub">{page.lede}</p>
      {page.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body ? <p>{s.body}</p> : null}
          {s.items ? <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul> : null}
        </section>
      ))}
      <h2>More on {page.group.toLowerCase()}</h2>
      <ul>{related.map((r) => <li key={r.slug}><Link href={`/features/${r.slug}`}>{r.title}</Link></li>)}</ul>
      <p style={{ marginTop: "1.5rem" }}>Achelon is invite-only. Read the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>, or <Link href="/login">sign in</Link>.</p>
    </>
  );
}
