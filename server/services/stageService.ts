import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { HttpError, notFound } from "../errors";
import { bracket, crossSeed, roundRobin } from "@shared/tournament/fixtures";
import { createMatchesForTie } from "./matchService";
import { buildBundle } from "./bundle";
import { settingsOf } from "./serialize";

type Tx = Prisma.TransactionClient;

export async function slotsForTemplate(tx: Tx, templateId: string | null) {
  if (!templateId) throw new HttpError(400, "Pick a tie format for this stage (or a default for the tournament) first");
  const tpl = await tx.tieTemplate.findUnique({ where: { id: templateId }, include: { slots: { orderBy: { order: "asc" } } } });
  if (!tpl) throw new HttpError(400, "Tie format not found");
  if (!tpl.slots.length) throw new HttpError(400, "Tie format has no category slots");
  return tpl.slots.map((s, i) => ({ order: i + 1, categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider }));
}

async function assertNoStartedTies(tx: Tx, stageId: string) {
  const started = await tx.match.count({ where: { tie: { stageId }, OR: [{ seq: { gt: 0 } }, { status: { in: ["LIVE", "FINISHED", "WALKOVER", "RETIRED"] } }] } });
  if (started > 0) throw new HttpError(409, "Ties in this stage have already started; edit them individually instead");
}

export async function generateStage(stageId: string) {
  return prisma.$transaction(
    async (tx) => {
      const stage = await tx.stage.findUnique({
        where: { id: stageId },
        include: { tournament: true, groups: { include: { teams: true }, orderBy: { order: "asc" } } },
      });
      if (!stage) throw notFound("Stage not found");
      await assertNoStartedTies(tx, stageId);
      await tx.tie.deleteMany({ where: { stageId } });
      const templateId = stage.templateId ?? stage.tournament.defaultTemplateId;
      const slots = await slotsForTemplate(tx, templateId);
      const duration = settingsOf(stage.tournament).matchDurationMinutes;
      let created = 0;

      if (stage.type === "ROUND_ROBIN") {
        const settings = (stage.settings as { doubleRoundRobin?: boolean }) ?? {};
        for (const g of stage.groups) {
          const ids = [...g.teams].sort((a, b) => a.seed - b.seed).map((t) => t.teamId);
          const rounds = roundRobin(ids, !!settings.doubleRoundRobin);
          for (let r = 0; r < rounds.length; r++) {
            for (const [a, b] of rounds[r]) {
              const tie = await tx.tie.create({
                data: { tournamentId: stage.tournamentId, stageId, groupId: g.id, round: r + 1, roundLabel: `${g.name} · Round ${r + 1}`, teamAId: a, teamBId: b, templateId },
              });
              await createMatchesForTie(tx, tie, slots, duration);
              created++;
            }
          }
        }
        return { created };
      }

      // KNOCKOUT
      const settings = (stage.settings as { seedTeamIds?: string[]; thirdPlace?: boolean }) ?? {};
      const seeds = settings.seedTeamIds ?? [];
      if (seeds.length < 2) throw new HttpError(400, "Add at least 2 seeded teams to the knockout stage first");
      const b = bracket(seeds.length);
      const byKey = new Map<string, string>();
      // create from the final backwards so next-tie links exist
      const ordered = [...b.matches].sort((x, y) => y.round - x.round || x.pos - y.pos);
      let finalId: string | null = null;
      for (const spec of ordered) {
        const next = spec.round < b.rounds ? byKey.get(`${spec.round + 1}:${Math.floor(spec.pos / 2)}`) : undefined;
        const teamAId = spec.seedA ? seeds[spec.seedA - 1] : null;
        const teamBId = spec.seedB ? seeds[spec.seedB - 1] : null;
        const isBye = spec.round === 1 && (!teamAId || !teamBId);
        if (isBye) {
          // Bye: advance the seeded team straight into the next round.
          const adv = teamAId ?? teamBId;
          if (next && adv) await tx.tie.update({ where: { id: next }, data: { [spec.pos % 2 === 0 ? "teamAId" : "teamBId"]: adv } });
          continue;
        }
        const tie = await tx.tie.create({
          data: {
            tournamentId: stage.tournamentId,
            stageId,
            round: spec.round,
            roundLabel: spec.label,
            bracketPos: spec.pos,
            teamAId,
            teamBId,
            templateId,
            nextTieId: next ?? null,
            nextSide: next ? (spec.pos % 2 === 0 ? "A" : "B") : null,
          },
        });
        byKey.set(`${spec.round}:${spec.pos}`, tie.id);
        if (spec.round === b.rounds) finalId = tie.id;
        await createMatchesForTie(tx, tie, slots, duration);
        created++;
      }
      if (settings.thirdPlace && b.rounds >= 2 && finalId) {
        const third = await tx.tie.create({
          data: { tournamentId: stage.tournamentId, stageId, round: b.rounds, roundLabel: "3rd place", bracketPos: 1, templateId },
        });
        await createMatchesForTie(tx, third, slots, duration);
        created++;
        for (let pos = 0; pos < 2; pos++) {
          const sfId = byKey.get(`${b.rounds - 1}:${pos}`);
          if (sfId) await tx.tie.update({ where: { id: sfId }, data: { loserNextTieId: third.id, loserNextSide: pos === 0 ? "A" : "B" } });
        }
      }
      return { created };
    },
    { timeout: 60000 },
  );
}

