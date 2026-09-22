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
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hasDatabase, markDatabaseUnreachable } from "./mode";
import { scopeViolation } from "./scope";

function createClient() {
  // Prisma 7 has no built-in engine: the client talks to Postgres through a driver adapter, and
  // `new PrismaClient()` with no adapter throws. This is also why the runtime image needs no
  // native engine binary and no OpenSSL gymnastics.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Callers should check hasDatabase() and fall back to the demo tenant.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) }).$extends({
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

/**
 * Ask Postgres once whether it is there. Called from src/instrumentation.ts before the first
 * request. When nothing answers, the process runs on the built-in demo instead of throwing
 * "Can't reach database server" into every page - that is what lets a colleague without Docker
 * open the landing page and the dashboard after copying .env.example.
 */
export async function probeDatabase(): Promise<void> {
  if (!hasDatabase()) return;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("no answer within 3 s")), 3000).unref(),
  );
  try {
    await Promise.race([getDb().$queryRaw`SELECT 1`, timeout]);
  } catch (err) {
    const where = describe(process.env.DATABASE_URL);
    const why = reason(err);
    markDatabaseUnreachable(`nothing answers at ${where} (${why})`);
    // Drop the half-made client so nothing later reuses a broken pool.
    void globalForDb.__nextupDb?.$disconnect().catch(() => {});
    globalForDb.__nextupDb = undefined;
    console.warn(
      `[nextup] DATABASE_URL is set but nothing answers at ${where} (${why}).\n` +
        "[nextup] Running on the built-in acme demo instead: /acme works, /admin and login are off.\n" +
        "[nextup] Start Postgres (docker start nextup-dev-db) and restart the dev server, or remove DATABASE_URL.",
    );
  }
}

/** The line that says what went wrong - Prisma puts "Invalid invocation:" above it. */
function reason(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const lines = err.message.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => !l.includes("invocation")) ?? lines[0] ?? err.name;
}

/** host:port of a connection string, never the password. */
function describe(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "the configured address";
  }
}

export { hasDatabase, databaseOutage } from "./mode";

export { TenantScopeError } from "./scope";
