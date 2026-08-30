/** Validates a `?redirect=` query param before it's ever passed to `router.push`.
 *  Next.js's client router falls back to a real browser navigation (`window.location`) for any
 *  URL it doesn't recognize as an internal route, so passing an untrusted value straight through
 *  is an open redirect — `/login?redirect=https://evil.example` would send a user off-site right
 *  after they enter real credentials. A leading single `/` isn't enough on its own: `//evil.example`
 *  and `/\evil.example` are both browser-normalized to an external origin (protocol-relative and
 *  backslash-as-slash tricks), so those are rejected too. */
export function safeRedirectPath(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
