// Tell n8n that a case was raised.
//
// A departure from docs/INTEGRATIONS.md, which chose polling on the premise that "a Vercel
// function cannot reliably retry a failed webhook". We are not on Vercel: the app and n8n share
// a Docker network, so this is one in-network hop with no internet and no TLS. It matters for
// the demo beat - the owner is notified while people are watching, not up to a minute later.
//
// The reliability objection is handled by never blocking on it. This is called AFTER the event
// row has committed, the promise is not awaited by the caller, and every failure is swallowed.
// n8n being down cannot break the core loop, which is the rule that doc actually cares about.
// GET /api/[company]/events?since= remains, so a catch-up workflow can exist alongside this.
//
// The APP resolves the route owner, not n8n: the seed already has the routing table, and keeping
// n8n dumb avoids a second endpoint just to expose it.
import type { EventPayload } from "@/features/cases/events";
import type { Seed } from "@/features/demo/types";

export type RaisedNotice = {
  eventId: string;
  slug: string;
  type: "case.raised";
  day: number;
  case: {
    id: string;
    title: string;
    body: string;
    from: string;
    routeId: string | null;
    dueDay: number;
  };
  route: {
    id: string | null;
    label: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    deputyName: string | null;
  };
  links: { inbox: string; case: string };
};

type People = { name: string; email: string }[];

/** Build the message. Pure enough to reason about; no fetch, no env. */
export function buildRaisedNotice(args: {
  slug: string;
  eventId: string;
  caseId: string;
  payload: EventPayload;
  seed: Seed;
  people: People;
  day: number;
  baseUrl: string;
}): RaisedNotice {
  const { slug, eventId, caseId, payload, seed, people, day, baseUrl } = args;
  const route = seed.routes.find((r) => r.id === payload.routeId) ?? null;
  const ownerName = route?.owner.name ?? payload.assignee ?? null;
  const ownerEmail = ownerName ? (people.find((p) => p.name === ownerName)?.email ?? null) : null;

  return {
    eventId,
    slug,
    type: "case.raised",
    day,
    case: {
      id: caseId,
      title: payload.title ?? "Untitled",
      body: payload.body ?? "",
      from: payload.fromDept ?? "",
      routeId: payload.routeId ?? null,
      dueDay: day + seed.promiseDays,
    },
    route: {
      id: route?.id ?? null,
      label: route?.type ?? null,
      ownerName,
      ownerEmail,
      deputyName: route?.deputy ?? null,
    },
    links: { inbox: `${baseUrl}/leader`, case: `${baseUrl}/cases/${caseId}` },
  };
}

/**
 * Fire and forget. Never throws, never blocks: the caller does not await it, and a failure is a
 * log line rather than a broken raise.
 */
export function notifyCaseRaised(notice: RaisedNotice): void {
  const url = process.env.N8N_HOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  void fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.N8N_HOOK_TOKEN ? { "x-nextup-token": process.env.N8N_HOOK_TOKEN } : {}),
    },
    body: JSON.stringify(notice),
    signal: controller.signal,
  })
    .catch(() => {
      // n8n down, wrong URL, timeout - all fine. The case is already saved; the notification is
      // the optional half. A catch-up workflow can poll GET ?since= for anything missed.
      console.warn("[n8n] could not deliver case.raised notice for", notice.slug);
    })
    .finally(() => clearTimeout(timeout));
}

/** Where this company lives, for the deep links in the message. */
export function companyBaseUrl(slug: string): string {
  const domain = process.env.APP_DOMAIN ?? "localhost";
  const scheme = process.env.PUBLIC_SCHEME ?? "http";
  return process.env.TENANT_MODE === "subdomain"
    ? `${scheme}://${slug}.${domain}`
    : `${scheme}://${domain}/${slug}`;
}
