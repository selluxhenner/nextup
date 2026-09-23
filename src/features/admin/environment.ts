// What the server is configured with, as /admin/connections shows it. Pure: takes the env, returns
// rows, never a secret's value - only whether it is set and whether it is still the placeholder
// from .env.example. tests/unit/admin-environment.test.ts.
import type { Tone } from "./nav";

export type EnvRow = { label: string; value: string; tone: Tone; hint?: string };

type Env = Record<string, string | undefined>;

const PLACEHOLDER = "change-me";

function secret(env: Env, key: string, label: string, why: string): EnvRow {
  const v = env[key];
  if (!v) return { label, value: "not set", tone: "bad", hint: why };
  if (v === PLACEHOLDER) return { label, value: "still the .env.example placeholder", tone: "bad", hint: why };
  if (v.length < 16) return { label, value: `set, but only ${v.length} characters`, tone: "warn", hint: "openssl rand -base64 24" };
  return { label, value: "set", tone: "ok" };
}

export function describeEnvironment(env: Env): EnvRow[] {
  const subdomain = env.TENANT_MODE === "subdomain";
  const https = env.PUBLIC_SCHEME === "https";
  return [
    secret(env, "AUTH_SECRET", "AUTH_SECRET", "Signs every session and the admin cookie."),
    secret(env, "ADMIN_ACCESS_CODE", "ADMIN_ACCESS_CODE", "The code that opens this page."),
    {
      label: "Addressing",
      value: subdomain ? `subdomain - acme.${env.APP_DOMAIN ?? "localhost"}` : `path - ${env.APP_DOMAIN ?? "localhost"}/acme`,
      tone: "ok",
    },
    {
      label: "Secure cookies",
      value: env.COOKIE_SECURE === "true" ? "on" : "off",
      tone: https && env.COOKIE_SECURE !== "true" ? "warn" : "ok",
      hint: https && env.COOKIE_SECURE !== "true" ? "Served over https - set COOKIE_SECURE=true." : undefined,
    },
    {
      label: "Admin demo fill",
      value: env.ADMIN_DEMO_FILL === "true" ? "on - the admin code is in the login page source" : "off",
      tone: env.ADMIN_DEMO_FILL === "true" ? "warn" : "ok",
      hint: env.ADMIN_DEMO_FILL === "true" ? "Demo boxes only." : undefined,
    },
    {
      label: "Login demo fill",
      value: env.LOGIN_DEMO_FILL === "true" ? "on - every company opens with the demo code" : "off",
      tone: env.LOGIN_DEMO_FILL === "true" ? "warn" : "ok",
      hint: env.LOGIN_DEMO_FILL === "true" ? "Demo boxes only - never where real people log in." : undefined,
    },
  ];
}
