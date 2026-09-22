"use client";
// TEAM MEMBER home: the raise box, after the collaborator's NextUp mockup. Idea or problem, one line,
// optional screenshots and the people or departments it also hits, then ↑. NextUp evaluates it
// against the company context (org chart, routing map, goals, spend rule, known problems) -
// features/evaluate - and the lower card shows that evaluation step by step before the case is raised.
// While nothing is typed the lower card explains how NextUp works; while typing it takes context.
// Demo: the steps are timed, the facts are real; the screenshots stay in this browser (src/lib/shots.ts,
// keyed by case id), only their count becomes an event fact.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { SITE } from "@/config/site";
import type { CaseKind } from "@/features/cases/events";
import { evaluate, type Evaluation } from "@/features/evaluate";
import { saveShots, shrinkImage, type Shot } from "@/lib/shots";
import styles from "./RaiseView.module.css";

const KINDS: { id: CaseKind; label: string; placeholder: string }[] = [
  { id: "idea", label: "Idea", placeholder: "Share an idea that would make work better…" },
  { id: "problem", label: "Problem", placeholder: "Describe a problem you keep running into…" },
];
const STEP_MS = 1100; // one step per ~1.1 s -> about 9 s for eight steps
const MAX_SHOTS = 4;
const MIN_CHARS = 8;
const PROMPTS = ["Impact", "Who's blocked", "Already tried", "Deadline"];
const KIND_INK: Record<CaseKind, string> = { idea: "#d9a11a", problem: "#c93a2d" }; // = --k in RaiseView.module.css; the orb tints from a prop, not CSS
const HOW: { id: "raise" | "context" | "score" | "track"; title: string; text: string }[] = [
  { id: "raise", title: "Raise it", text: "Anyone, from any team, submits an idea or a problem in one line." },
  { id: "context", title: "It reads the context", text: SITE.name + " maps it against your org structure, business model, and goals." },
  { id: "score", title: "Validated & scored", text: "Scored on strategic fit, urgency, impact, and KPI relevance." },
  { id: "track", title: "Connected & tracked", text: "The right people pick it up; results roll up to leadership." },
];

type Phase = { at: "edit" } | { at: "thinking"; ev: Evaluation; done: number } | { at: "done"; ev: Evaluation; id: string };
type Pick = { id: string; label: string; meta: string };

