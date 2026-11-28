-- Give every legacy (non-UUID) id a fresh UUID. Foreign keys are ON UPDATE CASCADE,
-- so posts, comments, reactions and follows follow their parents automatically.
UPDATE "users" SET "id" = gen_random_uuid()::text
  WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "posts" SET "id" = gen_random_uuid()::text
  WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "comments" SET "id" = gen_random_uuid()::text
  WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "reactions" SET "id" = gen_random_uuid()::text
  WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE "posts" DROP CONSTRAINT "posts_creatorId_fkey";
ALTER TABLE "comments" DROP CONSTRAINT "comments_postId_fkey";
ALTER TABLE "comments" DROP CONSTRAINT "comments_creatorId_fkey";
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_postId_fkey";
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_userId_fkey";
ALTER TABLE "follows" DROP CONSTRAINT "follows_followerId_fkey";
ALTER TABLE "follows" DROP CONSTRAINT "follows_followingId_fkey";
ALTER TABLE "follow_requests" DROP CONSTRAINT "follow_requests_senderId_fkey";
ALTER TABLE "follow_requests" DROP CONSTRAINT "follow_requests_recipientId_fkey";

ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE UUID USING "id"::uuid;
ALTER TABLE "posts"
  ALTER COLUMN "id" SET DATA TYPE UUID USING "id"::uuid,
  ALTER COLUMN "creatorId" SET DATA TYPE UUID USING "creatorId"::uuid;
ALTER TABLE "comments"
  ALTER COLUMN "id" SET DATA TYPE UUID USING "id"::uuid,
  ALTER COLUMN "postId" SET DATA TYPE UUID USING "postId"::uuid,
  ALTER COLUMN "creatorId" SET DATA TYPE UUID USING "creatorId"::uuid;
ALTER TABLE "reactions"
  ALTER COLUMN "id" SET DATA TYPE UUID USING "id"::uuid,
  ALTER COLUMN "postId" SET DATA TYPE UUID USING "postId"::uuid,
  ALTER COLUMN "userId" SET DATA TYPE UUID USING "userId"::uuid;
ALTER TABLE "follows"
  ALTER COLUMN "followerId" SET DATA TYPE UUID USING "followerId"::uuid,
  ALTER COLUMN "followingId" SET DATA TYPE UUID USING "followingId"::uuid;
ALTER TABLE "follow_requests"
  ALTER COLUMN "senderId" SET DATA TYPE UUID USING "senderId"::uuid,
  ALTER COLUMN "recipientId" SET DATA TYPE UUID USING "recipientId"::uuid;

ALTER TABLE "posts" ADD CONSTRAINT "posts_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
