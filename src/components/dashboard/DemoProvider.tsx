"use client";
// The one place the dashboard's client state lives. Port of the state half of the legacy
// Component class (legacy/demo/js/dashboard.js): the event log, the persona being viewed,
// demo data on/off, the department scope, search, popovers, the input sheet and the toast.
//
// Rule carried over: UI code changes domain state only through `act.*`, which appends one
// event as the current persona. Everything shown is reduce(seed, log) - see features/cases.
// The log and the dev-panel settings persist in localStorage (src/lib/demo-log.ts); the
// server renders with an empty log and `ready` false, the browser swaps in what it remembers.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccess, ROLE_HOME, type Role } from "@/config/roles";
import { appendEvent, newId, type EventLog, type EventPayload, type CaseEventType } from "@/features/cases/events";
import { reduce, type State } from "@/features/cases/reducer";
import { dayFormatter, type DayFmt } from "@/features/cases/rows";
import { affectedOn, exportSnippet } from "@/features/cases/selectors";
import type { Persona, RolePersona, Seed } from "@/features/demo/types";
import { counts, demoData, type Counts, type DemoData } from "@/features/metrics";
import { clearPrefs, getServerSnapshot, getSnapshot, resetLog, setPrefs, subscribe, updateLog } from "@/lib/demo-log";
import { clearShots, dropShots } from "@/lib/shots";
import { deptName as deptNameOf } from "@/lib/utils/format";

export type Pop = "search" | "decisions" | "me" | "sort" | "filter";
export type SheetKind = "no" | "ask" | "reply" | "hand" | "assign" | "askIdea";
export type Sheet = { kind: SheetKind; id: string; text: string; picked: string | null; people: string[] };

export type Act = {
  raise: (p: EventPayload) => string;
  read: (id: string) => void;
  decide: (id: string, answer: "yes" | "no", reason?: string, note?: string) => void;
  hand: (id: string, to: string, why?: string) => void;
  ask: (id: string, text: string) => void;
  answer: (id: string, text: string) => void;
  override: (id: string, proposed: string | null, chosen: string) => void;
  cosign: (ideaId: string) => boolean; // true when the co-sign was added, false when withdrawn
  affect: (caseId: string, why?: string) => boolean; // "this affects me too" (+ why, from a lead) - true when added, false when withdrawn
  comment: (caseId: string, text: string) => void;
  rescore: (caseId: string, text: string) => void; // new information: the score is re-evaluated with it
  askIdea: (ideaId: string, text: string) => void;
  approve: (ideaId: string, team: string[], note: string) => void;
  fund: (ideaId: string, team: string[], note: string) => void;
  advanceDay: (by?: number) => void;
};

export type DemoContext = {
  tenant: TenantInfo;
  seed: Seed;
  ready: boolean;
  S: State; D: DemoData; N: Counts; log: EventLog;
  role: Role; setRole: (r: Role) => void;
  leadAs: string | null; setLeadAs: (name: string) => void;
  persona: { role: RolePersona; who: Persona }; actor: string; email: string | null;
  demo: boolean; toggleDemo: () => void;
  dept: string; setDept: (id: string) => void; matches: (depts: readonly string[]) => boolean; deptName: (id: string) => string;
  q: string; setQ: (q: string) => void;
  pop: Pop | null; setPop: (p: Pop | null) => void; togglePop: (p: Pop) => void;
  sheet: Sheet | null; openSheet: (kind: SheetKind, id: string, init?: Partial<Sheet>) => void; closeSheet: () => void; patchSheet: (p: Partial<Sheet>) => void;
  toast: string | null; showToast: (msg: string) => void;
  menu: boolean; setMenu: (b: boolean) => void;
  dev: boolean; setDev: (b: boolean) => void;
  act: Act;
  resetDemo: () => void; deleteAdded: () => void; copySnippet: () => void; logout: () => void;
  f: DayFmt; // demo day offset -> "today" / "12 Sep"
  href: (path: string) => string; // "/ideas?id=i1" -> "/acme/ideas?id=i1"
};

const Ctx = createContext<DemoContext | null>(null);

export function useDemo(): DemoContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo() outside <DemoProvider>");
  return c;
}

// First visit: the URL says which role the visitor meant (/leader -> leader, /raise, /dashboard or /team -> member).
function roleFromPath(path: string): Role {
  if (path === "/leader" || path.startsWith("/leader/")) return "leader";
  if (path === "/raise" || path === "/dashboard" || path === "/team" || path.startsWith("/team/")) return "member";
  return "manager";
}

const iniOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);

// What the shell knows about the company: slug + name for chrome, the user list only to show an email in the profile menu.
export type TenantInfo = { slug: string; name: string; users?: { name: string; email: string }[] };
type Props = { tenant: TenantInfo; seed: Seed; children: React.ReactNode };

