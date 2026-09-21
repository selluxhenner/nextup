// Seeds the demo company into a fresh database.
//
//     DATABASE_URL=... npx tsx prisma/seed.ts
//
// Idempotent: re-running updates the company in place and leaves its event rows alone, so it is
// safe against a database people are already clicking around in.
//
// It ports src/features/demo/seed.ts (itself the port of legacy/demo/js/data.js) into acme's
// seedJson, and creates that company's three people from the demo table.
import { randomBytes, scryptSync } from "node:crypto";
import { DEMO_COMPANIES } from "../src/features/tenant/demo-companies";
import { seedTemplate } from "../src/features/demo";
import { toSeedJson } from "../src/features/demo/parse";
import { getDb } from "../src/lib/db/client";

/** scrypt$<saltHex>$<hashHex> - the format Company.accessCodeHash carries. */
function hashCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const iniOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);

async function main() {
  const db = getDb();
  const demo = DEMO_COMPANIES[0];
  const accessCode = process.env.SEED_ACCESS_CODE ?? "demo-" + randomBytes(4).toString("hex");

  const company = await db.company.upsert({
    where: { slug: demo.slug },
    update: {
      name: demo.name,
      mark: demo.mark,
      anonymousHandles: demo.anonymousHandles,
      seedJson: toSeedJson(seedTemplate("demo")) as object,
    },
    create: {
      slug: demo.slug,
      name: demo.name,
      mark: demo.mark,
      anonymousHandles: demo.anonymousHandles,
      stage: "demo",
      accessCodeHash: hashCode(accessCode),
      seedJson: toSeedJson(seedTemplate("demo")) as object,
      config: { create: {} },
    },
  });

  for (const u of demo.users) {
    await db.user.upsert({
      where: { companyId_email: { companyId: company.id, email: u.email } },
      update: { name: u.name, role: u.role, dept: u.dept, handle: u.handle ?? null },
      create: {
        companyId: company.id,
        name: u.name,
        email: u.email,
        role: u.role,
        dept: u.dept,
        ini: iniOf(u.name),
        handle: u.handle ?? null,
      },
    });
  }

  const created = !(await db.caseEvent.count({ where: { companyId: company.id } }));
  console.log(`seeded ${company.slug} (${demo.users.length} people, event log ${created ? "empty" : "left as it was"})`);
  if (process.env.SEED_ACCESS_CODE) {
    console.log("access code: from SEED_ACCESS_CODE");
  } else {
    console.log(`access code: ${accessCode}   <- shown once; re-run with SEED_ACCESS_CODE to set your own`);
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
