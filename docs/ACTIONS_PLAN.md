# Making the action buttons work — game plan

Goal: demonstrate the *process* end to end. An employee raises something, it
lands in the right leader's inbox with a clock, the leader answers (yes / no
and why / hand over / one question), the employee sees the answer, the
manager's ledger moves. Every button on Problems, Ideas, Inbox and My cases
does what it says.

This document is the plan. `README.md` stays the description of what is.

---

## 1. Why the buttons are toasts today

| Symptom | Cause in code |
|---|---|
| Lead answers a case, employee never sees it | `MY_IDEAS` (employee side) and `CASES` (lead side) are two unrelated arrays. Nothing links them. |
| Raised case can't update later | `onSend` stores *rendered strings* (`clock: 'Sent to T. Vogel. They owe…'`, `steps: [['Sent','today','done'],…]`), not facts (who, when, which route). |
| "No, and why" has no why; "Ask one question" has no question; "Hand to" hands to nobody | Inbox actions store one word: `cases[id] = 'decided' / 'handed' / 'asked'`. |
| Manager numbers never move | `LEDGER.handedOver`, `overrides`, funnel figures are constants in `METRICS` / `LEDGER`. |
| Co-sign / Approve / Fund a trial do nothing | No state exists for co-signers or idea status changes. |
| Clocks never run out | `age` is a fixed number in the seed; there is no notion of "today". |

Root cause: session state is stored as **presentation**, not as **facts**.

---

## 2. Target architecture

```
js/data.js        seed: PROBLEMS, IDEAS, CASES (incl. former MY_IDEAS), ROUTES, …
js/store.js       NEW — event log in localStorage + pure reducer
js/dashboard.js   reads reduced state; buttons call this.act.*  (never setState on domain data)
index.html        one extra <script src="./js/store.js"> before dashboard.js   (Kevin)
```

### 2.1 One entity: the case

A case is the single thing an employee raises. Employee sees "My cases"
(`from === my handle`), lead sees "Inbox" (`assignee === my name`, open),
manager sees all. `MY_IDEAS` is folded into `CASES`.

```js
// js/data.js — new CASE shape (seed rows)
{
  id: 'c3',
  title: 'Changeover sheet and MES ask for the same six numbers',
  body: 'Every changeover we write the same six values …',
  from: 'Anonymous #4471',            // handle or name — what "My cases" matches on
  fromDept: 'Production, Line 3',
  routeId: 'r8',                      // → ROUTES; owner / deputy / buddy come from here
  assignee: 'T. Vogel',               // who it is addressed to *now* (hand-over changes this)
  raisedDay: -3,                      // relative to demo "today" (0). Age is derived.
  reason: 'is it important',          // proposed stall reason (unchanged)
  upside: '≈ 20 min per changeover',
  linkedIdea: null,                   // idea id once a "yes" turns it into one (optional)
  // Optional seed history so demo rows arrive with a past:
  seedEvents: [ { type: 'case.read', day: -2, actor: 'T. Vogel' } ]
}
```

Rows that today live only in `MY_IDEAS` (the shipped one, the one in build,
the co-signed one) become CASES with `seedEvents` describing what already
happened (`case.decided`, `case.shipped`, `idea.cosigned`). The employee's
step tracker and reply text are then *derived* from those events — same code
path as live actions.

### 2.2 The event log

Append-only. Stored in `localStorage['nexthub.demo.v2'] = { events: [], day: 0 }`.

```js
{ id: 'e_…', day: 0, ts: 1726300000000, actor: 'T. Vogel', type: 'case.decided',
  target: 'c3', payload: { answer: 'no', reason: 'no time', note: 'Q4 at the earliest' } }
```

Event types (v1 — enough for the whole demo):

