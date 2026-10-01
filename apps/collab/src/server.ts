import { Server } from "@hocuspocus/server";
import { env } from "./env.js";
import { resolveFileAccess } from "./lib/access.js";
import { databaseExtension } from "./persistence.js";

const server = Server.configure({
  port: env.PORT,
  address: env.HOST,
  extensions: [databaseExtension],
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
});

server.listen();
