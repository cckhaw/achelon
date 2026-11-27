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

## Events, races, announcements, applications, insight
Added with Phases 2 to 5; this document is extended as they land.

## Good habits
- Check the **Audit log** after bulk operations.
- Never keep the CRM export in the repo; delete the CSV after import.
