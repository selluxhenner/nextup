// STEP 1 of login: work email or company slug -> /[company]/login. Visual only: the form is a GET to /acme/login.
import Link from "next/link";
import { AuthShell, AuthTitle, AuthFoot, AuthRoles } from "@/components/auth/AuthShell";
import { Field } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Divider";
import styles from "@/components/auth/forms.module.css";

export const metadata = { title: "Log in" };

export default function FindCompanyPage() {
  return (
    <AuthShell
      side={
        <>
          <p className="nh-eyebrow">Who owns this decision?</p>
          <h2>Nineteen working days.<br />Three of them are work.</h2>
          <p>Log in to see what is waiting on whom - and for how long. One home screen per role:</p>
          <AuthRoles items={[
            ["Team member", "Raise", "Problem or idea in one box - NextUp names the owner and the deadline."],
            ["Team leader", "Inbox", "Open items, oldest first. Yes, no and why, pass on, or ask - one click."],
            ["Manager", "Overview", "What is waiting on you, the wait ledger, where the waiting goes."],
          ]} />
        </>
      }
    >
      <AuthTitle step="Step 1 of 2" title="Find your company" sub="Enter your work email or your company's NextUp name. We will take you to your company's login." />

      <form className={styles.form} action="/acme/login" method="get" autoComplete="off">
        <Field id="email" label="Work email">
          <input className="nh-input" id="email" type="email" placeholder="you@company.com" autoComplete="email" />
        </Field>

        <Divider />

        <Field id="company" label="Company name" hint="The short name in your invitation link.">
          <div className={styles.slug}>
            <input className="nh-input" id="company" type="text" placeholder="acme" defaultValue="acme" autoComplete="organization" />
            <span className={`${styles.slugSuffix} nh-mono`}>.nextup.app</span>
          </div>
        </Field>

        <button className="nh-btn nh-btn-primary nh-btn-block" type="submit">Continue</button>
      </form>

      <AuthFoot>
        New here? <Link href="/signup">Create a workspace</Link> · <Link href="/invite/demo">I have an invite</Link>
      </AuthFoot>
    </AuthShell>
  );
}
