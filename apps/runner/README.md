# @collab/runner

BullMQ-воркер (ADR-003): забирает задачи запуска кода из очереди и исполняет
их в одноразовом Docker-контейнере (`node:22-alpine` / `python:3.12-alpine`)
без сети, с read-only файловой системой, непривилегированным пользователем и
лимитами CPU/памяти/процессов/времени. Вывод публикуется в Redis, api
рассылает его участникам проекта по WebSocket.

Подробности и значения лимитов — в
[ADR-003](../../docs/adr/003-code-execution-docker-queue.md).

## Локальная разработка

Нужны Docker и Redis (`infra/docker-compose.dev.yml`).

```bash
docker pull node:22-alpine && docker pull python:3.12-alpine
cp .env.example .env
pnpm --filter @collab/runner dev
```

Интеграционные тесты песочницы (`executor.test.ts`) запускают настоящие
контейнеры и автоматически пропускаются, если Docker или образы недоступны.
