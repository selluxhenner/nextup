// The Prisma client, with the tenant guard from docs/INTEGRATIONS.md wired in:
// "A Prisma client extension that refuses any query on a tenant table without companyId."
//
// Two rules this file exists to enforce:
//   1. Nothing constructs a client at module scope. `new PrismaClient()` throws when
//      DATABASE_URL is missing, and `next build` imports server modules - CI builds with no
//      database, so construction has to be lazy. Call getDb() inside a function, never at the top.
//   2. Every query on a tenant table names its company, or it throws.
//
// Known limits, stated plainly because they matter:
//   - The guard sees top-level operations only. `company.findUnique({ include: { events: true } })`
//     slips past it. Convention: never nest-include a tenant table from Company; go through the
//     helpers in this folder.
//   - $queryRaw / $executeRaw bypass it entirely.
//   - The real fix is Postgres row-level security, which docs/INTEGRATIONS.md already names as the
//     next step. This guard is the cheap 90% until then.
import { PrismaClient } from "@prisma/client";
import { scopeViolation } from "./scope";

function createClient() {
  return new PrismaClient().$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const violation = scopeViolation(model, operation, args);
          if (violation) throw violation;
          return query(args);
        },
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;

// Next's dev server re-evaluates modules on every edit; without this the connection pool grows
// until Postgres refuses new clients.
const globalForDb = globalThis as unknown as { __nextupDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__nextupDb) globalForDb.__nextupDb = createClient();
  return globalForDb.__nextupDb;
}

/** Is a database configured at all? Lets callers fall back to the built-in demo tenant. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { TenantScopeError } from "./scope";
