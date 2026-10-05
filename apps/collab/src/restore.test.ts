import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Hocuspocus } from "@hocuspocus/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@collab/db";
import { createCollabServer } from "./app.js";
import { replaceText, withLineBreaksOf } from "./restore.js";

function signToken(userId: string) {
  return jwt.sign({ sub: userId, email: "x@test.local" }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "1h" });
}

function stateOf(text: string) {
  const doc = new Y.Doc();
  doc.getText("monaco").insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function textOf(state: Uint8Array | null) {
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, new Uint8Array(state));
  return doc.getText("monaco").toString();
}

async function until(check: () => boolean | Promise<boolean>, what: string) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("replaceText", () => {
  function replaced(from: string, to: string) {
    const doc = new Y.Doc();
    const text = doc.getText("t");
    text.insert(0, from);
    const deltas: unknown[] = [];
    text.observe((event) => deltas.push(...event.delta));
    doc.transact(() => replaceText(text, to));
    return { result: text.toString(), deltas };
  }

  it("changes only the part that differs", () => {
    const { result, deltas } = replaced("a = 1\nb = 2\nc = 3", "a = 1\nb = 20\nc = 3");
    expect(result).toBe("a = 1\nb = 20\nc = 3");
    expect(deltas).toEqual([{ retain: 11 }, { insert: "0" }]);
  });

  it("handles emptying, filling and emoji", () => {
    expect(replaced("text", "").result).toBe("");
    expect(replaced("", "text").result).toBe("text");
    expect(replaced("x 😀 y", "x 😃 y").result).toBe("x 😃 y");
  });
});

describe("withLineBreaksOf", () => {
  it("gives the version the line breaks the document uses now", () => {
    expect(withLineBreaksOf("a\nb\r\nc", "x\r\ny")).toBe("a\r\nb\r\nc");
    expect(withLineBreaksOf("a\r\nb", "x\ny")).toBe("a\nb");
    expect(withLineBreaksOf("a\r\nb", "")).toBe("a\r\nb");
  });
});

describe("restoring a version through the sync server", () => {
  let server: Hocuspocus;
  let url: string;
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const providers: HocuspocusProvider[] = [];
  const sockets: HocuspocusProviderWebsocket[] = [];

  beforeAll(async () => {
    server = createCollabServer({ port: 0, address: "127.0.0.1", quiet: true, stopOnSignals: false, debounce: 50, maxDebounce: 100 });
    await server.listen();
    url = `127.0.0.1:${server.address.port}`;
  });

  afterAll(async () => {
    for (const provider of providers) provider.destroy();
    for (const socket of sockets) socket.destroy();
    await server.destroy();
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function user() {
    const created = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: "Restore", passwordHash: "x" },
    });
    userIds.push(created.id);
    return created;
  }

  async function fileWith(text: string, type: "code" | "board" = "code") {
    const owner = await user();
    const project = await prisma.project.create({
      data: {
        name: "restore test project",
        ownerId: owner.id,
        inviteCode: randomUUID(),
        members: { create: { userId: owner.id, role: "owner" } },
      },
    });
    projectIds.push(project.id);
    const file = await prisma.file.create({
      data: { projectId: project.id, path: type === "board" ? "plan.board" : "main.py", type, yjsState: stateOf(text) },
    });
    return { owner, project, file };
  }

  async function open(fileId: string, userId: string) {
    const websocketProvider = new HocuspocusProviderWebsocket({ url: `ws://${url}`, WebSocketPolyfill: WebSocket });
    const provider = new HocuspocusProvider({ websocketProvider, name: fileId, token: signToken(userId) });
    providers.push(provider);
    sockets.push(websocketProvider);
    await until(() => provider.isSynced, "the provider to sync");
    return provider;
  }

  function restore(fileId: string, versionId: string, token: string) {
    return fetch(`http://${url}/files/${fileId}/versions/${versionId}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  const storedText = async (fileId: string) =>
    textOf((await prisma.file.findUniqueOrThrow({ where: { id: fileId } })).yjsState);

  it("replaces the text for everyone editing it and keeps the replaced text as a version", async () => {
    const { owner, file } = await fileWith("print('new')");
    const old = await prisma.fileVersion.create({
      data: { fileId: file.id, content: "print('old')", size: 12, createdAt: new Date(Date.now() - 60_000) },
    });
    const provider = await open(file.id, owner.id);

    const response = await restore(file.id, old.id, signToken(owner.id));
    expect(response.status).toBe(204);

    await until(() => provider.document.getText("monaco").toString() === "print('old')", "the restored text");
    expect(await storedText(file.id)).toBe("print('old')");

    const versions = await prisma.fileVersion.findMany({ where: { fileId: file.id }, orderBy: { createdAt: "asc" } });
    expect(versions.map((version) => version.content)).toEqual(["print('old')", "print('new')"]);
    expect(versions[1].authorId).toBe(owner.id);
  });

  it("does not keep the replaced text again when the latest version already has it", async () => {
    const { owner, file } = await fileWith("saved");
    const older = await prisma.fileVersion.create({
      data: { fileId: file.id, content: "older", size: 5, createdAt: new Date(Date.now() - 120_000) },
    });
    await prisma.fileVersion.create({
      data: { fileId: file.id, content: "saved", size: 5, createdAt: new Date(Date.now() - 60_000) },
    });

    expect((await restore(file.id, older.id, signToken(owner.id))).status).toBe(204);
    expect(await storedText(file.id)).toBe("older");
    expect(await prisma.fileVersion.count({ where: { fileId: file.id } })).toBe(2);
  });

  it("restores into the stored document when nobody has the file open", async () => {
    const { owner, file } = await fileWith("current");
    const old = await prisma.fileVersion.create({ data: { fileId: file.id, content: "earlier", size: 7 } });

    expect((await restore(file.id, old.id, signToken(owner.id))).status).toBe(204);
    expect(await storedText(file.id)).toBe("earlier");
  });

  it("refuses a viewer, hides the file from strangers and checks the token", async () => {
    const { owner, project, file } = await fileWith("keep me");
    const old = await prisma.fileVersion.create({ data: { fileId: file.id, content: "gone", size: 4 } });
    const viewer = await user();
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: "viewer" } });
    const stranger = await user();

    expect((await restore(file.id, old.id, signToken(viewer.id))).status).toBe(403);
    expect((await restore(file.id, old.id, signToken(stranger.id))).status).toBe(404);
    expect((await restore(file.id, old.id, "not-a-token")).status).toBe(401);
    expect((await restore(file.id, randomUUID(), signToken(owner.id))).status).toBe(404);
    expect(await storedText(file.id)).toBe("keep me");
  });

  it("saves an edit made in the editor as a version with its author, but not a board's", async () => {
    const { owner, file } = await fileWith("");
    const provider = await open(file.id, owner.id);
    provider.document.getText("monaco").insert(0, "typed");
    await until(async () => (await prisma.fileVersion.count({ where: { fileId: file.id } })) === 1, "a version");
    const version = await prisma.fileVersion.findFirstOrThrow({ where: { fileId: file.id } });
    expect(version).toMatchObject({ content: "typed", authorId: owner.id });

    const board = await fileWith("", "board");
    const boardProvider = await open(board.file.id, board.owner.id);
    boardProvider.document.getMap("shapes").set("s1", { kind: "rect" });
    await until(async () => {
      const stored = await prisma.file.findUniqueOrThrow({ where: { id: board.file.id } });
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(stored.yjsState!));
      return doc.getMap("shapes").has("s1");
    }, "the board to be stored");
    expect(await prisma.fileVersion.count({ where: { fileId: board.file.id } })).toBe(0);
  });
});