| type | actor | target | payload | effect (in reducer) |
|---|---|---|---|---|
| `case.raised` | employee handle | new case id | `{ title, body, routeId, assignee, fromDept }` | new case in assignee's inbox, clock starts at `day` |
| `case.read` | lead | case | — | step "Read by a human" done |
| `case.decided` | lead | case | `{ answer: 'yes' or 'no', reason?, note? }` | case closed; clock stopped; employee sees the reply; `yes` may create / link an idea |
| `case.handed` | lead | case | `{ to, why? }` | `assignee = to`; leaves my inbox, enters theirs; clock keeps running; ledger `handedOver` +1 |
| `case.asked` | lead | case | `{ text }` | clock paused; case shows in employee's My cases with a reply box |
| `case.answered` | employee | case | `{ text }` | clock resumes; back in lead's inbox, marked "answered" |
| `case.escalated` | *system* | case | `{ from, to }` | **derived, not stored**: open and age > PROMISE_DAYS → also visible to deputy; ledger `escalated` +1 |
| `route.overridden` | employee | case | `{ proposed, chosen }` | `assignee = chosen owner`; ledger `overrides` +1 |
| `idea.cosigned` | employee handle | idea | — | co-signer count +1; button reads "Co-signed"; contributor tally credits the handle; My cases gets a "you co-signed" row |
| `idea.asked` | anyone | idea | `{ text }` | thread on the idea; if the proposer is a persona, a case appears in their inbox |
| `idea.approved` | lead / manager | idea | `{ team: [names], note? }` | `status → 'In trial'`, `wait → 0`, linked problem `owner → 'trial'`, funnel moves |
| `idea.funded` | manager | idea | `{ team }` | same as approved, from `Unfunded` |
| `day.advanced` | dev panel | — | `{ by: 1 }` | `day + 1`: ages grow, clocks expire, the escalation rule fires |

Rule: **the reducer never reads the DOM and never calls setState.** It is
`reduce(seed, events, day) → state`. Anyone can add a UI for an event type;
only Kevin changes the reducer.

### 2.3 What is derived (and therefore moves when you click)

- Inbox (open cases where `assignee === me`), sorted by age
- Cleared list (my cases with a terminal event by me)
- My cases (cases where `from === my handle`, plus ideas I co-signed), with the step tracker and reply *computed* from events
- Rail counts, "decisions waiting", funnel, "stuck the longest"
- Contributors tally (co-signers count as contributors)
- `LEDGER.handedOver / escalated / overrides` = seed value + counted from events
- Waiting-on list for the lead (cases my team raised that sit with someone else)
- Idea status, `wait`, `team`; problem `owner` label

Seed numbers that have no rows (`METRICS`) stay constants — they read
"measured in pilot" with demo data off, as today.

---

## 3. Action matrix — every button, what it must do

### Employee (J. Schmidt / Anonymous #4471)

| Button | Today | Target |
|---|---|---|
| **Send** (intake) | adds a pre-rendered row to `sent` | `case.raised` → case in the proposed owner's inbox; My cases shows it with a live clock |
| **Wrong owner?** | toast | small picker of ROUTES → `route.overridden`; the override % on the ledger moves |
| **Co-sign this idea** | toast | `idea.cosigned` (toggle); button state; co-signer count on the idea; credit in contributors; row in My cases |
| **Ask a question** (idea) | toast | one-line input → `idea.asked`; thread shown under the idea |
| **Reply** to a lead's question (My cases) | does not exist | text box on the case → `case.answered`; clock resumes |
| Buddy chips | toast | stays a toast for now (messaging is out of scope) |

### Team leader (T. Vogel)

| Button | Today | Target |
|---|---|---|
| **Yes, do it** | `cases[id] = 'decided'` | `case.decided { answer: 'yes' }`; optional "make this an idea" checkbox → creates an IDEA linked to the problem, status Building |
| **No, and why** | same as yes | must capture *why*: pick one of the four stall reasons or "not now", plus an optional one-liner → `case.decided { answer: 'no', reason, note }` |
| **Hand to ⟨deputy⟩ / Pass to ⟨owner⟩** | `cases[id] = 'handed'` | `case.handed { to }`; case leaves my inbox, appears in `to`'s inbox; shows under "Handed over · to X · clock still running" |
| **Ask one question** | `cases[id] = 'asked'` | one-line input → `case.asked { text }`; case stays visible, greyed: "waiting on sender · clock paused" |
| **Approve and assign** (idea) | toast | pick 1–3 names (route owner, deputy, buddies) → `idea.approved { team }` |
| **Open the trial** | toast | navigate to Collaboration with that initiative selected (pure navigation) |

