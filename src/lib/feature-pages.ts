/** Public, generic descriptions of what Achelon does (linked from the front-page footer). No community, member or event is ever named. */
export interface FeaturePage {
  slug: string;
  group: "Product" | "Privacy";
  title: string;
  lede: string;
  sections: { heading: string; body?: string; items?: string[] }[];
}

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "member-directory", group: "Product", title: "Member directory",
    lede: "A directory of the people in your community, where each person decides what the others can see.",
    sections: [
      { heading: "Who is in it", body: "Only active members of your community appear. Guests (people invited to a single event) are never listed, and nobody outside the community can see the directory at all." },
      { heading: "What members see", items: ["A member's name is always visible to other members.", "Every other field (job title, company, city, country, bio, sports, level, pace, ride speed, what they are open to, photo link, Strava badge) has its own audience: only me, admins, or all members.", "Defaults are conservative: city, sports, level and what a member is open to are shared with members; the rest with admins only."] },
      { heading: "Finding people", body: "Search and filter by sport, level, city or what someone is open to, such as training partners, race buddies, introductions or mentoring." },
      { heading: "Your control", body: "Members change any field and any audience at any time under Me, Profile and privacy. Admins see what the audience setting allows, and nothing more is exposed to other members." },
    ],
  },
  {
    slug: "events-and-waitlists", group: "Product", title: "Events and waitlists",
    lede: "Publish a ride, run or social, cap the places, and let the queue and the reminders run themselves.",
    sections: [
      { heading: "Sign-ups", items: ["Members answer Going, Maybe or Can't make it, with an optional note.", "Set a capacity and a sign-up cutoff. Times are shown in each member's own time zone; new events default to Malaysia time (GMT+8)."] },
      { heading: "Automatic waitlist", body: "When an event is full, the next people join a first-in, first-out waitlist. If someone drops out, the next person is promoted and emailed straight away." },
      { heading: "Who can see an event", body: "Events can be open to all members, to founding members only, or by invitation. An admin can invite someone new by email from the event page; they join as a guest and see only that event." },
      { heading: "Reminders and follow-up", items: ["A reminder email goes out about two days before the event, for members who want reminders.", "Admins can switch the attendee list between names and counts only, download the list as CSV, and post a recap afterwards."] },
    ],
  },
  {
    slug: "shared-calendar", group: "Product", title: "Shared calendar",
    lede: "Every event and race in one calendar, and a private feed for the calendar app you already use.",
    sections: [
      { heading: "In Achelon", body: "A month view and an agenda view show the events and races you are allowed to see, in your own time zone." },
      { heading: "In your own calendar", body: "Each member gets a private calendar link they can subscribe to in Apple Calendar, Google Calendar or Outlook. It stays up to date as events change." },
      { heading: "Private by design", body: "The link is secret and personal. You can revoke it at any time and create a new one; the old link stops working immediately." },
    ],
  },
  {
    slug: "race-board", group: "Product", title: "Race board",
    lede: "See which races your community is entering and who you could travel and race with.",
    sections: [
      { heading: "Declare a race", body: "Members add the races they are entering, outside the community's own events, with date, place and distance." },
      { heading: "Join in", body: "Other members can see who is going and join the same race, so friends, training partners and race buddies find each other." },
      { heading: "Your choice of audience", body: "Each declaration is visible to all members or to nobody. A goal time, if you add one, is never shown to other members." },
    ],
  },
  {
    slug: "invite-only", group: "Privacy", title: "Invite-only",
    lede: "Achelon is not a public site. You get in because someone in the community brought you in.",
    sections: [
      { heading: "How people join", items: ["An owner or admin invites someone by email, or creates a single-use link to share.", "A member can nominate someone, and an admin approves.", "Each invitation can be used once and expires after 14 days. Admins can revoke an invitation at any time."] },
      { heading: "Nothing is public", body: "Signed-out visitors see only the sign-in page and these information pages. Communities, members and events are not listed, linked or indexed by search engines, and a community's address returns a plain not-found page to anyone who is not a member." },
      { heading: "Roles", body: "Owners, admins, founding members, members and guests each see only what their role allows. Guests see only the events they were invited to." },
    ],
  },
  {
    slug: "per-field-visibility", group: "Privacy", title: "Per-field visibility",
    lede: "Every detail on your profile has its own audience, and you are the one who picks it.",
    sections: [
      { heading: "Three audiences", items: ["Only me", "Admins", "All members"] },
      { heading: "Field by field", body: "Job title, company, city, country, bio, sports, level, pace, ride speed, what you are open to, photo link and Strava badge are each set separately. Your name is the one thing always shown to members." },
      { heading: "Safe defaults", body: "New profiles start conservative: only city, sports, level and what you are open to are shared with members. Everything else starts with admins only, and you can open it up or close it again whenever you like." },
      { heading: "No surprises", body: "Admins can see an engagement summary (last active and attendance). It is disclosed to every member in Settings." },
    ],
  },
  {
    slug: "no-tracking", group: "Privacy", title: "No tracking",
    lede: "Achelon does what it needs to run and nothing more.",
    sections: [
      { heading: "What we do not use", items: ["No analytics.", "No advertising or marketing trackers.", "No third-party scripts or fonts.", "No location tracking and no access to your contacts."] },
      { heading: "The one cookie", body: "A single cookie keeps you signed in. Nothing else is stored in your browser to follow you around." },
      { heading: "Email", body: "All email is transactional: sign-in resets, invitations, sign-up confirmations and, if you want them, announcements, reminders and waitlist notices." },
      { heading: "One thing to know", body: "A profile photo is a link to an image you host. Other members' browsers fetch it directly, so its host can see their IP address. Use a host you trust, or no photo." },
    ],
  },
  {
    slug: "export-and-delete", group: "Privacy", title: "Export and delete",
    lede: "Your data is yours. Take a copy, or take it all back.",
    sections: [
      { heading: "Export", body: "In Settings, choose Export my data to download everything held about you, across communities, as a JSON file in one tap." },
      { heading: "Delete", items: ["In Settings, choose Delete my account. Access ends immediately.", "Your profile, sign-ups, preferences and tokens are permanently erased after 30 days.", "Members who leave or are removed follow the same 30-day rule."] },
      { heading: "Strava", body: "If you connect Strava, disconnecting revokes access and erases the tokens, results and badge straight away." },
      { heading: "Passwords", body: "Passwords are stored only as a salted one-way hash that nobody, including administrators, can read." },
    ],
  },
];

export const featureBySlug = (slug: string) => FEATURE_PAGES.find((p) => p.slug === slug);
