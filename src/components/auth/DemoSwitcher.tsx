"use client";
// Demo boxes only: "view as" one of a demo company's made-up people, in one click. The page
// renders this only when src/server/demo-login.ts says so, and demoSignIn re-checks it.
import { useFormStatus } from "react-dom";
import { demoSignIn } from "@/server/actions/auth";
import type { DemoPerson } from "@/server/demo-login";
import type { Role } from "@/config/roles";
import styles from "./forms.module.css";

const ROLE_WORD: Record<Role, string> = { member: "Employee", leader: "Team lead", manager: "Manager" };

function Person({ p }: { p: DemoPerson }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.demoPerson} type="submit" name="userId" value={p.id} disabled={pending}>
      <strong>{p.name}</strong>
      {p.line ? <span className="nh-hint">· {p.line}</span> : null}
      <span className={styles.demoRole}>{ROLE_WORD[p.role] ?? p.role}</span>
    </button>
  );
}

export function DemoSwitcher({ slug, next, people }: { slug: string; next?: string; people: DemoPerson[] }) {
  if (people.length === 0) return null;
  return (
    <form className={styles.demo} action={demoSignIn} aria-labelledby="demo-view-as">
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className={styles.demoHead}>
        <strong id="demo-view-as">View the demo as…</strong>
        <span className={styles.demoTag}>Demo only</span>
      </div>
      <p className="nh-hint">Made-up people on a demo box. Real companies never show this list.</p>
      <div className={styles.demoPeople}>
        {people.map((p) => (
          <Person key={p.id} p={p} />
        ))}
      </div>
    </form>
  );
}
