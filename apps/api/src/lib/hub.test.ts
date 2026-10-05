import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PresenceUser } from "@collab/shared";
import { hub } from "./hub.js";

function fakeSocket() {
  const socket = {
    sent: [] as { type: string; users?: PresenceUser[] }[],
    closed: null as { code: number; reason: string } | null,
    send: (data: string) => socket.sent.push(JSON.parse(data)),
    close: (code: number, reason: string) => {
      socket.closed = { code, reason };
    },
  };
  return socket;
}

const person = (name: string): PresenceUser => ({ id: randomUUID(), name, isGuest: false });

describe("hub.disconnect", () => {
  it("closes every tab of that user in that project and nobody else's", () => {
    const projectId = randomUUID();
    const otherProject = randomUUID();
    const removed = person("Removed");
    const stays = person("Stays");
    const [tabA, tabB, colleague, elsewhere] = [fakeSocket(), fakeSocket(), fakeSocket(), fakeSocket()];
    const offs = [
      hub.subscribe(projectId, tabA, removed),
      hub.subscribe(projectId, tabB, removed),
      hub.subscribe(projectId, colleague, stays),
      hub.subscribe(otherProject, elsewhere, removed),
    ];

    expect(hub.disconnect(projectId, removed.id, 4410, "removed")).toBe(2);

    expect(tabA.closed).toEqual({ code: 4410, reason: "removed" });
    expect(tabB.closed).toEqual({ code: 4410, reason: "removed" });
    expect(colleague.closed).toBeNull();
    expect(elsewhere.closed).toBeNull();
    expect(hub.presence(projectId).map((u) => u.id)).toEqual([stays.id]);
    expect(colleague.sent.at(-1)).toMatchObject({ type: "presence.updated", users: [stays] });

    // Nothing reaches a closed tab any more.
    const before = tabA.sent.length;
    hub.broadcast(projectId, { type: "project.members", projectId });
    expect(tabA.sent).toHaveLength(before);
    expect(colleague.sent.at(-1)).toEqual({ type: "project.members", projectId });

    offs.forEach((off) => off());
    expect(hub.size(otherProject)).toBe(0);
  });

  it("closes everybody's connections when no user is given (the project is deleted)", () => {
    const projectId = randomUUID();
    const sockets = [fakeSocket(), fakeSocket()];
    hub.subscribe(projectId, sockets[0]!, person("A"));
    hub.subscribe(projectId, sockets[1]!, person("B"));

    expect(hub.disconnect(projectId, null, 4410, "deleted")).toBe(2);
    expect(sockets.map((s) => s.closed?.reason)).toEqual(["deleted", "deleted"]);
    expect(hub.size(projectId)).toBe(0);
  });

  it("does nothing for a project nobody has open", () => {
    expect(hub.disconnect(randomUUID(), randomUUID(), 4410, "removed")).toBe(0);
  });
});
