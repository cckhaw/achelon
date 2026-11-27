"use client";
import { useActionState } from "react";
import { disconnectStravaAction, shareStravaAction, syncStravaAction } from "@/app/[tenant]/settings/strava-actions";
import { FormMessage, Group, Row } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export interface StravaView {
  mode: "mock" | "live";
  connected: { shareResults: boolean; derivedLevel: string | null; lastSync: string | null } | null;
  flash: string | null;
}

const FLASH: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Strava is connected." },
  disconnected: { ok: true, text: "Disconnected. Your Strava tokens, event results and badge have been erased." },
  denied: { ok: false, text: "You didn't allow access, so nothing was connected." },
  scope: { ok: false, text: "Achelon needs permission to read your activities to verify your level. Please connect again and leave “View data about your activities” ticked." },
  linked: { ok: false, text: "That Strava account is already linked to another member." },
  error: { ok: false, text: "Something went wrong connecting to Strava. Please try again." },
};

export function StravaPanel({ slug, view }: { slug: string; view: StravaView }) {
  const [synced, sync] = useActionState(syncStravaAction.bind(null, slug), undefined);
  const [shared, share] = useActionState(shareStravaAction.bind(null, slug), undefined);
  const [gone, disconnect] = useActionState(disconnectStravaAction.bind(null, slug), undefined);
  const flash = view.flash ? FLASH[view.flash] : null;
  return (
    <Group title="Strava" id="strava" footer={view.mode === "mock" ? "Demo mode: no real Strava account is used. Activities are simulated." : "Read-only: Achelon can read your profile and your own activities. It can never post, edit or delete anything on Strava."}>
      {flash ? <p className={flash.ok ? "form-ok" : "form-error"} role="status" style={{ margin: "0.75rem 1rem" }}>{flash.text}</p> : null}
      {!view.connected ? (
        <form method="get" action="/api/strava/connect" style={{ padding: "0.75rem 1rem" }} className="grid gap-3">
          <input type="hidden" name="tenant" value={slug} />
          <p>Connect Strava (optional) to earn a <strong>Strava verified</strong> badge when your recent training supports your level, and to appear on event leaderboards.</p>
          <label className="row card">
            <span className="row-main"><span className="row-title block">Show my results on event leaderboards</span><span className="row-sub block">Distance and time for events you attended. You can switch this off any time.</span></span>
            <input type="checkbox" role="switch" className="switch" name="share" defaultChecked />
          </label>
          <button className="btn btn-block">Connect Strava</button>
        </form>
      ) : (
        <>
          <Row title="Connected" sub={view.connected.lastSync ? `Last synced ${view.connected.lastSync}` : "Not synced yet"} value={view.connected.derivedLevel ? `Level: ${view.connected.derivedLevel}` : "Level: not enough data"} />
          <form action={share} style={{ padding: 0 }}>
            <label className="row">
              <span className="row-main"><span className="row-title block">Show my results on event leaderboards</span></span>
              <input type="checkbox" role="switch" className="switch" name="share" defaultChecked={view.connected.shareResults} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            </label>
          </form>
          <div style={{ padding: "0.75rem 1rem" }} className="grid gap-3">
            <FormMessage state={synced ?? shared ?? gone} />
            <form action={sync}><SubmitButton className="btn btn-tinted" pendingLabel="Syncing…">Sync now</SubmitButton></form>
            <form action={disconnect} onSubmit={(e) => { if (!window.confirm("Disconnect Strava? Your tokens, event results and badge are erased.")) e.preventDefault(); }} style={{ marginTop: "0.75rem" }}>
              <SubmitButton className="btn btn-danger" pendingLabel="Disconnecting…">Disconnect Strava</SubmitButton>
            </form>
          </div>
        </>
      )}
    </Group>
  );
}
