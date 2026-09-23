// Demo boxes only: a per-company access code the server can derive, so the company login can
// offer a one-click "Demo code" fill and a pretend "Continue with Microsoft".
//
// Real access codes are stored as scrypt hashes and nobody - not even the server - can show one
// again. On a demo box that makes a live walkthrough awkward, so LOGIN_DEMO_FILL=true turns on a
// second code per company: an HMAC of the slug under AUTH_SECRET, shaped like a real one
// ("globex-3f9a-07c2"). It is sent to the browser in the page source; with the flag unset it
// does not exist and is never accepted.
//
// Not a "use server" module: helpers for the auth action and the login page.
import { createHmac, timingSafeEqual } from "node:crypto";

export function demoLoginEnabled(): boolean {
  return process.env.LOGIN_DEMO_FILL === "true" && Boolean(process.env.AUTH_SECRET);
}

/** The demo code for a company, or null when the box is not a demo box. */
export function demoCodeFor(slug: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!demoLoginEnabled() || !secret || !slug) return null;
  const h = createHmac("sha256", secret).update(`demo-access-code:${slug}`).digest("hex");
  return `${slug}-${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

export function isDemoCode(slug: string, code: string): boolean {
  const want = demoCodeFor(slug);
  if (!want) return false;
  const a = Buffer.from(code.normalize("NFKC"));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
