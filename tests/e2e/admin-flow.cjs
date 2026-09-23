// End-to-end: add a company in /admin and log into it. Covers the one flow that cannot be
// unit-tested - the admin form, the access code, and a brand-new company serving immediately.
//
// No dependency is added for this. Playwright is installed on the side, the same way
// .github/ci/smoke.cjs does it for the legacy demo:
//
//   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright
//   # in the repo, with a database:
//   DATABASE_URL=... AUTH_SECRET=s ADMIN_ACCESS_CODE=admin-code-xyz \
//     TENANT_MODE=path APP_DOMAIN=localhost npx next dev -p 3994
//   NODE_PATH=/tmp/pw/node_modules node tests/e2e/admin-flow.cjs
//
// It creates the company "bosch-rexroth"; delete it before re-running, or the duplicate guard
// (correctly) refuses.
const { chromium } = require("playwright");

// CommonJS (not .mjs) so that NODE_PATH resolves playwright from a side install -
// the same trick .github/ci/smoke.cjs uses for the legacy demo.
async function main() {

const B = process.env.BASE_URL ?? "http://127.0.0.1:3994";
const SLUG = "bosch-rexroth";
let fails = 0;
function ok(message) { console.log("  PASS", message); }
function bad(message) { console.log("  FAIL", message); fails += 1; }
/** One assertion: passes with `pass`, otherwise reports `fail`. */
function check(condition, pass, fail) {
  if (condition) ok(pass); else bad(fail ?? pass);
}

const browser = await chromium.launch();
const page = await browser.newPage();

// 1. unlock the admin area
await page.goto(B + "/admin/login");
await page.fill("#code", "wrong-code");
await page.click('button[type=submit]');
await page.waitForTimeout(800);
check((await page.locator("text=not the admin code").count()), "wrong admin code refused", "wrong code was accepted");

await page.fill("#code", process.env.ADMIN_ACCESS_CODE ?? "admin-code-xyz");
await page.click('button[type=submit]');
await page.waitForURL(/\/admin$/, { timeout: 15000 });
ok("correct admin code unlocks /admin");

// The create form lives on its own page since /admin became four (Overview/Requests/Companies/Connections).
await page.goto(B + "/admin/companies");

// 2. validation actually stops a bad slug
await page.fill("#name", "Reserved Co");
await page.fill("#slug", "admin");
await page.click('button:has-text("Create company")');
await page.waitForTimeout(1200);
check((await page.locator("text=reserved for the app itself").count()), 'slug "admin" refused as reserved', "reserved slug was accepted");

// 3. create a real company through the form
await page.fill("#name", "Bosch Rexroth AG");
await page.fill("#slug", SLUG);
const names = page.locator('input[name="personName"]');
const emails = page.locator('input[name="personEmail"]');
await names.nth(0).fill("K. Weber");      await emails.nth(0).fill("k.weber@bosch.test");
await names.nth(1).fill("T. Vogel");      await emails.nth(1).fill("t.vogel@bosch.test");
await names.nth(2).fill("M. Roth");       await emails.nth(2).fill("m.roth@bosch.test");
await page.click('button:has-text("Create company")');
await page.waitForSelector("text=is live", { timeout: 20000 });
ok("company created through the form");

const code = (await page.locator('[class*="code"]').first().innerText()).trim();
check(/^bosch-rexroth-[0-9a-f]{4}-[0-9a-f]{4}$/.test(code), "access code shown once: " + code, "unexpected access code: " + code);

// a name not in the seed must be warned about, a name that is must not be
const warnings = await page.locator('[class*="warn"]').allInnerTexts();
check(warnings.some((w) => w.startsWith("K. Weber")), "warns that K. Weber is not in the seed", "no warning for an unknown name");
check(
  !warnings.some((w) => w.startsWith("T. Vogel")),
  "no warning for T. Vogel, who is in the seed",
  "warned about T. Vogel, who IS in the seed",
);

// 4. the new company serves immediately, with no deploy
const res = await page.goto(B + "/" + SLUG + "/login");
check(res.status() === 200, "/" + SLUG + "/login serves straight away", "new company 404s: " + res.status());
check((await page.locator("text=Bosch Rexroth AG").count()), "its own name is on its login page", "company name missing");

// 5. and the access code it printed actually works
await page.fill("#code", code);
await page.click('button[type=submit]');
try {
  await page.waitForSelector('input[name="userId"]', { timeout: 25000 });
} catch {
  console.log("  page said:", (await page.locator("form").innerText()).replace(/\s+/g, " ").slice(0, 300));
}
const people = await page.locator('input[name="userId"]').count();
check(people === 3, "access code unlocks the people picker (3 people)", "people picker showed " + people);
if (people === 0) { await browser.close(); process.exit(1); }

await page.locator('input[name="userId"]').first().check();
await page.click('button[type=submit]');
await page.waitForURL(new RegExp("/" + SLUG + "/"), { timeout: 20000 });
ok("logged in, landed on " + new URL(page.url()).pathname);

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall admin assertions passed");
  process.exit(fails ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
