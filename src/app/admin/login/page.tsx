// Unlocks the admin area with ADMIN_ACCESS_CODE. Not a user account - there is no admin user.
import { redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import styles from "../admin.module.css";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect(process.env.TENANT_MODE === "subdomain" ? "/" : "/admin");
  return (
    <section className={styles.card}>
      <h1>Admin</h1>
      <p className="nh-hint">Add a company, rotate its access code, or remove it.</p>
      <AdminLoginForm />
    </section>
  );
}
