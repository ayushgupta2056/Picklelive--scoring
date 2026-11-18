import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { ah, badRequest, HttpError, notFound } from "../errors";
import {
  categorySchema,
  groupsSchema,
  incomingEventSchema,
  lineupSchema,
  matchPatchSchema,
  playerSchema,
  stageSchema,
  teamSchema,
  templateSchema,
  tieSlotsSchema,
  tiePatchSchema,
  tournamentSchema,
} from "../validation";
import { appendEvent, audit, createMatchesForTie, loadTieSummary, recomputeTie } from "../services/matchService";
import { broadcastMatch, saveLineup, setLineupLock, tieLineups } from "../services/lineupService";
import { buildBundle } from "../services/bundle";
import { autoSchedule, fillKnockoutFromStandings, generateStage, slotsForTemplate } from "../services/stageService";
import { isoDate, matchSummary, resolveConfig, settingsOf, stateOf } from "../services/serialize";
import { decryptToken, freshRefToken } from "../tokens";
import { emitInvalidate, kickRef } from "../realtime";
import { CATEGORY_PRESETS } from "@shared/presets";
import { parsePlayerCsv, toCsv } from "@shared/csv";
import { findConflicts } from "@shared/tournament/conflicts";
import type { MatchConfig } from "@shared/scoring/types";
import { DEFAULT_SETTINGS } from "@shared/api";

export const adminRouter = Router();
const p = (v: unknown) => String(v);
const date = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : s === null ? null : undefined);
const actor = (res: { locals: Record<string, unknown> }) => String(res.locals.actor);

async function tidOf(entity: "category" | "tieTemplate" | "team" | "player" | "stage" | "tie" | "match", id: string): Promise<string> {
  const row = await (prisma[entity] as unknown as { findUnique: (a: unknown) => Promise<{ tournamentId: string } | null> }).findUnique({
    where: { id },
    select: { tournamentId: true },
  });
  if (!row) throw notFound(`${entity} not found`);
  return row.tournamentId;
}

const changed = (tid: string, reason: string) => emitInvalidate(tid, reason);

// ---------------- tournaments ----------------

adminRouter.get("/tournaments", ah(async (_req, res) => {
  const list = await prisma.tournament.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { teams: true, ties: true } } } });
  res.json(list.map((t) => ({ id: t.id, name: t.name, slug: t.slug, venue: t.venue, startDate: isoDate(t.startDate), teams: t._count.teams, ties: t._count.ties })));
}));

adminRouter.post("/tournaments", ah(async (req, res) => {
  const body = tournamentSchema.extend({ withPresets: z.boolean().default(true) }).parse(req.body);
  const { withPresets, settings, ...rest } = body;
  const t = await prisma.tournament.create({
    data: {
      ...rest,
      startDate: date(rest.startDate),
      endDate: date(rest.endDate),
      ageCutoffDate: date(rest.ageCutoffDate)!,
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    },
  });
  if (withPresets) {
    await prisma.category.createMany({
      data: CATEGORY_PRESETS.map((c, i) => ({ ...c, tournamentId: t.id, sortOrder: i, scoringConfig: (c.scoringConfig ?? {}) as Prisma.InputJsonValue })),
    });
  }
  await audit(actor(res), "tournament.create", "Tournament", t.id, { name: t.name }, t.id);
  res.status(201).json(t);
}));

adminRouter.get("/tournaments/:tid", ah(async (req, res) => {
  const t = await prisma.tournament.findUnique({
    where: { id: p(req.params.tid) },
    include: {
      categories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      templates: { include: { slots: { orderBy: { order: "asc" } } }, orderBy: { createdAt: "asc" } },
      teams: { orderBy: { name: "asc" } },
      players: { orderBy: { name: "asc" } },
      stages: { orderBy: { order: "asc" }, include: { groups: { orderBy: { order: "asc" }, include: { teams: true } } } },
    },
  });
  if (!t) throw notFound("Tournament not found");
  res.json({
    ...t,
    startDate: isoDate(t.startDate),
    endDate: isoDate(t.endDate),
    ageCutoffDate: isoDate(t.ageCutoffDate),
    settings: settingsOf(t),
    players: t.players.map((pl) => ({ ...pl, dob: isoDate(pl.dob) })),
  });
}));

