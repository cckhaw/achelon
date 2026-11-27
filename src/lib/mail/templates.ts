/** Plain, transactional emails. Text first; the HTML mirrors it with one button. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(title: string, bodyHtml: string, cta?: { label: string; url: string }, footer = "You are receiving this because of your Achelon membership.") {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:13px;letter-spacing:.04em;color:#6e6e73;margin:0 0 16px">ACHELON</p>
<div style="background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}
${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#0f6b5c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${esc(cta.label)}</a></p><p style="font-size:12px;color:#6e6e73;word-break:break-all">${esc(cta.url)}</p>` : ""}
</div><p style="font-size:12px;color:#6e6e73;margin:16px 4px">${esc(footer)}</p></div></body></html>`;
}
const p = (s: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(s)}</p>`;

export function magicLinkMail(url: string) {
  return {
    subject: "Your Achelon sign-in link",
    text: `Use this link to sign in to Achelon. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: wrap("Sign in to Achelon", p("Use this link to sign in. It works once and expires in 15 minutes. If you didn't ask for this, ignore this email."), { label: "Sign in", url }, "Sent because someone requested a sign-in link for this address."),
  };
}

export function inviteMail(o: { url: string; tenantName: string; inviter?: string | null; note?: string | null; days: number }) {
  const who = o.inviter ? `${o.inviter} has invited you` : "You have been invited";
  return {
    subject: `You're invited to ${o.tenantName} on Achelon`,
    text: `${who} to join ${o.tenantName} on Achelon.${o.note ? `\n\n"${o.note}"` : ""}\n\nAccept your invitation (single use, valid ${o.days} days):\n${o.url}`,
    html: wrap(`Join ${o.tenantName}`, p(`${who} to join ${o.tenantName} on Achelon.`) + (o.note ? p(`"${o.note}"`) : "") + p(`The link works once and is valid for ${o.days} days.`), { label: "Accept invitation", url: o.url }, "Sent because someone invited this address. If this is unexpected, ignore it."),
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
