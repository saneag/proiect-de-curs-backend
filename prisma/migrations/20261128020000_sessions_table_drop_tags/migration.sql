CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "previousHash" CHAR(64),
    "graceUntil" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX "sessions_userId_createdAt_idx" ON "sessions"("userId", "createdAt");
CREATE INDEX "sessions_previousHash_idx" ON "sessions"("previousHash");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep signed-in devices: each comma separated entry is `<current>` or `<current>.<previous>.<grace end ms>`.
INSERT INTO "sessions" ("id", "userId", "tokenHash", "previousHash", "graceUntil", "expiresAt")
SELECT gen_random_uuid(), u."id",
       split_part(e.entry, '.', 1),
       NULLIF(split_part(e.entry, '.', 2), ''),
       CASE WHEN split_part(e.entry, '.', 3) <> ''
            THEN to_timestamp(split_part(e.entry, '.', 3)::bigint / 1000.0) END,
       now() + interval '14 days'
FROM "users" u
CROSS JOIN LATERAL regexp_split_to_table(u."refreshToken", ',') AS e(entry)
WHERE u."refreshToken" IS NOT NULL
  AND e.entry ~ '^[0-9a-f]{64}(\.[0-9a-f]{64}\.[0-9]+)?$';

ALTER TABLE "users" DROP COLUMN "refreshToken";
ALTER TABLE "posts" DROP COLUMN "tags";
