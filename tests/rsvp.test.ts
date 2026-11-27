import { describe, expect, it } from "vitest";
import { canChangeRsvp, decideRsvp, promotable } from "@/lib/rsvp";
import { canViewEvent } from "@/lib/event-access";
import { buildCalendar, fold } from "@/lib/ical";

const base = { capacity: 3, goingCount: 0, waitlistCount: 0, existing: null, requested: "going" as const };

describe("decideRsvp", () => {
  it("goes when there is room and no queue", () => {
    expect(decideRsvp(base)).toMatchObject({ status: "going", joinsWaitlist: false, changed: true });
  });
  it("unlimited capacity always goes", () => {
    expect(decideRsvp({ ...base, capacity: null, goingCount: 500 }).status).toBe("going");
  });
  it("joins the waitlist when full", () => {
    expect(decideRsvp({ ...base, goingCount: 3 })).toMatchObject({ status: "waitlist", joinsWaitlist: true });
  });
  it("cannot jump the queue when a seat is free but others are waiting", () => {
    expect(decideRsvp({ ...base, goingCount: 2, waitlistCount: 1 })).toMatchObject({ status: "waitlist", joinsWaitlist: true });
  });
  it("is idempotent for going and for waitlist", () => {
    expect(decideRsvp({ ...base, existing: "going", goingCount: 3 })).toMatchObject({ status: "going", changed: false });
    expect(decideRsvp({ ...base, existing: "waitlist", goingCount: 3, waitlistCount: 2 })).toMatchObject({ status: "waitlist", joinsWaitlist: false, changed: false });
  });
  it("freeing a going seat is flagged for promotion", () => {
    for (const requested of ["maybe", "declined", "cancelled"] as const) {
      expect(decideRsvp({ ...base, existing: "going", goingCount: 3, requested })).toMatchObject({ status: requested, freesSeat: true });
    }
  });
  it("leaving the waitlist does not free a seat", () => {
    expect(decideRsvp({ ...base, existing: "waitlist", goingCount: 3, waitlistCount: 1, requested: "declined" })).toMatchObject({ freesSeat: false });
  });
  it("a declined member can come back", () => {
    expect(decideRsvp({ ...base, existing: "declined" }).status).toBe("going");
  });
});

describe("promotable", () => {
  it("fills free seats from the waitlist only", () => {
    expect(promotable(3, 2, 5)).toBe(1);
    expect(promotable(3, 3, 5)).toBe(0);
    expect(promotable(3, 0, 2)).toBe(2);
    expect(promotable(null, 99, 4)).toBe(4);
    expect(promotable(3, 1, 0)).toBe(0);
    expect(promotable(3, 5, 2)).toBe(0); // over-subscribed after a capacity cut: never negative
  });
});

describe("canChangeRsvp", () => {
  const start = new Date(Date.now() + 86_400_000);
  it("only published events accept sign-ups", () => {
    expect(canChangeRsvp({ status: "draft", cutoff: null, startsAt: start, requested: "going" }).ok).toBe(false);
    expect(canChangeRsvp({ status: "cancelled", cutoff: null, startsAt: start, requested: "going" }).ok).toBe(false);
  });
  it("respects the cutoff for joining but not for leaving", () => {
    const cutoff = new Date(Date.now() - 1000);
    expect(canChangeRsvp({ status: "published", cutoff, startsAt: start, requested: "going" }).ok).toBe(false);
    expect(canChangeRsvp({ status: "published", cutoff, startsAt: start, requested: "cancelled" }).ok).toBe(true);
    expect(canChangeRsvp({ status: "published", cutoff, startsAt: start, requested: "declined" }).ok).toBe(true);
  });
  it("blocks joining after the start", () => {
    expect(canChangeRsvp({ status: "published", cutoff: null, startsAt: new Date(Date.now() - 1000), requested: "going" }).ok).toBe(false);
  });
});

describe("canViewEvent (D-29)", () => {
  const e = { status: "published", invited: false };
  it("all_members: members yes, guests no", () => {
    expect(canViewEvent({ ...e, role: "member", visibility: "all_members" })).toBe(true);
    expect(canViewEvent({ ...e, role: "guest", visibility: "all_members" })).toBe(false);
  });
  it("founding_only", () => {
    expect(canViewEvent({ ...e, role: "member", visibility: "founding_only" })).toBe(false);
    expect(canViewEvent({ ...e, role: "founding_member", visibility: "founding_only" })).toBe(true);
    expect(canViewEvent({ ...e, role: "admin", visibility: "founding_only" })).toBe(true);
  });
  it("invite_list includes guests who are listed", () => {
    expect(canViewEvent({ ...e, role: "guest", visibility: "invite_list", invited: true })).toBe(true);
    expect(canViewEvent({ ...e, role: "member", visibility: "invite_list", invited: false })).toBe(false);
  });
  it("drafts are admin-only", () => {
    expect(canViewEvent({ role: "member", visibility: "all_members", status: "draft", invited: true })).toBe(false);
    expect(canViewEvent({ role: "owner", visibility: "all_members", status: "draft", invited: false })).toBe(true);
  });
});

describe("iCalendar", () => {
  it("produces a valid, escaped, CRLF calendar", () => {
    const ics = buildCalendar("EEN", [{ uid: "a@achelon", start: new Date("2026-05-03T07:30:00Z"), end: new Date("2026-05-03T09:00:00Z"), summary: "Sunday ride, 60 km; social", description: "Line1\nLine2", location: "Marina Bay", geo: { lat: 1.28, lng: 103.85 } }], new Date("2026-01-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20260503T073000Z");
    expect(ics).toContain("SUMMARY:Sunday ride\\, 60 km\; social");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
    expect(ics).toContain("GEO:1.28;103.85");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("folds long lines by octets without splitting characters", () => {
    const line = "SUMMARY:" + "é".repeat(80);
    const folded = fold(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
  });
  it("marks cancelled events and all-day races", () => {
    const ics = buildCalendar("x", [{ uid: "r", start: new Date(), allDay: "2026-10-10", summary: "Marathon", cancelled: true }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics).toContain("DTEND;VALUE=DATE:20261011");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
