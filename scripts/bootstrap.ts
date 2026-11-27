/**
 * Creates the first community and its owner (D-27). Idempotent. There is no public sign-up, so this is the only way
 * a community comes into being. The owner then signs in with a normal magic link.
 *   BOOTSTRAP_TENANT_SLUG, BOOTSTRAP_TENANT_NAME, BOOTSTRAP_OWNER_EMAIL
 */
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb } from "../src/lib/db";
import { slugSchema, emailSchema } from "../src/lib/validation";
import { DEFAULT_VISIBILITY } from "../src/db/constants";

const slug = slugSchema.parse(process.env.BOOTSTRAP_TENANT_SLUG ?? "een");
const name = (process.env.BOOTSTRAP_TENANT_NAME ?? "Executive Endurance Network").trim();
const emailRaw = process.env.BOOTSTRAP_OWNER_EMAIL;
if (!emailRaw) {
  console.error("BOOTSTRAP_OWNER_EMAIL is required");
  process.exit(1);
}
const email = emailSchema.parse(emailRaw);

const db = sysDb();
await db.transaction(async (tx) => {
  let [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
  if (!tenant) {
    [tenant] = await tx.insert(schema.tenants).values({ slug, name }).returning();
    console.log(`Created community "${name}" (/${slug}).`);
  }
  let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) [user] = await tx.insert(schema.users).values({ email }).returning();
  const [existing] = await tx.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id));
  if (existing && existing.tenantId === tenant.id) {
    console.log("Owner already exists; nothing to do.");
    return;
  }
  const [m] = await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner", status: "active", joinedAt: new Date() }).returning();
  await tx.insert(schema.memberProfiles).values({ membershipId: m.id, tenantId: tenant.id, displayName: email.split("@")[0] });
  await tx.insert(schema.fieldVisibility).values(Object.entries(DEFAULT_VISIBILITY).map(([f, v]) => ({ membershipId: m.id, tenantId: tenant.id, fieldName: f, visibleTo: v })));
  await tx.insert(schema.notificationPreferences).values({ membershipId: m.id, tenantId: tenant.id });
  console.log(`Owner ${email} created. Sign in at /login with that address.`);
});
await closePools();
