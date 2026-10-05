-- Each GitHub branch of a project keeps its own set of files; "" means "not tied to a branch".
ALTER TABLE "files" ADD COLUMN "branch" TEXT NOT NULL DEFAULT '';

UPDATE "files" AS f
SET "branch" = p."github_branch"
FROM "projects" AS p
WHERE f."project_id" = p."id" AND p."github_branch" IS NOT NULL;

DROP INDEX "files_project_id_path_key";
CREATE UNIQUE INDEX "files_project_id_branch_path_key" ON "files"("project_id", "branch", "path");
