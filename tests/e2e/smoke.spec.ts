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
/** Type part of a name into a player search box and pick the player from the list. */
async function pickPlayer(p: Page, box: string, typed: string, name: RegExp) {
  await p.getByTestId(box).fill(typed);
  await p.getByRole("option", { name }).click();
}

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
  const addCategory = async (name: string, code: string, gender: string, age?: string, bestOf?: string) => {
    await page.getByRole("button", { name: "New category" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name", { exact: true }).fill(name);
    await d.getByLabel("Short code").fill(code);
    await d.getByLabel("Gender rule").selectOption(gender);
    if (age) {
      await d.getByLabel("Age rule").selectOption("UNDER");
      await d.getByLabel("Under age").fill(age);
    }
    if (bestOf) await d.getByLabel("Games (sets) per match").selectOption(bestOf);
    await d.getByRole("button", { name: "Save category" }).click();
    await expect(d).toBeHidden();
  };
  await addCategory("U18 Mixed Doubles", "U18X", "MIXED", "18", "3"); // default is 1 game; this category plays best of 3
  await addCategory("Men's Doubles", "MD", "MALE");
  await expect(page.getByText("U18 Mixed Doubles")).toBeVisible();
  await expect(page.getByText(/best of 3/)).toBeVisible();
  await expect(page.getByText(/to 11, 1 game/)).toBeVisible(); // Men's Doubles keeps the new default

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

  // ---------- the tie and a per-match referee link (links still work alongside the shared login) ----------
  const tournamentId = base.split("/admin/t/")[1];
  const adminBundle = await (await page.request.get(`/api/admin/tournaments/${tournamentId}/bundle`)).json();
  const theTie = adminBundle.ties[0];
  const tieId = theTie.id as string;
  const matchId = theTie.matches[0].id as string;
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

  // ---------- referee on a phone: ONE simple setup screen ----------
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const ref = await phone.newPage();
  await ref.goto(refPath);
  // 1. players: type to search; ineligible players are listed but blocked, with the reason
  await ref.getByTestId("player-AAA-0").fill("a");
  await expect(ref.getByRole("option", { name: /Arun Kid/ })).toBeVisible(); // typing "a" lists every matching player
  await expect(ref.getByRole("option", { name: /Abe Adult/ })).toHaveAttribute("aria-disabled", "true");
  await expect(ref.getByRole("option", { name: /Abe Adult/ })).toContainText("Over 17 on cutoff date");
  await ref.getByRole("option", { name: /Arun Kid/ }).click();
  await ref.getByTestId("player-AAA-1").fill("abe");
  await expect(ref.getByRole("option", { name: /Abe Adult/ })).toContainText("Mixed needs 1M + 1F");
  await pickPlayer(ref, "player-AAA-1", "asha", /Asha Kid/);
  await pickPlayer(ref, "player-BBB-0", "ben", /Ben Kid/);
  await pickPlayer(ref, "player-BBB-1", "bea", /Bea Kid/);
  // 2. who serves first  3. court (sides/positions keep their defaults)
  await expect(ref.getByTestId("start-match")).toBeDisabled();
  await ref.getByTestId("serve-A").click();
  await ref.getByTestId("court-select").selectOption("Court 2");
  await ref.getByTestId("start-match").click();
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

  // ---------- one team, one tie at a time ----------
  // While AAA v BBB is in progress, a second tie involving these teams can't start a match.
  {
    const stages = (await (await page.request.get(`/api/admin/tournaments/${tournamentId}`)).json()).stages;
    const extra = await (await page.request.post(`/api/admin/tournaments/${tournamentId}/ties`, { data: { stageId: stages[0].id, teamAId: theTie.teamAId, teamBId: theTie.teamBId, roundLabel: "Extra" } })).json();
    const extraTie = await (await page.request.get(`/api/admin/ties/${extra.id}`)).json();
    const m0 = extraTie.tie.matches[0];
    const r = await page.request.post(`/api/admin/matches/${m0.id}/events`, {
      data: { seq: 1, idempotencyKey: `busy-${Date.now()}-0001`, event: { type: "SETUP", payload: { firstServingTeam: "A", positions: { A: { right: "x", left: "y" }, B: { right: "z", left: "w" } } } } },
    });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toMatch(/is still playing .*vs .*Finish that tie/);
    // the referee sees it up front and can't press START
    const busyRef = (await (await page.request.get(`/api/admin/matches/${m0.id}`)).json()).refPath;
    const bp = await phone.newPage();
    await bp.goto(busyRef);
    await expect(bp.getByTestId("busy-warning")).toBeVisible();
    await expect(bp.getByTestId("start-match")).toBeDisabled();
    await bp.close();
    await page.request.delete(`/api/admin/ties/${extra.id}`);
  }

  // ---------- a referee with the SHARED referee login scores the MD match (1 game to 11) ----------
  const phone2 = await browser.newContext({ ...devices["Pixel 7"] });
  const r2 = await phone2.newPage();
  await r2.goto("/ref");
  await r2.getByLabel("Username").fill(process.env.REF_USERNAME ?? "referee");
  await r2.getByLabel("Password").fill(process.env.REF_PASSWORD ?? "ref12345");
  await r2.getByRole("button", { name: "Sign in" }).click();
  await expect(r2.getByTestId("ref-team-a")).toBeVisible(); // console loaded after sign-in
  const tSel = r2.getByLabel("Tournament");
  if (await tSel.isVisible().catch(() => false)) await tSel.selectOption(tournamentId); // by id: names can repeat
  await r2.getByTestId("ref-team-a").selectOption({ label: "Alpha Aces" });
  await r2.getByTestId("ref-team-b").selectOption({ label: "Bravo Blasters" });
  // order: teams → court → category (nothing prefilled)
  await r2.getByTestId("ref-court").selectOption("Court 3");
  await r2.getByTestId("ref-cat-MD").click();
  await r2.getByTestId("ref-continue").click();
  await expect(r2).toHaveURL(/\/ref\/[^?]+$/); // no token: signed-in referee
  await expect(r2.getByText(/1 game to 11/)).toBeVisible(); // default format
  await expect(r2.getByTestId("court-chosen")).toHaveText("Court 3");
  await pickPlayer(r2, "player-AAA-0", "abe", /Abe Adult/);
  await pickPlayer(r2, "player-AAA-1", "arun", /Arun Kid/);
  await pickPlayer(r2, "player-BBB-0", "ben", /Ben Kid/);
  await pickPlayer(r2, "player-BBB-1", "bob", /Bob Adult/);
  await r2.getByTestId("serve-A").click();
  await r2.getByTestId("start-match").click();
  await expect(call(r2)).toHaveText("0-0-2");
  await rally(r2, "A", 11);
  await expect(r2.getByRole("heading", { name: /Alpha Aces win/ })).toBeVisible();
  await r2.getByRole("button", { name: "Submit final" }).click();
  await expect(r2.getByText(/Final submitted\. Thank you/)).toBeVisible();
  await phone2.close();

  await expect(pubTie.getByTestId("tie-score-a")).toHaveText("2");
  await expect(pubTie.getByText("Alpha Aces win the tie")).toBeVisible();
  await expect(pubStand.getByTestId("standing-AAA")).toHaveAttribute("data-points", "2");
  await expect(pubStand.getByTestId("standing-BBB")).toHaveAttribute("data-points", "0");

  // cleanup the e2e tournament
  await page.request.delete(`/api/admin/tournaments/${tournamentId}`);
  await viewer.close();
  await phone.close();
});
