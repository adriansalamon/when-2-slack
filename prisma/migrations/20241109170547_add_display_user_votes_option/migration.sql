-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Poll" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL DEFAULT 'meeting',
    "ts" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "addOptionDesc" TEXT,
    "displayUsersVotes" BOOLEAN NOT NULL DEFAULT true,
    "usersCanAddOption" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Poll" ("addOptionDesc", "author", "channel", "description", "id", "title", "ts", "type", "usersCanAddOption") SELECT "addOptionDesc", "author", "channel", "description", "id", "title", "ts", "type", "usersCanAddOption" FROM "Poll";
DROP TABLE "Poll";
ALTER TABLE "new_Poll" RENAME TO "Poll";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
