# n8n workflows

Exported as JSON and committed, because otherwise n8n is untracked state nobody can reproduce
(`docs/INTEGRATIONS.md`). One self-hosted instance serves every company; workflows read the
company from the payload.

## `case-raised-notify-owner.json`

The first workflow, and the only one until it runs end to end.

```
app: case.raised commits
  -> POST http://n8n:5678/webhook/nextup/case-raised   (in-network, X-NextUp-Token)
     -> is it a raise, and does the route have an owner?
        -> compose the message from the facts the app sent
        -> email the owner            (SMTP credential <slug>-smtp -> mailpit in the demo stack)
        -> POST back case.commented   (bearer <slug>-nextup, Idempotency-Key: the event id)
```

**The app resolves the route owner, not n8n.** The webhook body already carries the case, the
owner's name and address, the deputy, the due day and deep links. Keeping n8n dumb avoids a second
endpoint whose only job is exposing the routing table.

**Re-running is safe.** The write-back uses the event id as its `Idempotency-Key`, so a replay
answers `200 {"duplicate": true}` and writes no row.

### Push, not poll — and why that differs from the doc

`docs/INTEGRATIONS.md` chose polling because "a Vercel function cannot reliably retry a failed
webhook". On the Hetzner box the app and n8n share a Docker network, so this is one in-network hop
and the owner hears about it while people are still in the room. Reliability is handled by never
blocking: the POST happens after the row commits, is not awaited, and every failure is swallowed —
n8n being down cannot break the core loop, which is the rule that doc actually cares about.

`GET /api/[company]/events?since=<cursor>` is still there, so a catch-up workflow can be added
later without changing anything here.

## Setting it up

Everything below assumes the stack is up (`docker compose up -d`) and `/admin` opens.

### 1. Three credentials, made in n8n — never in this repo

Open n8n (`n8n.<domain>`, or the published port). The first visit asks you to create the owner
account; that account is yours and lives only in the `n8ndata` volume.

| Credential | Type | Value |
|---|---|---|
| `nextup-webhook` | Header Auth | name `x-nextup-token`, value = `N8N_HOOK_TOKEN` from `.env` |
| `<slug>-nextup` | Header Auth | name `Authorization`, value `Bearer <token>` — `/admin` → **API token** |
| `<slug>-smtp` | SMTP | host `mailpit`, port `1025`, no user, no password, TLS off |

The webhook credential is what makes the endpoint answer 403 to anything that is not us. The
`<slug>-nextup` one is how the workflow writes back, and it is scoped to that one company: used
against another company the API answers 403, by design.

### 2. Import the workflow and attach the credentials

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/case-raised-notify-owner.json
```

`./ops/n8n` is mounted read-only at `/data/workflows`, so a `git pull` is enough to update it.

The committed JSON carries **no credential references** — that is deliberate, see below — so after
importing, open the workflow and set the credential on three nodes:

- **Case raised (webhook)** → `nextup-webhook`
- **Email the owner** → `<slug>-smtp`
- **Write it back to the case** → `<slug>-nextup`

### 3. Activate it

A workflow that is imported but not active answers **404** on its production webhook. Toggle it
active in the UI, or:

```bash
docker compose exec n8n n8n update:workflow --id=<id> --active=true
```

The CLI prints "restart n8n for changes to take effect" — do that (`docker compose restart n8n`),
otherwise the running process is still serving the old state.

### Exporting after editing in the UI

```bash
docker compose exec n8n n8n export:workflow --id=<id> --pretty --output=/data/workflows/out.json
```

**Strip credential ids and data before committing.** gitleaks runs on every PR and n8n exports
carry a `credentials` block on every node. That block is also why step 2 is manual: keeping it out
of the repo is worth three clicks.

## Checking it works

1. `/admin` → **API token** for the company; paste it into the `<slug>-nextup` credential.
2. Raise a case as a member.
3. n8n → Executions: one run, green.
4. `mail.<domain>` (Mailpit): the message to the route owner.
5. Reload the case: the timeline now reads *"Route owner notified by email."*, posted by
   `system:n8n`.
6. `/admin` → **Automation tasks**: the raise now reads *"… notified, written back after Ns"*.

A quick check that needs no browser — 403 means active and guarded, 404 means not active:

```bash
curl -s -o /dev/null -w "%{http_code}
" -X POST -d '{}' http://localhost:5678/webhook/nextup/case-raised
```

If nothing arrives, the app logs `[n8n] could not deliver case.raised notice for <slug>` and
carries on — the case is saved either way. `/admin` → **Automation tasks** lists every raise n8n
never answered and has a **Send again** button that re-sends one and reports what came back.
Re-sending is safe: the write-back carries `Idempotency-Key: notify:<eventId>`, so a second
successful run answers `200 {"duplicate": true}` and writes no second comment.

## Things that will bite you

**`access to env vars denied`** — the write-back URL is `{{ $env.NEXTUP_BASE }}/...`, and n8n
blocks `$env` in expressions unless `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. It is set on the n8n
service in `compose.yml`; if you run n8n some other way, set it there too.

**`/api//events` with an empty slug** — `$json` in the write-back node is the *email* node's
output (`accepted`, `messageId`), not the composed fields. Every reference to the composed values
has to name the node: `{{ $('Compose the message').item.json.slug }}`. The committed workflow
already does this; it is easy to undo by accident when editing in the UI.

**Nothing at all, no execution** — the app only calls n8n when `N8N_HOOK_URL` is set. Without it
`notifyCaseRaised` returns immediately and a raise notifies nobody. `/admin` → **Automation** says
so in as many words.
