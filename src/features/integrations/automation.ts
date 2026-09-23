// What /admin says about the n8n half of the loop. Pure - no database, no next/*, no node:* -
// so the wording is unit-tested without a server (same rule as ./index.ts).
//
// The app cannot see inside n8n: there is no API key here and ops/n8n/README.md is deliberate
// that credentials are made in the n8n UI and never in this repo. So "is it working?" is answered
// from two things the app genuinely knows - whether the instance answers its health endpoint, and
// whether anything has ever come back through POST /api/[company]/events as system:n8n. A write-
// back is the only proof the whole chain ran, which is why it and not the ping decides "live".

/** What the environment and a health ping say about the instance. */
export type InstanceFacts = {
  /** N8N_HOOK_URL, or null when it is unset - in which case a raise notifies nobody. */
  hookUrl: string | null;
  /** Whether N8N_HOOK_TOKEN is set. The value itself never leaves the server. */
  hookTokenSet: boolean;
  /** null when no ping was made, because there was no URL to derive one from. */
  reachable: boolean | null;
};

/** One company's side of it: the credential it was given, and what has come back. */
export type CompanyAutomation = {
  slug: string;
  name: string;
  /** The n8n API token, if one was ever issued. */
  tokenCreatedAt: string | null;
  tokenLastUsedAt: string | null;
  /** Events appended by system:n8n - the workflow writing back to the case. */
  writeBacks: number;
  lastWriteBackAt: string | null;
};

export type AutomationState =
  /** No N8N_HOOK_URL: the notify call returns before it does anything. */
  | "off"
  /** Configured, but the instance did not answer. */
  | "unreachable"
  /** The instance answers, but nothing has ever come back. Workflow not imported or not active. */
  | "idle"
  /** At least one write-back exists, so the whole chain has run. */
  | "live";

export type AutomationSummary = {
  state: AutomationState;
  headline: string;
  /** What to do next, or null when nothing needs doing. */
  next: string | null;
};

/**
 * n8n's health endpoint, derived from the webhook URL so there is only one thing to configure.
 * Returns null for an unset or unparseable URL rather than throwing - a bad value in the
 * environment should show up as "unreachable" on the page, not as a crashed admin screen.
 */
export function healthUrlFrom(hookUrl: string | null): string | null {
  if (!hookUrl) return null;
  try {
    return new URL("/healthz", hookUrl).toString();
  } catch {
    return null;
  }
}

/** Everything the admin card renders, assembled by the server action. */
export type AutomationReport = {
  facts: InstanceFacts;
  companies: CompanyAutomation[];
  summary: AutomationSummary;
};

/** The one-line verdict at the top of the card. */
export function summarise(
  facts: InstanceFacts,
  companies: readonly CompanyAutomation[],
  /** How many cases have been raised at all. Without it "nothing has come back" is ambiguous. */
  raises: number,
): AutomationSummary {
  if (!facts.hookUrl) {
    return {
      state: "off",
      headline: "Off - N8N_HOOK_URL is not set.",
      next: "A raise still saves; it just notifies nobody. Set it in .env and restart the stack.",
    };
  }

  if (facts.reachable === false) {
    return {
      state: "unreachable",
      headline: "Configured, but the instance did not answer.",
      next: `Nothing reached ${facts.hookUrl}. Check that the n8n service is up.`,
    };
  }

  const delivered = companies.filter((c) => c.writeBacks > 0);
  if (delivered.length > 0) {
    return {
      state: "live",
      headline:
        delivered.length === companies.length
          ? "Live - every company has had a case answered by n8n."
          : `Live for ${delivered.length} of ${companies.length} companies.`,
      next: null,
    };
  }

  // Nothing has come back. Which of the four reasons it is decides what to do about it, and the
  // page used to guess the same one every time - telling you to import a workflow that was
  // already imported and running.
  if (!companies.some((c) => c.tokenCreatedAt)) {
    return {
      state: "idle",
      headline: "n8n answers, but no company can be written to yet.",
      next: "No company has an API token - issue one above, then paste it into the n8n credential.",
    };
  }

  if (raises === 0) {
    return {
      state: "idle",
      headline: "Wired up, and waiting for something to do.",
      next: "Nothing has been raised yet, so n8n has not been called. Raise a case to see it work.",
    };
  }

  if (companies.some((c) => c.tokenLastUsedAt)) {
    // n8n reached the API, so the webhook, the workflow and the email all ran. What did not
    // finish is the write-back itself.
    return {
      state: "idle",
      headline: "n8n reaches the API, but no notice has been written back.",
      next: "The owner may have been emailed already. Check the credential is a token for THIS database - a token from another one answers 401 - then n8n's executions for the failing node.",
    };
  }

  return {
    state: "idle",
    headline: "Cases are being raised, but n8n never calls back.",
    next: "Import case-raised-notify-owner.json, give it its credentials and activate it - an imported-but-inactive workflow answers 404 (ops/n8n/README.md).",
  };
}

/** The per-company line: what this company's automation has actually done. */
export function describeCompany(c: CompanyAutomation): string {
  if (!c.tokenCreatedAt) return "No API token issued.";
  if (c.writeBacks === 0) {
    return c.tokenLastUsedAt
      ? "Token used, but no write-back yet."
      : "Token issued, never used.";
  }
  return `${c.writeBacks} write-${c.writeBacks === 1 ? "back" : "backs"} from n8n.`;
}
