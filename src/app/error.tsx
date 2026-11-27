"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth-wrap" id="main">
      <h1 className="t-large">Something went wrong</h1>
      <p className="muted mt-2 mb-6">We couldn&apos;t load that. It&apos;s been noted. Please try again.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </main>
  );
}