### Manager (B. Hartmann)

| Button | Today | Target |
|---|---|---|
| **Approve and assign / Fund a trial** | toast | same events as the lead; the manager can approve `Unfunded` and CFO-blocked items (i1) |
| Decisions-waiting rows | select | click → Ideas view with that idea selected (exists), approve there |
| Ledger tiles | static | `handedOver`, `escalated`, `overrides` = seed + counted from events |

### Dev panel (all roles)

| Control | Purpose |
|---|---|
| **Advance one day** | `day.advanced` → watch clocks run out and the escalation rule fire |
| **View inbox as** ⟨T. Vogel / H. Sander / M. Roth / L. Brandt / C. Ilg⟩ | the lead persona becomes any route owner, so a hand-over can be *followed* into the other inbox — cheap once the inbox is derived by `assignee` |
| **Reset demo state** | clears events and day (exists) |
| **Copy for data.js** | exports events as `seedEvents` instead of pre-rendered rows |

---

## 4. UI pieces needed (small, reusable)

Three tiny components cover every input the actions need. Build them once:

1. **One-line prompt sheet** — title, one text field, primary + cancel.
   Used by: Ask one question, Ask a question (idea), Reply, the "why" note.
2. **Pick-one list** — radio-style rows with a label and a sub-line.
   Used by: No-and-why reason, Wrong-owner route picker, Hand-to target.
3. **Pick-people chips** — toggleable name chips.
   Used by: Approve and assign.

Mobile: they render as bottom sheets — the `< 760px` rules already pin
popovers to the top; reuse that pattern.

---

## 5. Phases and who does what

Kevin owns phase 1 alone — it is the part that, done wrong, breaks everything
after it. From phase 2 on, Sam and Victor take UI tasks against a stable
`this.act.*` API and never touch `store.js`.

### Phase 1 — Foundation (Kevin, ~1 day)
- [ ] `js/store.js`: `loadLog / append / reduce`; key `nexthub.demo.v2`; migration from `v1` (`sent` → `case.raised` events, `cases` → `case.decided / handed / asked`)
- [ ] Merge `MY_IDEAS` into `CASES` with `seedEvents`; `raisedDay` replaces `age`
- [ ] `this.act = { raise, read, decide, hand, ask, answer, override, cosign, askIdea, approve, fund, advanceDay }` — thin wrappers that append and re-render
- [ ] `renderVals()` reads inbox / mine / cleared / counts from `reduce(...)`; behaviour identical from the outside
- [ ] `index.html`: add the `store.js` script tag; CI `syntax` job: add it to the wiring check
- [ ] README "Data" section: store, events, day clock

**Exit test:** everything that worked before still works; Reset demo state still clears; smoke test green.

### Phase 2 — The inbox loop (Kevin + one helper, 2–3 days)
The core demo: raise → inbox → answer → seen.
- [ ] Employee Send creates a real case (Kevin)
- [ ] One-line prompt sheet + pick-one list components (helper)
- [ ] No-and-why with reason (helper, uses pick-one)
- [ ] Ask one question + employee Reply (helper, uses prompt sheet)
- [ ] Hand-to changes assignee; "Handed over · to X" rendering (Kevin)
- [ ] My cases step tracker derived from events (Kevin)
- [ ] Lead's inbox count in the rail, cleared list, waiting-on — all derived (Kevin)

**Exit test:** as employee raise "night shift can't sign a €300 order" → switch to lead → it is in the inbox at 0 d, route r1 proposes R. Nowak → Pass to R. Nowak → switch persona to R. Nowak → it is there → No, and why: "not responsible" → switch to employee → My cases shows the no, the reason, the name, the day.

