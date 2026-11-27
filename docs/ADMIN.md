# Running EEN day to day

## Roles
| Role | Can |
|---|---|
| Owner | Everything, including granting owner/admin. At least one active owner must always remain |
| Admin | Members (not owners/admins), invites, events, applications, announcements, settings, import, audit |
| Founding member / Member | Directory, events, races, sponsor new people; write recaps |
| Guest | Only the events they are listed on |

## First day
1. Owner signs in (the owner is created by `npm run db:bootstrap`, see HANDOVER).
2. **Admin → Settings**: community name, default time zone (Asia/Singapore for EEN), allowed event types, sponsorship on/off.
3. **Admin → Import**: upload the CRM CSV. Review the dry-run preview (new / already a member / duplicates / problems). Apply creates *invitations*, not members: nobody has consented yet and nobody is emailed.
4. **Admin → Invites**: review, then **Email all unsent invitations**. Each person gets a single-use link, sets their profile and chooses visibility.

## Invites
- **Email invite**: only that address can use it; the link is also shown once to copy.
- **Link invite**: single-use, anyone with the link may claim it, but they must confirm their email before they become a member.
- Expire after 14 days; **Resend** issues a fresh link and kills the old one; **Revoke** kills it now.

## People
Members screen: pause (keeps data, blocks access), reactivate, remove (access ends now, data erased after 30 days), change role. Removing frees their upcoming spots and promotes waitlists.

## Events
**Admin → Events → New event.** Choose the type, title, time zone (the event's own, e.g. Asia/Singapore; members see times in their own zone with the event-local time beside it), start, optional end, place, route link, distance, pace note.
- **Capacity**: leave empty for unlimited. When full, extra people join a **waitlist** in order; when someone leaves (or you raise the capacity, or remove them) the next person is promoted automatically. Pausing/removing a member also frees their seats.
- **Sign-up cutoff**: after it, people can still leave but not join.
- **Who can see it**: all members, founding members only, or an invite list (guests only ever see events they are on the list for).
- **Attendee list**: "Show names" or "Counts only". Admins always see names.
- **Draft** events are visible to admins only; **Publish** makes them visible. **Cancel** keeps the sign-ups and marks the event cancelled everywhere (including calendar feeds).
- On an event's admin page: attendees with Remove and "Move to going" (overrides capacity; audited), and **Download attendee list (CSV)** (audited).

## Calendar
Every member has one secret iCal link (Calendar → Subscribe). It is shown once when created (only its hash is stored); making a new one kills the old one, and it can be switched off. The feed includes every event that member may see plus their visible race declarations, never drafts.

## Races, announcements, applications, insight
Added with Phases 3 to 5; this document is extended as they land.

## Good habits
- Check the **Audit log** after bulk operations.
- Never keep the CRM export in the repo; delete the CSV after import.
