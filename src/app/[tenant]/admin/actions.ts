"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, zodState, type ActionState } from "@/lib/forms";
import { emailSchema } from "@/lib/validation";
import { createInvite, revokeInvite, rotateInvite } from "@/lib/services/invites";
import { changeRole, setStatus } from "@/lib/services/members";
import { applyImport, MAX_IMPORT_BYTES, previewImport, type ImportPreview } from "@/lib/services/csv-import";
import { enqueue, flush } from "@/lib/mail/outbox";
import { inviteMail } from "@/lib/mail/templates";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { EVENT_TYPES, MEMBERSHIP_ROLES } from "@/db/constants";
import { isValidTimeZone } from "@/lib/time";
import { sha256Hex } from "@/lib/crypto";

const inviteUrl = (token: string) => `${env().APP_URL}/invite/${token}`;

async function emailInvite(tenantId: string, tenantName: string, inviteId: string, to: string, token: string, inviterName: string | null, note: string | null) {
  const mail = inviteMail({ url: inviteUrl(token), tenantName, inviter: inviterName, note, days: 14 });
  await enqueue({ tenantId, to, ...mail, category: "essential", dedupeKey: `invite:${inviteId}:${sha256Hex(token).slice(0, 12)}` });
  await withTenant(tenantId, (tx) => tx.update(schema.invites).set({ emailedAt: new Date() }).where(eq(schema.invites.id, inviteId)));
  after(() => flush().catch(() => undefined));
}

async function inviterName(tenantId: string, membershipId: string) {
  const [p] = await withTenant(tenantId, (tx) => tx.select({ n: schema.memberProfiles.displayName }).from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, membershipId)));
  return p?.n ?? null;
}

const createSchema = z.object({
  email: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
  role: z.enum(MEMBERSHIP_ROLES),
  note: z.string().trim().max(300).transform((v) => v || null),
  sponsor: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});

export async function createInviteAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "invites.manage");
    const p = createSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return zodState(p.error);
    const actor = { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id };
    const inv = await withTenant(ctx.tenant.id, (tx) => createInvite(tx, actor, { email: p.data.email, role: p.data.role, note: p.data.note, sponsorMembershipId: p.data.sponsor }));
    if (p.data.email) {
      await emailInvite(ctx.tenant.id, ctx.tenant.name, inv.id, p.data.email, inv.token, await inviterName(ctx.tenant.id, ctx.membership.id), p.data.note);
      revalidatePath(`/${slug}/admin/invites`);
      return success(`Invitation emailed to ${p.data.email}.`, { url: inviteUrl(inv.token) });
    }
    revalidatePath(`/${slug}/admin/invites`);
    return success("Link created. Copy it now: for security it is shown only once.", { url: inviteUrl(inv.token) });
  });
}

export async function revokeInviteAction(slug: string, id: string): Promise<void> {
  const ctx = await requireMemberForAction(slug, "invites.manage");
  await withTenant(ctx.tenant.id, (tx) => revokeInvite(tx, { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id }, z.uuid().parse(id)));
  revalidatePath(`/${slug}/admin/invites`);
}

export async function resendInviteAction(slug: string, id: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "invites.manage");
    const r = await withTenant(ctx.tenant.id, (tx) => rotateInvite(tx, { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id }, z.uuid().parse(id)));
    if (!r) return failure("That invitation can't be resent.");
    revalidatePath(`/${slug}/admin/invites`);
    if (r.email) {
      await emailInvite(ctx.tenant.id, ctx.tenant.name, id, r.email, r.token, await inviterName(ctx.tenant.id, ctx.membership.id), r.note);
      return success(`Emailed to ${r.email}. The previous link no longer works.`);
    }
    return success("New link created. The previous link no longer works.", { url: inviteUrl(r.token) });
  });
}

