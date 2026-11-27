import Papa from "papaparse";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { emailSchema } from "@/lib/validation";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import type { MembershipRole } from "@/db/constants";
import { INVITE_TTL_DAYS } from "./invites";

import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/import-constants";
export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS };

export type ImportRole = Extract<MembershipRole, "member" | "founding_member" | "guest">;
export interface ImportRow {
  line: number;
  email: string;
  name: string;
  company: string;
  jobTitle: string;
  city: string;
  country: string;
  role: ImportRole;
}
export type RowStatus = "new" | "existing_member" | "pending_invite" | "duplicate_in_file" | "invalid";
export interface PreviewRow extends Partial<ImportRow> { line: number; status: RowStatus; reason?: string }
export interface ImportPreview {
  rows: PreviewRow[];
  counts: Record<RowStatus, number>;
  fatal?: string;
}

const ALIASES: Record<string, string[]> = {
  email: ["email", "e-mail", "email address", "e-mail address", "work email"],
  name: ["name", "full name", "display name", "your name", "first and last name"],
  company: ["company", "organisation", "organization", "employer", "company name"],
  jobTitle: ["job title", "job_title", "title", "position", "role / title", "job"],
  city: ["city", "based in", "location", "town"],
  country: ["country", "country of residence"],
  role: ["role", "member type", "type", "membership", "founding"],
};
const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

function pickColumns(headers: string[]) {
  const map: Partial<Record<keyof typeof ALIASES, string>> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const h = headers.find((x) => names.includes(norm(x)));
    if (h) map[key as keyof typeof ALIASES] = h;
  }
  return map;
}

function roleFrom(v: string): ImportRole {
  const s = v.trim().toLowerCase();
  if (/^(founding|founder|founding[_ ]member|yes|true|1)$/.test(s)) return "founding_member";
  if (s === "guest") return "guest";
  return "member";
}

/** Pure parsing and per-row validation (no database). */
export function parseCrmCsv(text: string): { rows: PreviewRow[]; fatal?: string } {
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], fatal: "That file is larger than 1 MB." };
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  const headers = parsed.meta.fields ?? [];
  const cols = pickColumns(headers);
  if (!cols.email) return { rows: [], fatal: "No email column found. Expected a column named Email (or Email Address)." };
  if (parsed.data.length > MAX_IMPORT_ROWS) return { rows: [], fatal: `Too many rows (${parsed.data.length}). Import up to ${MAX_IMPORT_ROWS} at a time.` };

  const seen = new Set<string>();
  const rows: PreviewRow[] = parsed.data.map((r, i) => {
    const line = i + 2; // header is line 1
    const get = (k: keyof typeof ALIASES) => (cols[k] ? String(r[cols[k]!] ?? "").trim() : "");
    const email = emailSchema.safeParse(get("email"));
    if (!email.success) return { line, status: "invalid" as const, reason: "Not a valid email address" };
    const name = get("name").slice(0, 80);
    if (!name) return { line, email: email.data, status: "invalid" as const, reason: "Missing name" };
    if (seen.has(email.data)) return { line, email: email.data, name, status: "duplicate_in_file" as const, reason: "Appears earlier in the file" };
    seen.add(email.data);
    return {
      line, status: "new" as const, email: email.data, name,
      company: get("company").slice(0, 100), jobTitle: get("jobTitle").slice(0, 100), city: get("city").slice(0, 80), country: get("country").slice(0, 80),
      role: roleFrom(get("role")),
    };
  });
  return { rows };
}

export async function previewImport(tx: Tx, text: string): Promise<ImportPreview> {
  const { rows, fatal } = parseCrmCsv(text);
  const counts: Record<RowStatus, number> = { new: 0, existing_member: 0, pending_invite: 0, duplicate_in_file: 0, invalid: 0 };
  if (fatal) return { rows: [], counts, fatal };
  const emails = rows.filter((r) => r.status === "new").map((r) => r.email!);
  if (emails.length) {
    const members = await tx.select({ email: schema.users.email }).from(schema.users)
      .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
      .where(and(inArray(schema.users.email, emails), inArray(schema.memberships.status, ["active", "paused", "invited"])));
    const pending = await tx.select({ email: schema.invites.email }).from(schema.invites)
      .where(and(inArray(schema.invites.email, emails), isNull(schema.invites.usedAt), isNull(schema.invites.revokedAt), sql`${schema.invites.expiresAt} > now()`));
    const m = new Set(members.map((x) => x.email));
    const p = new Set(pending.map((x) => x.email));
    for (const r of rows) {
      if (r.status !== "new") continue;
      if (m.has(r.email!)) { r.status = "existing_member"; r.reason = "Already a member"; }
      else if (p.has(r.email!)) { r.status = "pending_invite"; r.reason = "Already has a pending invitation"; }
    }
  }
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}

/** Creates email-bound invites for the `new` rows. Nobody is emailed here; admins send from the Invites screen. */
export async function applyImport(tx: Tx, actor: { membershipId: string; tenantId: string }, text: string): Promise<{ created: number; skipped: number }> {
  // Re-parse and re-check server-side: never trust the preview the browser sends back.
  const preview = await previewImport(tx, text);
  if (preview.fatal) throw new Error(preview.fatal);
  const fresh = preview.rows.filter((r) => r.status === "new");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  for (const r of fresh) {
    await tx.insert(schema.invites).values({
      tenantId: actor.tenantId, email: r.email!, tokenHash: sha256Hex(randomToken()), createdByMembershipId: actor.membershipId,
      roleGranted: r.role!, expiresAt, note: null,
      prefill: { name: r.name, company: r.company || undefined, jobTitle: r.jobTitle || undefined, city: r.city || undefined, country: r.country || undefined },
    });
  }
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "import.applied", metadata: { created: fresh.length, skipped: preview.rows.length - fresh.length } });
  return { created: fresh.length, skipped: preview.rows.length - fresh.length };
}
