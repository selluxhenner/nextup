"use client";
// The two-step company login: access code, then who you are. Props in, JSX out - the decisions
// live in src/server/actions/auth.ts.
import { useActionState, useState } from "react";
import { companyLogin, type LoginState } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Divider";
import { MicrosoftLogo, MicrosoftPicker } from "./MicrosoftPicker";
import styles from "./forms.module.css";

/**
 * `demoCode` is only set on a demo box (LOGIN_DEMO_FILL=true, src/server/demo-login.ts): it puts a
 * "Demo code" button in the field. Null means no button at all.
 */
type Props = { slug: string; short: string; next?: string; demoCode?: string | null };

export function CompanyLoginForm({ slug, short, next, demoCode }: Props) {
  // The action is passed directly, not wrapped in a closure: React needs the real server action
  // to give the form something to submit to before it hydrates.
  const [state, act, pending] = useActionState<LoginState, FormData>(companyLogin, { step: "code" });
  const [code, setCode] = useState("");
  // Our own message for an empty field, instead of the browser's "Please fill out this field"
  // bubble (the form is noValidate). Cleared as soon as they type.
  const [localError, setLocalError] = useState<string | null>(null);
  const [msPending, setMsPending] = useState(false);

  const codeError = state.step === "code" ? (localError ?? state.error) : undefined;
  const microsoft = state.step === "who" && state.via === "microsoft";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const via = submitter?.name === "via" ? submitter.value : "";
    setMsPending(via === "microsoft");
    if (state.step !== "code" || via) return;
    if (!code.trim()) {
      e.preventDefault();
      setLocalError(`Enter the access code for ${short}. Your team lead has it - it looks like ${slug}-0000-0000.`);
    } else {
      setLocalError(null);
    }
  }

  return (
    <form className={styles.form} action={act} onSubmit={onSubmit} autoComplete="off" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.step === "code" ? (
        <Field id="code" label={`Access code for ${short}`} error={codeError}>
          <div className={styles.inputWrap}>
            <input
              className={`nh-input ${demoCode ? styles.inputWithFill : ""}`}
              id="code"
              name="code"
              type="text"
              placeholder={`${slug}-0000-0000`}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setLocalError(null);
              }}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "code-error" : undefined}
              autoFocus
            />
            {demoCode ? (
              <button
                className={styles.fill}
                type="button"
                aria-label={`Fill in the demo access code for ${short}`}
                onClick={() => {
                  setCode(demoCode);
                  setLocalError(null);
                }}
              >
                Demo code
              </button>
            ) : null}
          </div>
        </Field>
      ) : microsoft ? (
        <input type="hidden" name="code" value={state.code} />
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

      {state.step === "who" && state.error && !microsoft ? (
        <p className="nh-error" role="alert">
          <span>{state.error}</span>
        </p>
      ) : null}

      {microsoft ? null : (
        <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
          {pending && !msPending ? "One moment…" : state.step === "code" ? "Continue" : "Log in"}
        </button>
      )}

      {state.step === "code" ? (
        <>
          <Divider />
          <button
            className="nh-btn nh-btn-ghost nh-btn-block"
            type="submit"
            name="via"
            value="microsoft"
            disabled={pending}
          >
            <MicrosoftLogo />
            {pending && msPending ? "Connecting to Microsoft…" : "Continue with Microsoft"}
          </button>
        </>
      ) : !microsoft ? (
        <button className={styles.back} type="submit" name="via" value="back" disabled={pending}>
          Use a different code
        </button>
      ) : null}

      {microsoft && state.step === "who" ? (
        <MicrosoftPicker company={short} people={state.people} pending={pending} error={state.error} />
      ) : null}
    </form>
  );
}
