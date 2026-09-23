"use client";
// TEAM LEADER home: open items addressed to me, sorted by age, one action each - yes /
// no+why / hand over / ask one question. Port of the INBOX block in legacy/demo/index.html.
// A manager sees the same list with the ideas waiting on their decision on top.
import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { deskCases, inboxIdeas, inboxSorted, openCases, problemOf } from "@/components/dashboard/derive";
import { Avatar, Btn, Empty, Pill, reasonTone, type Tone } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { actedBy } from "@/features/cases/selectors";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./InboxView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

export function InboxView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, D, demo, persona, act, openSheet, showToast, ready, f, href } = ctx;
  // Selection: the page remounts this view (key = ?id) when a search result or link picks a case.
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  if (!ready) return <PageSkeleton kind="inbox" delay />;

  const who = persona.who, P = seed.promiseDays;
  const desk = deskCases(ctx), open = openCases(ctx);
  const inbox = inboxSorted(ctx);
  const ideas = inboxIdeas(ctx);
  // The selection is an idea or a case; with nothing picked, the oldest decision owed wins.
  const si = ideas.find((i) => i.id === cid) ?? (inbox.some((c) => c.id === cid) ? null : ideas[0] ?? null);
  const sc = si ? null : inbox.find((c) => c.id === cid) ?? inbox[0] ?? null;
  const route = sc?.route ?? null;
  const scMine = !!route && route.owner.name === who.name;
  const handTo = route ? (scMine ? route.deputy : route.owner.name) : "the triage desk";
  const lastHand = sc?.handed[sc.handed.length - 1];
  const handedNote = !sc ? ""
    : sc.escalated && sc.escalated.to === who.name && sc.assignee !== who.name
      ? "Escalated to you " + f(sc.escalated.day) + " — " + sc.assignee + " missed the " + P + "-day promise."
      : sc.escalated && sc.assignee === who.name
        ? "Past the promise since " + f(sc.escalated.day) + " — " + sc.escalated.to + " sees it too."
        : lastHand ? "From " + lastHand.from + ", " + f(lastHand.day) + (lastHand.why ? " — “" + lastHand.why + "”" : "") : "";

  const cleared = D.cases.map((c) => ({ c, did: actedBy(c, who.name) })).filter((x) => x.did === "decided" || x.did === "handed");
  const overdue = open.filter((c) => c.overdue).length + ideas.filter((i) => i.wait > P).length;
  const stats = [
    { v: String(desk.length + ideas.length), l: open.length === desk.length ? "on your desk" : "on your desk · " + (desk.length - open.length) + " paused" },
    { v: String(overdue), l: "past the " + P + "-day promise", hot: overdue > 0 },
    { v: demo ? seed.metrics.lead.medianAnswer : "—", l: "median time to answer" },
    { v: demo ? seed.metrics.lead.withinPromise : "—", l: "within the promise, Q3" },
  ];

