"use client";
// The two-step company login: access code, then who you are. Props in, JSX out - the decisions
// live in src/server/actions/auth.ts.
import { useActionState } from "react";
import { companyLogin, type LoginState } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import styles from "./forms.module.css";

type Props = { slug: string; short: string; next?: string };

export function CompanyLoginForm({ slug, short, next }: Props) {
  // The action is passed directly, not wrapped in a closure: React needs the real server action
  // to give the form something to submit to before it hydrates.
  const [state, act, pending] = useActionState<LoginState, FormData>(companyLogin, { step: "code" });

  return (
    <form className={styles.form} action={act} autoComplete="off">
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.step === "code" ? (
        <Field id="code" label={`Access code for ${short}`}>
          <input
            className="nh-input"
            id="code"
            name="code"
            type="text"
            placeholder={`${slug}-0000-0000`}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </Field>
      ) : (
        <>
          <input type="hidden" name="code" value={state.code} />
          <fieldset className={styles.people}>
            <legend className="nh-hint">Who are you?</legend>
            {state.people.map((p, i) => (
              <label key={p.id} className={styles.person}>
                <input type="radio" name="userId" value={p.id} defaultChecked={i === 0} required />
                <span>
                  <strong>{p.name}</strong>
                  <span className="nh-hint"> · {p.line}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
        {pending ? "One moment…" : state.step === "code" ? "Continue" : "Log in"}
      </button>
    </form>
  );
}
