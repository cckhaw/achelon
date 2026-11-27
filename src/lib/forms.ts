import type { ZodError } from "zod";

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Free-form payload (e.g. a freshly created invite link shown once). */
  data?: Record<string, string>;
}

export function zodState(err: ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    fieldErrors[k] ??= i.message;
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}
export const failure = (error: string): ActionState => ({ ok: false, error });
export const success = (message?: string, data?: Record<string, string>): ActionState => ({ ok: true, message, data });
