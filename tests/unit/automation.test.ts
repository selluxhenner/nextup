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
  const TOKEN = "2026-09-22T10:00:00.000Z";

  it("is off when no hook url is configured", () => {
    const s = summarise(facts({ hookUrl: null }), [company()], 0);
    expect(s.state).toBe("off");
    expect(s.next).toContain(".env");
  });

  it("is unreachable when the instance does not answer", () => {
    expect(summarise(facts({ reachable: false }), [company()], 3).state).toBe("unreachable");
  });

  // The four reasons nothing has come back. They need different answers, and the page used to
  // give the same one to all of them - "import the workflow", even when it was already running.
  it("asks for a token first, because nothing else can work without one", () => {
    const s = summarise(facts(), [company()], 5);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("API token");
  });

  it("says so plainly when nothing has been raised yet", () => {
    const s = summarise(facts(), [company({ tokenCreatedAt: TOKEN })], 0);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("Nothing has been raised");
    expect(s.next).not.toContain("case-raised-notify-owner.json");
  });

  it("points at the workflow when raises exist but n8n never called back", () => {
    const s = summarise(facts(), [company({ tokenCreatedAt: TOKEN })], 4);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("case-raised-notify-owner.json");
  });

  it("points at the credential when n8n reached the API but wrote nothing back", () => {
    // The token was used, so the webhook, the workflow and the email all ran. A 401 on the
    // write-back is the usual cause, and it is not fixed by re-importing anything.
    const s = summarise(facts(), [company({ tokenCreatedAt: TOKEN, tokenLastUsedAt: TOKEN })], 4);
    expect(s.state).toBe("idle");
    expect(s.next).toContain("401");
    expect(s.next).not.toContain("case-raised-notify-owner.json");
  });

  it("is live only once a write-back exists", () => {
    const used = company({ tokenCreatedAt: TOKEN, tokenLastUsedAt: TOKEN });
    expect(summarise(facts(), [used], 4).state).toBe("idle");
    expect(summarise(facts(), [{ ...used, writeBacks: 1 }], 4).state).toBe("live");
  });

  it("counts how many companies are live when only some are", () => {
    const s = summarise(facts(), [company({ writeBacks: 2, tokenCreatedAt: "x" }), company({ slug: "beta" })], 4);
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
