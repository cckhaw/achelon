import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { applyImport, parseCrmCsv, previewImport } from "@/lib/services/csv-import";
import { makeMember, makeTenant } from "./helpers/factory";
import { eq } from "drizzle-orm";

const CSV = `Timestamp,Full Name,Email Address,Company,Job Title,City,Country,Member Type
1/1/2026,Ada Fictional,ADA@Example.test,Example Telecom,CTO,Singapore,SG,Founding
1/1/2026,Bo Invented,bo@example.test,Sample Networks,VP Eng,London,UK,
1/1/2026,No Email,,Acme,,,,
1/1/2026,Bad Email,not-an-email,Acme,,,,
1/1/2026,Ada Again,ada@example.test,Example Telecom,,,,
`;

let T: Awaited<ReturnType<typeof makeTenant>>, admin: Awaited<ReturnType<typeof makeMember>>;
beforeAll(async () => {
  T = await makeTenant();
  admin = await makeMember(T.id, { role: "admin" });
});
afterAll(closePools);

describe("parseCrmCsv", () => {
  it("maps Google Forms style headers, normalises email and role", () => {
    const { rows, fatal } = parseCrmCsv(CSV);
    expect(fatal).toBeUndefined();
    expect(rows[0]).toMatchObject({ line: 2, status: "new", email: "ada@example.test", name: "Ada Fictional", role: "founding_member", company: "Example Telecom" });
    expect(rows[1]).toMatchObject({ status: "new", role: "member" });
    expect(rows[2].status).toBe("invalid");
    expect(rows[3]).toMatchObject({ status: "invalid", reason: "Not a valid email address" });
    expect(rows[4].status).toBe("duplicate_in_file");
  });
  it("rejects files without an email column", () => {
    expect(parseCrmCsv("name,company\nA,B").fatal).toMatch(/email/i);
  });
  it("enforces size and row caps", () => {
    expect(parseCrmCsv("email,name\n" + "a@example.test,A\n".repeat(600)).fatal).toMatch(/Too many rows/);
  });
});

describe("import dry-run and apply", () => {
  it("dry run changes nothing; apply creates invites only for new rows; re-apply is a no-op", async () => {
    await makeMember(T.id, { email: "bo@example.test" }); // already a member
    const before = await sysDb().select().from(schema.invites).where(eq(schema.invites.tenantId, T.id));
    const preview = await withTenant(T.id, (tx) => previewImport(tx, CSV));
    expect(preview.counts).toMatchObject({ new: 1, existing_member: 1, invalid: 2, duplicate_in_file: 1 });
    const mid = await sysDb().select().from(schema.invites).where(eq(schema.invites.tenantId, T.id));
    expect(mid.length).toBe(before.length);

    const res = await withTenant(T.id, (tx) => applyImport(tx, { membershipId: admin.membership.id, tenantId: T.id }, CSV));
    expect(res.created).toBe(1);
    const after = await sysDb().select().from(schema.invites).where(eq(schema.invites.tenantId, T.id));
    const inv = after.find((i) => i.email === "ada@example.test")!;
    expect(inv.roleGranted).toBe("founding_member");
    expect(inv.prefill).toMatchObject({ name: "Ada Fictional", company: "Example Telecom" });

    const again = await withTenant(T.id, (tx) => applyImport(tx, { membershipId: admin.membership.id, tenantId: T.id }, CSV));
    expect(again.created).toBe(0);
  });
});
