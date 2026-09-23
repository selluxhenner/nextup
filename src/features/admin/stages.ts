// A customer's phase, as data. docs/INTEGRATIONS.md "Stages": a flag set, not a branch - the code
// is identical for all four, so this is how we describe the relationship, not how we behave.
//
// Kept out of src/config/roles.ts on purpose: a stage is a property of a company, a role is a
// property of a person, and conflating them is how a "superadmin" role gets invented.

export const STAGES = ["demo", "sandbox", "pilot", "live"] as const;
export type Stage = (typeof STAGES)[number];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/** What each stage means, so the dropdown is not four words with no definition. */
export const STAGE_MEANING: Record<Stage, string> = {
  demo: "Our content, shown to prospects.",
  sandbox: "Their people, our data - they are trying it out.",
  pilot: "Their real cases, with the two-working-day promise running.",
  live: "In production. Treat the data as theirs.",
};

/** The next step, or null at the end. Lets the page offer one button instead of a dropdown. */
export function nextStage(current: string): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(current);
  if (i < 0 || i === STAGES.length - 1) return null;
  return STAGES[i + 1];
}
