// The admin area. Outside [company] on purpose: it is not a role, it is a different surface,
// reached at admin.<domain> (or /admin in path mode) behind ADMIN_ACCESS_CODE.
import type { Metadata } from "next";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "NextUp admin", robots: { index: false, follow: false } };

// Reads cookies and the database on every request; nothing here should ever be prerendered.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.logo}>NextUp</span>
        <span className={styles.tag}>admin</span>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
