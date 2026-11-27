import { describe, expect, it } from "vitest";
import { can, canAssignRole, canManageMember, type Permission } from "@/lib/rbac";
import type { MembershipRole } from "@/db/constants";

const matrix: Record<MembershipRole, Permission[]> = {
  guest: ["events.view", "events.rsvp"],
  member: ["directory.view", "events.view", "events.rsvp", "races.view", "races.declare", "sponsor.nominate", "recaps.write"],
  founding_member: ["directory.view", "events.view", "events.rsvp", "races.view", "races.declare", "sponsor.nominate", "recaps.write"],
  admin: ["admin.access", "members.manage", "invites.manage", "events.manage", "applications.review", "announcements.send", "settings.manage", "audit.view", "import.run", "insights.view", "directory.view", "events.view", "events.rsvp", "races.view", "races.declare", "sponsor.nominate", "recaps.write"],
  owner: [],
};
matrix.owner = [...matrix.admin, "members.assign_privileged"];

const ALL: Permission[] = [...new Set(Object.values(matrix).flat())];

describe("permission boundaries", () => {
  for (const role of Object.keys(matrix) as MembershipRole[]) {
    it(`${role} has exactly its permissions`, () => {
      for (const p of ALL) expect(can(role, p), `${role} ${p}`).toBe(matrix[role].includes(p));
    });
  }
  it("guests cannot see the directory or races", () => {
    expect(can("guest", "directory.view")).toBe(false);
    expect(can("guest", "races.view")).toBe(false);
  });
  it("only owners assign privileged roles", () => {
    expect(can("owner", "members.assign_privileged")).toBe(true);
    expect(can("admin", "members.assign_privileged")).toBe(false);
  });
  it("admins cannot grant or manage owner/admin", () => {
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("admin", "member")).toBe(true);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "founding_member")).toBe(true);
    expect(canManageMember("owner", "admin")).toBe(true);
  });
  it("members and guests manage nobody", () => {
    for (const r of ["member", "founding_member", "guest"] as const) {
      expect(canAssignRole(r, "member")).toBe(false);
      expect(canManageMember(r, "member")).toBe(false);
    }
  });
});
