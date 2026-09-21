"use client";
import { useActionState } from "react";
import { adminSignIn, type AdminLoginState } from "@/server/actions/admin";
import { Field } from "@/components/ui/Field";
import styles from "@/app/admin/admin.module.css";

export function AdminLoginForm() {
  const [state, act, pending] = useActionState<AdminLoginState, FormData>(adminSignIn, {});
  return (
    <form action={act} className={styles.grid} autoComplete="off">
      <Field id="code" label="Admin code">
        <input className="nh-input" id="code" name="code" type="password" autoFocus required />
      </Field>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
