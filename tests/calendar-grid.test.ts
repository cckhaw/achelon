import { describe, expect, it } from "vitest";
import { addDays, addMonths, monthGrid, validMonth } from "@/lib/calendar-grid";

describe("month grid", () => {
  it("covers the month in whole weeks, Monday first", () => {
    const g = monthGrid("2026-05", 1); // 1 May 2026 is a Friday
    expect(g.weeks[0][0]).toBe("2026-04-27");
    expect(g.weeks[0][4]).toBe("2026-05-01");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weeks.at(-1)!.at(-1)).toBe("2026-05-31");
  });
  it("supports Sunday-first", () => {
    const g = monthGrid("2026-05", 7);
    expect(g.weeks[0][0]).toBe("2026-04-26");
    expect(g.weeks[0][5]).toBe("2026-05-01");
  });
  it("handles leap February and year boundaries", () => {
    expect(monthGrid("2028-02", 1).weeks.flat()).toContain("2028-02-29");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("validates month params", () => {
    expect(validMonth("2026-05")).toBe(true);
    expect(validMonth("2026-13")).toBe(false);
    expect(validMonth("../etc")).toBe(false);
    expect(validMonth(undefined)).toBe(false);
  });
});
