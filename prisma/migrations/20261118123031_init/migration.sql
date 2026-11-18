-- CreateEnum
CREATE TYPE "Format" AS ENUM ('SINGLES', 'DOUBLES');

-- CreateEnum
CREATE TYPE "GenderRule" AS ENUM ('ANY', 'MALE', 'FEMALE', 'MIXED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AgeRuleType" AS ENUM ('NONE', 'UNDER', 'OVER', 'RANGE');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('ROUND_ROBIN', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "TieStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'DECIDED', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LINEUP', 'LIVE', 'PAUSED', 'FINISHED', 'WALKOVER', 'RETIRED', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "logoMediaId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "ageCutoffDate" DATE NOT NULL,
    "courtNames" TEXT[] DEFAULT ARRAY['Court 1', 'Court 2', 'Court 3', 'Court 4']::TEXT[],
    "settings" JSONB NOT NULL DEFAULT '{}',
    "defaultTemplateId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "format" "Format" NOT NULL,
    "genderRule" "GenderRule" NOT NULL DEFAULT 'ANY',
    "ageRuleType" "AgeRuleType" NOT NULL DEFAULT 'NONE',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "skillMin" DOUBLE PRECISION,
    "skillMax" DOUBLE PRECISION,
    "scoringConfig" JSONB NOT NULL DEFAULT '{}',
    "color" TEXT NOT NULL DEFAULT '#C6FF00',
    "icon" TEXT NOT NULL DEFAULT 'trophy',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TieTemplate" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelPolicy" TEXT NOT NULL DEFAULT 'DECIDER',
    "stopEarly" BOOLEAN NOT NULL DEFAULT true,
    "earlyStopMode" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "usageLimit" INTEGER NOT NULL DEFAULT 2,
    "allowPairRepeat" BOOLEAN NOT NULL DEFAULT false,
    "rosterMin" INTEGER NOT NULL DEFAULT 4,
    "rosterMax" INTEGER NOT NULL DEFAULT 12,
    "blindLineup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TieTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TieTemplateSlot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isDecider" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TieTemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "logoMediaId" TEXT,
    "captain" TEXT,
    "managerName" TEXT,
    "managerContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "photoMediaId" TEXT,
    "gender" "Gender" NOT NULL,
    "dob" DATE,
    "skill" DOUBLE PRECISION,
    "jersey" TEXT,
    "handedness" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTeam" (
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupTeam_pkey" PRIMARY KEY ("groupId","teamId")
);

-- CreateTable
CREATE TABLE "Tie" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "roundLabel" TEXT,
    "bracketPos" INTEGER,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "templateId" TEXT,
    "slotOverrides" JSONB,
    "status" "TieStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "winner" TEXT,
    "court" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "nextTieId" TEXT,
    "nextSide" TEXT,
    "loserNextTieId" TEXT,
    "loserNextSide" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tieId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slotOrder" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isDecider" BOOLEAN NOT NULL DEFAULT false,
    "configOverride" JSONB,
    "config" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "court" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "refTokenHash" TEXT,
    "refTokenEnc" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "cachedState" JSONB,
    "winner" TEXT,
    "gamesA" INTEGER NOT NULL DEFAULT 0,
    "gamesB" INTEGER NOT NULL DEFAULT 0,
    "refSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLineup" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerIds" TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overridePlayerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tournamentId_code_key" ON "Category"("tournamentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tournamentId_code_key" ON "Team"("tournamentId", "code");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Tie_tournamentId_idx" ON "Tie"("tournamentId");

-- CreateIndex
CREATE INDEX "Tie_stageId_idx" ON "Tie"("stageId");

-- CreateIndex
CREATE INDEX "Match_tieId_idx" ON "Match"("tieId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_teamId_key" ON "MatchLineup"("matchId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEvent_matchId_seq_key" ON "ScoreEvent"("matchId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEvent_matchId_idempotencyKey_key" ON "ScoreEvent"("matchId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_tournamentId_createdAt_idx" ON "AuditLog"("tournamentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieTemplate" ADD CONSTRAINT "TieTemplate_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieTemplateSlot" ADD CONSTRAINT "TieTemplateSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TieTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieTemplateSlot" ADD CONSTRAINT "TieTemplateSlot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TieTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeam" ADD CONSTRAINT "GroupTeam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeam" ADD CONSTRAINT "GroupTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tie" ADD CONSTRAINT "Tie_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TieTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tieId_fkey" FOREIGN KEY ("tieId") REFERENCES "Tie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
