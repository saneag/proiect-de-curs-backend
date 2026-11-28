-- Bound text columns to the limits the API already enforces.
ALTER TABLE "users"
  ALTER COLUMN "firstName" SET DATA TYPE VARCHAR(20),
  ALTER COLUMN "lastName" SET DATA TYPE VARCHAR(20),
  ALTER COLUMN "email" SET DATA TYPE VARCHAR(254),
  ALTER COLUMN "avatarUrl" SET DATA TYPE VARCHAR(255),
  ALTER COLUMN "description" SET DATA TYPE VARCHAR(300);

ALTER TABLE "posts"
  ALTER COLUMN "title" SET DATA TYPE VARCHAR(50),
  ALTER COLUMN "image" SET DATA TYPE VARCHAR(255);

ALTER TABLE "comments"
  ALTER COLUMN "content" SET DATA TYPE VARCHAR(500);

-- "My posts" filters by creator and sorts by date.
DROP INDEX "posts_creatorId_idx";
CREATE INDEX "posts_creatorId_createdAt_idx" ON "posts"("creatorId", "createdAt");