export async function emailAllUnsentAction(slug: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "invites.manage");
    const actor = { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id };
    const unsent = await withTenant(ctx.tenant.id, (tx) => tx.select({ id: schema.invites.id }).from(schema.invites)
      .where(and(isNull(schema.invites.usedAt), isNull(schema.invites.revokedAt), isNull(schema.invites.emailedAt), isNotNull(schema.invites.email))));
    const name = await inviterName(ctx.tenant.id, ctx.membership.id);
    let n = 0;
    for (const u of unsent) {
      const r = await withTenant(ctx.tenant.id, (tx) => rotateInvite(tx, actor, u.id));
      if (r?.email) { await emailInvite(ctx.tenant.id, ctx.tenant.name, u.id, r.email, r.token, name, r.note); n++; }
    }
    revalidatePath(`/${slug}/admin/invites`);
    return success(n ? `Emailed ${n} ${n === 1 ? "invitation" : "invitations"}.` : "Nothing to send.");
  });
}

export async function changeRoleAction(slug: string, id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "members.manage");
    const role = z.enum(MEMBERSHIP_ROLES).safeParse(form.get("role"));
    if (!role.success) return failure("Choose a role.");
    await withTenant(ctx.tenant.id, (tx) => changeRole(tx, { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id }, z.uuid().parse(id), role.data));
    revalidatePath(`/${slug}/admin/members`);
    return success("Role updated.");
  });
}

export async function setStatusAction(slug: string, id: string, status: "active" | "paused" | "left", _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "members.manage");
    await withTenant(ctx.tenant.id, (tx) => setStatus(tx, { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id }, z.uuid().parse(id), status));
    revalidatePath(`/${slug}/admin/members`);
    return success(status === "left" ? "Member removed. Their data is erased after 30 days." : status === "paused" ? "Member paused." : "Member reactivated.");
  });
}

export interface ImportState extends ActionState { preview?: ImportPreview; csv?: string }

export async function importAction(slug: string, _prev: ImportState | undefined, form: FormData): Promise<ImportState> {
  try {
    const ctx = await requireMemberForAction(slug, "import.run");
    const mode = form.get("mode");
    let text = String(form.get("csv") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: "That file is larger than 1 MB." };
      text = await file.text();
    }
    if (!text.trim()) return { ok: false, error: "Choose a CSV file first." };
    if (mode === "apply") {
      const r = await withTenant(ctx.tenant.id, (tx) => applyImport(tx, { membershipId: ctx.membership.id, tenantId: ctx.tenant.id }, text));
      revalidatePath(`/${slug}/admin/invites`);
      return { ok: true, message: `Created ${r.created} ${r.created === 1 ? "invitation" : "invitations"} (${r.skipped} skipped). Nobody has been emailed yet: review them under Invites, then send.` };
    }
    const preview = await withTenant(ctx.tenant.id, (tx) => previewImport(tx, text));
    if (preview.fatal) return { ok: false, error: preview.fatal };
    return { ok: true, preview, csv: text };
  } catch (e) {
    if (e instanceof Error && e.name === "ForbiddenError") return { ok: false, error: "You don't have access to that." };
    console.error("[import]", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error && /Too many rows|1 MB|email column/.test(e.message) ? e.message : "Something went wrong. Please try again." };
  }
}

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Enter a community name").max(80),
  defaultTimezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone"),
  brand: z.enum(["green", "blue", "violet", "graphite"]).default("green"),
  types: z.array(z.enum(EVENT_TYPES)).min(1, "Allow at least one event type"),
});

export async function saveSettingsAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "settings.manage");
    const p = settingsSchema.safeParse({ name: form.get("name"), defaultTimezone: form.get("defaultTimezone"), brand: form.get("brand") ?? "green", types: form.getAll("types") });
    if (!p.success) return zodState(p.error);
    const settings = { ...ctx.tenant.settings, defaultTimezone: p.data.defaultTimezone, allowedEventTypes: p.data.types, sponsorshipEnabled: form.get("sponsorship") === "on", branding: { tint: p.data.brand } };
    await withTenant(ctx.tenant.id, async (tx) => {
      await tx.update(schema.tenants).set({ name: p.data.name, settings }).where(eq(schema.tenants.id, ctx.tenant.id));
      await audit(tx, { tenantId: ctx.tenant.id, actor: ctx.membership.id, action: "settings.updated", metadata: { sponsorship: settings.sponsorshipEnabled } });
    });
    revalidatePath(`/${slug}`, "layout");
    return success("Settings saved.");
  });
}