export function DemoProvider({ tenant, seed, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const slug = tenant.slug;
  const appPath = pathname.startsWith("/" + slug) ? pathname.slice(slug.length + 1) || "/" : pathname;

  // What this browser remembers: the event log and the dev-panel settings.
  const persisted = useSyncExternalStore(subscribe, () => getSnapshot(slug), getServerSnapshot);
  const ready = persisted.loaded;
  const log = persisted.log;
  // The guess is made once per page load, so following a link (/raise -> /cases/x) keeps the persona.
  const [guessedRole] = useState(() => roleFromPath(appPath));
  const role: Role = persisted.prefs.role ?? guessedRole;
  const leadAs = persisted.prefs.leadAs ?? null;
  const demo = persisted.prefs.demo ?? true;
  const dept = persisted.prefs.dept ?? "PRD";

  const [q, setQ] = useState("");
  const [pop, setPop] = useState<Pop | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dev, setDev] = useState(false);
  const [today] = useState(() => new Date()); // views render dates only once `ready`, so server/client never disagree on screen
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Roles are data: a role that may not open this path is sent home.
  useEffect(() => {
    if (ready && !canAccess(role, appPath)) router.replace("/" + slug + ROLE_HOME[role]);
  }, [ready, role, appPath, router, slug]);

  // ⌘K / Ctrl+K focuses the search box; Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("nh-search")?.focus();
        setPop("search");
      } else if (e.key === "Escape") {
        const el = document.getElementById("nh-search");
        if (el && e.target === el) return; // the box clears its text first, closes on the second press
        el?.blur();
        setPop(null); setQ(""); setMenu(false); setSheet(null); setDev(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const S = useMemo(() => reduce(seed, log), [seed, log]);
  const D = useMemo(() => demoData(seed, S, demo), [seed, S, demo]);
  const N = useMemo(() => counts(seed, D), [seed, D]);

  const deptName = useCallback((id: string) => deptNameOf(seed.depts, id), [seed.depts]);

  // The effective role + person. The team-leader role can be viewed as any desk holder (dev
  // panel -> "inbox of"), so a hand-over or an escalation can be followed into the other inbox.
  const persona = useMemo(() => {
    const rp = seed.personas.find((r) => r.id === role) ?? seed.personas[seed.personas.length - 1];
    if (rp.id !== "leader" || !leadAs || leadAs === rp.who.name) return { role: rp, who: rp.who };
    const r = seed.routes.find((x) => x.owner.name === leadAs);
    const b = seed.buddies.find((x) => x.name === leadAs);
    const bDept = b ? seed.depts.find((d) => d.name === b.dept)?.id : undefined;
    const pDept = r ? r.owner.dept : bDept ?? rp.dept;
    const line = r ? r.owner.role + " · " + deptName(r.owner.dept) : b ? "Team lead · " + b.dept : "Deputy · " + deptName(pDept);
    return { role: { ...rp, dept: pDept }, who: { name: leadAs, ini: iniOf(leadAs), line, handle: null } };
  }, [seed, role, leadAs, deptName]);

  // Who is acting: the employee posts under their handle, everyone else by name.
  const actor = persona.role.id === "member" && persona.who.handle ? persona.who.handle : persona.who.name;
  const email = tenant.users?.find((u) => u.name === persona.who.name)?.email ?? null;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const emit = useCallback((type: CaseEventType, target: string | null, payload?: EventPayload) => {
    updateLog(slug, (prev) => appendEvent(prev, { type, actor, target, payload }));
  }, [actor, slug]);

  const act = useMemo<Act>(() => ({
    raise: (p) => { const id = newId("c"); emit("case.raised", id, p); return id; },
    read: (id) => emit("case.read", id),
    decide: (id, answer, reason, note) => emit("case.decided", id, { answer, reason, note }),
    hand: (id, to, why) => emit("case.handed", id, { to, why }),
    ask: (id, text) => emit("case.asked", id, { text }),
    answer: (id, text) => emit("case.answered", id, { text }),
    override: (id, proposed, chosen) => emit("case.override", id, { proposed, chosen }),
    cosign: (ideaId) => {
      const already = S.ideas.find((x) => x.id === ideaId)?.cosigners.some((x) => x.name === actor) ?? false;
      emit(already ? "idea.uncosigned" : "idea.cosigned", ideaId);
      return !already;
    },
    affect: (caseId, why) => {
      // Decided against the log as it is at that moment, so a double click toggles cleanly.
      let added = true;
      updateLog(slug, (prev) => {
        added = !affectedOn(prev, caseId).some((a) => a.name === actor);
        return appendEvent(prev, { type: added ? "case.affected" : "case.unaffected", actor, target: caseId, payload: added && why ? { why } : undefined });
      });
      return added;
    },
    comment: (caseId, text) => emit("case.commented", caseId, { text }),
    rescore: (caseId, text) => emit("case.commented", caseId, { text, rescore: true }),
    askIdea: (ideaId, text) => emit("idea.asked", ideaId, { text }),
    approve: (ideaId, team, note) => emit("idea.approved", ideaId, { team, note }),
    fund: (ideaId, team, note) => emit("idea.funded", ideaId, { team, note }),
    advanceDay: (by) => emit("day.advanced", null, { by: by ?? 1 }),
  }), [emit, S.ideas, actor, slug]);

  const href = useCallback((path: string) => "/" + slug + path, [slug]);
  // Close the popovers and the mobile menu; the dev panel stays open so settings can be changed in a row.
  const closeAll = useCallback(() => { setPop(null); setQ(""); setMenu(false); }, []);

  const setRole = useCallback((r: Role) => {
    const rp = seed.personas.find((x) => x.id === r);
    setPrefs(slug, { role: r, leadAs: null, dept: rp?.dept ?? dept });
    closeAll();
    router.push(href(ROLE_HOME[r]));
  }, [seed.personas, slug, dept, closeAll, router, href]);

  // Dev panel: look at the team-leader screens as another desk holder.
  const setLeadAs = useCallback((name: string) => {
    const lead = seed.personas.find((r) => r.id === "leader");
    const r = seed.routes.find((x) => x.owner.name === name);
    const b = seed.buddies.find((x) => x.name === name);
    const nextDept = r ? r.owner.dept : b ? (seed.depts.find((d) => d.name === b.dept)?.id ?? lead?.dept ?? "PRD") : lead?.dept ?? "PRD";
    setPrefs(slug, { role: "leader", leadAs: lead && name === lead.who.name ? null : name, dept: nextDept });
    closeAll();
    router.push(href(ROLE_HOME.leader));
  }, [seed, slug, closeAll, router, href]);

  const resetDemo = useCallback(() => {
    resetLog(slug);
    clearShots(slug);
    setPrefs(slug, { leadAs: null });
    setQ(""); setPop(null); setSheet(null);
    showToast("Demo state reset");
  }, [slug, showToast]);

  // Dev panel: drop the cases raised in this browser (and everything done to them); seed cases and
  // what was done to them stay. A log purge, not an event - it only exists for the demo.
  const deleteAdded = useCallback(() => {
    const ids = new Set(S.cases.filter((c) => !c.seed).map((c) => c.id));
    if (!ids.size) { showToast("Nothing to delete — every case here is seed data."); return; }
    updateLog(slug, (prev) => ({ ...prev, events: prev.events.filter((e) => !(e.target && ids.has(e.target))) }));
    dropShots(slug, ids);
    setSheet(null);
    showToast("Deleted " + ids.size + (ids.size === 1 ? " case" : " cases") + " you added. Seed data untouched.");
  }, [S, slug, showToast]);

  // Log out: forget the persona in this browser and go back to the company login. Demo log stays.
  const logout = useCallback(() => {
    clearPrefs(slug);
    closeAll(); setSheet(null);
    router.push(href("/login"));
  }, [slug, closeAll, router, href]);

  // Session-created cases as seed rows (with their history) for src/features/demo/seed.ts.
  const copySnippet = useCallback(() => {
    const txt = exportSnippet(S);
    const n = S.cases.filter((c) => !c.seed).length;
    if (!txt) { showToast("Nothing new to copy — raise a case as the employee first."); return; }
    const done = () => showToast("Copied " + n + (n === 1 ? " case" : " cases") + " — paste into CASES in seed.ts.");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, () => window.prompt("Copy this into seed.ts:", txt));
    else window.prompt("Copy this into seed.ts:", txt);
  }, [S, showToast]);

  const value: DemoContext = {
    tenant, seed, ready, S, D, N, log,
    role, setRole, leadAs, setLeadAs, persona, actor, email,
    demo, toggleDemo: () => setPrefs(slug, { demo: !demo }),
    dept, setDept: (id) => { setPrefs(slug, { dept: id }); setMenu(false); }, matches: (depts) => dept === "All" || depts.includes(dept), deptName,
    q, setQ, pop, setPop, togglePop: (p) => setPop((cur) => (cur === p ? null : p)),
    sheet, openSheet: (kind, id, init) => { setSheet({ kind, id, text: "", picked: null, people: [], ...init }); setPop(null); },
    closeSheet: () => setSheet(null), patchSheet: (p) => setSheet((s) => (s ? { ...s, ...p } : s)),
    toast, showToast, menu, setMenu, dev, setDev, act, resetDemo, deleteAdded, copySnippet, logout,
    f: dayFormatter(today, S.day), href,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
