/**
 * End-to-end smoke test of the whole match-day flow:
 * admin creates categories → tie format → teams & players (CSV) → generates ties → enters lineups
 * (ineligible players blocked) → referee scores a full best-of-3 on a phone, including an undo across a
 * side out → the public tie page and standings update live in another browser, without reloading.
 */
import { test, expect, devices, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@picklelive.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme123";
const slug = `e2e-${Date.now().toString(36)}`;

async function rally(ref: Page, side: "A" | "B", times: number) {
  for (let i = 0; i < times; i++) {
    await ref.locator(`[data-testid=rally-${side}]:visible`).click();
    const confirm = ref.getByTestId("confirm-end");
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
  }
}
const call = (ref: Page) => ref.getByTestId("score-call");

test("match day: setup → lineups → ref scoring → live public updates", async ({ page, browser }) => {
  // ---------- admin: login + tournament ----------
  await page.goto("/admin");
  await page.fill("input[type=email]", ADMIN_EMAIL);
  await page.fill("input[type=password]", ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.getByRole("button", { name: "New tournament" }).click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Cup");
  await page.getByLabel("URL slug").fill(slug);
  await page.getByLabel("Age cutoff date").fill("2026-01-01");
  await page.getByRole("switch").click(); // no presets: we create our own categories
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const base = page.url();

  // ---------- categories ----------
  await page.goto(`${base}/categories`);
  const addCategory = async (name: string, code: string, gender: string, age?: string) => {
    await page.getByRole("button", { name: "New category" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name", { exact: true }).fill(name);
    await d.getByLabel("Short code").fill(code);
    await d.getByLabel("Gender rule").selectOption(gender);
    if (age) {
      await d.getByLabel("Age rule").selectOption("UNDER");
      await d.getByLabel("Under age").fill(age);
    }
    await d.getByRole("button", { name: "Save category" }).click();
    await expect(d).toBeHidden();
  };
  await addCategory("U18 Mixed Doubles", "U18X", "MIXED", "18");
  await addCategory("Men's Doubles", "MD", "MALE");
  await expect(page.getByText("U18 Mixed Doubles")).toBeVisible();

  // ---------- tie format ----------
  await page.goto(`${base}/formats`);
  await page.getByRole("button", { name: "New format" }).click();
  const fd = page.getByRole("dialog");
  await fd.getByLabel("Name", { exact: true }).fill("Two-slot cup");
  await fd.getByRole("button", { name: "Add slot" }).click();
  await fd.getByRole("button", { name: "Add slot" }).click();
  await fd.getByLabel("Category", { exact: true }).nth(1).selectOption({ label: "MD · Men's Doubles" });
  await fd.getByRole("button", { name: "Save tie format" }).click();
  await expect(page.getByText("Two-slot cup")).toBeVisible();

  // ---------- teams ----------
  await page.goto(`${base}/teams`);
  for (const [name, code] of [["Alpha Aces", "AAA"], ["Bravo Blasters", "BBB"]]) {
    await page.getByRole("button", { name: "New team" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name", { exact: true }).fill(name);
    await d.getByLabel("Code", { exact: true }).fill(code);
    await d.getByRole("button", { name: "Save team" }).click();
    await expect(d).toBeHidden();
  }

  // ---------- players via CSV ----------
  await page.goto(`${base}/players`);
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByLabel("CSV contents").fill(
    [
      "name,gender,dob,team_code",
      "Arun Kid,M,2010-05-05,AAA",
      "Asha Kid,F,2011-03-03,AAA",
      "Abe Adult,M,1990-01-01,AAA",
      "Amy Adult,F,1992-01-01,AAA",
      "Ben Kid,M,2010-06-06,BBB",
      "Bea Kid,F,2011-04-04,BBB",
      "Bob Adult,M,1988-01-01,BBB",
      "Bad Row,X,notadate,ZZZ",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Check rows" }).click();
  await expect(page.getByText("7 valid · 1 with errors")).toBeVisible();
  await page.getByRole("button", { name: "Import valid rows" }).click();
  await expect(page.getByText(/Imported 7 players/)).toBeVisible();
  await page.keyboard.press("Escape");

  // ---------- stage + generate ----------
  await page.goto(`${base}/stages`);
  await page.getByLabel("New stage name").fill("Groups");
  await page.getByRole("button", { name: "Add stage" }).click();
  await page.getByRole("button", { name: "Add group" }).click();
  await page.getByLabel("Add team").selectOption({ label: "Alpha Aces" });
  await page.getByLabel("Add team").selectOption({ label: "Bravo Blasters" });
  await page.getByRole("button", { name: "Generate ties" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("1 ties")).toBeVisible();

  // ---------- lineups: ineligible players blocked ----------
  await page.goto(`${base}/ties`);
  await page.locator('a[href*="/ties/"]').first().click();
  const panel1 = page.getByTestId("match-panel-1");
  const aaa = panel1.getByTestId("lineup-AAA");
  const adult = aaa.getByRole("option", { name: /Abe Adult/ });
  await expect(adult).toHaveAttribute("aria-disabled", "true");
  await expect(adult).toContainText("Over 17 on cutoff date");
  await aaa.getByRole("option", { name: /Arun Kid/ }).click();
  // picking a second boy for mixed is blocked
  await expect(aaa.getByRole("option", { name: /Abe Adult/ })).toContainText("Mixed needs 1M + 1F");
  await aaa.getByRole("option", { name: /Asha Kid/ }).click();
  await aaa.getByRole("button", { name: "Submit lineup" }).click();
  await expect(aaa.getByRole("button", { name: "Lock" })).toBeVisible();
  const bbb = panel1.getByTestId("lineup-BBB");
  await bbb.getByRole("option", { name: /Ben Kid/ }).click();
  await bbb.getByRole("option", { name: /Bea Kid/ }).click();
  await bbb.getByRole("button", { name: "Submit lineup" }).click();
  await expect(bbb.getByRole("button", { name: "Lock" })).toBeVisible();

  // referee link for slot 1 (what "Copy ref link" copies)
  const tieId = page.url().split("/ties/")[1];
  const tie = await (await page.request.get(`/api/admin/ties/${tieId}`)).json();
  const matchId = tie.tie.matches[0].id as string;
  const { refPath } = await (await page.request.get(`/api/admin/matches/${matchId}`)).json();
  expect(refPath).toMatch(/^\/ref\/.+\?token=[A-Za-z0-9]{32}$/);

  // ---------- public viewer in a second browser (no reloads after this) ----------
  const viewer = await browser.newContext();
  const pubTie = await viewer.newPage();
  await pubTie.goto(`/t/${slug}/tie/${tieId}`);
  await expect(pubTie.getByTestId("tie-score-a")).toHaveText("0");
  const pubStand = await viewer.newPage();
  await pubStand.goto(`/t/${slug}/standings`);
  await expect(pubStand.getByTestId("standing-AAA")).toHaveAttribute("data-points", "0");

  // ---------- referee on a phone ----------
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const ref = await phone.newPage();
  await ref.goto(refPath);
  await ref.getByTestId("court-select").selectOption("Court 2");
  await ref.getByRole("button", { name: /Confirm & lock lineups/ }).click();
  await ref.getByRole("button", { name: /AAA/ }).first().click(); // toss winner
  await ref.getByRole("button", { name: "Serve", exact: true }).click();
  await ref.getByRole("button", { name: "Next" }).click();
  await ref.getByRole("button", { name: "Next" }).click(); // sides
  await ref.getByRole("button", { name: "Next" }).click(); // positions
  await ref.getByRole("button", { name: "START MATCH" }).click();
  await expect(call(ref)).toHaveText("0-0-2");

  // Game 1: AAA serves and wins 11-0
  await rally(ref, "A", 10);
  await expect(call(ref)).toHaveText("10-0-2");
  await expect(ref.getByText("MATCH POINT").or(ref.getByText("GAME POINT AAA"))).toBeVisible();
  await rally(ref, "A", 1);
  // Game 2: BBB serves first (0-0-2). AAA wins a rally → side out → undo it.
  await expect(call(ref)).toHaveText("0-0-2");
  await rally(ref, "A", 1);
  await expect(call(ref)).toHaveText("0-0-1");
  await ref.getByTestId("undo").click();
  await expect(call(ref)).toHaveText("0-0-2");
  await rally(ref, "B", 11); // BBB wins game 2 11-0
  // Game 3 (decider): AAA serves first; ends switch at 6
  await expect(call(ref)).toHaveText("0-0-2");
  await rally(ref, "A", 6);
  await expect(ref.getByText("SWITCH ENDS")).toBeVisible();
  await rally(ref, "A", 5);
  await expect(ref.getByRole("heading", { name: /Alpha Aces win/ })).toBeVisible();
  await ref.getByRole("button", { name: "Submit final" }).click();
  await expect(ref.getByText(/Final submitted\. Thank you/)).toBeVisible();

  // public tie page updated live (no reload)
  await expect(pubTie.getByTestId("tie-score-a")).toHaveText("1");
  await expect(pubTie.getByText("11-0").first()).toBeVisible();

  // ---------- admin enters the MD result → tie finished → standings update live ----------
  const panel2 = page.getByTestId("match-panel-2");
  await panel2.getByRole("button", { name: "Enter result" }).click();
  const sd = page.getByRole("dialog");
  await sd.getByLabel("Game 1 team A").fill("11");
  await sd.getByLabel("Game 1 team B").fill("5");
  await sd.getByRole("button", { name: "Add game" }).click();
  await sd.getByLabel("Game 2 team A").fill("11");
  await sd.getByLabel("Game 2 team B").fill("7");
  await sd.getByRole("button", { name: /Save: Alpha Aces win 2-0/ }).click();

  await expect(pubTie.getByTestId("tie-score-a")).toHaveText("2");
  await expect(pubTie.getByText("Alpha Aces win the tie")).toBeVisible();
  await expect(pubStand.getByTestId("standing-AAA")).toHaveAttribute("data-points", "2");
  await expect(pubStand.getByTestId("standing-BBB")).toHaveAttribute("data-points", "0");

  // cleanup the e2e tournament
  const tid = base.split("/admin/t/")[1];
  await page.request.delete(`/api/admin/tournaments/${tid}`);
  await viewer.close();
  await phone.close();
});
