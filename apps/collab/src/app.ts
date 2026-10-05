import { Hocuspocus, type Configuration } from "@hocuspocus/server";
import { resolveFileAccess } from "./lib/access.js";
import { databaseExtension } from "./persistence.js";
import { restoreExtension } from "./restore.js";
import { forgetFile } from "./versions.js";

/** The sync server; tests start their own copy on a free port. */
export function createCollabServer(options: Partial<Configuration> = {}) {
  return new Hocuspocus({
    extensions: [databaseExtension, restoreExtension],
    // Snapshots reach the database within a few seconds, which is what "push to GitHub" reads.
    debounce: 1000,
    maxDebounce: 3000,
    async onAuthenticate(data) {
      const { token, documentName, connection } = data;

      if (!token) {
        throw new Error("Missing token");
      }

      const access = await resolveFileAccess(token, documentName);
      connection.readOnly = access.role === "viewer";

      return {
        userId: access.userId,
        projectId: access.projectId,
        role: access.role,
      };
    },
    async afterUnloadDocument({ documentName }) {
      forgetFile(documentName);
    },
    ...options,
  });
}
