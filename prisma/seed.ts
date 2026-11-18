/* Demo data: 1 tournament, presets, a 5-slot tie format, 6 teams × 8 players, 2 groups with generated ties,
 * one tie in progress (2 done, 1 live mid-game, 2 upcoming), one finished tie, and an empty knockout stage. */
import { PrismaClient, type Prisma } from "@prisma/client";
import { CATEGORY_PRESETS } from "../shared/presets";
import { DEFAULT_SETTINGS } from "../shared/api";
import { replay } from "../shared/scoring/engine";
import type { MatchConfig, Side } from "../shared/scoring/types";
import { generateStage, autoSchedule } from "../server/services/stageService";
import { appendEvent, recomputeTie } from "../server/services/matchService";
import { saveLineup } from "../server/services/lineupService";

const prisma = new PrismaClient();
const SLUG = "demo-cup";
const ACTOR = "seed";

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);

const TEAMS = [
  { name: "Smash Mavericks", code: "SMA", color: "#EF4444" },
  { name: "Dink Dynasty", code: "DNK", color: "#3B82F6" },
  { name: "Kitchen Kings", code: "KIT", color: "#F59E0B" },
  { name: "Volley Vipers", code: "VIP", color: "#10B981" },
  { name: "Erne Express", code: "ERN", color: "#A855F7" },
  { name: "Baseline Bandits", code: "BAN", color: "#EC4899" },
];
const MEN = ["Arjun", "Rohan", "Vikram", "Kabir", "Ishaan", "Dev", "Aditya", "Nikhil", "Sahil", "Karan", "Rahul", "Aman", "Varun", "Siddharth", "Yash", "Pranav", "Manav", "Tanay", "Om", "Reyansh", "Vihaan", "Aarav", "Arnav", "Dhruv"];
const WOMEN = ["Ananya", "Diya", "Meera", "Priya", "Saanvi", "Kavya", "Riya", "Isha", "Tara", "Nisha", "Pooja", "Aditi", "Sneha", "Avni", "Myra", "Kiara", "Zara", "Anika", "Sara", "Ira", "Pari", "Navya", "Aisha", "Mahi"];
const SURNAMES = ["Sharma", "Iyer", "Mehta", "Reddy", "Kapoor", "Nair", "Gupta", "Rao", "Singh", "Das", "Joshi", "Menon"];

