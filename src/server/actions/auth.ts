"use server";
// Sign in and out. The pilot's login: one access code per company, then pick which of that
// company's people you are (docs/PLAN.md Phase 2, minus Auth.js - no passwords, no email).
//
// Two steps on purpose. The code is checked before any name or address is returned, so the
// employee list of a pilot customer is not readable by anyone who guesses the subdomain.
import { redirect } from "next/navigation";
import { ROLE_HOME, type Role } from "@/config/roles";
import { verifyAccessCode } from "@/features/auth/access-code";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { clearSession, issueSession } from "@/server/issue-session";

export type LoginPerson = { id: string; name: string; role: Role; line: string };

export type LoginState =
  | { step: "code"; error?: string }
  | { step: "who"; code: string; people: LoginPerson[]; error?: string };

const wrongCode = (): LoginState => ({ step: "code", error: "That code is not right for this company." });

async function companyBySlug(slug: string) {
  // null when Postgres is gone as well as when the slug is unknown; callers check hasDatabase().
  return orDemo(
    () =>
      getDb().company.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          accessCodeHash: true,
          users: { orderBy: { name: "asc" } },
        },
      }),
    () => null,
  );
}

const noDatabase = (): LoginState => ({
  step: "code",
  error: "No database is connected, so there is nobody to sign in as. The demo works without one.",
});

/**
 * The whole company login, both steps, as ONE action.
 *
 * Deliberately not two actions picked by a client-side closure: useActionState must be handed a
 * server action directly, or the form has no action to fall back to before React hydrates and a
 * submit does nothing at all.
 */
export async function companyLogin(prev: LoginState, form: FormData): Promise<LoginState> {
  return prev.step === "who" ? signIn(prev, form) : checkAccessCode(prev, form);
}

/** Step 1 -> step 2. Returns the people only once the code is right. */
async function checkAccessCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { step: "code", error: "Enter the code your team lead gave you." };

  if (!hasDatabase()) return noDatabase();

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  if (!company || !verifyAccessCode(code, company.accessCodeHash)) return wrongCode();

  if (company.users.length === 0) {
    return { step: "code", error: "This company has no people yet. Add them in the admin page first." };
  }

  return {
    step: "who",
    code,
    people: company.users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as Role,
      line: u.line || u.dept,
    })),
  };
}

/** Step 2: the code again (so this cannot be called on its own) plus who you are. */
async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const userId = String(form.get("userId") ?? "");
  const next = String(form.get("next") ?? "");

  if (!hasDatabase()) return noDatabase();

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  // Re-checked, not trusted from the previous round trip.
  if (!company || !verifyAccessCode(code, company.accessCodeHash)) return wrongCode();

  const user = company.users.find((u) => u.id === userId);
  if (!user) {
    return {
      step: "who",
      code,
      people: company.users.map((u) => ({ id: u.id, name: u.name, role: u.role as Role, line: u.line || u.dept })),
      error: "Pick who you are.",
    };
  }

  const role = user.role as Role;
  await issueSession(company.id, company.slug, user);

  const home = ROLE_HOME[role];
  const target = next.startsWith("/") && !next.startsWith("//") ? next : home;
  redirect(prefix(slug) + target);
}

export async function signOut(slug: string) {
  await clearSession();
  redirect(prefix(slug) + "/login");
}

/** In subdomain mode the company IS the host, so links carry no slug. */
function prefix(slug: string): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/" + slug;
}
