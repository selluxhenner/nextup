// STEP 2 of login: company-branded login. Real now - the access code is checked server-side and
// a signed session cookie is set (src/server/actions/auth.ts).
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell, AuthTitle, AuthFoot, AuthStats } from "@/components/auth/AuthShell";
import { CompanyLoginForm } from "@/components/auth/CompanyLoginForm";
import { MicrosoftLogo } from "@/components/auth/MicrosoftPicker";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { SITE } from "@/config/site";
import { demoCodeFor } from "@/server/demo-login";
import styles from "@/components/auth/forms.module.css";

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: Props) {
  const tenant = await findTenant((await params).company);
  return { title: `Log in to ${tenant?.name ?? "your company"}` };
}

export default async function CompanyLoginPage({ params, searchParams }: Props) {
  const { company } = await params;
  const { next } = await searchParams;
  const tenant = await findTenant(company);
  if (!tenant) notFound(); // the layout 404s too, but layouts and pages render in parallel
  const short = tenant.name.split(" ")[0];

  return (
    <AuthShell
      side={
        <>
          <p className="nh-eyebrow">This week at {short}</p>
          <AuthStats items={[["26 h", "median to first answer"], ["84 %", `within the ${SITE.promiseDays}-day promise`], ["3", "decisions waiting on you"]]} />
          <p>Numbers from the manager overview. Empty inbox by end of day is the whole ritual.</p>
        </>
      }
    >
      <div className={styles.company}>
        <span className={styles.mark} aria-hidden="true">{tenant.mark}</span>
        <div>
          <p className="nh-eyebrow">Step 2 of 2</p>
          <strong>{tenant.name}</strong>
        </div>
        <Link className={styles.switch} href="/login">Not your company?</Link>
      </div>

      {hasDatabase() ? (
        <>
          <AuthTitle title="Welcome back" sub={`Log in with your ${short} account.`} />
          <CompanyLoginForm slug={tenant.slug} short={short} next={next} demoCode={demoCodeFor(tenant.slug)} />
        </>
      ) : (
        // No database, so there is no one to sign in as: a laptop without Postgres. The demo
        // needs no login - send them straight in rather than to a form that can only say no.
        // `?as=member`: through the login you always arrive as the employee (RoleRouter).
        <>
          <AuthTitle title="Demo mode" sub="No database is connected, so there is nothing to log in to. The built-in demo works without one." />
          <Button href={`/${tenant.slug}?as=member`} block>Open the {short} demo</Button>
          <Divider />
          <Link className="nh-btn nh-btn-ghost nh-btn-block" href={`/${tenant.slug}?as=member`}>
            <MicrosoftLogo />
            Continue with Microsoft
          </Link>
        </>
      )}

      <AuthFoot>No account at {short} yet? Ask your team leader for an invite.</AuthFoot>
    </AuthShell>
  );
}
