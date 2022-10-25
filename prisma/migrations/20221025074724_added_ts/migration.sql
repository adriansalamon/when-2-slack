/*
  Warnings:

  - Added the required column `ts` to the `Poll` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Poll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "identifier" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL
);
INSERT INTO "new_Poll" ("author", "channel", "description", "id", "identifier", "title") SELECT "author", "channel", "description", "id", "identifier", "title" FROM "Poll";
DROP TABLE "Poll";
ALTER TABLE "new_Poll" RENAME TO "Poll";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
