ALTER TABLE "files"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "trashed_path" TEXT;
