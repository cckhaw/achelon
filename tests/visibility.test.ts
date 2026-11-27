import { describe, expect, it } from "vitest";
import { matchesFilters, projectProfile, type ProfileData, type Viewer } from "@/lib/visibility";

const profile: ProfileData = {
  membershipId: "m-subject", displayName: "Ada Fictional", jobTitle: "CTO", company: "Example Telecom", city: "Singapore",
  country: "SG", timezone: "Asia/Singapore", bio: "Rides early.", sports: ["cycling"], level: "competitive",
  typicalPaceRunSecPerKm: 300, typicalSpeedRideKmh: "32.0", openTo: ["training_partners"], photoUrl: "https://example.test/a.jpg", stravaVerified: true,
};
const member: Viewer = { membershipId: "m-other", role: "member" };
const admin: Viewer = { membershipId: "m-admin", role: "admin" };
const guest: Viewer = { membershipId: "m-guest", role: "guest" };
const self: Viewer = { membershipId: "m-subject", role: "member" };

describe("projectProfile", () => {
  it("applies conservative defaults for a fellow member", () => {
    const v = projectProfile(profile, {}, member)!;
    expect(v.displayName).toBe("Ada Fictional");
    expect(v.city).toBe("Singapore");
    expect(v.sports).toEqual(["cycling"]);
    expect(v.level).toBe("competitive");
    expect("jobTitle" in v).toBe(false);
    expect("company" in v).toBe(false);
    expect("bio" in v).toBe(false);
    expect("typicalPaceRunSecPerKm" in v).toBe(false);
    expect("photoUrl" in v).toBe(false);
    expect("timezone" in v).toBe(false);
  });
  it("lets admins see admin-level fields but never 'nobody' fields", () => {
    const v = projectProfile(profile, { bio: "nobody", company: "admins" }, admin)!;
    expect(v.company).toBe("Example Telecom");
    expect("bio" in v).toBe(false);
    expect(v.timezone).toBe("Asia/Singapore");
  });
  it("members-level setting is visible to members and admins", () => {
    const s = { company: "members" as const };
    expect(projectProfile(profile, s, member)!.company).toBe("Example Telecom");
    expect(projectProfile(profile, s, admin)!.company).toBe("Example Telecom");
  });
  it("owner of the profile always sees everything, even 'nobody'", () => {
    const v = projectProfile(profile, { bio: "nobody", company: "nobody" }, self)!;
    expect(v.bio).toBe("Rides early.");
    expect(v.company).toBe("Example Telecom");
    expect(v.timezone).toBe("Asia/Singapore");
  });
  it("guests get no profile of anyone else", () => {
    expect(projectProfile(profile, { city: "members" }, guest)).toBeNull();
  });
  it("omits hidden fields entirely rather than nulling them", () => {
    const v = projectProfile(profile, { city: "nobody", sports: "nobody" }, member)!;
    expect(Object.keys(v)).not.toContain("city");
    expect(Object.keys(v)).not.toContain("sports");
  });
  it("never exposes the Strava athlete id", () => {
    const v = projectProfile(profile, { strava: "members" }, member)!;
    expect(v.stravaVerified).toBe(true);
    expect(JSON.stringify(v)).not.toContain("athlete");
  });
});

describe("matchesFilters (runs on the projected profile)", () => {
  it("cannot filter by a hidden city", () => {
    const hidden = projectProfile(profile, { city: "nobody" }, member)!;
    expect(matchesFilters(hidden, { city: "Singapore" })).toBe(false);
    const shown = projectProfile(profile, { city: "members" }, member)!;
    expect(matchesFilters(shown, { city: "singapore" })).toBe(true);
  });
  it("search cannot match hidden company or title", () => {
    const hidden = projectProfile(profile, {}, member)!;
    expect(matchesFilters(hidden, { q: "telecom" })).toBe(false);
    expect(matchesFilters(hidden, { q: "ada" })).toBe(true);
    const admins = projectProfile(profile, {}, admin)!;
    expect(matchesFilters(admins, { q: "example telecom" })).toBe(true);
  });
  it("filters by sport, level and open-to", () => {
    const v = projectProfile(profile, {}, member)!;
    expect(matchesFilters(v, { sport: "cycling", level: "competitive", openTo: "training_partners" })).toBe(true);
    expect(matchesFilters(v, { sport: "running" })).toBe(false);
  });
});
