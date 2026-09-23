"use client";
// The pretend Microsoft "Pick an account" window for demo boxes. There is no Microsoft behind it:
// the accounts are the company's people, and picking one submits the same sign-in step as the
// "Who are you?" list. Rendered inside CompanyLoginForm's <form>, so its buttons submit it.
//
// A native <dialog> opened with showModal(): the top layer escapes the auth card's transform
// (a position:fixed overlay would be trapped inside it) while the buttons stay in the form.
import { useEffect, useRef } from "react";
import type { LoginPerson } from "@/server/actions/auth";
import styles from "./MicrosoftPicker.module.css";

export function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f35325" />
      <rect x="12" y="1" width="10" height="10" fill="#81bc06" />
      <rect x="1" y="12" width="10" height="10" fill="#05a6f0" />
      <rect x="12" y="12" width="10" height="10" fill="#ffba08" />
    </svg>
  );
}

const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

type Props = { company: string; people: LoginPerson[]; pending: boolean; error?: string };

export function MicrosoftPicker({ company, people, pending, error }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.window}
      aria-labelledby="ms-title"
      // Escape = Cancel: back to the code step instead of a closed dialog over a dead form.
      onCancel={(e) => {
        e.preventDefault();
        cancel.current?.click();
      }}
    >
      <div className={styles.brand}>
        <MicrosoftLogo />
        <span>Microsoft</span>
      </div>
      <h2 id="ms-title" className={styles.title}>Pick an account</h2>
      <p className={styles.sub}>to continue to NextUp · {company}</p>

      <ul className={styles.accounts}>
        {people.map((p, i) => (
          <li key={p.id}>
            <button className={styles.account} type="submit" name="userId" value={p.id} disabled={pending} autoFocus={i === 0}>
              <span className={styles.avatar} aria-hidden="true">{initials(p.name)}</span>
              <span className={styles.who}>
                <strong>{p.name}</strong>
                <span>{p.email}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="nh-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}

      <div className={styles.foot}>
        <span className={styles.demo}>Demo sign-in - no Microsoft account is used.</span>
        <button ref={cancel} className={styles.cancel} type="submit" name="via" value="back" disabled={pending}>
          {pending ? "Signing in…" : "Cancel"}
        </button>
      </div>
    </dialog>
  );
}
