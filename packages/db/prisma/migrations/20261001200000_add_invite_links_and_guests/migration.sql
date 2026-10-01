-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_guest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "invite_code" TEXT;
ALTER TABLE "projects" ADD COLUMN "invite_role" "ProjectRole" NOT NULL DEFAULT 'editor';

-- Backfill invite_code for pre-existing rows
UPDATE "projects" SET "invite_code" = replace(gen_random_uuid()::text, '-', '') WHERE "invite_code" IS NULL;

-- Enforce NOT NULL + uniqueness now that every row has a value
ALTER TABLE "projects" ALTER COLUMN "invite_code" SET NOT NULL;
CREATE UNIQUE INDEX "projects_invite_code_key" ON "projects"("invite_code");
