// The company list plus the create form. The whole "add a customer" flow.
import { redirect } from "next/navigation";
import { isAdmin, listCompanies } from "@/server/actions/admin";
import { CreateCompany } from "@/components/admin/CreateCompany";
import { CompanyList } from "@/components/admin/CompanyList";
import { hasDatabase } from "@/lib/db/client";
import styles from "./admin.module.css";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect(process.env.TENANT_MODE === "subdomain" ? "/login" : "/admin/login");

  if (!hasDatabase()) {
    return (
      <section className={styles.card}>
        <h1>Companies</h1>
        <p className="nh-hint">
          No DATABASE_URL is configured, so there is nothing to list. Start the stack with
          <code> docker compose up</code>, or set DATABASE_URL and run the migrations.
        </p>
      </section>
    );
  }

  const companies = await listCompanies();
  return (
    <>
      <section className={styles.card}>
        <h1>Companies</h1>
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
