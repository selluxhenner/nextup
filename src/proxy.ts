// Request proxy (Next 16 name for middleware). Phase 2 wires it up:
//   1. Tenant: with TENANT_MODE=subdomain, rewrite acme.nextup.app/* -> /acme/*  (path mode needs nothing).
//   2. Auth: any /[company]/(app) path without a session -> /[company]/login?next=...
//   3. Role: ROLE_ACCESS from src/config/roles.ts.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  void request;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\..*).*)"],
};
