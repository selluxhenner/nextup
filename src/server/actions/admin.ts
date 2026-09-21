"use server";
// The admin surface: create a company, rotate its code, delete it.
//
// Deliberately OUTSIDE the [company] segment and outside the role system. src/config/roles.ts has
// three roles and they are all per-company; a fourth "superadmin" role would change the meaning of
// every ROLE_ACCESS row. Instead /admin sits behind its own cookie, unlocked by ADMIN_ACCESS_CODE.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { generateAccessCode, hashAccessCode } from "@/features/auth/access-code";
import { ADMIN_COOKIE, signAdmin, verifyAdmin } from "@/features/auth/cookie";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import {
  initialsOf,
  markFor,
  seedNameWarnings,
  validateNewCompany,
  type NewCompany,
  type NewPerson,
} from "@/features/tenant/create";
import { getDb, hasDatabase } from "@/lib/db/client";
import type { Role } from "@/config/roles";

const ADMIN_TTL_SECONDS = 8 * 60 * 60;

function codeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  return verifyAdmin((await cookies()).get(ADMIN_COOKIE)?.value, secret);
}

export type AdminLoginState = { error?: string };

export async function adminSignIn(_prev: AdminLoginState, form: FormData): Promise<AdminLoginState> {
  const expected = process.env.ADMIN_ACCESS_CODE;
  const secret = process.env.AUTH_SECRET;
  if (!expected || !secret) return { error: "ADMIN_ACCESS_CODE and AUTH_SECRET must be set on the server." };

  const given = String(form.get("code") ?? "");
  if (!given || !codeMatches(given, expected)) return { error: "That is not the admin code." };

  (await cookies()).set(ADMIN_COOKIE, signAdmin(Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS, secret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: ADMIN_TTL_SECONDS,
  });
  redirect(adminHome());
}

export async function adminSignOut() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect(adminHome() + "/login");
}

export type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  people: number;
  events: number;
  url: string;
  createdAt: string;
};

export async function listCompanies(): Promise<CompanyRow[]> {
  if (!(await isAdmin()) || !hasDatabase()) return [];
  const rows = await getDb().company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, slug: true, name: true, stage: true, createdAt: true,
      _count: { select: { users: true, events: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    stage: r.stage,
    people: r._count.users,
    events: r._count.events,
    url: companyUrl(r.slug),
    createdAt: r.createdAt.toISOString(),
  }));
}

export type CreateState =
  | { status: "idle" }
  | { status: "error"; problems: string[] }
  /** The access code is shown once, here, and never again - only its hash is stored. */
  | { status: "created"; slug: string; url: string; accessCode: string; warnings: string[] };

export async function createCompanyAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  if (!(await isAdmin())) return { status: "error", problems: ["Not signed in to the admin area."] };
  if (!hasDatabase()) return { status: "error", problems: ["No database is configured."] };

  const input: NewCompany = {
    slug: String(form.get("slug") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    mark: String(form.get("mark") ?? "").trim() || undefined,
    template: form.get("template") === "empty" ? "empty" : "demo",
    people: parsePeople(form),
  };

  const problems = validateNewCompany(input);
  if (problems.length) return { status: "error", problems: problems.map((p) => p.message) };

  const db = getDb();
  if (await db.company.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
    return { status: "error", problems: [`A company with the slug "${input.slug}" already exists.`] };
  }

  const seed = seedTemplate(input.template);
  const accessCode = generateAccessCode(input.slug);

  await db.company.create({
    data: {
      slug: input.slug,
      name: input.name,
      mark: markFor(input),
      stage: "demo",
      accessCodeHash: hashAccessCode(accessCode),
      seedJson: toSeedJson(seed) as object,
      config: { create: {} },
      users: {
        create: input.people.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim().toLowerCase(),
          role: p.role,
          dept: p.dept ?? "",
          ini: initialsOf(p.name),
          handle: p.handle ?? null,
        })),
      },
    },
  });

  return {
    status: "created",
    slug: input.slug,
    url: companyUrl(input.slug),
    accessCode,
    warnings: seedNameWarnings(seed, input.people),
  };
}

export type RotateState = { slug?: string; accessCode?: string; error?: string };

export async function rotateAccessCodeAction(_prev: RotateState, form: FormData): Promise<RotateState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return { error: "No such company." };

  const accessCode = generateAccessCode(slug);
  await getDb().company.update({
    where: { id: company.id },
    data: { accessCodeHash: hashAccessCode(accessCode) },
  });
  return { slug, accessCode };
}

/** Destructive and irreversible: the cascade takes the people and the whole event log with it. */
export async function deleteCompanyAction(_prev: RotateState, form: FormData): Promise<RotateState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };

  const slug = String(form.get("slug") ?? "");
  // Typing the slug is the confirmation - there is no undo.
  if (String(form.get("confirm") ?? "") !== slug) {
    return { error: `Type "${slug}" to confirm. Deleting takes its people and its whole history with it.` };
  }
  await getDb().company.deleteMany({ where: { slug } });
  return { slug };
}

function parsePeople(form: FormData): NewPerson[] {
  const names = form.getAll("personName").map(String);
  const emails = form.getAll("personEmail").map(String);
  const roles = form.getAll("personRole").map(String);
  const depts = form.getAll("personDept").map(String);

  return names
    .map((name, i) => ({
      name: name.trim(),
      email: (emails[i] ?? "").trim(),
      role: (roles[i] ?? "member") as Role,
      dept: (depts[i] ?? "").trim() || undefined,
    }))
    .filter((p) => p.name || p.email);
}

function adminHome(): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/admin";
}

function companyUrl(slug: string): string {
  const domain = process.env.APP_DOMAIN ?? "localhost";
  const scheme = process.env.PUBLIC_SCHEME ?? "http";
  return process.env.TENANT_MODE === "subdomain"
    ? `${scheme}://${slug}.${domain}`
    : `${scheme}://${domain}/${slug}`;
}
