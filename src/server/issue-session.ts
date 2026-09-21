// Mint and set the session cookie. Shared by login and by the dev panel's "switch person", so
// there is exactly one place that decides what a session looks like and how the cookie is scoped.
//
// Not a "use server" module: it is a helper those actions call, not an action itself.
import { cookies } from "next/headers";
import type { Role } from "@/config/roles";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/features/auth/cookie";

export type SessionUser = { id: string; name: string; handle: string | null; role: string };

export async function issueSession(companyId: string, slug: string, user: SessionUser): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");

  const token = signSession(
    {
      v: 1,
      cid: companyId,
      slug,
      uid: user.id,
      name: user.name,
      handle: user.handle,
      role: user.role as Role,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    secret,
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Scoped to this exact host, never ".<root>" - otherwise one company's subdomain could read
    // another's cookie, which is the isolation we are claiming.
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
