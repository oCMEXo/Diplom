import type { RealtimeEvent } from "@collab/shared";

export interface HubSocket {
  send(data: string): void;
}

const OPEN = 1;

class Hub {
  private rooms = new Map<string, Set<HubSocket & { readyState?: number }>>();

  subscribe(projectId: string, socket: HubSocket & { readyState?: number }) {
    let room = this.rooms.get(projectId);
    if (!room) {
      room = new Set();
      this.rooms.set(projectId, room);
    }
    room.add(socket);

    return () => {
      room.delete(socket);
      if (room.size === 0) this.rooms.delete(projectId);
    };
  }

  broadcast(projectId: string, event: RealtimeEvent) {
    const room = this.rooms.get(projectId);
    if (!room) return;
    const payload = JSON.stringify(event);
    for (const socket of room) {
      if (socket.readyState === undefined || socket.readyState === OPEN) {
        socket.send(payload);
      }
    }
  }

  size(projectId: string) {
    return this.rooms.get(projectId)?.size ?? 0;
  }
}

export const hub = new Hub();
