-- Default match format is now ONE game to 11 (side-out). Re-resolve matches that have not started yet,
-- unless their category or the match itself explicitly chose a number of games.
UPDATE "Match" m
SET "config" = jsonb_set(m."config", '{bestOf}', '1'::jsonb)
FROM "Category" c
WHERE m."categoryId" = c."id"
  AND m."seq" = 0
  AND NOT (c."scoringConfig" ? 'bestOf')
  AND (m."configOverride" IS NULL OR NOT (m."configOverride" ? 'bestOf'));
