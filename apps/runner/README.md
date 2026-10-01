# @collab/runner

BullMQ worker (ADR-003): pulls code-run jobs from the queue and executes them
in a throwaway Docker container (`node:alpine` / `python:alpine`) with
`--network none`, a read-only filesystem, an unprivileged user, and CPU/memory/
process/time limits. Publishes stdout/stderr/exit info to Redis for the API to
broadcast over WebSocket.

Not implemented yet — see the project plan for sequencing.
