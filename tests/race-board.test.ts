import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { groupRaces, normaliseRaceName } from "@/lib/services/race-board";
import { declareRace, joinRace, listRaces, racersForEvent, removeRace, setRaceVisibility } from "@/lib/services/races";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>;
beforeAll(async () => { T = await makeTenant(); });
afterAll(closePools);

const mk = (m: Awaited<ReturnType<typeof makeMember>>) => ({ tenantId: T.id, membershipId: m.membership.id, role: m.membership.role });
const input = (o: Partial<Parameters<typeof declareRace>[2]> = {}) => ({ raceName: "Sentosa Half Marathon", raceDate: "2027-01-10", location: "Sentosa", distance: "21.1 km", goalTime: "1:45:00", visibleTo: "members" as const, externalEventId: null, ...o });

describe("race grouping (pure)", () => {
  it("normalises names", () => {
    expect(normaliseRaceName("Sentosa  Half-Marathon!")).toBe("sentosa half marathon");
    expect(normaliseRaceName("Zürich Marathon")).toBe("zurich marathon");
  });
  it("groups by event link, else by normalised name and date", () => {
    const item = (o: Record<string, unknown>) => ({ id: Math.random().toString(), membershipId: "m", memberName: "x", mine: false, raceName: "R", raceDate: "2027-01-10", location: null, distance: null, goalTime: null, visibleTo: "members" as const, externalEventId: null, ...o });
    const g = groupRaces([item({ raceName: "Sentosa Half-Marathon", distance: "21k" }), item({ raceName: "sentosa half marathon", distance: "10k" }), item({ raceName: "Other", raceDate: "2027-02-01" }), item({ raceName: "Linked A", externalEventId: "e1" }), item({ raceName: "Linked B", externalEventId: "e1", raceDate: "2027-01-10" })] as never);
    expect(g).toHaveLength(3);
    const sentosa = g.find((x) => x.key.startsWith("n:sentosa"))!;
    expect(sentosa.entries).toHaveLength(2);
    expect(sentosa.distances.sort()).toEqual(["10k", "21k"]);
    expect(g.find((x) => x.externalEventId === "e1")!.entries).toHaveLength(2);
  });
});

describe("race declarations and visibility", () => {
  it("members see others' 'members' races but never their goal times; 'nobody' races stay private", async () => {
    const a = await makeMember(T.id, { name: "Ana Runner" });
    const b = await makeMember(T.id, { name: "Ben Runner" });
    await withTenant(T.id, async (tx) => {
      await declareRace(tx, mk(a), input({ raceName: "Public Race", goalTime: "3:30" }));
      await declareRace(tx, mk(a), input({ raceName: "Secret Race", visibleTo: "nobody" }));
    });
    const asB = await withTenant(T.id, (tx) => listRaces(tx, mk(b)));
    expect(asB.map((r) => r.raceName)).toContain("Public Race");
    expect(asB.map((r) => r.raceName)).not.toContain("Secret Race");
    expect(asB.find((r) => r.raceName === "Public Race")?.goalTime).toBeNull();
    const asA = await withTenant(T.id, (tx) => listRaces(tx, mk(a)));
    expect(asA.find((r) => r.raceName === "Public Race")?.goalTime).toBe("3:30");
    expect(asA.map((r) => r.raceName)).toContain("Secret Race");
  });

  it("guests see no races; paused/left members' races disappear", async () => {
    const g = await makeMember(T.id, { role: "guest" });
    expect(await withTenant(T.id, (tx) => listRaces(tx, mk(g)))).toEqual([]);
    const gone = await makeMember(T.id, { name: "Gone Runner" });
    const viewer = await makeMember(T.id);
    await withTenant(T.id, (tx) => declareRace(tx, mk(gone), input({ raceName: "Gone Race" })));
    await sysDb().update(schema.memberships).set({ status: "paused" }).where(eq(schema.memberships.id, gone.membership.id));
    expect((await withTenant(T.id, (tx) => listRaces(tx, mk(viewer)))).map((r) => r.raceName)).not.toContain("Gone Race");
  });

  it("'I'm going too' copies the race without the goal time, once", async () => {
    const a = await makeMember(T.id);
    const b = await makeMember(T.id);
    const id = await withTenant(T.id, (tx) => declareRace(tx, mk(a), input({ raceName: "Join Me 10k", goalTime: "40:00" })));
    expect(await withTenant(T.id, (tx) => joinRace(tx, mk(b), id))).toBe(true);
    expect(await withTenant(T.id, (tx) => joinRace(tx, mk(b), id))).toBe(true);
    const mine = (await withTenant(T.id, (tx) => listRaces(tx, mk(b)))).filter((r) => r.mine && r.raceName === "Join Me 10k");
    expect(mine).toHaveLength(1);
    expect(mine[0].goalTime).toBeNull();
  });

  it("can't join a race you can't see, nor delete or re-scope someone else's", async () => {
    const a = await makeMember(T.id);
    const b = await makeMember(T.id);
    const hidden = await withTenant(T.id, (tx) => declareRace(tx, mk(a), input({ raceName: "Hidden", visibleTo: "nobody" })));
    expect(await withTenant(T.id, (tx) => joinRace(tx, mk(b), hidden))).toBe(false);
    const open = await withTenant(T.id, (tx) => declareRace(tx, mk(a), input({ raceName: "Open Race" })));
    await withTenant(T.id, (tx) => removeRace(tx, b.membership.id, open));
    await withTenant(T.id, (tx) => setRaceVisibility(tx, b.membership.id, open, "nobody"));
    const still = await sysDb().select().from(schema.raceDeclarations).where(eq(schema.raceDeclarations.id, open));
    expect(still[0].visibleTo).toBe("members");
  });

  it("linking to an external_race event shows racers on that event; non-race events are ignored", async () => {
    const a = await makeMember(T.id);
    const [race] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "external_race", title: "City Marathon", startsAt: new Date(Date.now() + 40 * 86400000), timezone: "UTC", status: "published" }).returning();
    const [ride] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Ride", startsAt: new Date(Date.now() + 4 * 86400000), timezone: "UTC", status: "published" }).returning();
    await withTenant(T.id, async (tx) => {
      await declareRace(tx, mk(a), input({ raceName: "City Marathon", externalEventId: race.id }));
      await declareRace(tx, mk(a), input({ raceName: "Not a race event", externalEventId: ride.id }));
    });
    expect((await withTenant(T.id, (tx) => racersForEvent(tx, mk(a), race.id))).map((r) => r.raceName)).toEqual(["City Marathon"]);
    expect(await withTenant(T.id, (tx) => racersForEvent(tx, mk(a), ride.id))).toEqual([]);
  });
});