adminRouter.get("/tournaments/:tid/bundle", ah(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await buildBundle(p(req.params.tid), { revealAll: true }));
}));

adminRouter.patch("/tournaments/:tid", ah(async (req, res) => {
  const id = p(req.params.tid);
  const body = tournamentSchema.partial().parse(req.body);
  const cur = await prisma.tournament.findUniqueOrThrow({ where: { id } });
  const { settings, ...rest } = body;
  const t = await prisma.tournament.update({
    where: { id },
    data: {
      ...rest,
      startDate: date(rest.startDate),
      endDate: date(rest.endDate),
      ageCutoffDate: rest.ageCutoffDate ? date(rest.ageCutoffDate)! : undefined,
      settings: settings ? { ...settingsOf(cur), ...settings } : undefined,
    },
  });
  await audit(actor(res), "tournament.update", "Tournament", id, body as Record<string, unknown>, id);
  changed(id, "tournament");
  res.json(t);
}));

adminRouter.delete("/tournaments/:tid", ah(async (req, res) => {
  const id = p(req.params.tid);
  await prisma.$transaction([
    prisma.match.deleteMany({ where: { tournamentId: id } }),
    prisma.tie.deleteMany({ where: { tournamentId: id } }),
    prisma.tieTemplateSlot.deleteMany({ where: { template: { tournamentId: id } } }),
    prisma.tournament.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
}));

// ---------------- categories ----------------

adminRouter.post("/tournaments/:tid/categories", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const body = categorySchema.parse(req.body);
  const max = await prisma.category.aggregate({ where: { tournamentId: tid }, _max: { sortOrder: true } });
  const c = await prisma.category.create({ data: { ...body, scoringConfig: body.scoringConfig ?? {}, tournamentId: tid, sortOrder: body.sortOrder ?? (max._max.sortOrder ?? 0) + 1 } });
  await audit(actor(res), "category.create", "Category", c.id, { name: c.name }, tid);
  changed(tid, "categories");
  res.status(201).json(c);
}));

adminRouter.post("/tournaments/:tid/categories/presets", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const existing = await prisma.category.findMany({ where: { tournamentId: tid }, select: { code: true } });
  const codes = new Set(existing.map((c) => c.code));
  const add = CATEGORY_PRESETS.filter((c) => !codes.has(c.code));
  await prisma.category.createMany({ data: add.map((c, i) => ({ ...c, tournamentId: tid, sortOrder: 100 + i, scoringConfig: (c.scoringConfig ?? {}) as Prisma.InputJsonValue })) });
  changed(tid, "categories");
  res.json({ added: add.length });
}));

adminRouter.post("/tournaments/:tid/categories/reorder", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.category.updateMany({ where: { id, tournamentId: tid }, data: { sortOrder: i } })));
  changed(tid, "categories");
  res.json({ ok: true });
}));

adminRouter.patch("/categories/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const cur = await prisma.category.findUniqueOrThrow({ where: { id } });
  const merged = categorySchema.parse({ ...cur, ...req.body, scoringConfig: req.body.scoringConfig ?? cur.scoringConfig });
  const c = await prisma.category.update({ where: { id }, data: merged });
  // Refresh the resolved config of matches that haven't started yet.
  const pending = await prisma.match.findMany({ where: { categoryId: id, seq: 0 } });
  for (const m of pending) await prisma.match.update({ where: { id: m.id }, data: { config: resolveConfig(c, m.configOverride) as unknown as Prisma.InputJsonValue } });
  await audit(actor(res), "category.update", "Category", id, merged as Record<string, unknown>, c.tournamentId);
  changed(c.tournamentId, "categories");
  res.json(c);
}));

