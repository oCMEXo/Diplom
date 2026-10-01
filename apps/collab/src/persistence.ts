import { Database } from "@hocuspocus/extension-database";
import { Prisma, prisma } from "@collab/db";

export const databaseExtension = new Database({
  fetch: async ({ documentName }) => {
    const file = await prisma.file.findUnique({
      where: { id: documentName },
      select: { yjsState: true },
    });
    return file?.yjsState ?? null;
  },
  store: async ({ documentName, state }) => {
    try {
      await prisma.file.update({
        where: { id: documentName },
        data: { yjsState: state },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return;
      }
      throw err;
    }
  },
});
