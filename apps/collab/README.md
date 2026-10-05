# @collab/collab

Hocuspocus WebSocket server (ADR-002): authenticates connections with the
API's access token, checks project membership, and persists Yjs document
snapshots to PostgreSQL (`files.yjs_state`) through `@collab/db`. Listens on
Redis (`REDIS_URL`, channel `access-changes`) so that a member removed or
demoted by the API loses their open documents at once.

It also keeps the version history of code and Markdown files (`file_versions`, at
most one version per file every 5 minutes, the latest 50) and answers
`POST /files/:fileId/versions/:versionId/restore`, which the API calls (its
`COLLAB_URL`) to put a version back into the live document.

See [docs/websocket-protocol.md](../../docs/websocket-protocol.md) for the
connection contract.

## Local dev

```bash
cp .env.example .env
pnpm --filter @collab/collab dev
```

Listens on `ws://localhost:1234` by default (`PORT` in `.env`).