adminRouter.post("/categories/:id/clone", ah(async (req, res) => {
  const src = await prisma.category.findUniqueOrThrow({ where: { id: p(req.params.id) } });
  const { id: _id, createdAt: _c, ...rest } = src;
  let code = `${src.code}2`.slice(0, 8);
  for (let i = 2; await prisma.category.findFirst({ where: { tournamentId: src.tournamentId, code } }); i++) code = `${src.code.slice(0, 6)}${i}`;
  const c = await prisma.category.create({ data: { ...rest, scoringConfig: rest.scoringConfig as Prisma.InputJsonValue, name: `${src.name} (copy)`, code, sortOrder: src.sortOrder + 1 } });
  changed(src.tournamentId, "categories");
  res.status(201).json(c);
}));

adminRouter.delete("/categories/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("category", id);
  const used = await prisma.tieTemplateSlot.count({ where: { categoryId: id } });
  const usedM = await prisma.match.count({ where: { categoryId: id } });
  if (used || usedM) throw new HttpError(409, `Category is used by ${used} tie-format slot(s) and ${usedM} match(es)`);
  await prisma.category.delete({ where: { id } });
  changed(tid, "categories");
  res.json({ ok: true });
}));

// ---------------- tie templates ----------------

async function writeTemplate(tid: string, body: z.infer<typeof templateSchema>, id?: string) {
  const cats = await prisma.category.findMany({ where: { tournamentId: tid, id: { in: body.slots.map((s) => s.categoryId) } } });
  if (cats.length !== new Set(body.slots.map((s) => s.categoryId)).size) throw badRequest("Unknown category in slots");
  const { slots, ...rest } = body;
  return prisma.$transaction(async (tx) => {
    const tpl = id
      ? await tx.tieTemplate.update({ where: { id }, data: rest })
      : await tx.tieTemplate.create({ data: { ...rest, tournamentId: tid } });
    await tx.tieTemplateSlot.deleteMany({ where: { templateId: tpl.id } });
    await tx.tieTemplateSlot.createMany({ data: slots.map((s, i) => ({ templateId: tpl.id, order: i + 1, categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider })) });
    return tx.tieTemplate.findUniqueOrThrow({ where: { id: tpl.id }, include: { slots: { orderBy: { order: "asc" } } } });
  });
}

adminRouter.post("/tournaments/:tid/templates", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const tpl = await writeTemplate(tid, templateSchema.parse(req.body));
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
  if (!t.defaultTemplateId) await prisma.tournament.update({ where: { id: tid }, data: { defaultTemplateId: tpl.id } });
  await audit(actor(res), "template.create", "TieTemplate", tpl.id, { name: tpl.name }, tid);
  res.status(201).json(tpl);
}));

adminRouter.put("/templates/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("tieTemplate", id);
  const tpl = await writeTemplate(tid, templateSchema.parse(req.body), id);
  await audit(actor(res), "template.update", "TieTemplate", id, {}, tid);
  changed(tid, "templates");
  res.json(tpl);
}));

adminRouter.post("/templates/:id/clone", ah(async (req, res) => {
  const src = await prisma.tieTemplate.findUniqueOrThrow({ where: { id: p(req.params.id) }, include: { slots: { orderBy: { order: "asc" } } } });
  const { id: _i, createdAt: _c, tournamentId, slots, ...rest } = src;
  const tpl = await writeTemplate(tournamentId, { ...rest, name: `${src.name} (copy)`, slots: slots.map((s) => ({ categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider })) } as z.infer<typeof templateSchema>);
  res.status(201).json(tpl);
}));

adminRouter.delete("/templates/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("tieTemplate", id);
  await prisma.tournament.updateMany({ where: { defaultTemplateId: id }, data: { defaultTemplateId: null } });
  await prisma.tieTemplate.delete({ where: { id } });
  changed(tid, "templates");
  res.json({ ok: true });
}));

// ---------------- teams & players ----------------

adminRouter.post("/tournaments/:tid/teams", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const t = await prisma.team.create({ data: { ...teamSchema.parse(req.body), tournamentId: tid } });
  await audit(actor(res), "team.create", "Team", t.id, { name: t.name }, tid);
  changed(tid, "teams");
  res.status(201).json(t);
}));

adminRouter.patch("/teams/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const t = await prisma.team.update({ where: { id }, data: teamSchema.partial().parse(req.body) });
  changed(t.tournamentId, "teams");
  res.json(t);
}));

