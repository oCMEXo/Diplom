# Collab Code Platform

Веб-платформа для совместного редактирования кода в реальном времени на
основе CRDT (Yjs). Дипломный проект: работающая платформа + исследование,
сравнивающее CRDT и OT по задержке, корректности и масштабируемости.

Архитектура, ADR и план работ — см. [docs/adr](docs/adr) и разделы ниже.

## Структура репозитория

```
├── apps/
│   ├── web/        React SPA (Vite, Monaco, Yjs), invite-ссылки, гостевой вход
│   ├── api/        Fastify REST + Swagger + auth + проекты + файлы
│   ├── collab/     Hocuspocus, синхронизация Yjs, права доступа
│   └── runner/     Воркер BullMQ, запуск кода в Docker — план
├── packages/
│   ├── shared/     Типы, Zod-схемы, константы
│   └── db/         Prisma-схема и миграции
├── bench/          Стенд CRDT vs OT — план
├── infra/          docker-compose, Caddyfile, скрипты деплоя
├── docs/           ADR, описание WebSocket-протокола
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

## Стек

TypeScript везде. React + Vite на фронтенде, Fastify на бэкенде, Hocuspocus
для синхронизации Yjs, PostgreSQL (Prisma) + Redis (BullMQ) для данных и
очередей, Docker — для изолированного запуска кода. Подробности и
альтернативы — в [docs/adr](docs/adr).
