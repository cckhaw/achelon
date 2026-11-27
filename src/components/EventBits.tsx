import Link from "next/link";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { t, type MessageKey } from "@/lib/i18n";
import type { SignupStatus } from "@/db/constants";

/** Date tile in the viewer's zone, used in lists. */
export function DateTile({ month, day }: { month: string; day: string }) {
  return (
    <span aria-hidden="true" style={{ width: "3rem", flex: "none", textAlign: "center", lineHeight: 1.1 }}>
      <span className="t-caps" style={{ display: "block", color: "var(--tint)", fontWeight: 700 }}>{month}</span>
      <span className="t-title" style={{ display: "block" }}>{day}</span>
    </span>
  );
}

export function StatusBadge({ item }: { item: { status: string; mine: SignupStatus | null; capacity: number | null; going: number } }) {
  if (item.status === "cancelled") return <Badge tone="danger">Cancelled</Badge>;
  if (item.status === "draft") return <Badge tone="muted">Draft</Badge>;
  if (item.mine === "going") return <Badge><Icon name="check" width={12} height={12} />{t("signup.going")}</Badge>;
  if (item.mine === "waitlist") return <Badge tone="warn">{t("signup.waitlist")}</Badge>;
  if (item.mine === "maybe") return <Badge tone="muted">{t("signup.maybe")}</Badge>;
  if (item.capacity !== null && item.going >= item.capacity) return <Badge tone="muted">Full</Badge>;
  return null;
}

export const typeLabel = (type: string) => t(`eventType.${type}` as MessageKey);

export function MapsLink({ name, address, lat, lng }: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null }) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(", "));
  const href = lat != null && lng != null ? `https://maps.apple.com/?ll=${lat},${lng}&q=${q || "Meeting point"}` : q ? `https://maps.apple.com/?q=${q}` : null;
  if (!href) return null;
  return <Link href={href} target="_blank" rel="noopener noreferrer">Open in Maps</Link>;
}