adminRouter.delete("/teams/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("team", id);
  const ties = await prisma.tie.count({ where: { OR: [{ teamAId: id }, { teamBId: id }] } });
  if (ties) throw new HttpError(409, `Team is in ${ties} tie(s); delete or regenerate those first`);
  await prisma.team.delete({ where: { id } });
  changed(tid, "teams");
  res.json({ ok: true });
}));

adminRouter.post("/tournaments/:tid/players", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const b = playerSchema.parse(req.body);
  const pl = await prisma.player.create({ data: { ...b, dob: date(b.dob), tournamentId: tid } });
  changed(tid, "players");
  res.status(201).json({ ...pl, dob: isoDate(pl.dob) });
}));

adminRouter.patch("/players/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const b = playerSchema.partial().parse(req.body);
  const pl = await prisma.player.update({ where: { id }, data: { ...b, dob: date(b.dob) } });
  changed(pl.tournamentId, "players");
  res.json({ ...pl, dob: isoDate(pl.dob) });
}));

adminRouter.delete("/players/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("player", id);
  const inLineup = await prisma.matchLineup.count({ where: { playerIds: { has: id } } });
  if (inLineup) throw new HttpError(409, "Player appears in a lineup; remove them from lineups first");
  await prisma.player.delete({ where: { id } });
  changed(tid, "players");
  res.json({ ok: true });
}));

adminRouter.post("/tournaments/:tid/players/import", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const { csv, dryRun } = z.object({ csv: z.string().max(2_000_000), dryRun: z.boolean().default(true) }).parse(req.body);
  const teams = await prisma.team.findMany({ where: { tournamentId: tid } });
  const report = parsePlayerCsv(csv, teams.map((t) => t.code));
  const okRows = report.filter((r) => r.ok && r.data);
  let created = 0;
  if (!dryRun && okRows.length) {
    const r = await prisma.player.createMany({
      data: okRows.map(({ data: d }) => ({
        tournamentId: tid,
        name: d!.name,
        gender: d!.gender,
        dob: d!.dob ? new Date(`${d!.dob}T00:00:00Z`) : null,
        teamId: d!.teamCode ? teams.find((t) => t.code === d!.teamCode)!.id : null,
        skill: d!.skill,
        jersey: d!.jersey,
        handedness: d!.handedness?.toUpperCase().startsWith("L") ? "L" : d!.handedness ? "R" : null,
        phone: d!.phone,
        notes: d!.notes,
      })),
    });
    created = r.count;
    await audit(actor(res), "players.import", "Tournament", tid, { created }, tid);
    changed(tid, "players");
  }
  res.json({ report: report.map(({ data: _d, ...r }) => r), valid: okRows.length, invalid: report.length - okRows.length, created });
}));

adminRouter.post("/media", ah(async (req, res) => {
  const { dataUrl } = z.object({ dataUrl: z.string().max(3_000_000) }).parse(req.body);
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest("Upload a PNG, JPEG or WebP image");
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > 1_500_000) throw badRequest("Image too large after resize");
  const media = await prisma.media.create({ data: { mime: m[1], data: buf } });
  res.status(201).json({ id: media.id, url: `/api/media/${media.id}` });
}));

// ---------------- stages & groups ----------------

adminRouter.post("/tournaments/:tid/stages", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const b = stageSchema.parse(req.body);
  const count = await prisma.stage.count({ where: { tournamentId: tid } });
  const s = await prisma.stage.create({ data: { ...b, settings: b.settings ?? {}, order: b.order ?? count, tournamentId: tid } });
  changed(tid, "stages");
  res.status(201).json(s);
}));

adminRouter.patch("/stages/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const cur = await prisma.stage.findUniqueOrThrow({ where: { id } });
  const b = stageSchema.partial().parse(req.body);
  const s = await prisma.stage.update({ where: { id }, data: { ...b, settings: b.settings ? { ...((cur.settings as object) ?? {}), ...b.settings } : undefined } });
  changed(s.tournamentId, "stages");
  res.json(s);
}));

