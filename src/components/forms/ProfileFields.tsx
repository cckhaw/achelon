import { LEVELS, OPEN_TO, SPORTS, VISIBILITY_FIELDS, VISIBLE_TO, type VisibilityField, type VisibleTo } from "@/db/constants";
import { Field, Group, describedBy } from "@/components/ui";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { formatPace } from "@/lib/validation";
import { t, type MessageKey } from "@/lib/i18n";
import type { ProfileData } from "@/lib/visibility";

export type ProfileDefaults = Partial<Pick<ProfileData, "displayName" | "jobTitle" | "company" | "city" | "country" | "timezone" | "bio" | "sports" | "level" | "openTo" | "photoUrl">> & {
  typicalPaceRunSecPerKm?: number | null;
  typicalSpeedRideKmh?: string | null;
};

const FIELD_LABELS: Record<VisibilityField, string> = {
  job_title: "Job title", company: "Company", city: "City", country: "Country", bio: "About you", sports: "Sports",
  level: "Level", pace: "Typical run pace", speed: "Typical ride speed", open_to: "Open to", photo: "Photo", strava: "Strava verified badge",
};

export function ProfileFields({ values = {}, errors = {} }: { values?: ProfileDefaults; errors?: Record<string, string> }) {
  const e = (k: string) => errors[k];
  return (
    <div className="grid gap-4">
      <Field label="Name" name="displayName" error={e("displayName")} hint="Shown to other members.">
        <input id="displayName" name="displayName" className="input" required maxLength={80} autoComplete="name" defaultValue={values.displayName ?? ""} {...describedBy("displayName", e("displayName"), true)} />
      </Field>
      <Field label="Job title" name="jobTitle" error={e("jobTitle")}>
        <input id="jobTitle" name="jobTitle" className="input" maxLength={100} autoComplete="organization-title" defaultValue={values.jobTitle ?? ""} {...describedBy("jobTitle", e("jobTitle"))} />
      </Field>
      <Field label="Company" name="company" error={e("company")}>
        <input id="company" name="company" className="input" maxLength={100} autoComplete="organization" defaultValue={values.company ?? ""} {...describedBy("company", e("company"))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" name="city" error={e("city")}>
          <input id="city" name="city" className="input" maxLength={80} autoComplete="address-level2" defaultValue={values.city ?? ""} {...describedBy("city", e("city"))} />
        </Field>
        <Field label="Country" name="country" error={e("country")}>
          <input id="country" name="country" className="input" maxLength={80} autoComplete="country-name" defaultValue={values.country ?? ""} {...describedBy("country", e("country"))} />
        </Field>
      </div>
      <Field label="Time zone" name="timezone" error={e("timezone")} hint="Used to show event times in your local time. Only you and admins can see it.">
        <TimezoneSelect defaultValue={values.timezone ?? ""} blankLabel="Same as the community default" {...describedBy("timezone", e("timezone"), true)} />
      </Field>
      <fieldset>
        <legend className="field-label">Sports</legend>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => (
            <label key={s} className="chip"><input type="checkbox" name="sports" value={s} defaultChecked={values.sports?.includes(s)} /><span>{t(`sport.${s}` as MessageKey)}</span></label>
          ))}
        </div>
      </fieldset>
      <Field label="Level" name="level" error={e("level")}>
        <select id="level" name="level" className="select" defaultValue={values.level ?? ""} {...describedBy("level", e("level"))}>
          <option value="">Not set</option>
          {LEVELS.map((l) => <option key={l} value={l}>{t(`level.${l}` as MessageKey)}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Typical run pace (min/km)" name="pace" error={e("pace")} hint="For example 5:30">
          <input id="pace" name="pace" className="input" inputMode="numeric" placeholder="5:30" defaultValue={values.typicalPaceRunSecPerKm ? formatPace(values.typicalPaceRunSecPerKm) : ""} {...describedBy("pace", e("pace"), true)} />
        </Field>
        <Field label="Typical ride speed (km/h)" name="speed" error={e("speed")} hint="For example 30">
          <input id="speed" name="speed" className="input" inputMode="decimal" placeholder="30" defaultValue={values.typicalSpeedRideKmh ?? ""} {...describedBy("speed", e("speed"), true)} />
        </Field>
      </div>
      <fieldset>
        <legend className="field-label">Open to</legend>
        <div className="flex flex-wrap gap-2">
          {OPEN_TO.map((o) => (
            <label key={o} className="chip"><input type="checkbox" name="openTo" value={o} defaultChecked={values.openTo?.includes(o)} /><span>{t(`openTo.${o}` as MessageKey)}</span></label>
          ))}
        </div>
      </fieldset>
      <Field label="About you" name="bio" error={e("bio")} hint="A line or two. Up to 600 characters.">
        <textarea id="bio" name="bio" className="textarea" maxLength={600} defaultValue={values.bio ?? ""} {...describedBy("bio", e("bio"), true)} />
      </Field>
      <Field label="Photo link (optional)" name="photoUrl" error={e("photoUrl")} hint="An https:// link to an image. Your browser and your viewers' browsers fetch it directly, so use one you're comfortable sharing.">
        <input id="photoUrl" name="photoUrl" className="input" type="url" inputMode="url" autoCapitalize="none" defaultValue={values.photoUrl ?? ""} {...describedBy("photoUrl", e("photoUrl"), true)} />
      </Field>
    </div>
  );
}

const VIS_HELP: Record<VisibleTo, string> = { nobody: "Only you", admins: "Admins only", members: "All members" };

/** "Who can see what": one native picker per field. Defaults are conservative; the choice is the member's. */
export function VisibilityPanel({ current, defaults }: { current: Partial<Record<VisibilityField, VisibleTo>>; defaults: Record<VisibilityField, VisibleTo> }) {
  return (
    <Group
      id="vis"
      title="Who can see what"
      footer="Your name is always visible to members. Admins can also see your email address. You can change these any time."
    >
      {VISIBILITY_FIELDS.map((f) => {
        const id = `vis_${f}`;
        return (
          <div className="row" key={f}>
            <label htmlFor={id} className="row-main row-title">{FIELD_LABELS[f]}</label>
            <select id={id} name={id} className="select" style={{ width: "auto", minWidth: "9.5rem" }} defaultValue={current[f] ?? defaults[f]}>
              {VISIBLE_TO.map((v) => <option key={v} value={v}>{VIS_HELP[v]}</option>)}
            </select>
          </div>
        );
      })}
    </Group>
  );
}
