// The company list plus the create form. The whole "add a customer" flow.
import { redirect } from "next/navigation";
import { isAdmin, listCompanies, listPilotRequests } from "@/server/actions/admin";
import { CreateCompany } from "@/components/admin/CreateCompany";
import { CompanyList } from "@/components/admin/CompanyList";
import { PilotRequests } from "@/components/admin/PilotRequests";
import { databaseOutage, hasDatabase } from "@/lib/db/client";
import styles from "./admin.module.css";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect(process.env.TENANT_MODE === "subdomain" ? "/login" : "/admin/login");

  if (!hasDatabase()) {
    return (
      <section className={styles.card}>
        <h1>Companies</h1>
        <p className="nh-hint">
          {databaseOutage()
            ? `DATABASE_URL is set but ${databaseOutage()}, so there is nothing to list. `
            : "No DATABASE_URL is configured, so there is nothing to list. "}
          Start the stack with <code>docker compose up</code>, or start Postgres and restart the dev server.
        </p>
      </section>
    );
  }

  const [companies, requests] = await Promise.all([listCompanies(), listPilotRequests()]);
  const open = requests.filter((r) => !r.handledAt).length;
  return (
    <>
      <section className={styles.card}>
        <h1>Pilot requests</h1>
        <p className="nh-hint">
          {requests.length === 0
            ? "None yet. Every real submit of the /contact form lands here."
            : open === 0
              ? `All ${requests.length} replied to.`
              : `${open} waiting for a reply - the two-working-day promise applies to us too.`}
        </p>
        <PilotRequests requests={requests} />
      </section>

      <section className={styles.card}>
        <h2>Companies</h2>
        <p className="nh-hint">
          {companies.length === 0
            ? "None yet. Add the first one below - it is live the moment it is saved, no deploy."
            : `${companies.length} ${companies.length === 1 ? "company" : "companies"}, each on its own address.`}
        </p>
        <CompanyList companies={companies} />
      </section>

      <section className={styles.card}>
        <h2>Add a company</h2>
        <p className="nh-hint">
          The slug becomes the subdomain. Pick the demo template to clone Acme&rsquo;s content, or an
          empty one for a real customer starting from nothing.
        </p>
        <CreateCompany />
      </section>
    </>
  );
}
