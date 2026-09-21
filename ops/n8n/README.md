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

Two credentials, per company, created in n8n — **never in this repo**:

| Credential | Type | Value |
|---|---|---|
| `<slug>-nextup` | Header Auth | `Authorization: Bearer <token>` — make it in /admin → **API token** |
| `<slug>-smtp` | SMTP | `mailpit:1025` for the demo stack, no auth, no TLS |

Plus a Header Auth credential for the webhook node itself, checking `X-NextUp-Token` against
`N8N_HOOK_TOKEN` from `.env`.

Import:

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/case-raised-notify-owner.json
```

`./ops/n8n` is mounted read-only at `/data/workflows`, so a `git pull` is enough to update it.

Export after editing in the UI:

```bash
docker compose exec n8n n8n export:workflow --id=<id> --pretty --output=/data/workflows/out.json
```

**Strip credential ids and data before committing.** gitleaks runs on every PR and n8n exports can
carry credential blobs.

## Checking it works

1. `/admin` → **API token** for the company; paste it into the `<slug>-nextup` credential.
2. Raise a case as a member.
3. n8n → Executions: one run, green.
4. `mail.<domain>` (Mailpit): the message to the route owner.
5. Reload the case: the timeline now reads *"Route owner notified by email."*, posted by
   `system:n8n`.

If nothing arrives, the app logs `[n8n] could not deliver case.raised notice for <slug>` and
carries on — the case is saved either way.