adminRouter.delete("/stages/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("stage", id);
  const started = await prisma.match.count({ where: { tie: { stageId: id }, seq: { gt: 0 } } });
  if (started) throw new HttpError(409, "Stage has matches with scores");
  await prisma.$transaction([prisma.tie.deleteMany({ where: { stageId: id } }), prisma.stage.delete({ where: { id } })]);
  changed(tid, "stages");
  res.json({ ok: true });
}));

adminRouter.put("/stages/:id/groups", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("stage", id);
  const groups = groupsSchema.parse(req.body);
  const all = groups.flatMap((g) => g.teamIds);
  if (new Set(all).size !== all.length) throw badRequest("A team can only be in one group");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.group.findMany({ where: { stageId: id } });
    const keep = groups.map((g) => g.id).filter(Boolean) as string[];
    for (const g of existing) if (!keep.includes(g.id)) await tx.group.delete({ where: { id: g.id } });
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const row = g.id && existing.some((e) => e.id === g.id)
        ? await tx.group.update({ where: { id: g.id }, data: { name: g.name, order: i } })
        : await tx.group.create({ data: { stageId: id, name: g.name, order: i } });
      await tx.groupTeam.deleteMany({ where: { groupId: row.id } });
      await tx.groupTeam.createMany({ data: g.teamIds.map((teamId, seed) => ({ groupId: row.id, teamId, seed })) });
    }
  });
  changed(tid, "groups");
  res.json({ ok: true });
}));

adminRouter.put("/stages/:id/seeds", ah(async (req, res) => {
  const id = p(req.params.id);
  const { teamIds, regenerate } = z.object({ teamIds: z.array(z.string()), regenerate: z.boolean().default(true) }).parse(req.body);
  const cur = await prisma.stage.findUniqueOrThrow({ where: { id } });
  await prisma.stage.update({ where: { id }, data: { settings: { ...((cur.settings as object) ?? {}), seedTeamIds: teamIds } } });
  const r = regenerate && teamIds.length >= 2 ? await generateStage(id) : { created: 0 };
  await audit(actor(res), "stage.reseed", "Stage", id, { teamIds }, cur.tournamentId);
  changed(cur.tournamentId, "seeds");
  res.json(r);
}));

adminRouter.post("/stages/:id/generate", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("stage", id);
  const r = await generateStage(id);
  await audit(actor(res), "stage.generate", "Stage", id, r, tid);
  changed(tid, "generate");
  res.json(r);
}));

adminRouter.post("/stages/:id/fill", ah(async (req, res) => {
  const id = p(req.params.id);
  const { fromStageId } = z.object({ fromStageId: z.string() }).parse(req.body);
  const tid = await tidOf("stage", id);
  const r = await fillKnockoutFromStandings(id, fromStageId);
  await audit(actor(res), "stage.fill", "Stage", id, { fromStageId }, tid);
  changed(tid, "generate");
  res.json(r);
}));

// ---------------- ties ----------------

adminRouter.post("/tournaments/:tid/ties", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const b = z.object({ stageId: z.string(), groupId: z.string().nullable().optional(), teamAId: z.string(), teamBId: z.string(), round: z.number().int().min(1).default(1), roundLabel: z.string().max(60).optional() }).parse(req.body);
  if (b.teamAId === b.teamBId) throw badRequest("Pick two different teams");
  const stage = await prisma.stage.findUniqueOrThrow({ where: { id: b.stageId }, include: { tournament: true } });
  const templateId = stage.templateId ?? stage.tournament.defaultTemplateId;
  const tie = await prisma.$transaction(async (tx) => {
    const slots = await slotsForTemplate(tx, templateId);
    const tie = await tx.tie.create({ data: { ...b, tournamentId: tid, templateId } });
    await createMatchesForTie(tx, tie, slots, settingsOf(stage.tournament).matchDurationMinutes);
    return tie;
  });
  changed(tid, "ties");
  res.status(201).json(tie);
}));

adminRouter.get("/ties/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  res.json({ tie: await loadTieSummary(id, true), lineups: await tieLineups(id) });
}));

