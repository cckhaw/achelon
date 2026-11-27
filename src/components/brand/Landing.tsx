import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EchelonArt, Logo } from "./Logo";

/**
 * The public front door at /login. Everything here is generic: it must never mention a community, a member or an event
 * (the product is invisible by default). Structure follows a modern SaaS home page: announcement bar, navigation,
 * hero with the sign-in card, trust strip, value props, product panels with big numbers, short guides, footer.
 */
const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "directory", title: "A directory you control", body: "Every field on your profile has its own audience: only you, admins, or members. Defaults are conservative and you decide." },
  { icon: "events", title: "Events that run themselves", body: "Sign-ups with capacity, an automatic waitlist, reminders two days ahead and a spot-opened email when someone drops out." },
  { icon: "calendar", title: "One calendar for everyone", body: "A private link puts rides, runs and races into the calendar you already use, in your own time zone, and keeps it up to date." },
];

const PANELS: { tag: string; title: string; body: string; stat: string; label: string }[] = [
  { tag: "Gather", title: "Know who's in the room", body: "Invitations are single-use and sponsor-backed, so the community stays the community.", stat: "1", label: "single-use link per invitation" },
  { tag: "Plan", title: "From idea to start line", body: "Publish an event, cap it, queue the overflow, and let the reminders do the chasing.", stat: "48h", label: "reminder before every event" },
  { tag: "Protect", title: "Private by design", body: "No ads, no trackers, no third-party scripts. Nothing is public or searchable.", stat: "0", label: "trackers or ad scripts" },
  { tag: "Leave freely", title: "Your data, your exit", body: "Export everything in one tap. Delete your account and your data is erased.", stat: "30", label: "days until it is erased for good" },
];

const GUIDES: { tag: string; icon: IconName; title: string; body: string }[] = [
  { tag: "Guide", icon: "mail", title: "How invitations work", body: "Someone in the community invites you by email or by a single-use link. Accept it, choose a password, and set who sees what." },
  { tag: "Privacy", icon: "admin", title: "Your profile, field by field", body: "Name is shown to members. Everything else (job, company, city, pace) is shown only to the audience you pick, and you can change it any time." },
  { tag: "Install", icon: "link", title: "Add it to your phone", body: "On iPhone open Achelon in Safari, tap Share, then Add to Home Screen. It opens full-screen like an app, in light or dark." },
];

export function Landing({ form, error }: { form: ReactNode; error?: boolean }) {
  return (
    <div className="brand">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="b-announce" role="note">
        <Icon name="bolt" aria-hidden="true" />
        <span>Invite-only. Nothing on Achelon is public or searchable.</span>
      </div>
      <header className="b-nav">
        <div className="b-wrap">
          <Logo />
          <nav className="b-menu" aria-label="Page sections">
            <a href="#how" className="b-hide-sm">How it works</a>
            <a href="#privacy" className="b-hide-sm">Privacy</a>
            <a href="#install" className="b-hide-sm">Install</a>
            <a className="btn btn-sm" href="#signin">Sign in</a>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="b-hero" aria-labelledby="hero-title">
          <EchelonArt />
          <div className="b-wrap b-hero-grid">
            <div>
              <p className="b-eyebrow">The private network for endurance communities</p>
              <h1 className="b-h1" id="hero-title"><span className="b-line">Ride together.</span> <span className="b-line">Run together.</span> <span className="b-line"><mark>Stay in formation.</mark></span></h1>
              <p className="b-lede">Achelon is the invite-only home for your club&apos;s members, events and races: one directory you control, one shared calendar, and no group-chat chaos.</p>
              <p className="b-cta">
                <a className="btn" href="#signin">Sign in</a>
                <a href="#how">See how it works</a>
              </p>
            </div>
            <div className="b-card" id="signin" tabIndex={-1}>
              <h2>Sign in</h2>
              <p className="b-sub">Use your email and password, or ask for a one-time link.</p>
              {error ? <p className="form-error mb-4" role="alert">That link has expired or was already used. Request a new one below.</p> : null}
              {form}
              <p className="t-foot mt-6" style={{ color: "var(--card-muted)" }}>Achelon is invite-only. New here? Ask a member to sponsor you, then use the link in your invitation email. By signing in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
            </div>
          </div>
        </section>

        <div className="b-strip">
          <div className="b-wrap">
            <ul aria-label="What Achelon promises">
              {["Invite-only", "No ads", "No trackers", "You choose who sees what", "Export or delete any time"].map((t) => (
                <li key={t}><Icon name="check" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className="b-section" id="how" aria-labelledby="how-title">
          <div className="b-wrap">
            <p className="b-kicker">How it works</p>
            <h2 className="b-h2" id="how-title">Everything a club needs. Nothing it doesn&apos;t.</h2>
            <div className="b-features">
              {FEATURES.map((f) => (
                <article className="b-feature" key={f.title}>
                  <span className="b-ico"><Icon name={f.icon} aria-hidden="true" /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="b-section" id="privacy" style={{ paddingTop: 0 }} aria-labelledby="priv-title">
          <div className="b-wrap">
            <p className="b-kicker">Built on trust</p>
            <h2 className="b-h2" id="priv-title">From the first invitation to the day you leave.</h2>
            <div className="b-panels">
              {PANELS.map((p) => (
                <article className="b-panel" key={p.tag}>
                  <p className="b-tag">{p.tag}</p>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                  <p className="b-stat">{p.stat}<small>{p.label}</small></p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="b-section" id="install" style={{ paddingTop: 0 }} aria-labelledby="guides-title">
          <div className="b-wrap">
            <p className="b-kicker">Good to know</p>
            <h2 className="b-h2" id="guides-title">Short guides for new members.</h2>
            <div className="b-cards">
              {GUIDES.map((g) => (
                <article className="b-res" key={g.title}>
                  <div className="b-res-top"><span>{g.tag}</span><Icon name={g.icon} aria-hidden="true" /></div>
                  <div className="b-res-body"><h3>{g.title}</h3><p>{g.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="b-foot">
        <div className="b-wrap">
          <Logo />
          <div className="b-foot-grid">
            <div><h3>Product</h3><ul><li>Member directory</li><li>Events and waitlists</li><li>Shared calendar</li><li>Race board</li></ul></div>
            <div><h3>Privacy</h3><ul><li>Invite-only</li><li>Per-field visibility</li><li>No tracking</li><li>Export and delete</li></ul></div>
            <div><h3>Install</h3><ul><li>iPhone and iPad</li><li>Android</li><li>Desktop browsers</li></ul></div>
            <div><h3>Legal</h3><ul><li><Link href="/terms">Terms of Service</Link></li><li><Link href="/privacy">Privacy Policy</Link></li></ul></div>
          </div>
          <p className="b-legal">© {new Date().getFullYear()} Achelon. Invite-only and not indexed by search engines. One cookie, used only to keep you signed in. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></p>
        </div>
      </footer>
    </div>
  );
}
