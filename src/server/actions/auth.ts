"use server";
// Sign in and out. The pilot's login: one access code per company, then pick which of that
// company's people you are (docs/PLAN.md Phase 2, minus Auth.js - no passwords, no email).
//
// Two steps on purpose. The code is checked before any name or address is returned, so the
// employee list of a pilot customer is not readable by anyone who guesses the subdomain.
//
// What step 2 looks like depends on the company's stage (policyFor in features/admin/stages.ts):
// a demo company lists its people to pick from; a company with real people asks for your own
// work email instead, so the shared code alone neither reveals the staff list nor lets you pick
// the manager. Every code check is throttled (src/server/throttle.ts).
import { redirect } from "next/navigation";
import { ROLE_HOME, type Role } from "@/config/roles";
import { verifyAccessCode } from "@/features/auth/access-code";
import { policyFor } from "@/features/admin/stages";
import { safeNextPath } from "@/features/tenant/urls";
import { getDb, hasDatabase, orDemo } from "@/lib/db/client";
import { demoCodeFor, isDemoCode } from "@/server/demo-login";
import { clearSession, issueSession } from "@/server/issue-session";
import { clientKey, forgive, throttle } from "@/server/throttle";

export type LoginPerson = { id: string; name: string; email: string; role: Role; line: string };

export type LoginState =
  | { step: "code"; error?: string }
  | {
      step: "who";
      code: string;
      /** Empty when `ask` is "email": a real company's staff list never leaves the server. */
      people: LoginPerson[];
      ask?: "pick" | "email";
      via?: "code" | "microsoft";
      email?: string;
      error?: string;
    };

const wrongCode = (): LoginState => ({
  step: "code",
  error: "That code doesn't open this company. Check for a typo, or ask your team lead for a fresh one.",
});

/**
 * The real code, or - on a demo box, for a demo-stage company only - the derived demo code
 * (src/server/demo-login.ts). A sandbox/pilot/live company always needs its real code.
 */
function codeOpens(company: { slug: string; stage: string; accessCodeHash: string }, code: string): boolean {
  if (verifyAccessCode(code, company.accessCodeHash)) return true;
  return policyFor(company.stage).demoLogin && isDemoCode(company.slug, code);
}

/** Count one code attempt. Null to go ahead, or the "wait" state to return. */
async function tooMany(slug: string): Promise<LoginState | null> {
  const who = await clientKey();
  const error = throttle("companyLogin", `${who}|${slug}`) ?? throttle("companyLoginAll", slug);
  return error ? { step: "code", error } : null;
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
          stage: true,
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
  // The pretend Microsoft login skips the code entirely - demo companies only.
  if (!policyFor(company.stage).demoLogin) {
    return { step: "code", error: "Microsoft sign-in isn't connected for this company yet. Use your access code for now." };
  }
  if (company.users.length === 0) {
    return { step: "code", error: "This company has no people yet. Add them in the admin page first." };
  }
  return whoStep(company, code, "microsoft");
}

/** Step 1 -> step 2. Returns the people only once the code is right. */
async function checkAccessCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { step: "code", error: "Enter the access code your team lead gave you." };

  if (!hasDatabase()) return noDatabase();

  const blocked = await tooMany(slug);
  if (blocked) return blocked;

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  if (!company || !codeOpens(company, code)) return wrongCode();
  forgive("companyLogin", `${await clientKey()}|${slug}`);

  if (company.users.length === 0) {
    return { step: "code", error: "This company has no people yet. Add them in the admin page first." };
  }

  return whoStep(company, code, "code");
}

/** Step 2's shape: a list to pick from (demo) or an email field (real people). */
function whoStep(
  company: { stage: string; users: Parameters<typeof peopleOf>[0] },
  code: string,
  via: "code" | "microsoft",
  error?: string,
  email?: string,
): LoginState {
  if (policyFor(company.stage).pickPersonAtLogin) {
    return { step: "who", code, people: peopleOf(company.users), ask: "pick", via, error };
  }
  return { step: "who", code, people: [], ask: "email", via, email, error };
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
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = String(form.get("next") ?? "");
  const via = _prev.step === "who" && _prev.via ? _prev.via : "code";

  if (!hasDatabase()) return noDatabase();

  // Step 2 re-checks the code, so it is a guessing door too - counted like step 1.
  const blocked = await tooMany(slug);
  if (blocked) return blocked;

  const company = await companyBySlug(slug);
  if (!hasDatabase()) return noDatabase();
  // Re-checked, not trusted from the previous round trip.
  if (!company || !codeOpens(company, code)) return wrongCode();

  const policy = policyFor(company.stage);
  const user = policy.pickPersonAtLogin
    ? company.users.find((u) => u.id === userId)
    : email
      ? company.users.find((u) => u.email.toLowerCase() === email)
      : undefined;
  if (!user) {
    const error = policy.pickPersonAtLogin
      ? "Pick who you are to continue."
      : email
        ? "That email isn't on this company's list. Use your work address, or ask your team lead to add you."
        : "Enter your work email to continue.";
    return whoStep(company, code, via, error, email);
  }

  const role = user.role as Role;
  await issueSession(company.id, company.slug, user);

  const home = ROLE_HOME[role];
  const target = safeNextPath(next) ?? home;
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