adminRouter.patch("/ties/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const b = tiePatchSchema.parse(req.body);
  const tie = await prisma.tie.update({ where: { id }, data: { ...b, scheduledAt: b.scheduledAt === undefined ? undefined : b.scheduledAt ? new Date(b.scheduledAt) : null } });
  await audit(actor(res), "tie.update", "Tie", id, b as Record<string, unknown>, tie.tournamentId);
  changed(tie.tournamentId, "ties");
  res.json(tie);
}));

adminRouter.delete("/ties/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const tid = await tidOf("tie", id);
  const started = await prisma.match.count({ where: { tieId: id, seq: { gt: 0 } } });
  if (started) throw new HttpError(409, "Tie has scored matches");
  await prisma.tie.delete({ where: { id } });
  changed(tid, "ties");
  res.json({ ok: true });
}));

/** Override ONE tie's slots: add, remove or reorder category matches (only those not yet started can change). */
adminRouter.put("/ties/:id/slots", ah(async (req, res) => {
  const id = p(req.params.id);
  const slots = tieSlotsSchema.parse(req.body);
  const tie = await prisma.tie.findUniqueOrThrow({ where: { id }, include: { matches: true, tournament: true } });
  await prisma.$transaction(async (tx) => {
    const keepIds = slots.map((s) => s.matchId).filter(Boolean) as string[];
    for (const m of tie.matches) {
      if (keepIds.includes(m.id)) continue;
      if (m.seq > 0) throw new HttpError(409, "Cannot remove a match that has been scored");
      await tx.match.delete({ where: { id: m.id } });
    }
    // temporarily move kept matches out of the way of new orders
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.matchId) {
        const m = tie.matches.find((x) => x.id === s.matchId);
        if (!m) throw badRequest("Unknown match in slots");
        if (m.seq > 0 && m.categoryId !== s.categoryId) throw new HttpError(409, "Cannot change the category of a scored match");
        const cat = await tx.category.findUniqueOrThrow({ where: { id: s.categoryId } });
        await tx.match.update({
          where: { id: m.id },
          data: { slotOrder: i + 1, categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider, ...(m.seq === 0 ? { config: resolveConfig(cat, m.configOverride) as unknown as Prisma.InputJsonValue } : {}) },
        });
      } else {
        await createMatchesForTie(tx, tie, [{ order: i + 1, categoryId: s.categoryId, weight: s.weight, isDecider: s.isDecider }], settingsOf(tie.tournament).matchDurationMinutes);
      }
    }
    await tx.tie.update({ where: { id }, data: { slotOverrides: slots as unknown as Prisma.InputJsonValue } });
  });
  await audit(actor(res), "tie.slots_override", "Tie", id, { slots }, tie.tournamentId);
  await recomputeTie(id);
  changed(tie.tournamentId, "ties");
  res.json(await loadTieSummary(id, true));
}));

adminRouter.get("/ties/:id/lineups", ah(async (req, res) => {
  res.json(await tieLineups(p(req.params.id)));
}));

// ---------------- matches ----------------

adminRouter.get("/matches/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const m = await prisma.match.findUnique({ where: { id }, include: { lineups: true, tie: { include: { template: true } }, events: { orderBy: { seq: "asc" } } } });
  if (!m) throw notFound("Match not found");
  const auditRows = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 100 });
  const token = decryptToken(m.refTokenEnc);
  res.json({
    match: matchSummary(m, m.tie, { revealAll: true }),
    state: stateOf(m),
    config: m.config,
    configOverride: m.configOverride,
    refPath: token && m.refTokenHash ? `/ref/${m.id}?token=${token}` : null,
    events: m.events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, actor: e.actor, createdAt: e.createdAt })),
    audit: auditRows,
  });
}));

adminRouter.patch("/matches/:id", ah(async (req, res) => {
  const id = p(req.params.id);
  const b = matchPatchSchema.parse(req.body);
  const m = await prisma.match.findUniqueOrThrow({ where: { id }, include: { category: true } });
  const data: Prisma.MatchUpdateInput = {};
  if (b.court !== undefined) data.court = b.court;
  if (b.scheduledAt !== undefined) data.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (b.durationMin !== undefined) data.durationMin = b.durationMin;
  if (b.configOverride !== undefined) {
    if (m.seq > 0) throw new HttpError(409, "Scoring rules can't change once the match has started");
    data.configOverride = b.configOverride ?? undefined;
    data.config = resolveConfig(m.category, b.configOverride) as unknown as Prisma.InputJsonValue;
  }
  await prisma.match.update({ where: { id }, data });
  await audit(actor(res), "match.update", "Match", id, b as Record<string, unknown>, m.tournamentId);
  await broadcastMatch(id);
  changed(m.tournamentId, "schedule");
  res.json({ ok: true });
}));

