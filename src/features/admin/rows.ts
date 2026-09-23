// The two row shapes /admin renders. They live here, not in the server action, because the demo
// rows next door (demo.ts) have to satisfy exactly the same contract as the ones Postgres answers
// with - a demo row that drifts from the real one is a lie on the screen.
export type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  stage: string;
  people: number;
  events: number;
  url: string;
  createdAt: string;
};

export type PilotRequestRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  decision: string;
  council: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
  /** Internal only - never goes back to the person who wrote in. */
  notes: string;
  /** Oldest first, so the panel reads like a thread. */
  replies: PilotReplyRow[];
};

export type PilotReplyRow = {
  id: string;
  to: string;
  subject: string;
  body: string;
  /** smtp: sent from /admin. manual: written in a mail app and logged here. */
  via: string;
  sentAt: string;
};
