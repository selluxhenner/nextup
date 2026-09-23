// The demo-box login code (src/server/demo-login.ts). The point of these: it exists ONLY when
// LOGIN_DEMO_FILL=true, and one company's demo code never opens another.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCodeFor, isDemoCode } from "@/server/demo-login";

describe("demo login code", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("LOGIN_DEMO_FILL", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("looks like a real code and is stable", () => {
    const code = demoCodeFor("globex");
    expect(code).toMatch(/^globex-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(demoCodeFor("globex")).toBe(code);
  });

  it("opens its own company only", () => {
    const code = demoCodeFor("globex")!;
    expect(isDemoCode("globex", code)).toBe(true);
    expect(isDemoCode("acme", code)).toBe(false);
    expect(isDemoCode("globex", code + "x")).toBe(false);
  });

  it("does not exist without the flag", () => {
    const code = demoCodeFor("globex")!;
    vi.stubEnv("LOGIN_DEMO_FILL", "false");
    expect(demoCodeFor("globex")).toBeNull();
    expect(isDemoCode("globex", code)).toBe(false);
  });

  it("depends on AUTH_SECRET", () => {
    const code = demoCodeFor("globex");
    vi.stubEnv("AUTH_SECRET", "other-secret");
    expect(demoCodeFor("globex")).not.toBe(code);
  });
});
