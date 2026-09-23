# Security

How NextUp keeps companies apart, what protects each door, and what has to land before
real customers depend on it. Read this before touching login, `/admin`, stages or the API.

## Demo data vs. real people

Every company has a `stage` (`src/features/admin/stages.ts`). The code is identical for all four;
what changes is what the stage **allows**. `policyFor(stage)` is the one place that decides, and
the server actions check it - hiding a button is only a courtesy.

| | `demo` | `sandbox` · `pilot` · `live` |
|---|---|---|
| Whose data | Ours - made-up people and cases | Theirs - real people, real cases |
| "Demo code" button, pretend Microsoft login (`LOGIN_DEMO_FILL`) | yes | **no** - always the real access code |
| Login step 2 | pick anyone from the list | type your **own work email** - the staff list never reaches the browser |
| Dev panel: switch person, +1 day, reset, delete added | yes (managers for the last three) | **no** - panel hidden, actions refuse |
| People sent to the browser | the whole company (the dev panel needs them) | the signed-in viewer only |
| Move back to `demo` | - | **refused** - create a separate demo company instead |

An unknown stage gets the real-people policy: fail closed. Creating a company in `/admin` asks
"Who logs in" - demo or real people (sandbox).

## Doors and their locks

| Door | Lock | Brake (`src/server/throttle.ts`) |
|---|---|---|
| `/[company]/login` | per-company access code (scrypt hash), then who you are | 10 tries / 10 min per address+company; 200 / 10 min per company |
| `/admin/login` | `ADMIN_ACCESS_CODE`, constant-time compare | 5 tries / 15 min per address |
| `/contact` | honeypot + server-side validation | 5 / hour per address |
| `/api/[company]/events` | bearer token (sha256 hash stored), scoped to one company | - (token is 192 bits) |
| Every server action | re-checks the session for the slug; never trusts the client for actor or company | - |

Sessions are HMAC-signed cookies (`src/features/auth/cookie.ts`), `HttpOnly`, `SameSite=Lax`, and
`Secure` whenever `COOKIE_SECURE=true` **or** `PUBLIC_SCHEME=https`. Post-login redirects only go
to same-site paths (`safeNextPath`). `next.config.ts` sends a strict CSP, `frame-ancestors 'none'`,
HSTS, `nosniff` and a referrer policy.

## Before the first real customer

1. **Per-person login.** Today the shared code + a colleague's email is enough to act as them.
   Replace step 2 with a magic link to that email, or Microsoft Entra SSO (the pretend button is
   already where it goes). Needs a `LoginToken` table or an Entra app registration.
2. **Session revocation.** Sessions are stateless for 8 h; rotating the company code does not end
   them. Add `Company.sessionVersion`, put it in the cookie, bump it on rotate/offboarding.
3. **Admin as people, not a shared code.** One `ADMIN_ACCESS_CODE` for everyone means no audit of
   who did what. Named admin users (magic link or SSO) plus 2FA.
4. **Audit log for admin actions** - create, stage move, rotate code, issue token, delete - as
   events, like everything else.
5. **Shared rate-limit store.** The throttle counts in process memory: right for one Hetzner box,
   per-instance on Vercel. Move the `Map` to a Postgres table when there is more than one process.
6. **Role-scoped data.** The whole case log goes to every signed-in browser; roles only choose
   which pages show it. If members must not see something, filter it on the server.
7. **GDPR basics** - a processing record, a DPA with each customer, data export and deletion per
   company (delete exists; export does not), backup encryption and retention.

## Ongoing

- `npm audit` in CI and Dependabot alerts on. Today's 4 "high" findings sit in Prisma's CLI tooling
  (`mysql2`, `deepmerge-ts`), not in the runtime; `npm audit fix --force` would downgrade Prisma to
  v6 - wait for a Prisma release instead.
- `LOGIN_DEMO_FILL` / `ADMIN_DEMO_FILL` only on demo boxes. `/admin/connections` flags both.
- Anything published by Docker on a laptop binds to `127.0.0.1`, never all interfaces.
- A pentest by an outside firm before `live`.
