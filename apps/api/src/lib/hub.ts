import type { PresenceUser, RealtimeEvent } from "@collab/shared";

export interface HubSocket {
  send(data: string): void;
  readyState?: number;
}

const OPEN = 1;

class Hub {
  private rooms = new Map<string, Map<HubSocket, PresenceUser | null>>();

  /** Registers a connection; when `user` is given the room's presence list is updated and broadcast. */
  subscribe(projectId: string, socket: HubSocket, user: PresenceUser | null = null) {
    let room = this.rooms.get(projectId);
    if (!room) {
      room = new Map();
      this.rooms.set(projectId, room);
    }
    room.set(socket, user);
    if (user) this.broadcastPresence(projectId);

    return () => {
      const current = this.rooms.get(projectId);
      if (!current?.delete(socket)) return;
      if (current.size === 0) this.rooms.delete(projectId);
      if (user) this.broadcastPresence(projectId);
    };
  }

  broadcast(projectId: string, event: RealtimeEvent) {
    const room = this.rooms.get(projectId);
    if (!room) return;
    const payload = JSON.stringify(event);
    for (const socket of room.keys()) {
      if (socket.readyState === undefined || socket.readyState === OPEN) {
        socket.send(payload);
      }
    }
  }

  /** Distinct users with at least one open connection to the project. */
  presence(projectId: string): PresenceUser[] {
    const unique = new Map<string, PresenceUser>();
    for (const user of this.rooms.get(projectId)?.values() ?? []) {
      if (user) unique.set(user.id, user);
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  size(projectId: string) {
    return this.rooms.get(projectId)?.size ?? 0;
  }

  private broadcastPresence(projectId: string) {
    this.broadcast(projectId, {
      type: "presence.updated",
      projectId,
      users: this.presence(projectId),
    });
  }
}

export const hub = new Hub();
