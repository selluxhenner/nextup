# n8n workflows

Exported as JSON and committed, because otherwise n8n is untracked state nobody can reproduce
(`docs/INTEGRATIONS.md`). One self-hosted instance serves every company; workflows read the
company from the payload.

## Case notices are no longer here

Until 23 Sep 2026 `case-raised-notify-owner.json` emailed the route owner when a case was raised:
the app POSTed a webhook, n8n sent the mail, then wrote *"Route owner notified by email."* back
through the events API. That took three credentials made by hand in the n8n UI, a callback address
that differed per environment, and a failure anywhere in the chain looked the same from `/admin`.

The app now does it itself (`src/server/case-notice.ts`): it sends the mail through `SMTP_URL` and
writes the same note onto the case, with the same idempotency key `notify:<raiseId>`. Notes the
old workflow wrote still count as answered on `/admin` → Connections. If the workflow is still
imported in your instance, deactivate or delete it - nothing calls it any more.

## What n8n is still for

Anything that happens later rather than while someone waits: deadline → deputy, digests,
connectors. A workflow reads and writes the app through the two endpoints in
`docs/INTEGRATIONS.md`:

```
GET  /api/<slug>/events?since=<cursor>   read the event log
POST /api/<slug>/events                  append case.commented / case.handed as system:n8n
```

Both take `Authorization: Bearer <token>`. Issue one per company in `/admin` → Companies → **API
token**, and store it in n8n as a Header Auth credential named `<slug>-nextup`. A token used
against another company answers 403, by design. Send an `Idempotency-Key` header on every POST so
a re-run answers `200 {"duplicate": true}` and writes no second row.

## Importing and exporting

Open n8n at `n8n.<domain>` (behind the ops login from `OPS_USER` / `OPS_PASSWORD_HASH`) or on the
published port. The first visit asks you to create the owner account - do it right after the first
deploy; that account is yours and lives only in the `n8ndata` volume.

`./ops/n8n` is mounted read-only at `/data/workflows`, so a `git pull` is enough to update it.

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/<name>.json
docker compose exec n8n n8n export:workflow --id=<id> --pretty --output=/data/workflows/out.json
```

An imported workflow is inactive, and an inactive workflow's production webhook answers **404**.
Activate it in the UI, or with `n8n update:workflow --id=<id> --active=true` followed by
`docker compose restart n8n`.

**Strip credential ids and data before committing.** gitleaks runs on every PR, and n8n exports
carry a `credentials` block on every node - attach credentials by hand after importing.