### Phase 3 — Ideas (helper-heavy, 2–3 days)
- [ ] Co-sign toggle + count + contributor credit + My cases row
- [ ] Ask a question on an idea → thread under the idea
- [ ] Pick-people chips; Approve and assign / Fund a trial → status, team, funnel
- [ ] "Yes, do it" optional "make this an idea"
- [ ] Open the trial → navigation

**Exit test:** as manager approve i1 with C. Ilg + R. Nowak → Awaiting decision drops by one, In trial rises by one, p1 reads "Fix in trial", contributors credit both, the employee's co-signed row reads "Approved".

### Phase 4 — Time — DONE
- [x] `day` in the store; **+1 day** in the dev panel (`day.advanced`); the panel stays open so you can press it repeatedly; status line shows `+N d`
- [x] Ages, "d left / d past the promise", overdue styling, due dates all from `day`. Waiting ideas age too (`wait + day`), seed "waiting on" rows age too
- [x] **Escalation rule** in the reducer: open and clock > PROMISE_DAYS → `escalated { to, from, day, live }`. `to` = the route's owner if the case sat with someone else, otherwise the owner's deputy. The case is now **on both desks** (`NHStore.onDesk`); either can act. The deputy's row reads "escalated from ⟨name⟩" and the selected case explains it; the original owner's case says "⟨deputy⟩ now sees it too". Employee row reads "Moved to ⟨deputy⟩ automatically". Manager ledger: seed + `live` escalations (those that crossed the line on day ≥ 0 — a seed case already overdue at day 0 doesn't count)
- [x] **Inbox of ⟨name⟩** in the dev panel: every desk holder (route owners + whoever currently holds or was escalated a case) with a live count; `persona()` makes the team-leader role read as that person (name, role line, department scope). Actions are recorded under that name. `setRole` / Reset clear it
- [x] Overrides ledger understands the "6 of 54" seed format (both sides +1 per live override)
- [x] `flow.test.cjs` extended (step 9b): follow the gauge case into H. Sander's inbox → raise → +6 days → employee row "moved to S. Dahl automatically" → S. Dahl's inbox shows it "escalated from T. Vogel" → T. Vogel still has it, told the deputy sees it → manager's ledger = seed + 6 escalated, seed + 1 handed over

**Exit test (passed 15 Sep, automated):** as above. Six escalations, not one: after six days the five seed cases raised 1–4 days ago cross the line as well — which is the honest picture of an inbox nobody clears.

*Not done, by choice:* nothing auto-*closes* on escalation and nothing escalates a second time (to the manager). Both are product decisions; the reducer has the data (`escalated.day`) when you want them.

### Phase 5 — Demo polish (anyone)
- [ ] Guided path: a "Play the story" button that resets and steps through phases 2–4 with toasts (a helper task: it is a list of `this.act.*` calls with waits, no new state)
- [x] Export events as CASES rows with `seedEvents` (dev panel → Copy for data.js)
- [ ] Empty states re-checked with Demo data off after phases 2–4 (the flow test covers demo-on only)
- [ ] The dev panel "Inbox of" list is dark-on-dark on a phone — check it at 375px

---

## 6. Rules for helpers on this work

- You add UI and call `this.act.something(...)`. You do not edit `store.js`
  or the reducer. If the event you need does not exist, describe it in the PR
  and Kevin adds it.
- Never store text that is meant for display (`'Sent to X. They owe…'`) —
  store the facts (`assignee`, `day`) and build the sentence at render time.
- Everything you build must still look right with **Demo data off** and at
  **375px**.
- One button per PR is a fine size.

## 7. Open decisions (Kevin)

1. Persona switch for other leads: dev panel only, or a visible "act as" in the
   user menu? (Recommend dev panel — it's a demo control, not a product feature.)
2. Should "Yes, do it" always create an idea, or only when the case is
   idea-shaped? (Recommend: a checkbox, default off.)
3. Keep `localStorage` per browser, or move the log to a tiny JSON endpoint
   now so two laptops can share one demo? (Recommend localStorage until
   phase 4 is done; the reducer doesn't care where events come from.)
