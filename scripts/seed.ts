/** Local development seed. Entirely fictional names, companies and *.example.test addresses. Refuses to run in production. */
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb } from "../src/lib/db";
import { DEFAULT_VISIBILITY, type MembershipRole, type Sport, type Level, type OpenTo, type VisibilityField, type VisibleTo } from "../src/db/constants";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const db = sysDb();
const SLUG = "demo";

interface Seed { email: string; name: string; role: MembershipRole; title?: string; company?: string; city?: string; country?: string; sports?: Sport[]; level?: Level; openTo?: OpenTo[]; tz?: string; vis?: Partial<Record<VisibilityField, VisibleTo>>; bio?: string }

const people: Seed[] = [
  { email: "owen.owner@example.test", name: "Owen Okafor", role: "owner", title: "Chief Executive", company: "Northwind Telecom", city: "Singapore", country: "Singapore", sports: ["cycling", "running"], level: "competitive", openTo: ["training_partners"], tz: "Asia/Singapore", vis: { job_title: "members", company: "members", country: "members" }, bio: "Early rides, long runs." },
  { email: "ada.admin@example.test", name: "Ada Lindqvist", role: "admin", title: "VP Network Strategy", company: "Contoso Mobile", city: "London", country: "United Kingdom", sports: ["running"], level: "intermediate", openTo: ["race_buddies", "mentoring"], tz: "Europe/London", vis: { job_title: "members", company: "members" } },
  { email: "farid.founder@example.test", name: "Farid Haddad", role: "founding_member", title: "CTO", company: "Fabrikam Networks", city: "Dubai", country: "UAE", sports: ["cycling", "triathlon"], level: "competitive", openTo: ["training_partners", "introductions"], tz: "Asia/Dubai", vis: { company: "members", job_title: "members", bio: "members" }, bio: "Chasing a sub-5 half Ironman." },
  { email: "mei.member@example.test", name: "Mei Tan", role: "member", title: "Director, Partnerships", company: "Adatum Cloud", city: "Singapore", country: "Singapore", sports: ["running"], level: "social", openTo: ["race_buddies"], tz: "Asia/Singapore" },
  { email: "lars.member@example.test", name: "Lars Eriksen", role: "member", title: "Head of Spectrum", company: "Litware Wireless", city: "Stockholm", country: "Sweden", sports: ["cycling"], level: "intermediate", openTo: ["training_partners"], tz: "Europe/Stockholm", vis: { city: "nobody" } },
  { email: "priya.member@example.test", name: "Priya Raman", role: "member", title: "SVP Enterprise", company: "Tailspin Telecom", city: "Mumbai", country: "India", sports: ["running", "other"], level: "intermediate", openTo: ["introductions", "mentoring"], tz: "Asia/Kolkata", vis: { company: "members" } },
  { email: "jonas.member@example.test", name: "Jonas Weber", role: "member", title: "Managing Director", company: "Wingtip Towers", city: "Zurich", country: "Switzerland", sports: ["cycling", "running"], level: "competitive", openTo: ["training_partners"], tz: "Europe/Zurich" },
  { email: "grace.guest@example.test", name: "Grace Mwangi", role: "guest", city: "Nairobi", tz: "Africa/Nairobi" },
];

await db.transaction(async (tx) => {
  let [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.slug, SLUG));
  if (!tenant) [tenant] = await tx.insert(schema.tenants).values({ slug: SLUG, name: "Demo Endurance Club", settings: { defaultTimezone: "Asia/Singapore", sponsorshipEnabled: true } }).returning();
  for (const p of people) {
    let [u] = await tx.select().from(schema.users).where(eq(schema.users.email, p.email));
    if (!u) [u] = await tx.insert(schema.users).values({ email: p.email }).returning();
    const [ex] = await tx.select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
    if (ex) continue;
    const [m] = await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: u.id, role: p.role, status: "active", joinedAt: new Date(Date.now() - Math.random() * 90 * 86400000) }).returning();
    await tx.insert(schema.memberProfiles).values({ membershipId: m.id, tenantId: tenant.id, displayName: p.name, jobTitle: p.title ?? null, company: p.company ?? null, city: p.city ?? null, country: p.country ?? null, timezone: p.tz ?? null, bio: p.bio ?? null, sports: p.sports ?? [], level: p.level ?? null, openTo: p.openTo ?? [] });
    const vis = { ...DEFAULT_VISIBILITY, ...p.vis };
    await tx.insert(schema.fieldVisibility).values(Object.entries(vis).map(([f, v]) => ({ membershipId: m.id, tenantId: tenant.id, fieldName: f, visibleTo: v })));
    await tx.insert(schema.notificationPreferences).values({ membershipId: m.id, tenantId: tenant.id });
  }
  const [owner] = await tx.select({ id: schema.memberships.id }).from(schema.memberships).where(eq(schema.memberships.tenantId, tenant.id)).limit(1);
  const existing = await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.tenantId, tenant.id)).limit(1);
  if (!existing.length) {
    const at = (days: number, hour: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + days, hour));
    await tx.insert(schema.events).values([
      { tenantId: tenant.id, createdByMembershipId: owner.id, type: "een_ride", title: "Sunday sunrise ride", description: "Easy social pace along the coast. **Coffee after.** No one gets dropped.", startsAt: at(3, 22), endsAt: at(4, 1), timezone: "Asia/Singapore", locationName: "East Coast Park, Area C", locationAddress: "East Coast Park Service Rd, Singapore", locationLat: 1.3011, locationLng: 103.9122, distanceKm: "60.0", paceOrLevelNote: "Social, 28 km/h", capacity: 12, visibility: "all_members", status: "published" },
      { tenantId: tenant.id, createdByMembershipId: owner.id, type: "een_run", title: "Tuesday track session", startsAt: at(6, 11), timezone: "Asia/Singapore", locationName: "Kallang Practice Track", capacity: 6, visibility: "all_members", status: "published" },
      { tenantId: tenant.id, createdByMembershipId: owner.id, type: "een_social", title: "Founders' dinner", startsAt: at(14, 11), timezone: "Asia/Singapore", locationName: "Private room, Dempsey", visibility: "founding_only", attendeeVisibility: "counts", status: "published" },
      { tenantId: tenant.id, createdByMembershipId: owner.id, type: "external_race", title: "Sentosa Half Marathon", startsAt: at(45, 21), timezone: "Asia/Singapore", locationName: "Sentosa", externalUrl: "https://example.test/race", status: "published" },
      { tenantId: tenant.id, createdByMembershipId: owner.id, type: "een_ride", title: "Draft: Malaysia border ride", startsAt: at(30, 22), timezone: "Asia/Singapore", status: "draft" },
    ]);
  }
  console.log(`Seeded /${SLUG} with ${people.length} fictional people. Sign in as owen.owner@example.test (the magic link is printed to the server console).`);
});
await closePools();
