// The demo-box "view as" list (src/server/demo-login.ts). The point of these: it exists ONLY when
// LOGIN_DEMO_FILL=true, and never without a database behind it. (The stage check - demo only -
// needs Postgres and is covered by the login page itself.)
//
// Replaces the tests for the old derived "demo code", which went with the shared company code.
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoLoginEnabled, demoPeopleFor } from "@/server/demo-login";

describe("demo login switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off unless the flag and a secret are both set", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("LOGIN_DEMO_FILL", "false");
    expect(demoLoginEnabled()).toBe(false);
    vi.stubEnv("LOGIN_DEMO_FILL", "true");
    expect(demoLoginEnabled()).toBe(true);
    vi.stubEnv("AUTH_SECRET", "");
    expect(demoLoginEnabled()).toBe(false);
  });

  it("lists nobody when the switch is off", async () => {
    vi.stubEnv("LOGIN_DEMO_FILL", "false");
    expect(await demoPeopleFor("acme")).toEqual([]);
  });

  it("lists nobody without a database, even with the switch on", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("LOGIN_DEMO_FILL", "true");
    vi.stubEnv("DATABASE_URL", "");
    expect(await demoPeopleFor("acme")).toEqual([]);
  });
});