export function RaiseView() {
  const ctx = useDemo();
  const { seed, S, persona, act, ready, href, tenant, showToast } = ctx;
  const [kind, setKind] = useState<CaseKind>("idea");
  const [switches, setSwitches] = useState(0); // re-keys the ring so it washes in on every toggle
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [affected, setAffected] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [reading, setReading] = useState(0); // files still being shrunk
  const [phase, setPhase] = useState<Phase>({ at: "edit" });
  const [reduced, setReduced] = useState(false); // prefers-reduced-motion: the steps land fast and the orb holds still
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync(); mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The evaluation plays out one step at a time; the case is raised once the last step lands.
  useEffect(() => {
    if (phase.at !== "thinking") return;
    const { ev, done } = phase;
    timer.current = setTimeout(() => {
      if (done < ev.steps.length) setPhase({ at: "thinking", ev, done: done + 1 });
      else {
        const id = act.raise(ev.payload);
        if (!saveShots(tenant.slug, id, shots)) showToast("Case raised — the screenshots did not fit in this browser's storage.");
        setPhase({ at: "done", ev, id });
      }
    }, reduced ? 150 : STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase, act, shots, tenant.slug, showToast, reduced]); // shots cannot change while thinking: the box is locked

  // The affected picker closes on a click outside it or on Escape.
  useEffect(() => {
    if (!pickOpen) return;
    const onDown = (e: MouseEvent) => { if (pickRef.current && !pickRef.current.contains(e.target as Node)) setPickOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pickOpen]);

  if (!ready) return <div className={styles.loading} />;

  const who = persona.who;
  const current = KINDS.find((k) => k.id === kind) ?? KINDS[0];
  const other = kind === "idea" ? "problem" : "idea";
  const locked = phase.at !== "edit";
  const composing = draft.trim().length > 0;
  const canSend = draft.trim().length >= MIN_CHARS && !locked;
  const words = context.trim() ? context.trim().split(/\s+/).length : 0;

  // Who it also hits: the org chart and the departments, searched by name, role or department.
  const q = pickQuery.trim().toLowerCase();
  const hit = (p: Pick) => !q || p.label.toLowerCase().includes(q) || p.meta.toLowerCase().includes(q);
  const groups: { label: string; items: Pick[] }[] = [
    { label: "People", items: seed.people.filter((p) => p.name !== who.name).map((p) => ({ id: p.name, label: p.name, meta: p.role + " · " + p.dept })).filter(hit) },
    { label: "Departments", items: seed.depts.map((d) => ({ id: d.name, label: d.name, meta: d.people + " people" })).filter(hit) },
  ].filter((g) => g.items.length > 0);

  // Picked files are shrunk to small data URLs right away, so the preview and what gets stored are the same bytes.
  const addShots = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, MAX_SHOTS - shots.length);
    if (fileRef.current) fileRef.current.value = ""; // after the snapshot: clearing empties the FileList; same file again must fire change
    if (!picked.length) return;
    setReading((n) => n + picked.length);
    picked.forEach((f) => shrinkImage(f)
      .then((shot) => setShots((s) => (s.length < MAX_SHOTS ? [...s, shot] : s)), () => showToast("Could not read " + f.name + " as an image."))
      .finally(() => setReading((n) => n - 1)));
  };
  const toggleKind = () => { setKind(other); setSwitches((n) => n + 1); };
  const toggleAffected = (id: string) => setAffected((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const addPrompt = (label: string) => setContext((c) => (c.trim() ? c.replace(/\s*$/, "") + "\n" + label + ": " : label + ": "));
  const send = () => {
    if (!canSend) return;
    setPickOpen(false);
    const ev = evaluate({ kind, text: draft, context, affected, attachments: shots.length, who }, { ...seed, cases: S.cases });
    setPhase({ at: "thinking", ev, done: 0 });
  };
  const reset = () => {
    setDraft(""); setContext(""); setShots([]); setAffected([]); setPickQuery(""); setPickOpen(false); setPhase({ at: "edit" });
  };

  const chips: { key: string; label: string; thumb?: string; remove: () => void }[] = [
    ...affected.map((n) => ({ key: "a:" + n, label: n, remove: () => toggleAffected(n) })),
    ...shots.map((s) => ({ key: "s:" + s.url, label: s.name, thumb: s.url, remove: () => setShots((x) => x.filter((y) => y.url !== s.url)) })),
  ];
  const hint = locked ? "Raised" : composing ? "Enter to raise" : "";

  return (
    <div className={styles.page} data-kind={kind} data-phase={phase.at}>
      <h1 className={styles.title}>Raise it, {who.name}</h1>

      <div className={styles.boxWrap}>
        <div className={styles.aura} aria-hidden="true" />
        <div className={styles.ring}>
          <span key={switches} className={styles.ringWash} aria-hidden="true" />
          <div className={styles.box}>
            <div className={styles.line}>
              <button type="button" className={styles.mode} onClick={toggleKind} disabled={locked} aria-label={"Raising " + current.label.toLowerCase() + " — switch to " + other} title={"Switch to raising " + (other === "idea" ? "an idea" : "a problem")}>
                <span className={styles.thumb} aria-hidden="true" />
                <span className={styles.modeOpt} data-on={kind === "idea" ? "true" : undefined} aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="10" r="5.4" stroke="currentColor" strokeWidth="2" /><rect x="9.4" y="15.6" width="5.2" height="2" rx="1" fill="currentColor" /><rect x="10.2" y="18.4" width="3.6" height="1.7" rx="0.85" fill="currentColor" /></svg>
                </span>
                <span className={styles.modeOpt} data-on={kind === "problem" ? "true" : undefined} aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" /><rect x="11.05" y="6.8" width="1.9" height="7.1" rx="0.95" fill="currentColor" /><circle cx="12" cy="16.7" r="1.2" fill="currentColor" /></svg>
                </span>
              </button>
              <input className={styles.field} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={current.placeholder} aria-label={current.label} autoFocus readOnly={locked}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} />
            </div>

            {chips.length > 0 && (
              <div className={styles.chips}>
                {chips.map((c) => (
                  <span key={c.key} className={styles.chip}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
                    {c.thumb && <img src={c.thumb} alt="" className={styles.chipThumb} />}
                    {c.label}
                    {!locked && <button type="button" className={styles.chipX} onClick={c.remove} aria-label={"Remove " + c.label}>×</button>}
                  </span>
                ))}
              </div>
            )}

            <div className={styles.foot}>
              <div className={styles.adds}>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addShots(e.target.files)} />
                <button type="button" className={styles.pill} data-on={shots.length > 0 ? "true" : undefined} onClick={() => fileRef.current?.click()} disabled={locked || shots.length + reading >= MAX_SHOTS} aria-busy={reading > 0 || undefined}>
                  <span className={styles.pillIcon} aria-hidden="true">⎘</span>
                  {reading > 0 ? "Adding…" : shots.length ? "Attached · " + shots.length : "Attach"}
                </button>
                <div className={styles.pickRoot} ref={pickRef}>
                  <button type="button" className={styles.pill} data-on={affected.length > 0 || pickOpen ? "true" : undefined} onClick={() => setPickOpen((v) => !v)} disabled={locked} aria-expanded={pickOpen} aria-haspopup="dialog">
                    <span className={styles.dot} data-on={affected.length > 0 ? "true" : undefined} aria-hidden="true" />
                    {affected.length ? "Affected · " + affected.length : "Affected"}
                  </button>
                  {pickOpen && (
                    <div className={styles.picker} role="dialog" aria-label="Who else is affected">
                      <div className={styles.pickSearch}>
                        <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Search people, departments" aria-label="Search people and departments" autoFocus />
                      </div>
                      <div className={styles.pickList}>
                        {groups.map((g) => (
                          <div key={g.label}>
                            <span className={styles.pickGroup}>{g.label}</span>
                            {g.items.map((it) => {
                              const on = affected.includes(it.id);
                              return (
                                <button key={it.id} type="button" className={styles.pickRow} onClick={() => toggleAffected(it.id)} aria-pressed={on}>
                                  <span className={styles.pickMark} data-on={on ? "true" : undefined} aria-hidden="true">{on ? "✓" : ""}</span>
                                  <span className={styles.pickText}><span className={styles.pickLabel}>{it.label}</span><span className={styles.pickMeta}>{it.meta}</span></span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        {groups.length === 0 && <div className={styles.pickEmpty}>No matches</div>}
                      </div>
                      <div className={styles.pickFoot}>
                        <span className={styles.pickCount}>{affected.length} selected</span>
                        <span className={styles.pickBtns}>
                          <button type="button" className={styles.pickClear} onClick={() => setAffected([])}>Clear</button>
                          <button type="button" className={styles.pickDone} onClick={() => setPickOpen(false)}>Done</button>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.sendWrap}>
                <span className={styles.hint} aria-live="polite">{hint}</span>
                <span className={styles.sendRing}>
                  {locked && <span className={styles.pulse} aria-hidden="true" />}
                  <button type="button" className={styles.send} onClick={send} disabled={!canSend} data-sent={locked ? "true" : undefined} aria-label={"Raise this " + current.label.toLowerCase()} title="Raise it">
                    <span className={styles.arrow} aria-hidden="true">↑</span>
                    <span className={styles.check} aria-hidden="true">✓</span>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        {phase.at === "edit" && !composing && (
          <>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>How {SITE.name} works</h2>
              <span className={styles.cardTag}>Raised → routed → tracked</span>
            </div>
            <div className={styles.how}>
              {HOW.map((s) => (
                <section key={s.id} className={styles.step}>
                  {/* Decorative sketches of each stage, as in the mockup - no data behind them. */}
                  <div className={styles.mini} aria-hidden="true">
                    {s.id === "raise" && <><span className={styles.miniRow}><span className={styles.miniBulb} /><span className={styles.miniBar} /></span><span className={styles.miniTags}><span>Idea</span><span>Problem</span></span></>}
                    {s.id === "context" && ["Org", "Model", "Goals"].map((l, j) => <span key={l} className={styles.miniRow}><span className={styles.miniL}>{l}</span><span className={styles.miniTrack}><span className={styles.miniFill} style={{ width: ["82%", "64%", "91%"][j] }} /></span></span>)}
                    {s.id === "score" && ([["Fit", 4], ["Urgency", 3], ["Impact", 5]] as const).map(([l, n]) => <span key={l} className={styles.miniRow}><span className={styles.miniL}>{l}</span><span className={styles.miniDots}>{[0, 1, 2, 3, 4].map((d) => <span key={d} data-on={d < n ? "true" : undefined} />)}</span></span>)}
                    {s.id === "track" && <><span className={styles.miniRow}><span className={styles.miniFaces}><span>AK</span><span>JS</span><span>MR</span></span><span className={styles.miniFlight}>In flight</span></span><span className={styles.miniTrack}><span className={styles.miniFill} style={{ width: "58%" }} /></span></>}
                  </div>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.stepText}>{s.text}</p>
                </section>
              ))}
            </div>
          </>
        )}

        {phase.at === "edit" && composing && (
          <>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Add context</h2>
              <span className={styles.cardTag}>{words ? words + (words === 1 ? " word" : " words") : "Optional"}</span>
            </div>
            <div className={styles.ctx}>
              <textarea className={styles.ctxField} value={context} onChange={(e) => setContext(e.target.value)} rows={6} aria-label="Context"
                placeholder={"What's happening, who does it affect, what have you already tried? The more context, the better " + SITE.name + " can route it."} />
              <div className={styles.prompts}>
                <span className={styles.promptsL}>Prompts</span>
                {PROMPTS.map((p) => <button key={p} type="button" className={styles.prompt} onClick={() => addPrompt(p)}>{p}</button>)}
              </div>
            </div>
          </>
        )}

        {(phase.at === "thinking" || phase.at === "done") && (() => {
          const ev = phase.ev, done = phase.at === "done" ? ev.steps.length + 1 : phase.done;
          return (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}><span className={styles.orb} aria-hidden="true"><ThinkingOrb state="solving" size={20} theme="light" color={KIND_INK[kind]} paused={phase.at !== "thinking" || reduced} /></span>{phase.at === "thinking" ? SITE.name + " is evaluating" : "Evaluated"}</h2>
                <span className={styles.cardTag}>{phase.at === "thinking" ? Math.min(done, ev.steps.length) + " / " + ev.steps.length : "Score " + ev.score.value}</span>
              </div>
              <ol className={styles.evalSteps} aria-live="polite">
                {ev.steps.map((s, i) => {
                  const state = i < done ? "done" : i === done ? "now" : "todo";
                  return (
                    <li key={s.id} className={styles.evalStep} data-state={state}>
                      <span className={styles.mark} aria-hidden="true">{state === "done" ? "✓" : ""}</span>
                      <span className={styles.evalText}>
                        <span className={styles.evalTitle}>{s.title}</span>
                        {state === "done" && <span className={styles.evalDetail}>{s.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {phase.at === "done" && (
                <div className={styles.banner} role="status">
                  <p className={styles.bannerSub}>
                    On <strong>{ev.lead}</strong>’s desk{ev.passesTo ? <>, passed to <strong>{ev.passesTo}</strong> if it is theirs</> : null}. Answer owed in {seed.promiseDays} d — it stays on the dashboard until then.
                  </p>
                  <div className={styles.bannerRow}>
                    <Link href={href("/dashboard")} className="nh-btn nh-btn-primary nh-btn-sm">See it on the dashboard</Link>
                    <Link href={href("/cases/" + phase.id)} className="nh-btn nh-btn-ghost nh-btn-sm">Open the case</Link>
                    <button type="button" className={styles.again} onClick={reset}>Raise another</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
