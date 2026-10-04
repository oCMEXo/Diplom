ALTER TABLE "projects"
  ADD COLUMN "github_owner" TEXT,
  ADD COLUMN "github_repo" TEXT,
  ADD COLUMN "github_branch" TEXT;

ALTER TABLE "files" ADD COLUMN "source_sha" TEXT;