adminRouter.post("/matches/:id/events", ah(async (req, res) => {
  const body = incomingEventSchema.parse(req.body);
  const r = await appendEvent(p(req.params.id), { seq: body.seq, idempotencyKey: body.idempotencyKey, type: body.event.type, payload: body.event.payload as Record<string, unknown> }, actor(res));
  res.json(r);
}));

adminRouter.post("/matches/:id/action", ah(async (req, res) => {
  const id = p(req.params.id);
  const { action } = z.object({ action: z.enum(["PAUSE", "RESUME", "RESET"]) }).parse(req.body);
  const m = await prisma.match.findUniqueOrThrow({ where: { id }, include: { lineups: true } });
  if (action === "PAUSE") {
    if (m.status !== "LIVE") throw new HttpError(409, "Only a live match can be paused");
    await prisma.match.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (action === "RESUME") {
    if (m.status !== "PAUSED") throw new HttpError(409, "Match is not paused");
    await prisma.match.update({ where: { id }, data: { status: "LIVE" } });
  } else {
    // RESET wipes all score events (kept in the audit log) and unlocks lineups.
    const events = await prisma.scoreEvent.findMany({ where: { matchId: id }, orderBy: { seq: "asc" } });
    await prisma.$transaction([
      prisma.scoreEvent.deleteMany({ where: { matchId: id } }),
      prisma.matchLineup.updateMany({ where: { matchId: id }, data: { locked: false } }),
      prisma.match.update({
        where: { id },
        data: { seq: 0, cachedState: Prisma.DbNull, status: m.lineups.some((l) => l.submittedAt) ? "LINEUP" : "SCHEDULED", winner: null, gamesA: 0, gamesB: 0, startedAt: null, finishedAt: null, refSubmitted: false },
      }),
    ]);
    await audit(actor(res), "match.reset", "Match", id, { deletedEvents: events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, actor: e.actor })) }, m.tournamentId);
  }
  if (action !== "RESET") await audit(actor(res), `match.${action.toLowerCase()}`, "Match", id, {}, m.tournamentId);
  await broadcastMatch(id);
  await recomputeTie(m.tieId);
  res.json({ ok: true });
}));

adminRouter.put("/matches/:id/lineup", ah(async (req, res) => {
  const v = await saveLineup(p(req.params.id), lineupSchema.parse(req.body), actor(res), true);
  res.json({ ok: true, validation: v });
}));

adminRouter.post("/matches/:id/lineups/lock", ah(async (req, res) => {
  const { locked, teamId } = z.object({ locked: z.boolean(), teamId: z.string().optional() }).parse(req.body);
  await setLineupLock(p(req.params.id), locked, actor(res), teamId);
  res.json({ ok: true });
}));

adminRouter.post("/matches/:id/ref-link", ah(async (req, res) => {
  const id = p(req.params.id);
  const { token, refTokenHash, refTokenEnc } = freshRefToken();
  const m = await prisma.match.update({ where: { id }, data: { refTokenHash, refTokenEnc } });
  kickRef(id);
  await audit(actor(res), "ref.regenerate", "Match", id, {}, m.tournamentId);
  res.json({ refPath: `/ref/${id}?token=${token}` });
}));

adminRouter.delete("/matches/:id/ref-link", ah(async (req, res) => {
  const id = p(req.params.id);
  const m = await prisma.match.update({ where: { id }, data: { refTokenHash: null, refTokenEnc: null } });
  kickRef(id);
  await audit(actor(res), "ref.revoke", "Match", id, {}, m.tournamentId);
  res.json({ ok: true });
}));

// ---------------- schedule ----------------

