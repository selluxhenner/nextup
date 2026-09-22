"use client";
// What came in through /contact. One row per request; the only action is "replied".
import { useActionState } from "react";
import { markPilotRequestHandled, type HandledState, type PilotRequestRow } from "@/server/actions/admin";
import styles from "@/app/admin/admin.module.css";

const COUNCIL: Record<string, string> = { yes: "works council", no: "no works council", "not sure": "council: not sure" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PilotRequests({ requests }: { requests: PilotRequestRow[] }) {
  const [state, mark] = useActionState<HandledState, FormData>(markPilotRequestHandled, {});

  if (requests.length === 0) return null;

  return (
    <div className={styles.rows}>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {requests.map((r) => (
        <div key={r.id} className={styles.row} data-handled={r.handledAt ? "" : undefined}>
          <div className={styles.rowMain}>
            <div className={styles.rowName}>
              {r.company} <span className={styles.rowMeta}>- {r.name}</span>
            </div>
            <div className={styles.decision}>{r.decision}</div>
            {r.message ? <p className={styles.rowMessage}>{r.message}</p> : null}
            <div className={styles.rowMeta}>
              <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: pilot request - ${r.company}`)}`}>{r.email}</a>
              {" · "}{COUNCIL[r.council] ?? r.council}
              {" · "}{when(r.createdAt)}
              {r.handledAt ? ` · replied ${when(r.handledAt)}` : null}
            </div>
          </div>
          <form action={mark}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="handled" value={r.handledAt ? "0" : "1"} />
            <button type="submit" className={r.handledAt ? "nh-btn nh-btn-ghost nh-btn-sm" : "nh-btn nh-btn-primary nh-btn-sm"}>
              {r.handledAt ? "Reopen" : "Replied"}
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
