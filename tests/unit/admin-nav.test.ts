// The nav carries state, so these are the rules for when it shouts. A badge that is always there
// is wallpaper; the point is that "3 stuck" only appears when three are stuck.
import { describe, expect, it } from "vitest";
import { adminNav } from "@/features/admin/nav";
import { nextStage, STAGES, isStage } from "@/features/admin/stages";
import type { TaskCounts } from "@/features/integrations/tasks";

const counts = (over: Partial<TaskCounts> = {}): TaskCounts => ({
  done: 0,
  skipped: 0,
  pending: 0,
  failed: 0,
  ...over,
});

const base = {
  database: "up" as const,
  openRequests: 0,
  companies: 1,
  automation: "live" as const,
  tasks: counts({ done: 3 }),
};

describe("adminNav", () => {
  it("is quiet when everything is fine", () => {
    const items = adminNav(base);
    expect(items.map((i) => i.id)).toEqual(["database", "requests", "companies", "automation", "tasks"]);
    expect(items.filter((i) => i.tone === "bad" || i.tone === "warn")).toEqual([]);
    expect(items.find((i) => i.id === "database")?.badge).toBeNull();
  });

  it("drops the automation sections when there is no database to read them from", () => {
    const items = adminNav({ ...base, database: "down", automation: null, tasks: null });
    expect(items.map((i) => i.id)).toEqual(["database", "requests", "companies"]);
    expect(items[0]).toMatchObject({ badge: "down", tone: "bad" });
  });

  it("counts unanswered requests, and says nothing at zero", () => {
    expect(adminNav({ ...base, openRequests: 2 }).find((i) => i.id === "requests")).toMatchObject({
      badge: "2",
      tone: "warn",
    });
    expect(adminNav(base).find((i) => i.id === "requests")?.badge).toBeNull();
  });

  it("leads with stuck tasks over running ones", () => {
    expect(adminNav({ ...base, tasks: counts({ failed: 3, pending: 1 }) }).find((i) => i.id === "tasks"))
      .toMatchObject({ badge: "3 stuck", tone: "bad" });
    expect(adminNav({ ...base, tasks: counts({ pending: 1 }) }).find((i) => i.id === "tasks"))
      .toMatchObject({ badge: "1 running", tone: "warn" });
  });
});

describe("stages", () => {
  it("walks demo -> sandbox -> pilot -> live and stops there", () => {
    expect(nextStage("demo")).toBe("sandbox");
    expect(nextStage("sandbox")).toBe("pilot");
    expect(nextStage("pilot")).toBe("live");
    expect(nextStage("live")).toBeNull();
  });

  it("has no next step for something that is not a stage", () => {
    expect(nextStage("banana")).toBeNull();
    expect(isStage("banana")).toBe(false);
    expect(STAGES.every(isStage)).toBe(true);
  });
});