adminRouter.get("/tournaments/:tid/conflicts", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
  const matches = await prisma.match.findMany({
    where: { tournamentId: tid, status: { not: "NOT_REQUIRED" } },
    include: { lineups: true, category: true, tie: { include: { teamA: true, teamB: true } } },
  });
  const players = await prisma.player.findMany({ where: { tournamentId: tid }, select: { id: true, name: true } });
  const names = Object.fromEntries(players.map((x) => [x.id, x.name]));
  const conflicts = findConflicts(
    matches.map((m) => ({
      id: m.id,
      label: `${m.tie.teamA?.code ?? "TBD"} v ${m.tie.teamB?.code ?? "TBD"} ${m.category.code}`,
      court: m.court,
      start: m.scheduledAt,
      durationMin: m.durationMin,
      playerIds: m.lineups.flatMap((l) => l.playerIds),
    })),
    settingsOf(t).restGapMinutes,
    names,
  );
  res.json(conflicts);
}));

adminRouter.post("/tournaments/:tid/auto-schedule", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const b = z.object({ start: z.string().datetime(), slotMinutes: z.number().int().min(5).max(240), onlyUnscheduled: z.boolean().default(true) }).parse(req.body);
  const r = await autoSchedule(tid, b.start, b.slotMinutes, b.onlyUnscheduled);
  await audit(actor(res), "schedule.auto", "Tournament", tid, { ...b, ...r }, tid);
  changed(tid, "schedule");
  res.json(r);
}));

// ---------------- audit & export ----------------

adminRouter.get("/tournaments/:tid/audit", ah(async (req, res) => {
  const take = Math.min(500, Number(req.query.limit ?? 200));
  res.json(await prisma.auditLog.findMany({ where: { tournamentId: p(req.params.tid) }, orderBy: { createdAt: "desc" }, take }));
}));

adminRouter.get("/tournaments/:tid/export/:kind", ah(async (req, res) => {
  const tid = p(req.params.tid);
  const kind = p(req.params.kind);
  const b = await buildBundle(tid, { revealAll: true });
  const team = (id: string | null) => b.teams.find((t) => t.id === id);
  const cat = (id: string) => b.categories.find((c) => c.id === id);
  const pname = (ids: string[] | null) => (ids ?? []).map((i) => b.players.find((x) => x.id === i)?.name ?? "").join(" / ");
  let rows: (string | number | null)[][];
  if (kind === "standings.csv") {
    rows = [["Stage", "Group", "Rank", "Team", "P", "W", "D", "L", "Matches W", "Matches L", "Games W", "Games L", "PF", "PA", "PD", "Tie Pts"]];
    for (const g of b.standings) {
      const st = b.stages.find((s) => s.id === g.stageId);
      const gr = st?.groups.find((x) => x.id === g.groupId);
      for (const r of g.rows) rows.push([st?.name ?? "", gr?.name ?? "", r.rank, team(r.teamId)?.name ?? "", r.played, r.won, r.drawn, r.lost, r.matchesWon, r.matchesLost, r.gamesWon, r.gamesLost, r.pointsFor, r.pointsAgainst, r.pointDiff, r.tiePoints]);
    }
  } else if (kind === "results.csv") {
    rows = [["Round", "Team A", "Team B", "Tie score", "Tie status", "Slot", "Category", "Court", "Scheduled (UTC)", "Status", "Lineup A", "Lineup B", "Games", "Match winner"]];
    for (const t of b.ties) {
      for (const m of t.matches) {
        rows.push([t.roundLabel ?? t.round, team(t.teamAId)?.name ?? "TBD", team(t.teamBId)?.name ?? "TBD", `${t.scoreA}-${t.scoreB}`, t.status, m.slotOrder, cat(m.categoryId)?.code ?? "", m.court, m.scheduledAt, m.status, pname(m.lineupA), pname(m.lineupB), m.games.map((g) => `${g.a}-${g.b}`).join(" "), m.winner ? team(m.winner === "A" ? t.teamAId : t.teamBId)?.name ?? "" : ""]);
      }
    }
  } else throw notFound("Unknown export");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${b.tournament.slug}-${kind}"`);
  res.send(toCsv(rows));
}));

export type { MatchConfig };
