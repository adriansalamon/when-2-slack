/*
  Warnings:

  - You are about to drop the column `identifier` on the `Poll` table. All the data in the column will be lost.
  - Added the required column `userName` to the `Vote` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "optionId" INTEGER NOT NULL,
    "pollId" INTEGER NOT NULL,
    CONSTRAINT "Vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Vote" ("id", "optionId", "pollId", "user") SELECT "id", "optionId", "pollId", "user" FROM "Vote";
DROP TABLE "Vote";
ALTER TABLE "new_Vote" RENAME TO "Vote";
CREATE TABLE "new_Poll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL
);
INSERT INTO "new_Poll" ("author", "channel", "description", "id", "title", "ts") SELECT "author", "channel", "description", "id", "title", "ts" FROM "Poll";
DROP TABLE "Poll";
ALTER TABLE "new_Poll" RENAME TO "Poll";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
