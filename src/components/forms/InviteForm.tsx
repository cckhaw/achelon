"use client";
import { useActionState } from "react";
import { acceptInviteAction } from "@/app/invite/[token]/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ProfileFields, VisibilityPanel } from "./ProfileFields";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { DEFAULT_VISIBILITY } from "@/db/constants";

export function InviteForm({ token, boundEmail, tenantName, prefill }: { token: string; boundEmail: string | null; tenantName: string; prefill: { name?: string; company?: string; jobTitle?: string; city?: string; country?: string } | null }) {
  const [state, action] = useActionState(acceptInviteAction.bind(null, token), undefined);
  if (state?.ok) return <p className="form-ok" role="status">{state.message}</p>;
  const errors = state?.fieldErrors ?? {};
  return (
    <form onReset={(e) => e.preventDefault()} action={action} className="grid gap-6" noValidate>
      {boundEmail ? (
        <Field label="Email" name="email-shown">
          <input id="email-shown" className="input" value={boundEmail} readOnly aria-readonly="true" />
        </Field>
      ) : (
        <Field label="Your email" name="email" error={errors.email} hint="We'll send a link to confirm it's yours.">
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required className="input" {...describedBy("email", errors.email, true)} />
        </Field>
      )}
      {boundEmail ? <PasswordInput id="password" name="password" label="Choose a password" autoComplete="new-password" error={errors.password} hint="At least 10 characters. Use it with your email to sign in; you can also always use an emailed link." /> : null}
      <ProfileFields errors={errors} values={{ displayName: prefill?.name, company: prefill?.company, jobTitle: prefill?.jobTitle, city: prefill?.city, country: prefill?.country }} />
      <VisibilityPanel current={{}} defaults={DEFAULT_VISIBILITY} />
      <div>
        <label className="row card" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" name="consent" className="switch" style={{ marginTop: "0.1rem" }} role="switch" aria-describedby="consent-text" />
          <span id="consent-text" className="row-main t-sub">
            I agree that {tenantName} stores the details above to run the community, and that other members and admins see only what I allow here. I can export or delete my data at any time in Settings. I have read the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
          </span>
        </label>
        <details className="mt-3 t-sub">
          <summary style={{ minHeight: "2.75rem", display: "flex", alignItems: "center", cursor: "pointer" }}>What is collected, and who sees it</summary>
          <p className="muted">We store your email, the profile details above, your event sign-ups and the choices you make here. Your name is visible to members; every other field is shown only to the audience you pick, and admins can see your email. We use no analytics or advertising trackers. Departed members&apos; data is erased after 30 days.</p>
        </details>
        {errors.consent ? <p className="field-error" role="alert">Please agree to continue.</p> : null}
      </div>
      <FormMessage state={errors && Object.keys(errors).length ? { error: state?.error } : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Joining…">Join {tenantName}</SubmitButton>
    </form>
  );
}