const sel = (c: (typeof inbox)[number]) => { if (c.read === null) act.read(c.id); setCid(c.id); };

  return (
    <>
      <ViewHead view="inbox" />
      <div className={ui.stack14}>
        <div className={ui.stats}>
          {stats.map((k) => (
            <div key={k.l} className={ui.stat}>
              <div className={ui.statV} data-hot={k.hot ? "true" : undefined}>{k.v}</div>
              <div className={ui.statL}>{k.l}</div>
            </div>
          ))}
        </div>

        <div className={ui.split}>
          <div className={ui.stack}>
            <div className={`${ui.card} ${ui.cardList}`}>
              {inbox.length === 0 && ideas.length === 0 && (
                <Empty title="Inbox empty" sub="Nothing is waiting on you." />
              )}
              <div className={ui.list}>
                {ideas.map((i) => {
                  const late = i.wait > P, soon = i.wait >= P - 2 && !late;
                  return (
                    <div key={i.id} className={ui.row} data-active={si?.id === i.id ? "true" : undefined} onClick={() => setCid(i.id)}>
                      <div className={ui.mark} />
                      <div className={ui.rowBody}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowMain}>
                            <div className={styles.caseTitle}>{i.title}</div>
                            <div className={ui.rowSub}>{i.proposedBy} · solves: {problemOf(ctx, i)?.title ?? "—"}</div>
                          </div>
                          <div className={styles.rowRight}>
                            <span className={styles.clock} data-tone={late ? "late" : soon ? "soon" : undefined}>
                              {late ? i.wait - P + " d past the promise" : P - i.wait + " d left"}
                            </span>
                            <span className={styles.open}>waiting {i.wait} d</span>
                          </div>
                        </div>
                        <div className={`${ui.chips} ${styles.why}`}>
                          <Pill tone="accent">decision</Pill>
                          {i.blocker && <span className={styles.whyLabel}>{i.blocker}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {inbox.map((c) => {
                  const paused = c.status === "asked";
                  const toMe = !!(c.escalated && c.escalated.to === who.name && c.assignee !== who.name);
                  const late = c.clock > P, soon = c.clock >= P - 2 && !late;
                  const tone: Tone = paused ? "soft" : toMe ? "ink" : reasonTone(c.reason);
                  return (
                    <div key={c.id} className={ui.row} data-active={sc?.id === c.id ? "true" : undefined} data-paused={paused ? "true" : undefined} onClick={() => sel(c)}>
                      <div className={ui.mark} />
                      <div className={ui.rowBody}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowMain}>
                            <div className={styles.caseTitle}>{c.title}</div>
                            <div className={ui.rowSub}>{c.from} · {c.fromDept}</div>
                          </div>
                          <div className={styles.rowRight}>
                            <span className={styles.clock} data-tone={paused ? "paused" : late ? "late" : soon ? "soon" : undefined}>
                              {paused ? "clock paused" : late ? c.clock - P + " d past the promise" : P - c.clock + " d left"}
                            </span>
                            <span className={styles.open}>open {c.clock} d</span>
                          </div>
                        </div>
                        <div className={`${ui.chips} ${styles.why}`}>
                          <Pill tone={tone}>{paused ? "waiting on " + c.from : toMe ? "escalated from " + c.assignee : c.reason}</Pill>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {cleared.length > 0 && (
                <div className={styles.cleared}>
                  <div className={ui.eyebrow}>Cleared today</div>
                  <div className={`${ui.list} ${ui.mt8}`}>
                    {cleared.map(({ c, did }) => (
                      <div key={c.id} className={styles.clearedRow}>
                        <span className={styles.clearedTitle}>{c.title}</span>
                        <Pill tone={did === "handed" ? "soft" : "ink"}>
                          {did === "decided" && c.decided ? "Decided · " + c.decided.answer + (c.decided.reason && c.decided.answer === "no" ? " · " + c.decided.reason : "") : "Handed over · " + c.assignee}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`${ui.sticky} ${ui.stack}`}>
            <div className={ui.card}>
              <div className={ui.eyebrow}>{si ? "Selected idea" : "Selected case"}</div>
              {si ? (
                <>
                  <div className={ui.h2}>{si.title}</div>
                  <div className={`${ui.chips} ${styles.selMeta}`}>
                    <Pill tone="accent">{si.status}</Pill>
                    <span className={ui.small}>waiting {si.wait} days</span>
                  </div>
                  <div className={`${ui.body} ${ui.mt14}`}>{si.rationale}</div>
                  <div className={`${ui.grid2} ${ui.mt14}`}>
                    <div className={ui.tile}><div className={ui.tileTitle}>{si.upside}</div><div className={ui.tileL}>expected upside / yr</div></div>
                    <div className={ui.tile}><div className={ui.tileTitle}>{si.effort}</div><div className={ui.tileL}>to find out if it works</div></div>
                  </div>
                  {si.blocker && <div className={styles.handedNote}>{si.blocker}</div>}
                  <div className={`${ui.eyebrow} ${styles.section}`}>Your move</div>
                  <div className={`${ui.btnRow} ${styles.actions}`}>
                    <Btn kind="accent" onClick={() => openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") })}>Approve and assign</Btn>
                    <Btn onClick={() => openSheet("askIdea", si.id)}>Ask a question</Btn>
                  </div>
                  <div className={ui.mt14}><Link href={href("/ideas?id=" + si.id)} className={ui.textlink}>Open the idea →</Link></div>
                </>
              ) : !sc ? (
                <>
                  <div className={ui.h2}>Inbox empty</div>
                </>
              ) : (
                <>
                  <div className={ui.h2}>{sc.title}</div>
                  <div className={`${ui.chips} ${styles.selMeta}`}>
                    <Pill tone={reasonTone(sc.reason)}>{sc.reason}</Pill>
                    <span className={ui.small}>{sc.clock} days open</span>
                  </div>
                  <div className={`${ui.quote} ${ui.mt14}`}>
                    <div className={ui.quoteText}>{sc.body}</div>
                    <div className={ui.quoteBy}><Avatar name={sc.from} size="sm" tone="color" /> {sc.from} · {sc.fromDept}</div>
                  </div>
                  <div className={`${ui.grid2} ${ui.mt14}`}>
                    <div className={ui.tile}><div className={ui.tileTitle}>{sc.upside || "not estimated yet"}</div><div className={ui.tileL}>what it is worth</div></div>
                    <div className={ui.tile}>
                      <div className={ui.tileTitle}>{!route ? "Nobody yet" : scMine ? "You" : route.owner.name}</div>
                      <div className={ui.tileL}>{!route ? "no map entry — you triage it" : scMine ? "owner on the map · deputy " + route.deputy : "owner on the map · " + route.type}</div>
                    </div>
                  </div>

                  {handedNote && <div className={styles.handedNote}>{handedNote}</div>}

                  {sc.question && (
                    <>
                      <div className={`${ui.eyebrow} ${styles.section}`}>Your question</div>
                      <div className={`${ui.quote} ${styles.q}`}>
                        <div className={ui.quoteText}>“{sc.question.text || "One question."}”</div>
                        <div className={ui.quoteBy}>you asked {f(sc.question.day)}</div>
                      </div>
                      {sc.question.answer && (
                        <div className={`${ui.quote} ${styles.a}`} data-tone="accent">
                          <div className={ui.quoteText}>“{sc.question.answer.text}”</div>
                          <div className={ui.quoteBy}>{sc.from} answered {f(sc.question.answer.day)}</div>
                        </div>
                      )}
                    </>
                  )}

                  {sc.status === "asked" && (
                    <div className={styles.pausedNote}>Waiting for {sc.from} to answer · clock paused at {sc.clock} d.</div>
                  )}

                  {sc.open && (
                    <>
                      <div className={`${ui.eyebrow} ${styles.section}`}>Your move</div>
                      <div className={`${ui.btnRow} ${styles.actions}`}>
                        <Btn kind="primary" onClick={() => { act.decide(sc.id, "yes"); showToast("Answered “yes” in " + sc.clock + " days. " + sc.from + " has been told."); }}>Yes, do it</Btn>
                        <Btn onClick={() => openSheet("no", sc.id)}>No, and why</Btn>
                      </div>
                      <div className={ui.btnRow}>
                        <Btn kind="accent" onClick={() => openSheet("hand", sc.id, { picked: handTo })}>{"Pass to " + handTo}</Btn>
                        <Btn onClick={() => openSheet("ask", sc.id)}>Ask a question</Btn>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
