// Small steps both suites repeat. Locators go by role and visible text - what a person sees -
// so a class rename never breaks a test, and a changed label does (which is worth knowing).
import { test as base, expect, type Page } from "@playwright/test";

/** `test` with one extra rule: any uncaught error in the page fails the test, not only a wrong assertion. */
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Raise a problem from the member home and wait until the evaluation has placed it. */
export async function raiseProblem(page: Page, title: string) {
  await page.getByRole("button", { name: /Raising idea/ }).click();
  await page.getByRole("textbox", { name: "Problem" }).fill(title);
  await page.getByRole("button", { name: "Raise this problem" }).click();
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
}

/** The sheet that opens for "No, and why", "Ask a question", "Answer …". */
export const sheet = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("textarea") });

/** Type into the open sheet and press its confirm button. */
export async function confirmSheet(page: Page, text: string, confirm: string) {
  await sheet(page).locator("textarea").fill(text);
  await page.getByRole("button", { name: confirm }).click();
  await expect(sheet(page)).toBeHidden();
}
