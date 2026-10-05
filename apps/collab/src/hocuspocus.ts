import { Hocuspocus, type Configuration } from "@hocuspocus/server";
import { resolveFileAccess } from "./lib/access.js";
import { databaseExtension } from "./persistence.js";

/** The sync server as it runs in production; tests start the same one on a free port. */
export function createHocuspocus(configuration: Partial<Configuration> = {}) {
  return new Hocuspocus({
    extensions: [databaseExtension],
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

      // Kept on the connection as its context: a change of access finds connections by it.
      return {
        userId: access.userId,
        projectId: access.projectId,
        role: access.role,
      };
    },
    ...configuration,
  });
}
