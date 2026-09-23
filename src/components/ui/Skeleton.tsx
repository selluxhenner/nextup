// Placeholder shown while a page waits: before hydration (views gate on `ready`) and while a
// route segment streams in (app/[company]/(app)/loading.tsx). Grey shapes in the page's layout -
// a title, a toolbar, a few cards - so slower devices see the page arrive instead of a blank.
import styles from "./Skeleton.module.css";

// `delay` (default): stay invisible for the first 400ms so fast loads never flash a skeleton.
// Off for route navigation, where the previous page has already been replaced.
export function PageSkeleton({ rows = 4, delay = true }: { rows?: number; delay?: boolean }) {
  return (
    <div className={styles.page} data-delay={delay ? "true" : undefined} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.sr}>Loading…</span>
      <div className={styles.head} aria-hidden="true">
        <div className={styles.headText}>
          <span className={styles.bone} data-size="title" />
          <span className={styles.bone} data-size="sub" />
        </div>
        <span className={styles.bone} data-size="tools" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.card} aria-hidden="true">
          <span className={styles.bone} data-size="avatar" />
          <div className={styles.cardText}>
            <span className={styles.bone} data-size="line" />
            <span className={styles.bone} data-size="short" />
          </div>
          <span className={styles.bone} data-size="pill" />
        </div>
      ))}
    </div>
  );
}
