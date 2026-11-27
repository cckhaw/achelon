import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { classifyEngagement, type Engagement } from "@/lib/engagement";

export interface MemberEngagement {
  id: string; name: string; role: string; joinedAt: Date | null; lastActiveAt: Date | null; lastWentAt: Date | null; went90: number; state: Engagement;
}
export interface EventStat { id: string; title: string; startsAt: Date; capacity: number | null; going: number; waitlist: number; type: string }
export interface Insights {
  members: MemberEngagement[];
  events: EventStat[];
  summary: { active30: number; quiet: number; newMembers: number; events90: number; avgGoing: number | null };
}

/** Admin-only (permission `insights.view`). Runs inside withTenant, so RLS keeps it to one community. */
export async function engagementSummary(tx: Tx, now = new Date()): Promise<Insights> {
  const rows = await tx.execute<{ id: string; name: string | null; role: string; joined_at: Date | null; last_active_at: Date | null; last_went: Date | null; went90: number }>(sql`
    SELECT m.id, p.display_name AS name, m.role, m.joined_at, m.last_active_at,
           (SELECT max(e.starts_at) FROM event_signups s JOIN events e ON e.id = s.event_id
             WHERE s.membership_id = m.id AND s.status = 'going' AND e.status = 'published' AND e.starts_at <= ${now}) AS last_went,
           (SELECT count(*)::int FROM event_signups s JOIN events e ON e.id = s.event_id
             WHERE s.membership_id = m.id AND s.status = 'going' AND e.status = 'published'
               AND e.starts_at <= ${now} AND e.starts_at > ${now}::timestamptz - interval '90 days') AS went90
      FROM memberships m LEFT JOIN member_profiles p ON p.membership_id = m.id
     WHERE m.status = 'active' AND m.role <> 'guest'
     ORDER BY p.display_name`);
  const members: MemberEngagement[] = rows.rows.map((r) => {
    const joinedAt = r.joined_at ? new Date(r.joined_at) : null, lastActiveAt = r.last_active_at ? new Date(r.last_active_at) : null, lastWentAt = r.last_went ? new Date(r.last_went) : null;
    return { id: r.id, name: r.name ?? "Member", role: r.role, joinedAt, lastActiveAt, lastWentAt, went90: Number(r.went90), state: classifyEngagement({ joinedAt, lastActiveAt, lastWentAt, now }) };
  });

  const ev = await tx.execute<{ id: string; title: string; starts_at: Date; capacity: number | null; type: string; going: number; waitlist: number }>(sql`
    SELECT e.id, e.title, e.starts_at, e.capacity, e.type,
           (SELECT count(*)::int FROM event_signups s WHERE s.event_id = e.id AND s.status = 'going') AS going,
           (SELECT count(*)::int FROM event_signups s WHERE s.event_id = e.id AND s.status = 'waitlist') AS waitlist
      FROM events e WHERE e.status = 'published' AND e.starts_at <= ${now} AND e.starts_at > ${now}::timestamptz - interval '90 days'
     ORDER BY e.starts_at DESC LIMIT 30`);
  const events: EventStat[] = ev.rows.map((r) => ({ id: r.id, title: r.title, startsAt: new Date(r.starts_at), capacity: r.capacity, type: r.type, going: Number(r.going), waitlist: Number(r.waitlist) }));

  return {
    members, events,
    summary: {
      active30: members.filter((m) => m.state === "active" || m.state === "new").length,
      quiet: members.filter((m) => m.state === "quiet").length,
      newMembers: members.filter((m) => m.state === "new").length,
      events90: events.length,
      avgGoing: events.length ? Math.round((events.reduce((s, e) => s + e.going, 0) / events.length) * 10) / 10 : null,
    },
  };
}
