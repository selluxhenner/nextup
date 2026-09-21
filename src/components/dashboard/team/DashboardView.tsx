"use client";
// The dashboard: problems and ideas as one list - how long open, whose desk (and every desk
// before that), what stage, and the score. Click a row for the full case. Rows are facts from
// dashboardRow(); nothing is stored. Who sees what: an employee opens on "Mine" (the filter
// stays); a team leader sees their branch and their own (derive.inBranch); a manager sees all.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { inBranch } from "@/components/dashboard/derive";
import { Avatar, Pill, statusTone } from "@/components/dashboard/shared/primitives";
import { dashboardRow, type DashRow } from "@/features/cases/rows";
import { scoreBand } from "@/features/scoring";
import styles from "./DashboardView.module.css";

type Filter = "all" | "problem" | "idea" | "mine";
type Sort = "score" | "open" | "new";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "problem", label: "Problems" }, { id: "idea", label: "Ideas" }, { id: "mine", label: "Mine" },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "Score" }, { id: "open", label: "Longest open" }, { id: "new", label: "Newest" },
];

const stageTone = (s: DashRow["stage"]) => (s === "Read" ? "soft" : s === "Question" ? "accent" : statusTone(s));

export function DashboardView() {
  const ctx = useDemo();
  const { seed, D, log, persona, role, ready, href } = ctx;
  const [picked, setPicked] = useState<Filter | null>(null); // null = the role's default, decided once the persona is known
  const [sort, setSort] = useState<Sort>("score");
  if (!ready) return <div className={styles.loading} />;
  const filter: Filter = picked ?? (role === "member" ? "mine" : "all");
  const setFilter = setPicked;

  const who = persona.who;
  const rows = D.cases.filter((c) => inBranch(ctx, c)).map((c) => dashboardRow(c, seed.promiseDays, who, log));
  const counts: Record<Filter, number> = {
    all: rows.length, problem: rows.filter((r) => r.kind === "problem").length, idea: rows.filter((r) => r.kind === "idea").length, mine: rows.filter((r) => r.mine).length,
  };
  const shown = rows
    .filter((r) => (filter === "all" ? true : filter === "mine" ? r.mine : r.kind === filter))
    .sort((a, b) => {
      // Open before closed, then by the chosen sort.
      if (a.open !== b.open) return a.open ? -1 : 1;
      if (sort === "score") return b.score.value - a.score.value;
      if (sort === "open") return b.openDays - a.openDays;
      return b.sortDay - a.sortDay;
    });
  const open = rows.filter((r) => r.open).length, late = rows.filter((r) => r.overdue).length;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.sub}>{role === "leader" ? ctx.deptName(persona.role.dept) + " and your own · " : ""}{open} open · {late ? late + " past the " + seed.promiseDays + "-day promise" : "all inside the " + seed.promiseDays + "-day promise"}</p>
        </div>
        <div className={styles.tools}>
          <div className={styles.chips} role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={styles.chip} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}<span className={styles.chipN}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className={styles.sort}>
            <span className={styles.sortL}>Sort</span>
            <select className={styles.sortSel} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.list} role="table" aria-label="Problems and ideas">
        <div className={`${styles.row} ${styles.rowHead}`} role="row">
          <span role="columnheader" className={styles.cTitle}>What</span>
          <span role="columnheader" className={styles.cOpen}>Open since</span>
          <span role="columnheader" className={styles.cStage}>Stage</span>
          <span role="columnheader" className={styles.cChain}>On whose desk</span>
          <span role="columnheader" className={styles.cScore}>Score</span>
        </div>
        {shown.length === 0 && (
          <div className={styles.empty}>
            {filter === "mine" ? "You have not raised anything yet." : "Nothing here yet."} <Link href={href("/raise")} className={styles.emptyLink}>Raise the first one →</Link>
          </div>
        )}
        {shown.map((r) => (
          <Link key={r.id} href={href("/cases/" + r.id)} className={styles.row} role="row" data-kind={r.kind} data-open={r.open ? "true" : undefined}>
            <span role="cell" className={styles.cTitle}>
              <span className={styles.rowTitle}>{r.title}</span>
              <span className={styles.rowFrom}>
                <Avatar name={r.from} size="sm" tone="color" /> {r.mine ? "you" : r.from} · {r.fromDept}
                <span className={styles.kindTag} data-kind={r.kind}>{r.kind}</span>
                {r.fresh && <span className={styles.newTag}>new</span>}
                {r.affected.length > 0 && <span className={styles.meta}>+{r.affected.length} affected</span>}
                {r.attachments > 0 && <span className={styles.meta}>{r.attachments} screenshot{r.attachments > 1 ? "s" : ""}</span>}
              </span>
            </span>
            <span role="cell" className={styles.cOpen} data-overdue={r.overdue ? "true" : undefined}>
              {r.open ? <><strong className={styles.days}>{r.openDays} d</strong>{r.overdue && <span className={styles.late}>past promise</span>}</> : <span className={styles.closed}>closed</span>}
            </span>
            <span role="cell" className={styles.cStage}><Pill tone={stageTone(r.stage)}>{r.stage}</Pill></span>
            <span role="cell" className={styles.cChain}>
              {r.chain.map((name, i) => (
                <span key={i} className={styles.hop} data-last={i === r.chain.length - 1 ? "true" : undefined} data-auto={r.escalated && i === r.chain.length - 1 ? "true" : undefined}>
                  {i > 0 && <span className={styles.arrow} aria-hidden="true">→</span>}
                  <Avatar name={name} size="sm" tone="color" />{name}
                </span>
              ))}
              {r.escalated && <span className={styles.auto}>auto-escalated</span>}
            </span>
            <span role="cell" className={styles.cScore} title={r.score.parts.map((p) => "+" + p.points + " " + p.label).join("\n") || "Base score only"}>
              <span className={styles.scoreV} data-band={scoreBand(r.score.value)}>{r.score.value}</span>
              <span className={styles.dots} aria-hidden="true">
                {[60, 80, 90].map((t) => <span key={t} className={styles.dot} data-on={r.score.value >= t ? "true" : undefined} />)}
              </span>
            </span>
          </Link>
        ))}
      </div>
      <p className={styles.note}>The score is built from the case, never the person: a matching decision type, a stated upside, detail, and how long it has waited. Hover a score to see the parts.</p>
    </div>
  );
}
