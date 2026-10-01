# bench

Stand for the thesis's research question: Yjs (CRDT) vs ShareDB (OT) under the
same simulated load (N concurrent typists, same-line conflict storm, offline
reconnect). Measures sync latency (avg/p50/p95/p99), correctness (hash
convergence), server CPU/memory, bytes per edit, document size growth, and
offline merge time.

Not implemented yet — scheduled for the "Исследование" phase of the plan.
