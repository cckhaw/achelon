import { describe, expect, it } from "vitest";
import { formatEventTime, utcToZonedLocal, zonedLocalToUtc } from "@/lib/time";

describe("time zones", () => {
  it("converts wall-clock in a zone to UTC and back", () => {
    const d = zonedLocalToUtc("2026-05-03T07:30", "Asia/Singapore");
    expect(d.toISOString()).toBe("2026-05-02T23:30:00.000Z");
    expect(utcToZonedLocal(d, "Asia/Singapore")).toBe("2026-05-03T07:30");
  });
  it("handles DST (London summer vs winter)", () => {
    expect(zonedLocalToUtc("2026-07-01T08:00", "Europe/London").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(zonedLocalToUtc("2026-01-15T08:00", "Europe/London").toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });
  it("shows viewer zone first and event-local beside it only when different", () => {
    const start = zonedLocalToUtc("2026-05-03T07:30", "Europe/London");
    const same = formatEventTime(start, "Europe/London", "Europe/London", "en-GB");
    expect(same.local).toBeNull();
    const other = formatEventTime(start, "Europe/London", "Asia/Singapore", "en-GB");
    expect(other.local).toMatch(/07:30|7:30/);
    expect(other.primary).toMatch(/14:30|2:30/);
  });
});
