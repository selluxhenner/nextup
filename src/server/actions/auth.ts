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
import { demoCodeFor, isDemoCode } from "@/server/demo-login";
import { clearSession, issueSession } from "@/server/issue-session";

export type LoginPerson = { id: string; name: string; email: string; role: Role; line: string };

export type LoginState =
  | { step: "code"; error?: string }
  | { step: "who"; code: string; people: LoginPerson[]; via?: "code" | "microsoft"; error?: string };

const wrongCode = (): LoginState => ({
  step: "code",
  error: "That code doesn't open this company. Check for a typo, or ask your team lead for a fresh one.",
});

/** The real code, or - on a demo box only - the derived demo code (src/server/demo-login.ts). */
function codeOpens(slug: string, code: string, hash: string): boolean {
  return verifyAccessCode(code, hash) || isDemoCode(slug, code);
}

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
  const via = String(form.get("via") ?? "");
  if (via === "back") return { step: "code" };
  if (prev.step === "code" && via === "microsoft") return continueWithMicrosoft(form);
  return prev.step === "who" ? signIn(prev, form) : checkAccessCode(prev, form);
}

/**
 * A pretend "Continue with Microsoft" for demos. There is no Entra app behind it: on a demo box it
 * skips the code (using the demo code under the hood) and shows the company's people as Microsoft
 * accounts to pick from. Anywhere else it says plainly that Microsoft sign-in is not connected.
 */
async function continueWithMicrosoft(form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  if (!hasDatabase()) return noDatabase();

  const code = demoCodeFor(slug);
  if (!code) {
    return { step: "code", error: "Microsoft sign-in isn't connected for this company yet. Use your access code for now." };
  }

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  if (!company) return { step: "code", error: "We couldn't find this company. Go back and pick it again." };
  if (company.users.length === 0) {
    return { step: "code", error: "This company has no people yet. Add them in the admin page first." };
  }
  return { step: "who", code, people: peopleOf(company.users), via: "microsoft" };
}

/** Step 1 -> step 2. Returns the people only once the code is right. */
async function checkAccessCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { step: "code", error: "Enter the access code your team lead gave you." };

  if (!hasDatabase()) return noDatabase();

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  if (!company || !codeOpens(slug, code, company.accessCodeHash)) return wrongCode();

  if (company.users.length === 0) {
    return { step: "code", error: "This company has no people yet. Add them in the admin page first." };
  }

  return { step: "who", code, people: peopleOf(company.users), via: "code" };
}

// The "who are you" list: employees first, then team leaders, then managers - each group by name.
// The first entry is preselected, so whoever logs in without thinking lands as an employee, the
// role every case starts from. A manager scrolls; there are far fewer of them.
const ROLE_ORDER: Record<Role, number> = { member: 0, leader: 1, manager: 2 };
function peopleOf(users: { id: string; name: string; email: string; role: string; line: string; dept: string }[]): LoginPerson[] {
  return users
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role as Role, line: u.line || u.dept }))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name));
}

/** Step 2: the code again (so this cannot be called on its own) plus who you are. */
async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const userId = String(form.get("userId") ?? "");
  const next = String(form.get("next") ?? "");
  const via = _prev.step === "who" ? _prev.via : undefined;

  if (!hasDatabase()) return noDatabase();

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  // Re-checked, not trusted from the previous round trip.
  if (!company || !codeOpens(slug, code, company.accessCodeHash)) return wrongCode();

  const user = company.users.find((u) => u.id === userId);
  if (!user) {
    return { step: "who", code, people: peopleOf(company.users), via, error: "Pick who you are to continue." };
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
