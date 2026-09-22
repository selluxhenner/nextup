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
import { hasDatabase, markDatabaseReachable, markDatabaseUnreachable } from "./mode";
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
const globalForDb = globalThis as unknown as { __nextupDb?: Db; __nextupDbRetry?: NodeJS.Timeout };

export function getDb(): Db {
  if (!globalForDb.__nextupDb) globalForDb.__nextupDb = createClient();
  return globalForDb.__nextupDb;
}

/**
 * Ask Postgres whether it is there. Called from src/instrumentation.ts before the first request.
 * When nothing answers, the process runs on the built-in demo instead of throwing "Can't reach
 * database server" into every page - that is what lets a colleague without Docker open the
 * landing page and the dashboard after copying .env.example.
 */
export async function probeDatabase(): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await ping();
  } catch (err) {
    goDown(err);
  }
}

/**
 * Run one database read; if Postgres has gone away since startup (Docker Desktop closed, laptop
 * woke up), switch to demo mode right there and answer with `fallback` instead of a 500.
 * Only connection errors are swallowed - a bad query still throws.
 */
export async function orDemo<T>(query: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (!hasDatabase()) return fallback();
  try {
    return await query();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    goDown(err);
    return fallback();
  }
}

/** Does this error mean Postgres is unreachable, as opposed to a query being wrong? */
export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "PrismaClientInitializationError") return true;
  return /Can't reach database server|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|Connection terminated|connection pool|no answer within/i.test(
    err.message,
  );
}

function ping(): Promise<unknown> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("no answer within 3 s")), 3000).unref(),
  );
  return Promise.race([getDb().$queryRaw`SELECT 1`, timeout]);
}

/** Switch to demo mode: flag it, drop the broken pool, say so once, and keep trying to come back. */
function goDown(err: unknown) {
  // Layouts and pages render in parallel, so several reads fail in the same instant: say it once.
  if (globalForDb.__nextupDbRetry) return;
  const where = describe(process.env.DATABASE_URL);
  const why = reason(err);
  markDatabaseUnreachable(`nothing answers at ${where} (${why})`);
  void globalForDb.__nextupDb?.$disconnect().catch(() => {});
  globalForDb.__nextupDb = undefined;
  console.warn(
    `[nextup] DATABASE_URL is set but nothing answers at ${where} (${why}).\n` +
      "[nextup] Running on the built-in acme demo instead: /acme works, /admin and login are off.\n" +
      "[nextup] Start Postgres (docker start nextup-dev-db) and it is picked up again within 30 s, or remove DATABASE_URL.",
  );
  globalForDb.__nextupDbRetry = setTimeout(retry, RETRY_MS);
  globalForDb.__nextupDbRetry.unref();
}

const RETRY_MS = 30_000;

async function retry() {
  globalForDb.__nextupDbRetry = undefined;
  try {
    await ping();
    markDatabaseReachable();
    console.info(`[nextup] Postgres answers again at ${describe(process.env.DATABASE_URL)} - leaving demo mode.`);
  } catch {
    void globalForDb.__nextupDb?.$disconnect().catch(() => {});
    globalForDb.__nextupDb = undefined;
    globalForDb.__nextupDbRetry = setTimeout(retry, RETRY_MS);
    globalForDb.__nextupDbRetry.unref();
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
