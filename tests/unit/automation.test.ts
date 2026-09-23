// The /admin automation verdict. Pure, so no server and no n8n: the point is that each state is
// reachable and that a write-back - not a successful ping - is what counts as "working".
import { describe, expect, it } from "vitest";
import {
  describeCompany,
  healthUrlFrom,
  summarise,
  type CompanyAutomation,
  type InstanceFacts,
} from "@/features/integrations/automation";

const HOOK = "http://n8n:5678/webhook/nextup/case-raised";

const facts = (over: Partial<InstanceFacts> = {}): InstanceFacts => ({
  hookUrl: HOOK,
  hookTokenSet: true,
  reachable: true,
  ...over,
});

const company = (over: Partial<CompanyAutomation> = {}): CompanyAutomation => ({
  slug: "acme",
  name: "Acme",
  tokenCreatedAt: null,
  tokenLastUsedAt: null,
  writeBacks: 0,
  lastWriteBackAt: null,
  ...over,
});

describe("healthUrlFrom", () => {
  it("replaces the webhook path with /healthz", () => {
    expect(healthUrlFrom(HOOK)).toBe("http://n8n:5678/healthz");
  });

  it("is null for an unset or unparseable url, rather than throwing", () => {
    expect(healthUrlFrom(null)).toBeNull();
    expect(healthUrlFrom("not a url")).toBeNull();
  });
});

describe("summarise", () => {
  it("is off when no hook url is configured", () => {
    const s = summarise(facts({ hookUrl: null }), [company()]);
    expect(s.state).toBe("off");
    expect(s.next).toContain(".env");
  });

  it("is unreachable when the instance does not answer", () => {
    expect(summarise(facts({ reachable: false }), [company()]).state).toBe("unreachable");
  });

  it("is idle while nothing has come back, and says a token is missing first", () => {
    const s = summarise(facts(), [company()]);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("API token");
  });

  it("points at the workflow once a token exists but nothing has come back", () => {
    const s = summarise(facts(), [company({ tokenCreatedAt: "2026-09-22T10:00:00.000Z" })]);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("case-raised-notify-owner.json");
  });

  // The rule this file exists for: a reachable instance is not a working one.
  it("is live only once a write-back exists", () => {
    const used = company({ tokenCreatedAt: "2026-09-22T10:00:00.000Z", tokenLastUsedAt: "2026-09-22T10:05:00.000Z" });
    expect(summarise(facts(), [used]).state).toBe("idle");
    expect(summarise(facts(), [{ ...used, writeBacks: 1 }]).state).toBe("live");
  });

  it("counts how many companies are live when only some are", () => {
    const s = summarise(facts(), [company({ writeBacks: 2, tokenCreatedAt: "x" }), company({ slug: "beta" })]);
    expect(s.state).toBe("live");
    expect(s.headline).toContain("1 of 2");
    expect(s.next).toBeNull();
  });
});

describe("describeCompany", () => {
  it("distinguishes no token, unused, used-but-silent, and working", () => {
    expect(describeCompany(company())).toContain("No API token");
    expect(describeCompany(company({ tokenCreatedAt: "x" }))).toContain("never used");
    expect(describeCompany(company({ tokenCreatedAt: "x", tokenLastUsedAt: "y" }))).toContain("no write-back");
    expect(describeCompany(company({ tokenCreatedAt: "x", writeBacks: 1 }))).toBe("1 write-back from n8n.");
    expect(describeCompany(company({ tokenCreatedAt: "x", writeBacks: 3 }))).toBe("3 write-backs from n8n.");
  });
});
