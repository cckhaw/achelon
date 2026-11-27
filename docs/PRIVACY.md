# Privacy: what is collected, who sees it, how long we keep it

Principle: collect the minimum; the member decides who sees what.

## What is collected
| Data | Why | Who can see it |
|---|---|---|
| Email address | Sign-in, invitations, event email | The member; owners and admins |
| Name | Identify members | All active members (always) |
| Job title, company, city, country, bio, sports, level, pace, ride speed, "open to", photo link, Strava badge | Directory and matching training partners | **Per field, chosen by the member**: only me / admins / all members. Defaults are conservative: city, sports, level and open-to are shared with members; the rest with admins only |
| Time zone | Show event times in local time | The member and admins |
| Event sign-ups and notes | Run events, capacity and waitlists | Admins; other members see names unless an event is "counts only" |
| Race declarations | "Who's going to this race" | Members, or nobody, per declaration |
| Last-active time, attendance | Engagement summary for admins | Admins only (disclosed in Settings) |
| Strava connection (optional) | Verified level badge, event leaderboard | Tokens encrypted at rest; read-only scopes; only the badge/result is shown |
| Audit log | Accountability for admin actions | Admins; stores ids, never names or emails |

## What is not collected
No analytics, no advertising trackers, no third-party scripts or fonts, no location tracking, no contact-list access. The calendar feed is a secret URL per member; revoke it any time.

## Remote photos
A photo is a link to an image you host. Your viewers' browsers fetch it directly (without a referrer), so the host can see their IP address. Use a host you trust, or no photo.

## Your rights
- **Export**: Settings → Export my data (JSON, everything held across communities).
- **Delete**: Settings → Delete my account. Access ends immediately; the profile, sign-ups, preferences and tokens are erased after **30 days** by the purge job. Departed or removed members follow the same 30-day rule. Audit history keeps only the opaque member id.
- **Change visibility** any time under Me → Profile and privacy.

## Retention
| Data | Kept |
|---|---|
| Active member data | While a member |
| Departed / deleted members | 30 days, then hard-deleted |
| Sent email bodies | 30 days (sign-in and invite bodies are scrubbed on delivery) |
| Login tokens | 15 minutes; sessions 30 days |
| Audit log | Indefinitely (ids only) |
| CSV import prefill | Until the invite is used or purged |

## Emails
All email is transactional. Essential mail (sign-in links, invitations, RSVP confirmation) is always sent; announcements, reminders and waitlist notices respect preferences.
