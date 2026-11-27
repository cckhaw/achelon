"use client";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/[tenant]/me/actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ProfileFields, VisibilityPanel, type ProfileDefaults } from "./ProfileFields";
import { DEFAULT_VISIBILITY, type VisibilityField, type VisibleTo } from "@/db/constants";

export function ProfileForm({ slug, values, visibility }: { slug: string; values: ProfileDefaults; visibility: Partial<Record<VisibilityField, VisibleTo>> }) {
  const [state, action] = useActionState(saveProfileAction.bind(null, slug), undefined);
  return (
    <form onReset={(e) => e.preventDefault()} action={action} className="grid gap-6" noValidate>
      <ProfileFields values={values} errors={state?.fieldErrors} />
      <VisibilityPanel current={visibility} defaults={DEFAULT_VISIBILITY} />
      <FormMessage state={state} />
      <SubmitButton className="btn btn-block" pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
