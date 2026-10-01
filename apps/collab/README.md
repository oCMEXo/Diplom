# @collab/collab

Hocuspocus WebSocket server (ADR-002): authenticates connections with the
API's access token, checks project membership, and persists Yjs document
snapshots to PostgreSQL (`files.yjs_state`) through `@collab/db`.

See [docs/websocket-protocol.md](../../docs/websocket-protocol.md) for the
connection contract.

## Local dev

```bash
cp .env.example .env
pnpm --filter @collab/collab dev
```

Listens on `ws://localhost:1234` by default (`PORT` in `.env`).
