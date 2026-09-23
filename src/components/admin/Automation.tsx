// Whether the n8n half of the loop is actually running. Read-only: every action that changes
// anything here is in n8n itself or in the API token button above, so this renders and nothing
// more - no "use client", no form.
import { describeCompany, type AutomationReport } from "@/features/integrations/automation";
import styles from "@/app/admin/admin.module.css";

// Server-rendered, so this formats in the container's zone unless told otherwise - which would
// print 09:39 here next to the task list's 11:33 for the same moment. One zone for the page.
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.TZ || "Europe/Zurich",
  });
}

export function Automation({ report }: { report: AutomationReport }) {
  const { facts, companies, summary } = report;

  return (
    <div className={styles.grid}>
      <p className={styles.verdict} data-state={summary.state}>
        <span className={styles.dot} aria-hidden="true" />
        {summary.headline}
      </p>
      {summary.next ? <p className="nh-hint">{summary.next}</p> : null}

      <dl className={styles.facts}>
        <dt>Webhook</dt>
        <dd>{facts.hookUrl ? <code>{facts.hookUrl}</code> : "not configured"}</dd>
        <dt>Shared token</dt>
        <dd>{facts.hookTokenSet ? "set" : "not set - the webhook is unauthenticated"}</dd>
        <dt>Instance</dt>
        <dd>
          {facts.reachable === null
            ? "not checked"
            : facts.reachable
              ? "answers /healthz"
              : "no answer"}
        </dd>
      </dl>

      {companies.length === 0 ? null : (
        <div className={styles.rows}>
          {companies.map((c) => (
            <div key={c.slug} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{c.name}</span>
                <span className={styles.rowMeta}>
                  {describeCompany(c)}
                  {c.lastWriteBackAt ? ` · last ${when(c.lastWriteBackAt)}` : null}
                  {c.tokenLastUsedAt && !c.lastWriteBackAt
                    ? ` · token last used ${when(c.tokenLastUsedAt)}`
                    : null}
                </span>
              </div>
              <span className={styles.stage}>{c.writeBacks > 0 ? "working" : "waiting"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
