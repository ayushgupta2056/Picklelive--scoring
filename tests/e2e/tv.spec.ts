/** TV display: invalid selections ask for a choice, and the bottom dock picks a team or a tie from the TV itself. */
import { test, expect } from "@playwright/test";

test("TV dock selects one team / one tie and never goes blank", async ({ page, request }) => {
  const list = await (await request.get("/api/public/tournaments")).json();
  test.skip(!list.length, "needs a seeded tournament (npm run db:seed)");
  // a tournament that has teams and ties (other test files may be creating a fresh, empty one)
  let slug = "";
  let b: any = null;
  for (const t of [...list].sort((x: { slug: string }) => (x.slug === "demo-cup" ? -1 : 1))) {
    const bundle = await (await request.get(`/api/public/t/${t.slug}`)).json();
    if (bundle.teams?.length >= 2 && bundle.ties?.some((x: { teamAId: string | null }) => x.teamAId)) {
      slug = t.slug;
      b = bundle;
      break;
    }
  }
  test.skip(!b, "needs a seeded tournament with ties");
  const team = b.teams[0];
  const tie = b.ties.find((t: { teamAId: string | null; teamBId: string | null }) => t.teamAId && t.teamBId);

  // stale/unknown team id → picker opens instead of an empty screen
  await page.goto(`/t/${slug}/tv?team=does-not-exist`);
  await expect(page.getByText("Select a team to display")).toBeVisible();
  await page.getByTestId(`dock-team-${team.code}`).click();
  await expect(page).toHaveURL(new RegExp(`team=${team.id}`));
  await expect(page.getByRole("complementary", { name: `${team.name} overview` })).toBeVisible();

  // the dock closes itself after a valid pick; reopen it with the keyboard (not hover-only) and pick a tie
  await expect(page.getByRole("dialog", { name: "Display controls" })).toBeHidden();
  await page.keyboard.press("m");
  await page.getByRole("tab", { name: "One tie" }).click();
  await page.locator('[data-testid^="dock-tie-"]').first().click();
  await expect(page).toHaveURL(/tie=/);
  await expect(page.getByText(/Featured/)).toBeVisible();

  // back to the admin default
  await expect(page.getByRole("dialog", { name: "Display controls" })).toBeHidden();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Follow admin" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${slug}/tv$`));
  expect(tie).toBeTruthy();
});