/** Seed a knockout stage from the standings of a round-robin stage (A1 v B2, B1 v A2, ...). */
export async function fillKnockoutFromStandings(stageId: string, fromStageId: string) {
  const ko = await prisma.stage.findUnique({ where: { id: stageId } });
  const rr = await prisma.stage.findUnique({ where: { id: fromStageId } });
  if (!ko || !rr || ko.type !== "KNOCKOUT" || rr.type !== "ROUND_ROBIN") throw new HttpError(400, "Pick a knockout stage and a round-robin source stage");
  const bundle = await buildBundle(ko.tournamentId);
  const q = ((rr.settings as { qualifiersPerGroup?: number }) ?? {}).qualifiersPerGroup ?? 2;
  const groups = bundle.standings.filter((s) => s.stageId === rr.id).map((s) => s.rows.map((r) => r.teamId));
  const seeds = crossSeed(groups, q);
  await prisma.stage.update({ where: { id: stageId }, data: { settings: { ...((ko.settings as object) ?? {}), seedTeamIds: seeds } } });
  return generateStage(stageId);
}

/**
 * Greedy auto-scheduler: walks ties in round order and puts each tie's matches on parallel courts,
 * advancing time by one slot whenever all courts are filled.
 */
export async function autoSchedule(tournamentId: string, startISO: string, slotMinutes: number, onlyUnscheduled = true) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  const courts = t.courtNames.length ? t.courtNames : ["Court 1"];
  const ties = await prisma.tie.findMany({
    where: { tournamentId },
    include: { matches: { orderBy: { slotOrder: "asc" } }, stage: true },
    orderBy: [{ stage: { order: "asc" } }, { round: "asc" }, { bracketPos: "asc" }, { createdAt: "asc" }],
  });
  let time = new Date(startISO).getTime();
  let c = 0;
  let count = 0;
  for (const tie of ties) {
    for (const m of tie.matches) {
      if (["FINISHED", "LIVE", "WALKOVER", "RETIRED", "NOT_REQUIRED"].includes(m.status)) continue;
      if (onlyUnscheduled && m.scheduledAt) continue;
      await prisma.match.update({ where: { id: m.id }, data: { court: courts[c], scheduledAt: new Date(time), durationMin: slotMinutes } });
      count++;
      c++;
      if (c >= courts.length) {
        c = 0;
        time += slotMinutes * 60000;
      }
    }
    if (tie.matches.length) {
      const first = await prisma.match.findFirst({ where: { tieId: tie.id }, orderBy: { scheduledAt: "asc" } });
      await prisma.tie.update({ where: { id: tie.id }, data: { scheduledAt: first?.scheduledAt ?? null, court: first?.court ?? null } });
    }
  }
  return { scheduled: count };
}
