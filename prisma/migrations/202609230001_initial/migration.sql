-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingsJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SettingsChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Token" (
    "mint" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenMint" TEXT NOT NULL,
    "scanMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME NOT NULL,
    "riskScore" REAL NOT NULL,
    "confidenceScore" REAL NOT NULL,
    "verdict" TEXT NOT NULL,
    "criticalVetoCount" INTEGER NOT NULL,
    "reportJson" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VetoFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "vetoCode" TEXT NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reviewedAt" DATETIME,
    "reviewedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScoreContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "points" REAL NOT NULL,
    "maxCategoryPoints" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawResponseJson" TEXT NOT NULL,
    "normalizedResponseJson" TEXT NOT NULL,
    "errorJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenMint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "scanIntervalSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenMint" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LpPositionProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenMint" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "lowerPrice" REAL NOT NULL,
    "upperPrice" REAL NOT NULL,
    "currentPriceManual" REAL NOT NULL,
    "amountUsd" REAL NOT NULL,
    "targetHorizonHours" REAL NOT NULL,
    "maxLossPercent" REAL NOT NULL,
    "notes" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Scan_tokenMint_idx" ON "Scan"("tokenMint");

-- CreateIndex
CREATE INDEX "Scan_completedAt_idx" ON "Scan"("completedAt");

-- CreateIndex
CREATE INDEX "Evidence_scanId_idx" ON "Evidence"("scanId");

-- CreateIndex
CREATE INDEX "VetoFinding_scanId_idx" ON "VetoFinding"("scanId");

-- CreateIndex
CREATE INDEX "ScoreContribution_scanId_idx" ON "ScoreContribution"("scanId");

-- CreateIndex
CREATE INDEX "ProviderSnapshot_scanId_idx" ON "ProviderSnapshot"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_tokenMint_key" ON "WatchlistItem"("tokenMint");

-- CreateIndex
CREATE INDEX "Alert_tokenMint_idx" ON "Alert"("tokenMint");

-- CreateIndex
CREATE INDEX "LpPositionProfile_tokenMint_idx" ON "LpPositionProfile"("tokenMint");
