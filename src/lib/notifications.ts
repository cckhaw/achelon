import "server-only";
import type { MemberContext } from "@/lib/context";
import type { RsvpResult } from "@/lib/services/signups";

/** Phase 3 wires email here (RSVP confirmation, waitlist promotion). Phase 2 only needs the hook point. */
export async function afterRsvp(ctx: MemberContext, eventId: string, result: Extract<RsvpResult, { ok: true }>): Promise<void> {
  void ctx; void eventId; void result;
}

export async function afterEventPublished(ctx: MemberContext, eventId: string): Promise<void> { void ctx; void eventId; }
export async function afterEventCancelled(ctx: MemberContext, eventId: string): Promise<void> { void ctx; void eventId; }
export async function afterPromotions(ctx: MemberContext, eventId: string, promoted: string[]): Promise<void> { void ctx; void eventId; void promoted; }
