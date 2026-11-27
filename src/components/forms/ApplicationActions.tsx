"use client";
import { useActionState } from "react";
import { approveApplicationAction, declineApplicationAction } from "@/app/[tenant]/admin/applications/actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ApplicationActions({ slug, id, isMember }: { slug: string; id: string; isMember: boolean }) {
  const [a, approve] = useActionState(approveApplicationAction.bind(null, slug, id), undefined);
  const [d, decline] = useActionState(declineApplicationAction.bind(null, slug, id), undefined);
  return (
    <div className="grid gap-2" style={{ padding: "0 1rem 0.75rem" }}>
      <FormMessage state={a ?? d} />
      <div className="flex flex-wrap items-center justify-between" style={{ gap: "1.5rem" }}>
        <form action={approve}><SubmitButton className="btn btn-sm" pendingLabel="Approving…">{isMember ? "Approve anyway" : "Approve and invite"}</SubmitButton></form>
        <form action={decline} onSubmit={(e) => { if (!window.confirm("Decline this nomination?")) e.preventDefault(); }}><SubmitButton className="btn btn-danger btn-sm" pendingLabel="Declining…">Decline</SubmitButton></form>
      </div>
    </div>
  );
}
