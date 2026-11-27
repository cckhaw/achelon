/** Plain, transactional emails. Text first; the HTML mirrors it with one button. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(title: string, bodyHtml: string, cta?: { label: string; url: string }, footer = "You are receiving this because of your Achelon membership.") {
  // Black and yellow, matching the app. Inline styles and tables only: mail clients ignore <style> and most modern CSS.
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px"><span style="display:inline-block;background:#ffd60a;color:#0a0a0a;font-weight:800;font-size:13px;letter-spacing:.14em;padding:6px 12px;border-radius:8px">ACHELON</span></td></tr>
<tr><td style="background:#ffffff;border-top:6px solid #ffd60a;border-radius:16px;padding:28px">
<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;color:#0a0a0a">${esc(title)}</h1>${bodyHtml}
${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#ffd60a;color:#0a0a0a;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:700;border:2px solid #0a0a0a">${esc(cta.label)}</a></p><p style="font-size:12px;color:#55524a;word-break:break-all;margin:14px 0 0">${esc(cta.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:#bdbdbd">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
const p = (s: string) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px;color:#0a0a0a">${esc(s)}</p>`;

export function magicLinkMail(url: string) {
  return {
    subject: "Your Achelon sign-in link",
    text: `Use this link to sign in to Achelon. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: wrap("Sign in to Achelon", p("Use this link to sign in. It works once and expires in 15 minutes. If you didn't ask for this, ignore this email."), { label: "Sign in", url }, "Sent because someone requested a sign-in link for this address."),
  };
}

export function inviteMail(o: { url: string; tenantName: string; inviter?: string | null; note?: string | null; days: number; eventTitle?: string | null }) {
  const who = o.inviter ? `${o.inviter} has invited you` : "You have been invited";
  return {
    subject: o.eventTitle ? `You're invited: ${o.eventTitle}` : `You're invited to ${o.tenantName} on Achelon`,
    text: `${who} to ${o.eventTitle ? `${o.eventTitle}, an event run by ${o.tenantName} on Achelon. Accept to create your account and see the details` : `join ${o.tenantName} on Achelon`}.${o.note ? `\n\n"${o.note}"` : ""}\n\nAccept your invitation (single use, valid ${o.days} days):\n${o.url}`,
    html: wrap(o.eventTitle ? o.eventTitle : `Join ${o.tenantName}`, p(o.eventTitle ? `${who} to ${o.eventTitle}, an event run by ${o.tenantName} on Achelon. Accept to create your account and see the details.` : `${who} to join ${o.tenantName} on Achelon.`) + (o.note ? p(`"${o.note}"`) : "") + p(`The link works once and is valid for ${o.days} days.`), { label: "Accept invitation", url: o.url }, "Sent because someone invited this address. If this is unexpected, ignore it."),
  };
}

export function confirmEmailMail(url: string, tenantName: string) {
  return {
    subject: `Confirm your email for ${tenantName}`,
    text: `Confirm your email to finish joining ${tenantName} on Achelon (works once, 15 minutes):\n\n${url}`,
    html: wrap("Confirm your email", p(`Confirm your email to finish joining ${tenantName}. The link works once and expires in 15 minutes.`), { label: "Confirm and sign in", url }),
  };
}

export function rsvpMail(o: { tenantName: string; title: string; when: string; status: "going" | "waitlist"; url: string }) {
  const going = o.status === "going";
  return {
    subject: going ? `You're going: ${o.title}` : `You're on the waitlist: ${o.title}`,
    text: `${going ? "You're going to" : "You're on the waitlist for"} ${o.title}.\n${o.when}\n\n${o.url}`,
    html: wrap(going ? "You're going" : "You're on the waitlist", p(o.title) + p(o.when), { label: "View event", url: o.url }, `${o.tenantName} on Achelon`),
  };
}

export function newEventMail(o: { tenantName: string; title: string; when: string; url: string }) {
  return {
    subject: `New: ${o.title}`,
    text: `${o.title}\n${o.when}\n\n${o.url}\n\nChange which emails you get in Settings.`,
    html: wrap(o.title, p(o.when), { label: "View and RSVP", url: o.url }, `${o.tenantName} on Achelon. Change which emails you get in Settings.`),
  };
}

export function reminderMail(o: { tenantName: string; title: string; when: string; url: string }) {
  return {
    subject: `Coming up: ${o.title}`,
    text: `Reminder: ${o.title}\n${o.when}\n\n${o.url}`,
    html: wrap("Coming up", p(o.title) + p(o.when), { label: "View event", url: o.url }, `${o.tenantName} on Achelon. Turn reminders off in Settings.`),
  };
}

export function waitlistPromotedMail(o: { tenantName: string; title: string; when: string; url: string }) {
  return {
    subject: `A spot opened: ${o.title}`,
    text: `Good news, you're now going to ${o.title}.\n${o.when}\n\n${o.url}`,
    html: wrap("A spot opened up", p(`You're now going to ${o.title}.`) + p(o.when), { label: "View event", url: o.url }, `${o.tenantName} on Achelon`),
  };
}

export function announcementMail(o: { tenantName: string; subject: string; body: string; url: string }) {
  return {
    subject: o.subject,
    text: `${o.body}\n\n${o.url}`,
    html: wrap(o.subject, o.body.split(/\n{2,}/).map(p).join(""), { label: "Open Achelon", url: o.url }, `${o.tenantName} on Achelon. Change which emails you get in Settings.`),
  };
}

export function passwordResetMail(url: string) {
  return {
    subject: "Set or reset your Achelon password",
    text: `Use this link to set or reset your Achelon password. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email: your password won't change.`,
    html: wrap("Set your password", p("Use this link to set or reset your password. It works once and expires in 15 minutes. If you didn't ask for this, ignore this email and your password stays as it is."), { label: "Set my password", url }, "Sent because someone asked to set or reset the password for this address."),
  };
}
