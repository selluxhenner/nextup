// Authenticated shell: rail + top bar around every app page. Session + role guard live here
// (Phase 2). Until then DemoProvider holds the persona (switchable in the dev panel), the event
// log and the demo seed for this company; AppShell renders the chrome from it.
import { notFound } from "next/navigation";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ company: string }> }) {
  const { company } = await params;
  // Nested layouts render in parallel, so the parent's notFound() does not stop this one.
  // Every stray single-segment URL (/favicon.ico, typos) lands here - 404 it ourselves.
  const tenant = await findTenant(company);
  if (!tenant) notFound();
  const seed = await seedFor(tenant.slug);
  return (
    <DemoProvider tenant={{ slug: tenant.slug, name: tenant.name, users: tenant.users.map((u) => ({ name: u.name, email: u.email })) }} seed={seed}>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
