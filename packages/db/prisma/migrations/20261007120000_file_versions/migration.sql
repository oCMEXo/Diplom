-- Earlier states of a file as plain text, written by the sync server (at most ~50 per file).
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "file_versions_file_id_created_at_idx" ON "file_versions"("file_id", "created_at");

ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
