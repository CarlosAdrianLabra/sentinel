-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImportJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileName" TEXT,
    "totalRows" INTEGER,
    "processedRows" INTEGER,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "snapshotDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" INTEGER,
    CONSTRAINT "ImportJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ImportJob" ("createdAt", "errorMessage", "fileName", "finishedAt", "id", "processedRows", "snapshotDate", "source", "startedAt", "status", "totalRows") SELECT "createdAt", "errorMessage", "fileName", "finishedAt", "id", "processedRows", "snapshotDate", "source", "startedAt", "status", "totalRows" FROM "ImportJob";
DROP TABLE "ImportJob";
ALTER TABLE "new_ImportJob" RENAME TO "ImportJob";
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
