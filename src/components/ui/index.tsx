import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: `${size / 16}rem`, height: `${size / 16}rem`, fontSize: `${size / 16 / 2.4}rem` };
  // Remote photos are fetched by the viewer's browser: no referrer is sent (see docs/PRIVACY.md).
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="avatar" style={style} referrerPolicy="no-referrer" loading="lazy" />;
  }
  return <span className="avatar" style={style} aria-hidden="true">{initials(name)}</span>;
}

export function Badge({ children, tone = "tint" }: { children: ReactNode; tone?: "tint" | "warn" | "muted" | "danger" }) {
  const cls = tone === "tint" ? "badge" : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

/** Inset grouped list container. */
export function Group({ title, footer, children, id }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={title && id ? `${id}-t` : undefined}>
      {title ? <h2 className="t-caps group-title" id={id ? `${id}-t` : undefined}>{title}</h2> : <div className="mt-6" />}
      <div className="group">{children}</div>
      {footer ? <p className="t-foot muted group-foot">{footer}</p> : null}
    </section>
  );
}

/** A list row. With `href` it is a link with a disclosure chevron. */
export function Row({ href, title, sub, value, leading, trailing, disclosure = Boolean(href), prefetch }: {
  href?: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; leading?: ReactNode; trailing?: ReactNode; disclosure?: boolean; prefetch?: boolean;
}) {
  const inner = (
    <>
      {leading}
      <div className="row-main">
        <div className="row-title">{title}</div>
        {sub ? <div className="row-sub">{sub}</div> : null}
      </div>
      {value ? <div className="row-value">{value}</div> : null}
      {trailing}
      {disclosure ? <Icon name="chevron" className="disclosure" /> : null}
    </>
  );
  return href ? <Link href={href} className="row" prefetch={prefetch}>{inner}</Link> : <div className="row">{inner}</div>;
}

export function EmptyState({ title, body, action, icon = "events" }: { title: string; body?: ReactNode; action?: ReactNode; icon?: "events" | "directory" | "races" | "calendar" | "mail" }) {
  return (
    <div className="card" style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
      <div className="avatar" style={{ width: "3.5rem", height: "3.5rem", margin: "0 auto 0.75rem" }}><Icon name={icon} width={26} height={26} /></div>
      <h2 className="t-headline">{title}</h2>
      {body ? <p className="muted mt-1">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>{label}</label>
      {children}
      {hint ? <p className="field-hint" id={`${name}-hint`}>{hint}</p> : null}
      {error ? <p className="field-error" id={`${name}-err`} role="alert">{error}</p> : null}
    </div>
  );
}

export function describedBy(name: string, error?: string, hint?: boolean) {
  return { "aria-invalid": error ? true : undefined, "aria-describedby": [hint ? `${name}-hint` : null, error ? `${name}-err` : null].filter(Boolean).join(" ") || undefined } as const;
}

export function FormMessage({ state }: { state: { ok?: boolean; error?: string; message?: string } | undefined }) {
  if (!state) return null;
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (state.ok && state.message) return <p className="form-ok" role="status">{state.message}</p>;
  return null;
}

export function Segmented({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav className="segmented" aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined} replace>{i.label}</Link>
      ))}
    </nav>
  );
}
