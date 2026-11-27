"use client";

export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ paddingTop: "4rem" }} role="alert">
      <h1 className="t-large">Something went wrong</h1>
      <p className="muted mt-2 mb-6">We couldn&apos;t load this screen. Please try again.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