async function main() {
  const old = await prisma.tournament.findUnique({ where: { slug: SLUG } });
  if (old) {
    await prisma.match.deleteMany({ where: { tournamentId: old.id } });
    await prisma.tie.deleteMany({ where: { tournamentId: old.id } });
    await prisma.tieTemplateSlot.deleteMany({ where: { template: { tournamentId: old.id } } });
    await prisma.tournament.delete({ where: { id: old.id } });
  }
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const t = await prisma.tournament.create({
    data: {
      slug: SLUG,
      name: "PickleLive Demo Cup",
      venue: "Riverside Sports Arena, Bengaluru",
      startDate: new Date(`${ymd}T00:00:00Z`),
      endDate: new Date(new Date(`${ymd}T00:00:00Z`).getTime() + 86400000),
      timezone: "Asia/Kolkata",
      ageCutoffDate: new Date("2026-01-01T00:00:00Z"),
      courtNames: ["Court 1", "Court 2", "Court 3", "Court 4"],
      settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.category.createMany({
    data: CATEGORY_PRESETS.map((c, i) => ({ ...c, tournamentId: t.id, sortOrder: i, scoringConfig: (c.scoringConfig ?? {}) as Prisma.InputJsonValue })),
  });
  const cats = await prisma.category.findMany({ where: { tournamentId: t.id } });
  const cat = (code: string) => cats.find((c) => c.code === code)!;

  const tpl = await prisma.tieTemplate.create({
    data: {
      tournamentId: t.id,
      name: "Team Cup (5 slots)",
      levelPolicy: "DECIDER",
      stopEarly: true,
      earlyStopMode: "NOT_REQUIRED",
      usageLimit: 2,
      allowPairRepeat: false,
      rosterMin: 6,
      rosterMax: 10,
      slots: {
        create: [
          { order: 1, categoryId: cat("U18XD").id },
          { order: 2, categoryId: cat("MD").id },
          { order: 3, categoryId: cat("WD").id },
          { order: 4, categoryId: cat("XD").id },
          { order: 5, categoryId: cat("OS").id, isDecider: true },
        ],
      },
    },
  });
  await prisma.tournament.update({ where: { id: t.id }, data: { defaultTemplateId: tpl.id } });

  const teams = [];
  let mi = 0;
  let wi = 0;
  for (const [i, tm] of TEAMS.entries()) {
    const team = await prisma.team.create({ data: { ...tm, tournamentId: t.id, captain: `${MEN[i * 4]} ${SURNAMES[i]}`, managerName: `Coach ${SURNAMES[(i + 3) % 12]}`, managerContact: `+91 90000 0${1000 + i}` } });
    teams.push(team);
    // 4 men + 4 women; the 4th of each is U18; the 1st man is 35+.
    const dobs = ["1986-03-14", "1995-07-02", "1999-11-23", "2009-05-10"];
    const fdobs = ["1992-02-08", "1997-09-19", "2001-12-30", "2010-08-04"];
    for (let k = 0; k < 4; k++) {
      await prisma.player.create({
        data: { tournamentId: t.id, teamId: team.id, name: `${MEN[mi++]} ${SURNAMES[(i + k) % 12]}`, gender: "MALE", dob: new Date(`${dobs[k]}T00:00:00Z`), skill: Math.round((3 + rand() * 1.5) * 10) / 10, jersey: String(k + 1), handedness: k === 2 ? "L" : "R", phone: `+91 98${i}${k}0 0000${k}` },
      });
      await prisma.player.create({
        data: { tournamentId: t.id, teamId: team.id, name: `${WOMEN[wi++]} ${SURNAMES[(i + k + 5) % 12]}`, gender: "FEMALE", dob: new Date(`${fdobs[k]}T00:00:00Z`), skill: Math.round((3 + rand() * 1.5) * 10) / 10, jersey: String(k + 11), handedness: "R" },
      });
    }
  }

  const rr = await prisma.stage.create({ data: { tournamentId: t.id, name: "Group Stage", type: "ROUND_ROBIN", order: 0, templateId: tpl.id, settings: { qualifiersPerGroup: 2 } } });
  const gA = await prisma.group.create({ data: { stageId: rr.id, name: "Group A", order: 0 } });
  const gB = await prisma.group.create({ data: { stageId: rr.id, name: "Group B", order: 1 } });
  await prisma.groupTeam.createMany({ data: teams.slice(0, 3).map((x, seed) => ({ groupId: gA.id, teamId: x.id, seed })) });
  await prisma.groupTeam.createMany({ data: teams.slice(3).map((x, seed) => ({ groupId: gB.id, teamId: x.id, seed })) });
  await prisma.stage.create({ data: { tournamentId: t.id, name: "Knockout", type: "KNOCKOUT", order: 1, templateId: tpl.id, settings: { thirdPlace: true, seedTeamIds: [] } } });

  await generateStage(rr.id);
  const start = new Date(`${ymd}T03:30:00Z`); // 09:00 IST
  await autoSchedule(t.id, start.toISOString(), 30);

  // --- helpers to play matches through the real services ---
  const lineupFor = async (teamId: string, code: string) => {
    const ps = await prisma.player.findMany({ where: { teamId }, orderBy: { jersey: "asc" } });
    const m = ps.filter((p) => p.gender === "MALE").sort((a, b) => Number(a.jersey) - Number(b.jersey));
    const f = ps.filter((p) => p.gender === "FEMALE").sort((a, b) => Number(a.jersey) - Number(b.jersey));
    switch (code) {
      case "U18XD": return [m[3].id, f[3].id];
      case "MD": return [m[0].id, m[1].id];
      case "WD": return [f[0].id, f[1].id];
      case "XD": return [m[2].id, f[2].id];
      default: return [m[0].id];
    }
  };

  async function prepare(matchId: string) {
    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { tie: true, category: true } });
    const a = await lineupFor(m.tie.teamAId!, m.category.code);
    const b = await lineupFor(m.tie.teamBId!, m.category.code);
    await saveLineup(matchId, { teamId: m.tie.teamAId!, playerIds: a }, ACTOR, true);
    await saveLineup(matchId, { teamId: m.tie.teamBId!, playerIds: b }, ACTOR, true);
    let seq = 1;
    const send = (type: string, payload: Record<string, unknown>) =>
      appendEvent(matchId, { seq: seq++, idempotencyKey: `seed-${matchId}-${seq}`, type: type as never, payload }, ACTOR);
    await send("SETUP", {
      firstServingTeam: "A",
      positions: { A: { right: a[0], left: a[1] ?? null }, B: { right: b[0], left: b[1] ?? null } },
      teamAEnd: "NEAR",
      coinTossWinner: "A",
      coinTossChoice: "SERVE",
    });
    return { send, config: m.config as unknown as MatchConfig, seqRef: () => seq };
  }

  async function play(matchId: string, favour: Side, stopAt?: { games: number; points: number }) {
    const { send } = await prepare(matchId);
    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    const config = m.config as unknown as MatchConfig;
    const evs: { type: "RALLY"; payload: { winner: Side } }[] = [];
    for (let i = 0; i < 400; i++) {
      const winner: Side = rand() < 0.58 ? favour : favour === "A" ? "B" : "A";
      evs.push({ type: "RALLY", payload: { winner } });
      const s = replay(config, [{ type: "SETUP", payload: { firstServingTeam: "A", positions: { A: { right: "a", left: config.format === "DOUBLES" ? "b" : null }, B: { right: "c", left: config.format === "DOUBLES" ? "d" : null } } } }, ...evs]);
      if (stopAt && s.gameIndex === stopAt.games && s.games[s.gameIndex].a + s.games[s.gameIndex].b >= stopAt.points) break;
      if (s.phase === "FINISHED") break;
    }
    for (const e of evs) await send(e.type, e.payload);
  }

  const ties = await prisma.tie.findMany({ where: { stageId: rr.id }, include: { matches: { orderBy: { slotOrder: "asc" } } }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] });
  const inProgress = ties.find((x) => x.groupId === gA.id)!;
  const finished = ties.find((x) => x.groupId === gB.id)!;

  // Group A tie in progress: slot 1 to A, slot 2 to B, slot 3 live mid-game 1, slots 4-5 upcoming.
  await play(inProgress.matches[0].id, "A");
  await play(inProgress.matches[1].id, "B");
  await play(inProgress.matches[2].id, "A", { games: 0, points: 12 });
  // Pre-submit one upcoming lineup so the lineup screen has something to show.
  const m4 = await prisma.match.findUniqueOrThrow({ where: { id: inProgress.matches[3].id }, include: { tie: true, category: true } });
  await saveLineup(m4.id, { teamId: m4.tie.teamAId!, playerIds: await lineupFor(m4.tie.teamAId!, m4.category.code) }, ACTOR, true);

  // Group B tie fully finished.
  for (const [i, m] of finished.matches.entries()) {
    const cur = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
    if (cur.status === "NOT_REQUIRED") continue;
    await play(m.id, i === 1 ? "B" : "A");
  }
  await recomputeTie(inProgress.id);
  await recomputeTie(finished.id);

  const refMatch = await prisma.match.findUniqueOrThrow({ where: { id: inProgress.matches[2].id } });
  console.log(`Seeded tournament "${t.name}" → /t/${SLUG}`);
  console.log(`Live match id: ${refMatch.id} (get its ref link from Admin → Ties)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
