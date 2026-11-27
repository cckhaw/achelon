import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service · Achelon" };

const UPDATED = "27 November 2026";

export default function TermsPage() {
  return (
    <>
      <p className="b-tag">Legal</p>
      <h1>Terms of Service</h1>
      <p className="b-sub">Last updated {UPDATED}</p>

      <p>These terms govern your use of Achelon, a private, invite-only platform that communities use to run their member directory, events and races. By signing in or accepting an invitation you agree to them. If you do not agree, do not use Achelon.</p>

      <h2>1. The service</h2>
      <p>Achelon is operated for communities (each a &ldquo;community&rdquo;). Each community is run by its own owners and administrators, who decide who is invited, what is published and how the community is run. Achelon provides the software; it does not organise, supervise or endorse any event.</p>

      <h2>2. Access and accounts</h2>
      <ul>
        <li>Access is by invitation only. An invitation is for you alone and must not be shared or forwarded.</li>
        <li>You must give accurate information and keep your password and sign-in links private. You are responsible for activity under your account. Tell a community administrator promptly if you suspect misuse.</li>
        <li>Owners and administrators may pause or remove members from their community. We may suspend a community or an account to protect the service or its members.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to: attempt to access another member&apos;s or community&apos;s data; probe, scan or disrupt the service; use it to harass others, send spam or break the law; scrape the directory or use member information for anything other than taking part in the community; or upload content you have no right to share.</p>

      <h2>4. Member information</h2>
      <p>Information about other members (names, profile fields, sign-ups) is shared with you in confidence, for community purposes only. Do not copy it out of Achelon, publish it or pass it to third parties. You choose who sees each field of your own profile; see the <Link href="/privacy">Privacy Policy</Link>.</p>

      <h2>5. Events, safety and health</h2>
      <p>Endurance sport carries real risk of injury. Events listed in Achelon are organised by members or community administrators, not by Achelon. You take part at your own risk, are responsible for judging your own fitness and the conditions, and for following the organiser&apos;s and the community&apos;s rules and any applicable law. Information about time, place and capacity is provided in good faith and may change.</p>

      <h2>6. Your content</h2>
      <p>You keep ownership of what you add (profile text, notes, race declarations). You give the community and Achelon a limited licence to store and display it to the audiences you choose, solely to operate the service. Do not add anything unlawful or that infringes someone else&apos;s rights.</p>

      <h2>7. Optional integrations</h2>
      <p>Features such as Strava are optional and available only if your community enables them. If you connect one you authorise read-only access as described in the Privacy Policy, and you may disconnect at any time. The third party&apos;s own terms also apply.</p>

      <h2>8. Availability and changes</h2>
      <p>We aim to keep Achelon available but do not promise uninterrupted service. We may change or discontinue features, and we may update these terms. When changes are material we will give notice in the service; continuing to use Achelon after a change means you accept it.</p>

      <h2>9. Ending your use</h2>
      <p>You may export your data and delete your account at any time from your account settings. Deleted data is erased after 30 days as described in the Privacy Policy. Sections that by their nature should survive (such as 4, 5 and 10) continue after your account ends.</p>

      <h2>10. Disclaimer and liability</h2>
      <p>Achelon is provided &ldquo;as is&rdquo; without warranties of any kind, to the fullest extent permitted by law. To the same extent, Achelon and its operators are not liable for indirect or consequential loss, for loss arising from any event or from the conduct of members or organisers, or for loss of data beyond what the law does not allow us to exclude. Nothing in these terms limits liability that cannot lawfully be limited.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the law of the jurisdiction in which the operator of your community is established, unless mandatory local consumer law says otherwise.</p>

      <h2>12. Contact</h2>
      <p>For questions about these terms, or to report a problem, contact an owner or administrator of your community; they will escalate to the platform operator if needed.</p>
    </>
  );
}
