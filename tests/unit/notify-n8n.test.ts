// The notice n8n receives. buildRaisedNotice is pure, so this needs no server and no n8n.
//
// The rule worth protecting: the notice says where to write back. n8n used to read that from its
// own environment, which meant one instance could only ever answer one app - and it answered that
// one even when the notice had come from somewhere else, so the comment landed in the wrong
// database and the raise looked unanswered forever.
import { afterEach, describe, expect, it } from "vitest";
import { apiBaseForN8n, buildRaisedNotice } from "@/server/notify-n8n";
import { seedTemplate } from "@/features/demo";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const seed = seedTemplate("demo");
const route = seed.routes[0];

function notice(over: { apiBase?: string } = {}) {
  return buildRaisedNotice({
    slug: "acme",
    eventId: "e_1",
    caseId: "c_1",
    payload: { title: "Line 3 stops", body: "every shift", routeId: route.id, fromDept: "Production" },
    seed,
    people: [{ name: route.owner.name, email: "owner@acme.example" }],
    day: 2,
    baseUrl: "http://acme.localhost",
    apiBase: over.apiBase ?? "http://app:3000",
  });
}

describe("apiBaseForN8n", () => {
  it("defaults to the compose service name", () => {
    delete process.env.N8N_CALLBACK_BASE;
    expect(apiBaseForN8n()).toBe("http://app:3000");
  });

  it("is overridable for an app running outside the stack", () => {
    process.env.N8N_CALLBACK_BASE = "http://host.docker.internal:3000";
    expect(apiBaseForN8n()).toBe("http://host.docker.internal:3000");
  });
});

describe("buildRaisedNotice", () => {
  it("carries the write-back address, so n8n answers the app that asked", () => {
    expect(notice().apiBase).toBe("http://app:3000");
    expect(notice({ apiBase: "http://host.docker.internal:3000" }).apiBase).toBe(
      "http://host.docker.internal:3000",
    );
  });

  it("keeps the browser links separate from the callback address", () => {
    // One is for a person clicking in an email, the other for a container calling an API. Inside
    // the Docker network "acme.localhost" is not the app, which is why these must not be merged.
    const n = notice();
    expect(n.links.case).toBe("http://acme.localhost/cases/c_1");
    expect(n.apiBase).not.toBe("http://acme.localhost");
  });

  it("resolves the route owner and their address, which is what the email needs", () => {
    const n = notice();
    expect(n.route.ownerName).toBe(route.owner.name);
    expect(n.route.ownerEmail).toBe("owner@acme.example");
    expect(n.case.dueDay).toBe(2 + seed.promiseDays);
  });

  it("has no owner email when nobody matches, so the workflow skips instead of mailing nowhere", () => {
    const n = buildRaisedNotice({
      slug: "acme",
      eventId: "e_2",
      caseId: "c_2",
      payload: { title: "x", routeId: "no-such-route" },
      seed,
      people: [],
      day: 0,
      baseUrl: "http://acme.localhost",
      apiBase: "http://app:3000",
    });
    expect(n.route.ownerEmail).toBeNull();
  });
});
