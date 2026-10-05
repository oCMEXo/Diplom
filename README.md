# Collab Code Platform

Веб-платформа для совместного редактирования кода в реальном времени на
основе CRDT (Yjs). Дипломный проект: работающая платформа + исследование,
сравнивающее CRDT и OT по задержке, корректности и масштабируемости.

## Идея

Постоянное общее пространство для проекта — примерно как сервер в Discord, только
вокруг совместной работы: у проекта есть код, документы, чат и список тех, кто
сейчас в нём. В проект заходят по ссылке-приглашению (даже без регистрации,
гостем), правят файлы одновременно, видят курсоры друг друга и не
выгружают ничего на свои машины. Это не площадка для собеседований и не
разовый «скретч-пад»: проект живёт, пока им пользуются, а запуск кода —
скромная вспомогательная функция, а не центр продукта.

Архитектура, ADR и план работ — см. [docs/adr](docs/adr) и разделы ниже.

## Структура репозитория

```
├── apps/
│   ├── web/        React SPA (Vite, Monaco, Yjs, react-konva), PWA, invite-ссылки, гостевой вход
│   ├── api/        Fastify REST + Swagger + auth + проекты + файлы
│   ├── collab/     Hocuspocus, синхронизация Yjs, права доступа
│   └── runner/     Воркер BullMQ, запуск кода в Docker-песочнице
├── packages/
│   ├── shared/     Типы, Zod-схемы, константы
│   └── db/         Prisma-схема и миграции
├── bench/          Стенд CRDT vs OT: сценарии, результаты, графики
├── e2e/            Playwright: сквозные тесты в двух браузерах
├── infra/          Dockerfile, docker-compose, Caddyfile, скрипты деплоя
├── docs/           ADR, WebSocket-протокол, деплой, текст диплома (thesis/)
└── .github/workflows/
```

## Локальная разработка

Требуется Node.js 20+, pnpm (`corepack enable`) и Docker.

```bash
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres :5433, Redis :6380
cp apps/api/.env.example apps/api/.env
cp apps/collab/.env.example apps/collab/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
pnpm db:migrate
pnpm dev:api      # REST API, http://localhost:3001, Swagger на /docs
pnpm dev:collab   # сервер синхронизации, ws://localhost:1234
pnpm dev:runner    # запуск кода (нужен Docker)
pnpm dev:web      # фронтенд, http://localhost:5173
```

Зайти можно по email/паролю, через invite-ссылку проекта (видна владельцу на
странице проекта) или без регистрации — кнопкой «Продолжить как гость» на
странице входа.

> Порты 5433/6380 выбраны не случайно: 5432/6379 на этой машине заняты
> локальными Postgres/Redis вне Docker. При необходимости поменяйте их в
> `infra/docker-compose.dev.yml` и в `.env`.

## Скрипты

- `pnpm lint` / `pnpm typecheck` / `pnpm test` — по всем пакетам
- `pnpm db:generate` / `pnpm db:migrate` — Prisma
- `pnpm --filter @collab/e2e e2e` — сквозные тесты (нужны Postgres, Redis и
  Chrome; с `E2E_RUNNER=1` и запущенным runner — ещё и запуск кода)
- `pnpm --filter @collab/bench bench` — исследовательский стенд CRDT vs OT
  (результаты — `bench/results/REPORT.md`, разбор — `docs/thesis/04-research.md`)

## Документация

- [docs/deploy-local.md](docs/deploy-local.md) — показать сайт другим с этого компьютера (`pnpm host:test`)
- [docs/adr](docs/adr) — архитектурные решения (ADR-001…004)
- [docs/websocket-protocol.md](docs/websocket-protocol.md) — протоколы реального времени
- Swagger — `http://localhost:3001/docs` при запущенном api
- [docs/deploy-aws.md](docs/deploy-aws.md) — деплой на AWS (не проверен на реальном аккаунте)
- [docs/thesis](docs/thesis) — черновики глав диплома

## Стек

TypeScript везде. React + Vite на фронтенде, Fastify на бэкенде, Hocuspocus
для синхронизации Yjs, PostgreSQL (Prisma) + Redis (BullMQ) для данных и
очередей, Docker — для изолированного запуска кода. Подробности и
альтернативы — в [docs/adr](docs/adr).
