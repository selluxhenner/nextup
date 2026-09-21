"use client";
// Existing companies: where each one lives, how much is in it, and the two destructive actions.
import { useActionState } from "react";
import {
  deleteCompanyAction,
  rotateAccessCodeAction,
  type CompanyRow,
  type RotateState,
} from "@/server/actions/admin";
import styles from "@/app/admin/admin.module.css";

export function CompanyList({ companies }: { companies: CompanyRow[] }) {
  const [rotated, rotate] = useActionState<RotateState, FormData>(rotateAccessCodeAction, {});
  const [removed, remove] = useActionState<RotateState, FormData>(deleteCompanyAction, {});

  if (companies.length === 0) return null;

  return (
    <div className={styles.rows}>
      {rotated.accessCode ? (
        <div className={styles.ok}>
          <strong>New access code for {rotated.slug}</strong>
          <div className={styles.code}>{rotated.accessCode}</div>
          <p className="nh-hint">The previous code stopped working the moment this was made.</p>
        </div>
      ) : null}
      {rotated.error ? <p className={styles.error} role="alert">{rotated.error}</p> : null}
      {removed.error ? <p className={styles.error} role="alert">{removed.error}</p> : null}

      {companies.map((c) => (
        <div key={c.id} className={styles.row}>
          <div className={styles.rowMain}>
            <span className={styles.rowName}>{c.name}</span>
            <span className={styles.rowMeta}>
              <a href={c.url}>{c.url}</a> · {c.people} {c.people === 1 ? "person" : "people"} ·{" "}
              {c.events} {c.events === 1 ? "event" : "events"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={styles.stage}>{c.stage}</span>
            <form action={rotate}>
              <input type="hidden" name="slug" value={c.slug} />
              <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit">New code</button>
            </form>
            <form
              action={remove}
              onSubmit={(e) => {
                const typed = window.prompt(`Delete ${c.slug}? This takes its people and its whole history with it. Type the slug to confirm.`);
                if (typed === null) { e.preventDefault(); return; }
                (e.currentTarget.elements.namedItem("confirm") as HTMLInputElement).value = typed;
              }}
            >
              <input type="hidden" name="slug" value={c.slug} />
              <input type="hidden" name="confirm" defaultValue="" />
              <button className={`nh-btn nh-btn-ghost nh-btn-sm ${styles.danger}`} type="submit">Delete</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
