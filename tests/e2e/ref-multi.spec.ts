/** Several referees can be signed in with the same shared login at the same time, on different devices. */
import { test, expect, devices } from "@playwright/test";

test("multiple referees share one login simultaneously", async ({ browser }) => {
  const user = process.env.REF_USERNAME ?? "referee";
  const pass = process.env.REF_PASSWORD ?? "ref12345";
  const phones = await Promise.all([1, 2, 3].map(() => browser.newContext({ ...devices["Pixel 7"] })));
  const pages = await Promise.all(phones.map((c) => c.newPage()));
  for (const p of pages) {
    await p.goto("/ref");
    await p.getByLabel("Username").fill(user);
    await p.getByLabel("Password").fill(pass);
    await p.getByRole("button", { name: "Sign in" }).click();
    await expect(p.getByTestId("ref-team-a")).toBeVisible();
  }
  // every device is still signed in after the others logged in
  for (const p of pages) {
    const me = await (await p.request.get("/api/auth/me")).json();
    expect(me.referee).toBe(true);
  }
  // one referee signing out doesn't affect the others
  await pages[0].getByRole("button", { name: "Sign out" }).click();
  await expect(pages[0].getByLabel("Username")).toBeVisible();
  expect((await (await pages[1].request.get("/api/auth/me")).json()).referee).toBe(true);
  await Promise.all(phones.map((c) => c.close()));
});
