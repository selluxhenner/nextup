// What /admin needs to answer "is n8n actually working?": the credential each company was given,
// and what has come back from it.
//
// Both queries name their companies. CaseEvent and ApiToken are tenant tables, so scope.ts
// refuses an unscoped read - and rightly: "every company" is an admin intention, not a property
// of the query. The caller passes the ids it already listed, and `companyId: { in: ids }` is what
// the guard checks for.
import type { CompanyAutomation } from "@/features/integrations/automation";
import { getDb } from "./client";

/** One row per company id given, in that order. Ids that do not exist are skipped. */
export async function automationFor(
  companies: readonly { id: string; slug: string; name: string }[],
): Promise<CompanyAutomation[]> {
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);

  const [tokens, written] = await Promise.all([
    getDb().apiToken.findMany({
      where: { companyId: { in: ids }, name: "n8n" },
      orderBy: { createdAt: "desc" },
      select: { companyId: true, createdAt: true, lastUsedAt: true },
    }),
    // Events appended as system:n8n - the workflow writing the notice back onto the case.
    getDb().caseEvent.groupBy({
      by: ["companyId"],
      where: { companyId: { in: ids }, source: "n8n" },
      _count: { _all: true },
      _max: { ts: true },
    }),
  ]);

  // Newest first from the query, so the first token seen for a company is its current one.
  const newestToken = new Map<string, (typeof tokens)[number]>();
  for (const t of tokens) if (!newestToken.has(t.companyId)) newestToken.set(t.companyId, t);
  const byCompany = new Map(written.map((w) => [w.companyId, w]));

  return companies.map((c) => {
    const token = newestToken.get(c.id);
    const w = byCompany.get(c.id);
    return {
      slug: c.slug,
      name: c.name,
      tokenCreatedAt: token?.createdAt.toISOString() ?? null,
      tokenLastUsedAt: token?.lastUsedAt?.toISOString() ?? null,
      writeBacks: w?._count._all ?? 0,
      lastWriteBackAt: w?._max.ts?.toISOString() ?? null,
    };
  });
}

/** A raise, with whatever the automation did about it. Ordered newest first. */
export type RaiseRow = {
  eventId: string;
  companyId: string;
  caseId: string | null;
  payload: unknown;
  raisedAt: string;
  noticeAt: string | null;
};

/**
 * The last `limit` raises across the companies given, each paired with its write-back.
 *
 * The join is on the idempotency key the workflow sends back (`notify:<eventId>`), so a raise is
 * matched to its own notice and to no other. Two queries rather than a relation: CaseEvent has no
 * self-relation, and inventing one for this would be a schema change.
 */
export async function raisesFor(
  companyIds: readonly string[],
  limit = 25,
): Promise<RaiseRow[]> {
  if (companyIds.length === 0) return [];
  const ids = [...companyIds];

  const raises = await getDb().caseEvent.findMany({
    where: { companyId: { in: ids }, type: "case.raised" },
    orderBy: { seq: "desc" },
    take: limit,
    select: { id: true, companyId: true, targetId: true, payload: true, ts: true },
  });
  if (raises.length === 0) return [];

  const notices = await getDb().caseEvent.findMany({
    where: {
      companyId: { in: ids },
      source: "n8n",
      idemKey: { in: raises.map((r) => "notify:" + r.id) },
    },
    select: { idemKey: true, ts: true },
  });
  const noticeAt = new Map(notices.map((n) => [n.idemKey, n.ts]));

  return raises.map((r) => ({
    eventId: r.id,
    companyId: r.companyId,
    caseId: r.targetId,
    payload: r.payload,
    raisedAt: r.ts.toISOString(),
    noticeAt: noticeAt.get("notify:" + r.id)?.toISOString() ?? null,
  }));
}
