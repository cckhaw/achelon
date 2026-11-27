import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy · Achelon" };

const UPDATED = "27 November 2026";

export default function PrivacyPage() {
  return (
    <>
      <p className="b-tag">Legal</p>
      <h1>Privacy Policy</h1>
      <p className="b-sub">Last updated {UPDATED}</p>

      <p>Achelon collects the minimum it needs, and you decide who sees what. Nothing on Achelon is public or searchable, and there are no ads, analytics or third-party trackers.</p>

      <h2>1. Who is responsible</h2>
      <p>Your community&apos;s owners and administrators decide whom to invite and how member information is used within the community. The platform operator runs the software and infrastructure on their behalf. This policy applies to both.</p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Email address</strong> for sign-in, invitations and event email.</li>
        <li><strong>Password</strong>, if you set one. It is stored only as a salted one-way hash that no administrator, operator or application code can read. It is never exported.</li>
        <li><strong>Name</strong>, shown to active members of your community.</li>
        <li><strong>Profile fields</strong> you choose to add: job title, company, city, country, bio, sports, level, pace, speed, what you are open to, a photo link and a Strava badge. Each has its own audience (only me, administrators or all members). Defaults are conservative.</li>
        <li><strong>Time zone</strong>, to show event times in your local time.</li>
        <li><strong>Event sign-ups, notes and race declarations</strong>, visible to administrators and, depending on the event or declaration, to other members.</li>
        <li><strong>Last-active time and attendance</strong>, used for an engagement summary seen by administrators only.</li>
        <li><strong>Strava</strong>, only if you connect it: read-only access to your profile and activities. We keep encrypted tokens, your athlete id, an inferred level (visible to you) and, if you allow it, distance, time and climb for events you attended.</li>
        <li><strong>Audit log</strong> of administrative actions, recorded with opaque ids rather than names or emails.</li>
      </ul>

      <h2>3. How we use it</h2>
      <p>To sign you in, run the directory, events, waitlists, calendar and race board, send the email described below, keep the service secure and prevent abuse. We do not sell your data and do not use it for advertising.</p>

      <h2>4. Email</h2>
      <p>All email is transactional. Sign-in links, invitations and sign-up confirmations are always sent. Announcements, reminders and waitlist notices follow your notification preferences. We use an email delivery provider to send them.</p>

      <h2>5. Cookies and tracking</h2>
      <p>One cookie, used only to keep you signed in. No analytics, advertising trackers, third-party scripts or fonts, and no location tracking.</p>

      <h2>6. Who we share it with</h2>
      <ul>
        <li><strong>Your community</strong>, as set by your per-field choices.</li>
        <li><strong>Service providers</strong> that host the application and database and deliver email, bound to process data only on our instructions.</li>
        <li><strong>Strava</strong>, only when you connect it.</li>
        <li><strong>Authorities</strong>, where the law requires it.</li>
      </ul>
      <p>Platform operators can create and suspend communities but cannot see member data.</p>

      <h2>7. Photos you link</h2>
      <p>A photo is a link to an image you host. Other members&apos; browsers fetch it directly (without a referrer), so its host can see their IP address. Use a host you trust, or no photo.</p>

      <h2>8. How long we keep it</h2>
      <ul>
        <li>Active member data: while you are a member.</li>
        <li>Departed or deleted members: 30 days, then permanently erased.</li>
        <li>Sent email bodies: 30 days (sign-in and invitation bodies are scrubbed on delivery).</li>
        <li>Sign-in links: 15 minutes. Sessions: 30 days.</li>
        <li>Audit log: kept, but holds only opaque ids.</li>
      </ul>

      <h2>9. Your rights</h2>
      <ul>
        <li><strong>Access and export:</strong> Settings, Export my data (JSON).</li>
        <li><strong>Correction and visibility:</strong> edit your profile and each field&apos;s audience at any time.</li>
        <li><strong>Deletion:</strong> Settings, Delete my account. Access ends at once and data is erased after 30 days.</li>
        <li><strong>Withdraw Strava:</strong> Settings, Strava, Disconnect.</li>
      </ul>
      <p>Depending on where you live you may have further rights, such as objecting to processing or complaining to a data-protection authority. Contact an administrator of your community to exercise them.</p>

      <h2>10. Security</h2>
      <p>Each community&apos;s data is isolated at the database level, sessions can be revoked, passwords are hashed, and integration tokens are encrypted. No system is perfectly secure; tell an administrator promptly if you suspect a problem.</p>

      <h2>11. Children</h2>
      <p>Achelon is for adults and is not directed at children.</p>

      <h2>12. Changes and contact</h2>
      <p>We will note material changes in the service. Questions go to an owner or administrator of your community. See also the <Link href="/terms">Terms of Service</Link>.</p>
    </>
  );
}
